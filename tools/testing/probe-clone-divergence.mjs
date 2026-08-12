// Definitive html2canvas divergence locator. Loads the SAME html2canvas
// 1.4.1 build the app bundles, captures the real disciplinary export page,
// and measures at every stage:
//   1. original DOM: Range rect + real baseline of target text nodes
//   2. clone DOM (onclone): the same Range rects — divergence here means
//      the clone LAYS OUT differently (stylesheet/layout race), not painter math
//   3. the output canvas: actual ink rows for the first info-table row band
//
//   node tools/testing/probe-clone-divergence.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const PORT = 4334;
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(([k, json]) => window.localStorage.setItem(k, json), [KEY, fixtureJson]);
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('.sidebarNavItem, .mobileNavItem', { hasText: 'Drafts' }).first().click();
    await page.locator('.listItem button', { hasText: 'Open Draft' }).first().click();
    await page.waitForTimeout(500);
    await page.addScriptTag({ path: path.join(repoRoot, 'node_modules', 'html2canvas', 'dist', 'html2canvas.js') });

    const result = await page.evaluate(async () => {
      const root = document.querySelector('.docPdfExportRoot[data-doc-id="disciplinary"]');
      if (!root) return { error: 'no export root' };
      const pageEl = root.querySelector('.docPdfPage');
      const pageTop = pageEl.getBoundingClientRect().top;

      function measureTargets(doc, pageEl2, tag) {
        const pTop = pageEl2.getBoundingClientRect().top;
        const targets = [];
        function grab(label, el) {
          if (!el) { targets.push({ label, missing: true }); return; }
          const textNode = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
          if (!textNode) { targets.push({ label, noText: true }); return; }
          const range = doc.createRange();
          range.selectNodeContents(textNode);
          const rect = range.getClientRects()[0];
          const cs = doc.defaultView.getComputedStyle(el);
          targets.push({
            label,
            tag,
            fontSize: cs.fontSize,
            lineHeight: cs.lineHeight,
            rectTop: rect ? +(rect.top - pTop).toFixed(2) : null,
            rectH: rect ? +rect.height.toFixed(2) : null,
          });
        }
        grab('td-first', pageEl2.querySelector('td .docPdfCellContent'));
        grab('th-first', pageEl2.querySelector('th .docPdfCellContent'));
        grab('textblock-first', pageEl2.querySelector('.docPdfTextBlock'));
        grab('graybar', pageEl2.querySelector('.docPdfGrayBar'));
        grab('checkboxrow', pageEl2.querySelector('.docPdfCheckboxRow span:last-child'));
        return targets;
      }

      const original = measureTargets(document, pageEl, 'original');
      let cloneMeasures = null;
      let cloneInfo = null;

      const canvas = await window.html2canvas(pageEl, {
        scale: 2.5,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        onclone: (cloneDoc) => {
          const cloneRoot = cloneDoc.querySelector('.docPdfExportRoot[data-doc-id="disciplinary"]');
          const clonePage = cloneRoot && cloneRoot.querySelector('.docPdfPage');
          if (clonePage) {
            cloneMeasures = measureTargets(cloneDoc, clonePage, 'clone');
            const cw = cloneDoc.defaultView;
            cloneInfo = {
              scrollY: cw.scrollY,
              styleSheets: cloneDoc.styleSheets.length,
              bodyLineHeight: cw.getComputedStyle(cloneDoc.body).lineHeight,
              bodyFont: cw.getComputedStyle(cloneDoc.body).fontFamily,
              pageRectTop: clonePage.getBoundingClientRect().top,
              rootPosition: cw.getComputedStyle(cloneRoot).position,
              rootLeft: cw.getComputedStyle(cloneRoot).left,
            };
          }
        },
      });

      // scan the output canvas: find ink rows in the first table band.
      // First info row's td x-range in page coords:
      const td = pageEl.querySelector('td');
      const tdRect = td.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const sc = canvas.width / pageRect.width;
      const x0 = Math.round((tdRect.left - pageRect.left + 4) * sc);
      const x1 = Math.round((tdRect.right - pageRect.left - 4) * sc);
      const y0 = Math.round((tdRect.top - pageRect.top + 1) * sc);
      const y1 = Math.round((tdRect.bottom - pageRect.top - 1) * sc);
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      let inkTop = -1, inkBottom = -1;
      for (let y = 0; y < img.height; y += 1) {
        let dark = false;
        for (let x = 0; x < img.width; x += 1) {
          const i = (y * img.width + x) * 4;
          const luma = img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114;
          if (luma < 170) { dark = true; break; }
        }
        if (dark) { if (inkTop < 0) inkTop = y; inkBottom = y; }
      }
      const tdCellCss = {
        cellTopInPage: +(tdRect.top - pageRect.top).toFixed(2),
        cellH: +tdRect.height.toFixed(2),
        canvasInkTopCss: inkTop >= 0 ? +(inkTop / sc).toFixed(2) : null,
        canvasInkBottomCss: inkBottom >= 0 ? +(inkBottom / sc).toFixed(2) : null,
      };

      // DOM ink position for the same text: use the range rect + font geometry
      const span = td.querySelector('.docPdfCellContent');
      const textNode = Array.from(span.childNodes).find(n => n.nodeType === 3);
      const r = document.createRange();
      r.selectNodeContents(textNode);
      const rr = r.getClientRects()[0];
      const domTextRect = { top: +(rr.top - tdRect.top).toFixed(2), h: +rr.height.toFixed(2) };

      return { original, cloneMeasures, cloneInfo, tdCellCss, domTextRect, canvasW: canvas.width, canvasH: canvas.height };
    });

    console.log(JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  } finally {
    server.kill();
    process.exit(0);
  }
}

main().catch(err => { console.error('probe crashed:', err); process.exit(1); });
