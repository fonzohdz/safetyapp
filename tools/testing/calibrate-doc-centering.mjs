// Empirical calibration harness for the four Superintendent documents' PDF
// text centering. Generates one real PDF per CSS-override variant (injected
// via addStyleTag before Create Document — html2canvas clones the live
// document, so injected <style> participates in the capture), then the
// analyzer measures the actual embedded raster. This answers, with evidence:
//   - does html2canvas honor translateY on .docPdfCellContent at all?
//   - does it honor position:relative/top?
//   - does it honor .docPdfTextBlock's flex justify-content:center?
//   - what constant shift actually balances each cell family?
//
//   node tools/testing/calibrate-doc-centering.mjs
//
// Output: tools/testing/output/calibration/<variant>.pdf + per-variant
// centering reports.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { killTree } from './lib/killTree.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzePdf } from './analyze-pdf-centering.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'calibration');
mkdirSync(outDir, { recursive: true });

const PORT = 4331;
const BASE_URL = `http://localhost:${PORT}`;
const KEY = 'sdc.discipline.draft.v1';
const FIXTURE = 'disciplinary-normal.json';

function shiftCss(cell, tb) {
  return `.docPdfExportRoot .docPdfCellContent { transform: translateY(${cell}px); }
          .docPdfExportRoot .docPdfTextBlockText { display: inline-block; transform: translateY(${tb}px); }`;
}

const VARIANTS = [
  // Residual calibration sweep, post body-line-height fix.
  { name: 'shift-4', css: shiftCss(-4, -4) },
  { name: 'shift-5', css: shiftCss(-5, -5) },
  { name: 'shift-6', css: shiftCss(-6, -6) },
  { name: 'shift-7', css: shiftCss(-7, -7) },
];

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

async function generateVariant(browser, fixtureJson, variant) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(([k, json]) => window.localStorage.setItem(k, json), [KEY, fixtureJson]);
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  if (variant.css) await page.addStyleTag({ content: variant.css });
  await page.locator('.sidebarNavItem, .mobileNavItem', { hasText: 'Drafts' }).first().click();
  await page.locator('.listItem button', { hasText: 'Open Draft' }).first().click();
  await page.waitForTimeout(300);
  for (let step = 0; step < 12; step += 1) {
    const create = page.getByRole('button', { name: /Create Document|Update Document/ });
    if (await create.count() > 0 && await create.first().isVisible().catch(() => false)) { await create.first().click(); break; }
    const review = page.getByRole('button', { name: 'Go to Review' });
    if (await review.count() > 0 && await review.first().isVisible().catch(() => false)) { await review.first().click(); continue; }
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await next.first().click();
  }
  await page.waitForSelector('.pdfReadyPanel', { timeout: 45000 });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('button', { hasText: 'Download Document' }).click();
  const download = await downloadPromise;
  const pdfPath = path.join(outDir, `${variant.name}.pdf`);
  await download.saveAs(pdfPath);
  await context.close();
  return pdfPath;
}

async function main() {
  const fixtureJson = readFileSync(path.join(__dirname, 'fixtures', FIXTURE), 'utf8');
  console.log('Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForServer(BASE_URL, 20000);
    const browser = await chromium.launch();
    for (const variant of VARIANTS) {
      console.log(`\n=== Variant: ${variant.name} ===`);
      const pdfPath = await generateVariant(browser, fixtureJson, variant);
      const report = await analyzePdf(pdfPath, path.join(outDir, variant.name));
      // Print the key reference cells: first info row (y≈91), second info
      // row (y≈116) and the three single-line TextBlock sections.
      const interesting = report
        .filter(e => e.page === 1)
        .sort((a, b) => a.bandYCss - b.bandYCss);
      for (const e of interesting) {
        console.log(`  y=${e.bandYCss} h=${e.bandHCss} cell#${e.cell} x=${e.xCss}: top ${e.topGap} / bottom ${e.bottomGap} (delta ${e.delta}) textH=${e.textHCss}`);
      }
    }
    await browser.close();
  } finally {
    killTree(server);
  }
}

main().catch(err => { console.error('calibrate-doc-centering crashed:', err); process.exit(1); });
