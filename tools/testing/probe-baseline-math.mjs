// In-browser probe of html2canvas 1.4.1's text-baseline math against the
// real DOM baseline, for the exact elements the four documents' PDFs paint
// wrong. No PDF generation — this reproduces the painter's formula:
//   paintedBaselineY = Range.getClientRects()[0].top + FontMetrics.baseline
// where FontMetrics.baseline = img.offsetTop - span.offsetTop + 2 in a probe
// with the same font-family/font-size (html2canvas dist source, ~line 6589).
//
//   node tools/testing/probe-baseline-math.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const PORT = 4333;
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

    const probe = await page.evaluate(() => {
      const out = { scrollY: window.scrollY, targets: [] };
      const root = document.querySelector('.docPdfExportRoot[data-doc-id="disciplinary"]');
      if (!root) return { error: 'export root not mounted' };
      const pageEl = root.querySelector('.docPdfPage');
      const pageTop = pageEl.getBoundingClientRect().top;

      function fontMetricsBaseline(fontFamily, fontSize) {
        // verbatim re-implementation of html2canvas 1.4.1 FontMetrics.parseMetrics
        const container = document.createElement('div');
        const img = document.createElement('img');
        const span = document.createElement('span');
        const body = document.body;
        container.style.visibility = 'hidden';
        container.style.fontFamily = fontFamily;
        container.style.fontSize = fontSize;
        container.style.margin = '0';
        container.style.padding = '0';
        container.style.whiteSpace = 'nowrap';
        body.appendChild(container);
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.width = 1;
        img.height = 1;
        img.style.margin = '0';
        img.style.padding = '0';
        img.style.verticalAlign = 'baseline';
        span.style.fontFamily = fontFamily;
        span.style.fontSize = fontSize;
        span.style.margin = '0';
        span.style.padding = '0';
        span.appendChild(document.createTextNode('Hidden Text'));
        container.appendChild(span);
        container.appendChild(img);
        const baseline = img.offsetTop - span.offsetTop + 2;
        body.removeChild(container);
        return baseline;
      }

      function realBaselineOf(el, textNode) {
        // insert a zero-size inline marker right after the first text — its
        // bottom edge sits on the text's real baseline
        const marker = document.createElement('img');
        marker.width = 1; marker.height = 1;
        marker.style.cssText = 'vertical-align: baseline; margin:0; padding:0;';
        textNode.parentNode.insertBefore(marker, textNode.nextSibling);
        const y = marker.getBoundingClientRect().bottom;
        marker.remove();
        return y;
      }

      function inspect(label, el) {
        const textNode = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
        if (!textNode) return;
        const cs = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getClientRects()[0];
        if (!rect) return;
        const probeBaseline = fontMetricsBaseline(cs.fontFamily, cs.fontSize);
        const painted = rect.top + probeBaseline;
        const real = realBaselineOf(el, textNode);
        out.targets.push({
          label,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          rectTop: +(rect.top - pageTop).toFixed(2),
          rectH: +rect.height.toFixed(2),
          probeBaseline,
          paintedBaselineY: +(painted - pageTop).toFixed(2),
          realBaselineY: +(real - pageTop).toFixed(2),
          error: +(painted - real).toFixed(2),
        });
      }

      inspect('td CellContent (Marcus Doyle)', root.querySelector('td .docPdfCellContent'));
      inspect('th CellContent (Employee Name)', root.querySelector('th .docPdfCellContent'));
      root.querySelectorAll('.docPdfTextBlock').forEach((el, i) => { if (i < 2) inspect(`TextBlock #${i}`, el); });
      inspect('NumberedBar title span', root.querySelector('.docPdfNumberedBar span:last-child'));
      inspect('GrayBar', root.querySelector('.docPdfGrayBar'));
      const cbText = root.querySelector('.docPdfCheckboxRow span:last-child');
      if (cbText) inspect('CheckboxRow text span', cbText);
      const caption = root.querySelector('.docPdfSignatureCaption');
      if (caption) inspect('SignatureCaption', caption);
      return out;
    });

    console.log(JSON.stringify(probe, null, 2));

    // Repeat with the window scrolled, to see if scroll enters the math.
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(200);
    const probe2 = await page.evaluate(() => window.scrollY);
    console.log('scrollY after scrollTo(0,300):', probe2);

    await context.close();
    await browser.close();
  } finally {
    server.kill();
  }
}

main().catch(err => { console.error('probe crashed:', err); process.exit(1); });
