// Definitive divergence experiment: for the SAME rendered export page,
// compare (a) what Chrome itself paints (Playwright element screenshot of
// the live export DOM) against (b) what html2canvas painted into the real
// downloaded PDF. Both are analyzed with the identical band/ink measurement,
// in CSS-px units. Any per-cell difference between the two columns is
// html2canvas divergence, by construction — not CSS opinion.
//
//   node tools/testing/compare-dom-vs-raster.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { killTree } from './lib/killTree.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodePng, extractPageRasters } from './extract-pdf-images.mjs';
import { analyzeRaster } from './analyze-pdf-centering.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'dom-vs-raster');
mkdirSync(outDir, { recursive: true });

const PORT = 4332;
const BASE_URL = `http://localhost:${PORT}`;
const KEY = 'sdc.discipline.draft.v1';

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() > deadline) reject(new Error('server not ready'));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function main() {
  const fixtureJson = readFileSync(path.join(__dirname, 'fixtures', 'disciplinary-normal.json'), 'utf8');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForServer(BASE_URL, 20000);
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
    await context.addInitScript(([k, json]) => window.localStorage.setItem(k, json), [KEY, fixtureJson]);
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('.sidebarNavItem, .mobileNavItem', { hasText: 'Drafts' }).first().click();
    await page.locator('.listItem button', { hasText: 'Open Draft' }).first().click();
    await page.waitForTimeout(300);
    for (let step = 0; step < 12; step += 1) {
      const create = page.getByRole('button', { name: /Create Document|Update Document/ });
      if (await create.count() > 0 && await create.first().isVisible().catch(() => false)) { await create.first().click(); break; }
      const review = page.getByRole('button', { name: 'Go to Review' });
      if (await review.count() > 0 && await review.first().isVisible().catch(() => false)) { await review.first().click(); continue; }
      await page.getByRole('button', { name: 'Next', exact: true }).first().click();
    }
    await page.waitForSelector('.pdfReadyPanel', { timeout: 45000 });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button', { hasText: 'Download Document' }).click();
    const download = await downloadPromise;
    const pdfPath = path.join(outDir, 'generated.pdf');
    await download.saveAs(pdfPath);

    // Screenshot the SAME first export page from the live DOM.
    await page.addStyleTag({ content: '.docPdfExportRoot[data-doc-id="disciplinary"] { position: static !important; left: 0 !important; top: 0 !important; }' });
    const el = page.locator('.docPdfExportRoot[data-doc-id="disciplinary"] .docPdfPage').first();
    const shotPath = path.join(outDir, 'dom-page1.png');
    await el.screenshot({ path: shotPath });
    await context.close();
    await browser.close();

    const domRaster = decodePng(readFileSync(shotPath));
    const pdfRaster = (await extractPageRasters(pdfPath))[0];
    const domReport = analyzeRaster(domRaster).map(({ _crop, ...r }) => r);
    const pdfReport = analyzeRaster(pdfRaster).map(({ _crop, ...r }) => r);

    console.log('DOM screenshot:', domRaster.width, 'x', domRaster.height, ' PDF raster:', pdfRaster.width, 'x', pdfRaster.height);
    console.log('\nband(yCss) cell |   DOM top/bot   |   PDF top/bot   | PDF-DOM ink shift');
    for (const d of domReport.sort((a, b) => a.bandYCss - b.bandYCss || a.cell - b.cell)) {
      const p = pdfReport.find(e => Math.abs(e.bandYCss - d.bandYCss) < 3 && e.cell === d.cell);
      if (!p) { console.log(`  y=${d.bandYCss} c${d.cell}: (no PDF match) DOM ${d.topGap}/${d.bottomGap}`); continue; }
      const shift = ((p.topGap - d.topGap) - (d.bottomGap - p.bottomGap)) / 2 + (p.topGap - d.topGap) * 0 // simple: top delta
      ;
      console.log(`  y=${String(d.bandYCss).padEnd(6)} c${d.cell} | ${String(d.topGap).padStart(5)}/${String(d.bottomGap).padEnd(5)} | ${String(p.topGap).padStart(5)}/${String(p.bottomGap).padEnd(5)} | ${(p.topGap - d.topGap).toFixed(1)}`);
    }
    writeFileSync(path.join(outDir, 'dom-report.json'), JSON.stringify(domReport, null, 2));
    writeFileSync(path.join(outDir, 'pdf-report.json'), JSON.stringify(pdfReport, null, 2));
  } finally {
    killTree(server);
  }
}

main().catch(err => { console.error('compare-dom-vs-raster crashed:', err); process.exit(1); });
