// Interactive signature-capture regression script (Incident Report v0.1.4).
//
// Not part of the application build or bundle -- lives entirely under
// tools/testing/ and is invoked manually with
// `node tools/testing/verify-signature-pad.mjs`. Requires `npm run build`
// to have already produced dist/, and the `playwright` dev dependency
// (+ `npx playwright install chromium`) to be installed.
//
// verify-incident-pdf.mjs proves that a signature *already present in a
// fixture's data* renders correctly in the exported PDF, but never actually
// draws one -- it can't catch a regression in SignaturePad's own capture
// area (dimensions, responsive resize, pointer-to-canvas coordinate
// mapping). This script closes that gap: for each of three viewports
// (desktop, tablet/iPad, phone) it seeds the real "full" fixture (which has
// an unsigned witness slot -- Witness 2, "Jake Lytle" -- to sign), drives
// the real UI to open that witness's signature pad, measures the rendered
// canvas against the v0.1.4 target dimensions, draws a signature with real
// pointer input, saves it, and confirms a non-empty preview image was
// produced. On the desktop pass it additionally carries that interactively-
// drawn signature all the way through PDF export and asserts it renders as
// an <img> inside the Witness 2 signature cell on the real generated page --
// proving the whole capture -> save -> print pipeline, not just the canvas.
//
// Exits nonzero on any assertion failure, console error, or page error.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, process.env.SIGNATURE_VERIFY_OUTDIR || 'output', 'signature-pad');
mkdirSync(outDir, { recursive: true });

const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;

// v0.1.4 target dimensions -- see SignaturePad.jsx's PAD_HEIGHT_DESKTOP /
// PAD_HEIGHT_PHONE / PAD_WIDTH_MIN / PAD_WIDTH_MAX / PHONE_BREAKPOINT_PX.
// expectMinWidth is deliberately lower on phone: SignaturePad fills 100% of
// its real container (paired with a date field in a half-width formPairRow
// column -- see IncidentWorkflow.jsx), and that real container is narrower
// on a 390px-wide viewport than on tablet/desktop. That's correct existing
// form-layout behavior, not a signature-pad regression, so the floor here
// reflects the real achievable width rather than an arbitrary round number.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900, expectHeight: 170, expectMinWidth: 200, runExport: true },
  { name: 'tablet', width: 820, height: 1180, expectHeight: 170, expectMinWidth: 200, runExport: false },
  { name: 'phone', width: 390, height: 844, expectHeight: 145, expectMinWidth: 180, runExport: false },
];

function makeAssertions() {
  const failures = [];
  return {
    check(condition, message) { if (!condition) failures.push(message); },
    failures,
  };
}

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

/* Draws a simple multi-stroke scribble across the canvas using real mouse
   (-> Pointer Events, the same code path SignaturePad listens on regardless
   of pointerType) input -- exercises getPoint()'s rendered-rect-to-internal-
   coordinate-space mapping exactly the way a finger/stylus drag would. */
async function drawScribble(page, canvasBox) {
  const { x, y, width, height } = canvasBox;
  const points = [
    [x + width * 0.12, y + height * 0.7],
    [x + width * 0.25, y + height * 0.25],
    [x + width * 0.4, y + height * 0.75],
    [x + width * 0.55, y + height * 0.3],
    [x + width * 0.7, y + height * 0.7],
    [x + width * 0.85, y + height * 0.35],
  ];
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [px, py] of points.slice(1)) {
    await page.mouse.move(px, py, { steps: 6 });
  }
  await page.mouse.up();
}

async function runViewport(browser, fixtureJson, viewport) {
  const consoleErrors = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  await context.addInitScript((json) => {
    window.localStorage.setItem('sdc.incident.draft.v1', json);
  }, fixtureJson);

  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const a = makeAssertions();
  console.log(`\n=== Viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ===`);

  console.log('  [1/6] Loading app with seeded draft, opening Witnesses step...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continue Incident Report' }).click();
  await page.getByRole('tab', { name: /^Witnesses/ }).click();

  console.log('  [2/6] Opening the unsigned witness (Witness 2) signature pad...');
  const addSignatureBtn = page.getByRole('button', { name: 'Add signature' }).first();
  await addSignatureBtn.waitFor({ state: 'visible' });
  await addSignatureBtn.click();

  const wrap = page.locator('.signatureCanvasWrap').first();
  const canvas = page.locator('.signatureCanvas').first();
  await canvas.waitFor({ state: 'visible' });

  console.log('  [3/6] Measuring rendered pad dimensions...');
  const wrapBox = await wrap.boundingBox();
  const canvasBox = await canvas.boundingBox();
  a.check(Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0), 'expected the signature canvas to have a measurable rendered size');
  if (canvasBox) {
    a.check(canvasBox.width >= viewport.expectMinWidth, `expected the pad to render at least ~${viewport.expectMinWidth}px wide on ${viewport.name}, got ${canvasBox.width.toFixed(1)}px`);
    a.check(
      Math.abs(canvasBox.height - viewport.expectHeight) <= 2,
      `expected pad height ~${viewport.expectHeight}px for ${viewport.name}, got ${canvasBox.height.toFixed(1)}px`,
    );
  }
  if (wrapBox && canvasBox) {
    a.check(
      canvasBox.width <= wrapBox.width + 1,
      `expected the canvas to stay within its container width (no horizontal overflow): canvas ${canvasBox.width.toFixed(1)}px vs container ${wrapBox.width.toFixed(1)}px`,
    );
    const canvasRight = canvasBox.x + canvasBox.width;
    a.check(canvasRight <= viewport.width + 1, `expected the canvas not to overflow the viewport (right edge ${canvasRight.toFixed(1)}px vs viewport width ${viewport.width}px)`);
  }

  console.log('  [4/6] Drawing a signature with real pointer input...');
  await drawScribble(page, canvasBox);

  // Coordinate-mapping sanity check: the canvas's internal bitmap should
  // now contain non-transparent pixels roughly where the stroke was drawn
  // (left/right thirds), not compressed into a corner -- a regression in
  // getPoint()'s scale factor would show up as ink bunched at one edge.
  const inkSpread = await canvas.evaluate((el) => {
    const ctx = el.getContext('2d');
    const { width, height } = el;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width; let maxX = 0;
    for (let px = 0; px < width; px += 2) {
      for (let py = 0; py < height; py += 4) {
        const alpha = data[(py * width + px) * 4 + 3];
        if (alpha > 10) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
        }
      }
    }
    return { minX, maxX, width };
  });
  a.check(inkSpread.maxX > inkSpread.minX, 'expected drawn ink to span a real horizontal range on the canvas bitmap (coordinate mapping sanity check)');
  a.check(inkSpread.minX < inkSpread.width * 0.35, `expected ink to reach near the left side of the pad, leftmost ink at x=${inkSpread.minX} of ${inkSpread.width}`);
  a.check(inkSpread.maxX > inkSpread.width * 0.65, `expected ink to reach near the right side of the pad, rightmost ink at x=${inkSpread.maxX} of ${inkSpread.width}`);

  console.log('  [5/6] Saving and checking the preview renders...');
  // exact: true -- getByRole's default substring match would also match the
  // unrelated header "Save Now" button, causing a strict-mode violation.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const preview = page.locator('.signaturePreview').first();
  await preview.waitFor({ state: 'visible', timeout: 5000 });
  const previewSrc = await preview.getAttribute('src');
  a.check(Boolean(previewSrc && previewSrc.startsWith('data:image/png')), `expected the saved signature preview to be a PNG data URL, got "${previewSrc?.slice(0, 30)}..."`);

  let exportInfo = null;
  if (viewport.runExport) {
    console.log('  [6/6] Carrying the drawn signature through full PDF export...');
    await page.getByRole('tab', { name: /^Review & Export/ }).click();
    await page.locator('button:has-text("Generate PDF"), button:has-text("Regenerate PDF")').first().click();
    await page.locator('.pdfReadyPanel').waitFor({ state: 'visible', timeout: 30000 });

    const page3 = page.locator('.incidentPdfExportRoot .incidentPage').nth(2);
    const sigImages = page3.locator('.incSignatureImage');
    const sigCount = await sigImages.count();
    a.check(sigCount === 2, `expected both Witness 1 (fixture) and Witness 2 (interactively drawn) signatures to render on page 3, found ${sigCount}`);
    if (sigCount === 2) {
      const secondSrc = await sigImages.nth(1).getAttribute('src');
      a.check(Boolean(secondSrc && secondSrc.startsWith('data:image/png')), 'expected the interactively-drawn Witness 2 signature to render as a real PNG image in the exported PDF page');
    }
    exportInfo = { sigCount };
  } else {
    console.log('  [6/6] Skipping full export on this viewport (desktop pass already covers it).');
  }

  if (a.failures.length) {
    console.error(`  FAILED ASSERTIONS for viewport "${viewport.name}":`);
    a.failures.forEach((f) => console.error(`    - ${f}`));
  } else {
    console.log('  All assertions passed.');
  }

  const summary = {
    viewport: viewport.name,
    generatedAt: new Date().toISOString(),
    canvasBox,
    wrapBox,
    previewSrcPrefix: previewSrc?.slice(0, 30) || null,
    exportInfo,
    assertionFailures: a.failures,
    consoleErrors,
    pageErrors,
  };
  writeFileSync(path.join(outDir, `${viewport.name}-summary.json`), JSON.stringify(summary, null, 2));

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

    const fixtureJson = readFileSync(path.join(__dirname, 'fixtures', 'incident-full-fixture.json'), 'utf8');
    JSON.parse(fixtureJson); // fail fast on invalid fixture JSON

    const browser = await chromium.launch();
    const summaries = [];
    try {
      for (const viewport of VIEWPORTS) {
        const summary = await runViewport(browser, fixtureJson, viewport);
        summaries.push(summary);
      }
    } finally {
      // Always close the browser, even if a viewport throws -- an open
      // browser<->page connection is a live handle that keeps the Node
      // process running indefinitely, which turns one bad assertion into a
      // silently hung script instead of a clean nonzero exit.
      await browser.close();
    }

    console.log('\n=== OVERALL SUMMARY ===');
    console.log(JSON.stringify(summaries.map((s) => ({
      viewport: s.viewport, assertionFailures: s.assertionFailures.length, consoleErrors: s.consoleErrors.length, pageErrors: s.pageErrors.length,
    })), null, 2));

    const anyErrors = summaries.some((s) => s.consoleErrors.length || s.pageErrors.length || s.assertionFailures.length);
    if (anyErrors) {
      console.error('\nFAILED: console/page errors or assertion failures were captured during at least one viewport run (see per-viewport summary.json).');
      process.exitCode = 1;
    } else {
      console.log('\nAll viewports passed all assertions with zero console/page errors.');
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('Verification script failed:', err);
  process.exitCode = 1;
});
