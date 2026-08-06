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
//   6. Asserts hard expectations per fixture (exact page count, draft vs.
//      final filename/watermark, six-page structural completeness,
//      signature rendering, cause-table formatting) and exits nonzero on
//      any mismatch -- this script is a real regression gate, not just a
//      screenshot generator.
//
// Never commits generated PDFs, PNGs, or summaries -- tools/testing/output/
// is git-ignored (see .gitignore).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outRoot = path.join(__dirname, process.env.INCIDENT_VERIFY_OUTDIR || 'output', 'incident');
mkdirSync(outRoot, { recursive: true });

// expectedPageCount is a hard assertion -- the script fails loudly (nonzero
// exit) if the real generated page count ever drifts from this, instead of
// silently accepting whatever came out.
const FIXTURES = [
  { name: 'full', file: 'incident-full-fixture.json', expectedPageCount: 6, expectFinal: true },
  { name: 'na', file: 'incident-na-fixture.json', expectedPageCount: 6, expectFinal: false },
  // Was 12 pages before the v0.1.1 polish pass raised the description/
  // statement base-page capacities (DESCRIPTION_FIRST_HEIGHT_PX/
  // STATEMENT_FIRST_HEIGHT_PX in incidentPdfLayout.js) to use more of page
  // 1/3/4's real available space -- this fixture's deliberately very long
  // text now legitimately needs fewer continuation pages, not the same
  // count forced by an artificially small box. See page-by-page screenshots
  // in tools/testing/output/incident/overflow/ to confirm nothing clipped.
  { name: 'overflow', file: 'incident-overflow-fixture.json', expectedPageCount: 10, expectFinal: false },
  // Reproduces the actual user-reported draft (Entergy_TAPS_IncidentReport_2026-08-06_DRAFT.pdf)
  // that generated a wasted, nearly-empty page 7 before the v0.1.1 PDF polish
  // pass -- see incidentPdfMeasure.js / allocateSharedHeight in
  // incidentPdfGenerate.jsx. Must render as exactly 6 pages with no
  // continuation page now that page 6's notes boxes share real leftover space.
  { name: 'userDraft', file: 'incident-user-draft-fixture.json', expectedPageCount: 6, expectFinal: false },
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

// Collects assertion failures instead of throwing on the first one, so a
// single run reports every mismatch for a fixture at once.
function makeAssertions() {
  const failures = [];
  return {
    check(condition, message) { if (!condition) failures.push(message); },
    failures,
  };
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
  console.log('  [1/7] Loading app with seeded draft...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Continue Incident Report' }).click();
  await page.getByRole('tab', { name: /^Review & Export/ }).click();

  console.log('  [2/7] Triggering real PDF export (exportIncidentPdf -> generateIncidentPdf)...');
  await page.locator('button:has-text("Generate PDF"), button:has-text("Regenerate PDF")').first().click();
  await page.locator('.pdfReadyPanel').waitFor({ state: 'visible', timeout: 30000 });

  const readyHeadline = await page.locator('.pdfReadyHeadline').innerText();
  const readyFilename = await page.locator('.pdfReadyFilename').innerText();
  console.log(`  [3/7] PDF ready: ${readyHeadline} (${readyFilename})`);

  console.log('  [4/7] Downloading generated PDF...');
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
  console.log(`  [5/7] Screenshotting ${pageEls.length} real export page(s)...`);
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
  console.log(`  [6/7] Wrote ${shots.length} page screenshot(s) to ${outDir}`);

  console.log('  [7/7] Running hard assertions...');
  const a = makeAssertions();
  const root = page.locator('.incidentPdfExportRoot');

  a.check(pageEls.length === fixture.expectedPageCount,
    `expected exactly ${fixture.expectedPageCount} pages, got ${pageEls.length}`);

  const isDraftFilename = /_DRAFT/.test(readyFilename);
  const watermarkCount = await root.locator('.incidentWatermark').count();
  if (fixture.expectFinal) {
    a.check(!isDraftFilename, `expected a final (non-_DRAFT) filename, got "${readyFilename}"`);
    a.check(watermarkCount === 0, `expected no DRAFT watermark on a final export, found ${watermarkCount}`);
  } else {
    a.check(isDraftFilename, `expected a draft (_DRAFT) filename, got "${readyFilename}"`);
    a.check(watermarkCount > 0, 'expected at least one DRAFT watermark on a draft export');
  }

  if (fixture.name === 'full') {
    const witnessSignatureCount = await page.locator('.incidentPage').nth(2).locator('.incSignatureImage').count()
      + await page.locator('.incidentPage').nth(3).locator('.incSignatureImage').count();
    a.check(witnessSignatureCount > 0, 'expected at least one witness signature image to render');
    const teamSignatureCount = await page.locator('.incTeamTable .incSignatureImage').count();
    a.check(teamSignatureCount > 0, 'expected at least one investigation-team signature image to render');
    const wrapBox = await page.locator('.incidentBodyDiagramImageWrap').boundingBox();
    const markCount = await page.locator('.incidentBodyDiagramImageWrap .incidentBodyDiagramMark').count();
    a.check(markCount === 2, `expected 2 body diagram marks rendered inside the image wrapper, found ${markCount}`);
    a.check(Boolean(wrapBox && wrapBox.width > 0 && wrapBox.height > 0), 'expected the body diagram image wrapper to have a measurable size');
  }

  if (fixture.name === 'na') {
    const page2Text = await page.locator('.incidentPage').nth(1).innerText();
    a.check(/INJURED PARTY/.test(page2Text), 'page 2 should always render the INJURED PARTY section header, even when Injury = No');
    a.check((page2Text.match(/N\/A/g) || []).length >= 5, 'page 2 should show N/A in every injury detail field when Injury = No');

    const page3Text = await page.locator('.incidentPage').nth(2).innerText();
    const page4Text = await page.locator('.incidentPage').nth(3).innerText();
    const witnessHeaders = (page3Text.match(/WITNESS \d/g) || []).concat(page4Text.match(/WITNESS \d/g) || []);
    a.check(witnessHeaders.length === 3, `expected all 3 witness block headers across pages 3-4, found ${witnessHeaders.length}`);
    a.check(/PROPERTY DAMAGE/.test(page4Text), 'page 4 should always render the PROPERTY DAMAGE line');
    a.check((page4Text.match(/N\/A/g) || []).length >= 4, 'page 4 should show N/A in all 4 property-damage detail fields when Property Damage = No');

    const page6TeamRows = await page.locator('.incidentPage').nth(5).locator('.incTeamTable tbody tr').count();
    a.check(page6TeamRows === 4, `expected 4 investigation-team rows on page 6, found ${page6TeamRows}`);
  }

  if (fixture.name === 'userDraft') {
    // The core v0.1.1 bug: this exact report used to produce a wasted,
    // nearly-empty page 7 for a few leftover Safety Consultant Notes lines.
    const continuationCount = await page.locator('.incidentPage.incidentContinuationPage').count();
    a.check(continuationCount === 0, `expected no continuation page for the user-draft fixture, found ${continuationCount}`);

    // Four equal investigation-team rows (page 6, last table) -- no
    // collapsed/blank rows next to the one populated row.
    const teamRowHeights = await page.locator('.incTeamTable tbody tr').evaluateAll(
      (rows) => rows.map((r) => r.getBoundingClientRect().height),
    );
    a.check(teamRowHeights.length === 4, `expected 4 investigation-team rows, found ${teamRowHeights.length}`);
    if (teamRowHeights.length === 4) {
      const maxH = Math.max(...teamRowHeights);
      const minH = Math.min(...teamRowHeights);
      a.check(maxH - minH < 3, `expected all 4 investigation-team rows to have consistent height, got heights ${JSON.stringify(teamRowHeights)}`);
      a.check(minH >= 38, `expected investigation-team rows to be at least ~40px tall, smallest was ${minH}px`);
    }

    // Witness 1 has an intentional bordered signature+date row, not a bare
    // floating image.
    const witness1SigCell = page.locator('.incidentPage').nth(2).locator('.incSignatureTable .incSignatureCell').first();
    const witness1SigCellBox = await witness1SigCell.boundingBox();
    a.check(Boolean(witness1SigCellBox && witness1SigCellBox.height >= 30), 'expected witness 1 signature cell to be a properly sized bordered cell (>=30px tall)');
    const witness1SigImgCount = await witness1SigCell.locator('.incSignatureImage').count();
    a.check(witness1SigImgCount === 1, `expected exactly 1 signature image in witness 1's signature cell, found ${witness1SigImgCount}`);

    // Page 1's top information grid: the Workplace Location value spans 3
    // of the table's 4 equal columns (colSpan=3, ~75% of the table width),
    // not a narrow single column with unexplained blank cells beside it.
    const page1Table = page.locator('.incidentPage').first().locator('.incInfoTable').first();
    const tableBox = await page1Table.boundingBox();
    const workplaceValueCell = page1Table.locator('tbody tr').first().locator('td').first();
    const valueCellBox = await workplaceValueCell.boundingBox();
    a.check(
      Boolean(tableBox && valueCellBox && valueCellBox.width > tableBox.width * 0.6),
      `expected the Workplace Location value cell to span most of the table width (colSpan=3), got ${valueCellBox?.width} of ${tableBox?.width}`,
    );

    // Body-diagram wording updated from "SHADE" to "MARK".
    const page2Text = await page.locator('.incidentPage').nth(1).innerText();
    a.check(/MARK ALL AREAS THAT APPLY/.test(page2Text), 'expected updated body-diagram wording "MARK ALL AREAS THAT APPLY"');
    a.check(!/SHADE ALL AREAS/.test(page2Text), 'expected old "SHADE ALL AREAS" wording to be gone');

    // Watermark reduced from the original 72pt/0.16-alpha and rendered
    // behind content (z-index below the header/body's stacking level).
    const wmFontPx = await page.locator('.incidentWatermark').first().evaluate((elWm) => parseFloat(getComputedStyle(elWm).fontSize));
    a.check(wmFontPx < 72 * (96 / 72), `expected watermark font-size smaller than the original 72pt (96px), computed ${wmFontPx}px`);
    const bodyZ = await page.locator('.incidentPage').first().locator('.incidentPageBody').evaluate((elBody) => getComputedStyle(elBody).zIndex);
    const wmZ = await page.locator('.incidentWatermark').first().evaluate((elWm) => getComputedStyle(elWm).zIndex);
    a.check(Number(bodyZ) > Number(wmZ), `expected page body z-index (${bodyZ}) above watermark z-index (${wmZ}) so content paints on top`);
  }

  // Cause-analysis page assertions apply to every fixture (page 5 is always
  // present at a fixed index for these three fixtures since none of them
  // overflow before page 5).
  const causePageIndex = fixture.name === 'overflow' ? null : 4;
  if (causePageIndex != null) {
    const causePage = page.locator('.incidentPage').nth(causePageIndex);
    const otherLinesCount = await causePage.locator('.incCauseOtherLines, .incCauseOtherLine').count();
    a.check(otherLinesCount === 0, 'expected no duplicated Other section beneath the cause table');
    const causeFontPx = await causePage.locator('.incCauseTable').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // 9pt == 12px at the standard 96dpi/72pt browser conversion used throughout this module.
    a.check(causeFontPx >= 12, `expected cause table body font-size >= 9pt (12px), computed ${causeFontPx}px`);
  }

  if (a.failures.length) {
    console.error(`  FAILED ASSERTIONS for fixture "${fixture.name}":`);
    a.failures.forEach(f => console.error(`    - ${f}`));
  } else {
    console.log('  All assertions passed.');
  }

  const summary = {
    fixture: fixture.name,
    generatedAt: new Date().toISOString(),
    pdfReadyHeadline: readyHeadline,
    pdfReadyFilename: readyFilename,
    pageCount: pageEls.length,
    expectedPageCount: fixture.expectedPageCount,
    assertionFailures: a.failures,
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
      fixture: s.fixture, pageCount: s.pageCount, expectedPageCount: s.expectedPageCount, headline: s.pdfReadyHeadline,
      assertionFailures: s.assertionFailures.length, consoleErrors: s.consoleErrors.length, pageErrors: s.pageErrors.length,
    })), null, 2));

    const anyErrors = summaries.some(s => s.consoleErrors.length || s.pageErrors.length || s.assertionFailures.length);
    if (anyErrors) {
      console.error('\nFAILED: console/page errors or assertion failures were captured during at least one fixture run (see per-fixture summary.json).');
      process.exitCode = 1;
    } else {
      console.log('\nAll fixtures passed all assertions with zero console/page errors.');
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('Verification script failed:', err);
  process.exitCode = 1;
});
