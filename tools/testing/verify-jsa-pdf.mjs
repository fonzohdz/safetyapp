// TEMPORARY verification script (2026-08-06 JSA PDF readability pass).
//
// Not part of the application build or bundle -- lives entirely under
// tools/testing/ and is invoked manually with `node tools/testing/verify-jsa-pdf.mjs`.
// Requires `npm run build` to have already produced dist/, and the
// `playwright` dev dependency (+ `npx playwright install chromium`) to be
// installed. Safe to delete along with the playwright devDependency once
// the PDF review in this chat is complete -- it makes no changes to any
// application source file and writes only under tools/testing/output/.
//
// What it does:
//   1. Starts `vite preview` (serves the production build in dist/).
//   2. Seeds localStorage (sdc.jsa.draft.v4) with the exact Entergy TAPS
//      draft JSON provided by the user, via Playwright's addInitScript --
//      this runs before the app's own React code boots, so useState's
//      lazy localStorage read on first render already sees it.
//   3. Drives the real UI: Home -> "Continue JSA" -> Review/Export step ->
//      "Print / Save PDF" (the actual exportPdf() -> generateJsaPdf()
//      html2canvas+pdf-lib pipeline, not a stub) -> "Download PDF".
//   4. Saves the real generated PDF file.
//   5. Screenshots each real .pdfExportRoot .printPage DOM element (the
//      exact nodes html2canvas captures for the PDF) as PNGs, one per
//      logical page, by temporarily overriding their off-screen
//      positioning with an injected <style> tag (runtime-only DOM/CSS
//      mutation in this throwaway browser session -- never touches any
//      source file).
//   6. Reports console/page errors, the exportPlanGrid's own page-count
//      breakdown, and the final generated page count.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, process.env.JSA_VERIFY_OUTDIR || 'output');
mkdirSync(outDir, { recursive: true });

const draftJson = readFileSync(path.join(__dirname, 'fixtures', 'entergy-taps-draft.json'), 'utf8');
// Fail fast if the fixture isn't valid JSON rather than silently seeding garbage.
JSON.parse(draftJson);

const PORT = 4319;
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() > deadline) reject(new Error(`Server at ${url} did not become ready in time`));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function main() {
  console.log('[1/7] Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', d => { serverOutput += d.toString(); });
  server.stderr.on('data', d => { serverOutput += d.toString(); });

  const consoleErrors = [];
  const pageErrors = [];

  try {
    await waitForServer(BASE_URL, 20000);
    console.log('[2/7] Preview server ready at', BASE_URL);

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });

    await context.addInitScript((draftJsonStr) => {
      window.localStorage.setItem('sdc.jsa.draft.v4', draftJsonStr);
    }, draftJson);

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    console.log('[3/7] Loading app and seeded Entergy TAPS draft...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Continue JSA' }).click();
    await page.getByRole('tab', { name: /^Review \/ Export/ }).click();

    // Read the JS-estimated page plan (pre-generation heuristic/measured plan)
    // shown in the Review step's own UI, for comparison against the actual
    // generated PDF's page count.
    const planText = await page.locator('.exportPlanGrid').innerText();
    console.log('[4/7] Review step export plan (pre-generation):\n' + planText.replace(/\n+/g, ' | '));

    console.log('[5/7] Triggering real PDF export (exportPdf -> generateJsaPdf)...');
    await page.locator('.reviewPrimaryAction button').click();
    await page.locator('.pdfReadyPanel').waitFor({ state: 'visible', timeout: 30000 });

    const readyHeadline = await page.locator('.pdfReadyHeadline').innerText();
    const readyFilename = await page.locator('.pdfReadyFilename').innerText();
    console.log(`[6/7] PDF ready: ${readyHeadline} (${readyFilename})`);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Download PDF")').click();
    const download = await downloadPromise;
    const pdfPath = path.join(outDir, 'entergy-taps-generated.pdf');
    await download.saveAs(pdfPath);
    console.log('    Saved PDF ->', pdfPath);

    // Reveal the off-screen PdfExportRoot for direct DOM screenshots of the
    // exact nodes html2canvas just rasterized -- runtime-only style
    // override in this throwaway page, never written to any source file.
    await page.addStyleTag({
      content: `
        .pdfExportRoot { position: static !important; left: 0 !important; top: 0 !important; }
        .pdfExportRoot .printPage { margin: 0 0 24px !important; box-shadow: 0 0 0 1px #ccc; }
        .toast { display: none !important; }
      `,
    });

    const pageEls = await page.locator('.pdfExportRoot .printPage').all();
    console.log(`[7/7] Screenshotting ${pageEls.length} real export page(s)...`);
    const shots = [];
    for (let i = 0; i < pageEls.length; i += 1) {
      const el = pageEls[i];
      const cls = await el.getAttribute('class');
      let kind = 'unknown';
      if (cls.includes('mainJsaPage')) kind = 'main';
      else if (cls.includes('continuationPage')) kind = 'continuation';
      else if (cls.includes('signInPage')) kind = 'signin';
      const fname = `page-${i + 1}-${kind}.png`;
      const fpath = path.join(outDir, fname);
      await el.screenshot({ path: fpath });
      shots.push(fpath);
      console.log('    ' + fpath);
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      exportPlanGridText: planText,
      pdfReadyHeadline: readyHeadline,
      pdfReadyFilename: readyFilename,
      pageScreenshots: shots,
      pdfPath,
      consoleErrors,
      pageErrors,
    };
    writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    await browser.close();

    if (consoleErrors.length || pageErrors.length) {
      console.error('\nFAILED: console/page errors were captured during the run (see summary.json).');
      process.exitCode = 1;
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('Verification script failed:', err);
  process.exitCode = 1;
});
