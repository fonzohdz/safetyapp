// Incident Report PDF verification script (Incident Report v0.1).
//
// Not part of the application build or bundle -- lives entirely under
// tools/testing/ and is invoked manually with
// `node tools/testing/verify-incident-pdf.mjs`. Requires `npm run build`
// to have already produced dist/, and the `playwright` dev dependency
// (+ `npx playwright install chromium`) to be installed.
//
// For each fixture under tools/testing/fixtures/incident-*.json, this:
//   1. Starts `vite preview` (serves the production build in dist/).
//   2. Seeds localStorage (sdc.incident.draft.v1) with the fixture, via
//      Playwright's addInitScript -- runs before the app's own React code
//      boots, so useState's lazy localStorage read on first render sees it.
//   3. Drives the real UI: Home -> "Continue Incident Report" -> Review &
//      Export step -> "Generate PDF" (the actual exportIncidentPdf() ->
//      generateIncidentPdf() html2canvas+pdf-lib pipeline) -> "Download PDF".
//   4. Saves the real generated PDF file.
//   5. Screenshots each real .incidentPdfExportRoot .incidentPage DOM
//      element (the exact nodes html2canvas captured) as PNGs.
//   6. Reports console/page errors and the final generated page count.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outRoot = path.join(__dirname, process.env.INCIDENT_VERIFY_OUTDIR || 'output', 'incident');
mkdirSync(outRoot, { recursive: true });

const FIXTURES = [
  { name: 'full', file: 'incident-full-fixture.json' },
  { name: 'na', file: 'incident-na-fixture.json' },
  { name: 'overflow', file: 'incident-overflow-fixture.json' },
];

const PORT = 4320;
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

async function runFixture(browser, fixture) {
  const draftJson = readFileSync(path.join(__dirname, 'fixtures', fixture.file), 'utf8');
  JSON.parse(draftJson); // fail fast on invalid fixture JSON

  const outDir = path.join(outRoot, fixture.name);
  mkdirSync(outDir, { recursive: true });

  const consoleErrors = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addInitScript((json) => {
    window.localStorage.setItem('sdc.incident.draft.v1', json);
  }, draftJson);

  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  console.log(`\n=== Fixture: ${fixture.name} (${fixture.file}) ===`);
  console.log('  [1/6] Loading app with seeded draft...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Continue Incident Report' }).click();
  await page.getByRole('tab', { name: /^Review & Export/ }).click();

  console.log('  [2/6] Triggering real PDF export (exportIncidentPdf -> generateIncidentPdf)...');
  await page.locator('.reviewPrimaryAction button, .pdfStaleWarning button').first().click();
  await page.locator('.pdfReadyPanel').waitFor({ state: 'visible', timeout: 30000 });

  const readyHeadline = await page.locator('.pdfReadyHeadline').innerText();
  const readyFilename = await page.locator('.pdfReadyFilename').innerText();
  console.log(`  [3/6] PDF ready: ${readyHeadline} (${readyFilename})`);

  console.log('  [4/6] Downloading generated PDF...');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('button:has-text("Download PDF")').click();
  const download = await downloadPromise;
  const pdfPath = path.join(outDir, `incident-${fixture.name}.pdf`);
  await download.saveAs(pdfPath);
  console.log('    Saved PDF ->', pdfPath);

  await page.addStyleTag({
    content: `
      .incidentPdfExportRoot { position: static !important; left: 0 !important; top: 0 !important; }
      .incidentPdfExportRoot .incidentPage { margin: 0 0 24px !important; box-shadow: 0 0 0 1px #ccc; }
      .toast { display: none !important; }
    `,
  });

  const pageEls = await page.locator('.incidentPdfExportRoot .incidentPage').all();
  console.log(`  [5/6] Screenshotting ${pageEls.length} real export page(s)...`);
  const shots = [];
  for (let i = 0; i < pageEls.length; i += 1) {
    const el = pageEls[i];
    const cls = await el.getAttribute('class');
    const kind = cls.includes('incidentContinuationPage') ? 'continuation' : 'base';
    const fname = `page-${String(i + 1).padStart(2, '0')}-${kind}.png`;
    const fpath = path.join(outDir, fname);
    await el.screenshot({ path: fpath });
    shots.push(fpath);
  }
  console.log(`  [6/6] Wrote ${shots.length} page screenshot(s) to ${outDir}`);

  const summary = {
    fixture: fixture.name,
    generatedAt: new Date().toISOString(),
    pdfReadyHeadline: readyHeadline,
    pdfReadyFilename: readyFilename,
    pageCount: pageEls.length,
    pageScreenshots: shots,
    pdfPath,
    consoleErrors,
    pageErrors,
  };
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  await context.close();
  return summary;
}

async function main() {
  console.log('[1/2] Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});

  try {
    await waitForServer(BASE_URL, 20000);
    console.log('[2/2] Preview server ready at', BASE_URL);

    const browser = await chromium.launch();
    const summaries = [];
    for (const fixture of FIXTURES) {
      const summary = await runFixture(browser, fixture);
      summaries.push(summary);
    }
    await browser.close();

    console.log('\n=== OVERALL SUMMARY ===');
    console.log(JSON.stringify(summaries.map(s => ({
      fixture: s.fixture, pageCount: s.pageCount, headline: s.pdfReadyHeadline,
      consoleErrors: s.consoleErrors.length, pageErrors: s.pageErrors.length,
    })), null, 2));

    const anyErrors = summaries.some(s => s.consoleErrors.length || s.pageErrors.length);
    if (anyErrors) {
      console.error('\nFAILED: console/page errors were captured during at least one fixture run (see per-fixture summary.json).');
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
