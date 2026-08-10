// Regression coverage for the Employee Separation form (Milestone 5 of the
// Superintendent Document Suite mission). Same pattern/lessons as the other
// verify-*.mjs scripts in this batch — standalone execution, getByRole
// textbox/exact matching, case-insensitive badge text, scrollIntoView
// before drawing a signature.
//   node tools/testing/verify-separation.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'separation');
mkdirSync(outDir, { recursive: true });

const PORT = 4328;
const BASE_URL = `http://localhost:${PORT}`;
const STORAGE_KEY = 'sdc.separation.draft.v1';

function loadFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
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

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  [PASS] ${label}`);
  else { console.log(`  [FAIL] ${label}`); failures += 1; }
}

async function drawSignature(page) {
  const canvas = page.locator('canvas.signatureCanvas').first();
  await canvas.waitFor({ state: 'visible' });
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await canvas.boundingBox();
  const points = [
    [box.x + box.width * 0.15, box.y + box.height * 0.7],
    [box.x + box.width * 0.3, box.y + box.height * 0.25],
    [box.x + box.width * 0.5, box.y + box.height * 0.75],
    [box.x + box.width * 0.7, box.y + box.height * 0.3],
    [box.x + box.width * 0.85, box.y + box.height * 0.6],
  ];
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [px, py] of points.slice(1)) {
    await page.mouse.move(px, py, { steps: 6 });
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.locator('.signaturePadActions button', { hasText: /^Save$/ }).first().click();
  await page.waitForTimeout(150);
}

async function main() {
  console.log('[1/5] Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', d => { serverOutput += d.toString(); });
  server.stderr.on('data', d => { serverOutput += d.toString(); });

  try {
    await waitForServer(BASE_URL, 20000);
    console.log('[2/5] Preview server ready at', BASE_URL);
    const browser = await chromium.launch();

    // ── 1. Real UI workflow: Discharge reveals warning-history sub-fields ──
    console.log('\n=== 1. Real UI workflow ===');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const consoleErrors = []; const pageErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => pageErrors.push(String(e)));

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Documents', exact: false }).first().click();
      const row = page.locator('.listItem', { hasText: 'Employee Separation' });
      await row.getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('text=Separation Details');

      await page.getByRole('textbox', { name: 'Employee Name', exact: true }).fill('Jordan Blake');
      await page.getByRole('textbox', { name: 'Supervisor', exact: true }).fill('Casey Renn');

      const dischargeFieldsBefore = await page.locator('text=Discharge — Warning History').count();
      check(dischargeFieldsBefore === 0, 'Discharge warning-history fields hidden before Discharge is selected');
      await page.getByRole('button', { name: 'Discharge', exact: true }).click();
      await page.waitForSelector('text=Discharge — Warning History');
      check(true, 'Discharge warning-history fields appear once Discharge is selected');

      await page.getByRole('textbox', { name: 'Detailed Explanation', exact: true }).fill('Repeated safety policy violations after two prior documented warnings.');
      await page.getByRole('button', { name: 'Yes', exact: true }).first().click();
      await page.getByRole('textbox', { name: 'How many warning notices?', exact: true }).fill('2');
      await page.getByRole('button', { name: 'No', exact: true }).last().click(); // "Would you re-hire?" = No

      const sigCount = await page.locator('.signaturePad button', { hasText: 'Add signature' }).count();
      check(sigCount === 2, `Both signature pads present (found ${sigCount})`);
      // Only Supervisor signature is required for readiness — sign that one.
      await page.locator('.signaturePad', { hasText: 'Supervisor Signature' }).getByRole('button', { name: 'Add signature' }).click();
      await drawSignature(page);

      await page.getByRole('button', { name: 'Go to Review' }).click();
      await page.waitForSelector('text=Readiness');
      const pendingItems = await page.locator('.incidentReadinessItem.pending').count();
      check(pendingItems === 0, `Readiness satisfied with only the required Supervisor signature (${pendingItems} pending item(s))`);

      await page.getByRole('button', { name: 'Mark Ready' }).click();
      await page.waitForTimeout(300);
      const badgeText = await page.locator('.builderHeaderBadges .badge').innerText();
      check(badgeText.trim().toLowerCase() === 'ready', `Status badge reads "Ready" (got "${badgeText.trim()}")`);

      await page.getByRole('button', { name: /Create Document/ }).click();
      await page.waitForSelector('.pdfReadyPanel', { timeout: 30000 });
      const headline = await page.locator('.pdfReadyHeadline').innerText();
      console.log(`  PDF ready: ${headline}`);
      check(/^1 page$/.test(headline.trim()), `Normal-length content fits on 1 page (got "${headline.trim()}")`);

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button', { hasText: 'Download Document' }).click();
      const download = await downloadPromise;
      await download.saveAs(path.join(outDir, 'ui-workflow-generated.pdf'));

      await page.reload({ waitUntil: 'networkidle' });
      const raw = await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY);
      const persisted = JSON.parse(raw || 'null');
      check(Boolean(persisted) && persisted.employeeName === 'Jordan Blake', 'Draft persisted under sdc.separation.draft.v1 after reload');
      check(persisted?.status === 'completed', `Status is "completed" after PDF export (got "${persisted?.status}")`);
      check(persisted?.employeeSignatureData == null, 'Employee signature correctly left unset when the employee did not sign');

      // Scope creep guard: the model must never grow payroll/HR fields the
      // mission explicitly excludes (address/phone/pay rate/tax withholding/
      // benefits/loans/payroll status).
      const forbiddenKeys = Object.keys(persisted).filter(k => /address|phone|payRate|taxWithholding|benefit|loan|payrollStatus/i.test(k));
      check(forbiddenKeys.length === 0, `No payroll/HR data-change fields present in the model (found: ${forbiddenKeys.join(', ') || 'none'})`);

      check(consoleErrors.length === 0, `No console errors (${consoleErrors.length} found)${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
      check(pageErrors.length === 0, `No page errors (${pageErrors.length} found)${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`);

      await page.evaluate(key => window.localStorage.removeItem(key), STORAGE_KEY);
      await context.close();
    }

    // ── 2. Draft key isolation ──
    console.log('\n=== 2. Draft key isolation ===');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(json => window.localStorage.setItem('sdc.separation.draft.v1', json), loadFixture('separation-resignation.json'));
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      for (const key of ['sdc.jsa.draft.v4', 'sdc.incident.draft.v1', 'sdc.discipline.draft.v1', 'sdc.uncontrolled.draft.v1', 'sdc.medical.draft.v1']) {
        const val = await page.evaluate(k => window.localStorage.getItem(k), key);
        check(val === null, `Does not create/touch ${key}`);
      }
      await page.evaluate(() => window.localStorage.clear());
      await context.close();
    }

    // ── 3. PDF fixtures: resignation / discharge / no-call-no-show ──
    console.log('\n=== 3. PDF fixtures (page count + no clipping) ===');
    const fixtures = [
      { name: 'separation-resignation.json', label: 'resignation', title: 'Dale Hutto', expectMaxPages: 1 },
      { name: 'separation-discharge.json', label: 'discharge', title: 'Marcus Doyle', expectMaxPages: 1 },
      { name: 'separation-no-call-no-show.json', label: 'no-call-no-show', title: 'Regina Poe', expectMaxPages: 1 },
    ];
    const summary = [];
    for (const fx of fixtures) {
      console.log(`\n--- Fixture: ${fx.label} ---`);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(json => window.localStorage.setItem('sdc.separation.draft.v1', json), loadFixture(fx.name));
      const page = await context.newPage();
      const consoleErrors = []; const pageErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => pageErrors.push(String(e)));

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.locator('.sidebarNavItem, .mobileNavItem', { hasText: 'Drafts' }).first().click();
      const draftRow = page.locator('.listItem', { hasText: fx.title });
      await draftRow.getByRole('button', { name: 'Open Draft' }).click();
      await page.waitForSelector('text=Separation Details').catch(() => {});

      await page.getByRole('button', { name: 'Go to Review' }).click().catch(() => {});
      await page.waitForSelector('text=Readiness', { timeout: 5000 }).catch(() => {});
      await page.getByRole('button', { name: /Create Document/ }).click();
      await page.waitForSelector('.pdfReadyPanel', { timeout: 30000 });
      const headline = (await page.locator('.pdfReadyHeadline').innerText()).trim();
      const pageCount = parseInt(headline, 10);
      console.log(`  PDF ready: ${headline}`);
      check(Number.isFinite(pageCount) && pageCount >= 1 && pageCount <= fx.expectMaxPages, `Page count within expected range (got ${pageCount}, expected 1-${fx.expectMaxPages})`);

      const overflowReport = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll('.docPdfExportRoot[data-doc-id="separation"] .docPdfPage'));
        return pages.map((p, i) => ({ index: i + 1, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight }));
      });
      overflowReport.forEach(p => {
        check(p.scrollHeight <= p.clientHeight + 2, `page ${p.index}: no clipped content (scrollHeight ${p.scrollHeight}px <= clientHeight ${p.clientHeight}px, +2px tolerance)`);
      });

      // The Employee Data Change half of the historical form must never
      // appear — this is a separation-only document.
      const pageText = await page.evaluate(() => document.querySelector('.docPdfExportRoot[data-doc-id="separation"] .docPdfPage')?.textContent || '');
      check(!/pay rate|tax withholding|address change|phone change/i.test(pageText), 'No Employee Data Change content leaked into the printed form');

      // Discharge-only section must only print for the discharge fixture.
      const hasDischargeSection = pageText.includes('Discharge');
      const expectDischarge = fx.label === 'discharge';
      check(hasDischargeSection === expectDischarge, `Discharge warning-history section only prints for the discharge fixture (present: ${hasDischargeSection}, expected: ${expectDischarge})`);

      check(consoleErrors.length === 0, `No console errors (${consoleErrors.length} found)`);
      check(pageErrors.length === 0, `No page errors (${pageErrors.length} found)`);

      await page.addStyleTag({ content: '.docPdfExportRoot[data-doc-id="separation"] { position: static !important; left: 0 !important; top: 0 !important; }' });
      await page.locator('.docPdfExportRoot[data-doc-id="separation"] .docPdfPage').first().screenshot({ path: path.join(outDir, `${fx.label}-page1.png`) }).catch(() => {});

      summary.push({ fixture: fx.label, pageCount, hasDischargeSection, overflowReport, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length });
      await context.close();
    }

    // ── 4. Mobile viewport (390px) ──
    console.log('\n=== 4. Mobile viewport (390px) ===');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e)));
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.locator('.mobileNavItem', { hasText: 'Documents' }).click();
      const row = page.locator('.listItem', { hasText: 'Employee Separation' });
      await row.getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('text=Separation Details');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `No horizontal overflow on phone (scrollWidth - clientWidth = ${overflow})`);
      const bottomNavHidden = await page.evaluate(() => {
        const el = document.querySelector('.mobileBottomNav');
        return !el || getComputedStyle(el).display === 'none';
      });
      check(bottomNavHidden, 'Bottom nav hidden while the builder is open');

      // Smoke-test the shared SignaturePad's native touch listener path
      // (see src/incident/SignaturePad.jsx) with real CDP touch dispatch,
      // not synthetic JS calls into the component's internals. Signature
      // pads render on this same first step, no Next click required.
      await page.getByRole('textbox', { name: 'Employee Name', exact: true }).fill('Touch Smoke Test');
      await page.getByRole('textbox', { name: 'Supervisor', exact: true }).fill('Casey Renn');
      await page.locator('.signaturePad', { hasText: 'Supervisor Signature' }).getByRole('button', { name: 'Add signature' }).click();
      const canvas = page.locator('canvas.signatureCanvas').first();
      await canvas.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const box = await canvas.boundingBox();
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.15, y: box.y + box.height * 0.5 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * 0.5, y: box.y + box.height * 0.3 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * 0.85, y: box.y + box.height * 0.6 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const hasInk = await canvas.evaluate((el) => {
        const ctx = el.getContext('2d');
        const data = ctx.getImageData(0, 0, el.width, el.height).data;
        for (let i = 3; i < data.length; i += 4 * 8) { if (data[i] > 10) return true; }
        return false;
      });
      check(hasInk, 'Touch input (native touch listener path) draws visible ink on the signature canvas');
      await page.locator('.signaturePadActions button', { hasText: /^Save$/ }).first().click();
      const previewSrc = await page.locator('.signaturePreview').first().getAttribute('src');
      check(Boolean(previewSrc && previewSrc.startsWith('data:image/png')), 'Touch-drawn signature saves to a real PNG preview');

      check(pageErrors.length === 0, `No page errors on phone (${pageErrors.length} found)`);
      await page.evaluate(key => window.localStorage.removeItem(key), STORAGE_KEY);
      await context.close();
    }

    await browser.close();

    console.log('\n=== OVERALL SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  } finally {
    server.kill();
  }

  console.log(`\n[5/5] Done. ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) {
    console.log('--- preview server output (tail) ---');
    console.log(serverOutput.slice(-2000));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
