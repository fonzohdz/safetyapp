// Regression coverage for the Employee Disciplinary Notice (Milestone 2 of
// the Superintendent Document Suite mission). Same pattern as the existing
// verify-*.mjs scripts: `vite preview` serving the production build, driven
// with real Playwright interaction (typing, signature drawing) plus direct
// localStorage seeding for the PDF-content fixture cases. Run standalone
// (no pipe to tail — see the mobile UX session's postmortem on why piping
// this kind of script deadlocks stdout):
//   node tools/testing/verify-disciplinary.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'disciplinary');
mkdirSync(outDir, { recursive: true });

const PORT = 4325;
const BASE_URL = `http://localhost:${PORT}`;
const STORAGE_KEY = 'sdc.discipline.draft.v1';

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

async function main() {
  console.log('[1/6] Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', d => { serverOutput += d.toString(); });
  server.stderr.on('data', d => { serverOutput += d.toString(); });

  try {
    await waitForServer(BASE_URL, 20000);
    console.log('[2/6] Preview server ready at', BASE_URL);
    const browser = await chromium.launch();

    // ── 1. Real UI workflow: fill, sign, autosave, reload, generate PDF ──
    console.log('\n=== 1. Real UI workflow ===');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const consoleErrors = []; const pageErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => pageErrors.push(String(e)));

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Documents', exact: false }).first().click();
      await page.waitForSelector('text=Employee Disciplinary Notice');
      const row = page.locator('.listItem', { hasText: 'Employee Disciplinary Notice' });
      await row.getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('text=Notice Details');

      // getByRole('textbox', ...) rather than getByLabel — the stepper rail's
      // own tab buttons carry an aria-label like "Corrective Action: Needs
      // Info", which substring-collides with getByLabel's default matching
      // against a same-named field; scoping to the textbox/input role avoids
      // matching a role="tab" element entirely.
      await page.getByRole('textbox', { name: 'Employee Name', exact: true }).fill('Jordan Blake');
      await page.getByRole('textbox', { name: 'Supervisor', exact: true }).fill('Casey Renn');
      await page.getByRole('textbox', { name: 'Position', exact: true }).fill('Laborer');
      await page.getByRole('button', { name: 'Written Warning', exact: true }).click();
      await page.getByRole('textbox', { name: 'Describe what happened', exact: true }).fill('Employee failed to wear required fall protection while working at height on the scaffold.');

      await page.getByRole('button', { name: 'Next' }).click();
      await page.waitForSelector('text=Corrective Action');
      await page.getByRole('textbox', { name: 'Corrective action', exact: true }).fill('Employee must wear fall protection at all times above six feet, verified daily by the foreman.');
      await page.getByRole('textbox', { name: 'Company action', exact: true }).fill('The company will retrain the employee on fall protection requirements.');
      await page.getByRole('textbox', { name: 'Consequence', exact: true }).fill('Further violations will result in suspension or termination.');

      // Draw both signatures with real pointer input. Button text is scoped
      // to .signaturePadActions/.signaturePad with an exact "Save" match —
      // the builder header's own "Save Now" button also contains the
      // substring "Save", which a loose hasText match would collide with.
      const sigButtons = page.locator('.signaturePad button', { hasText: 'Add signature' });
      const sigCount = await sigButtons.count();
      check(sigCount === 2, `Both signature pads present before signing (found ${sigCount})`);
      for (let i = 0; i < sigCount; i += 1) {
        await page.locator('.signaturePad button', { hasText: 'Add signature' }).first().click();
        const canvas = page.locator('canvas.signatureCanvas').first();
        // A lower signature pad can sit beyond the viewport, and synthetic
        // mouse coordinates below the viewport bottom never register as a
        // stroke (see the Uncontrolled Event regression's own postmortem).
        await canvas.scrollIntoViewIfNeeded();
        const box = await canvas.boundingBox();
        await page.mouse.move(box.x + 20, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2 - 10, { steps: 8 });
        await page.mouse.up();
        await page.locator('.signaturePadActions button', { hasText: /^Save$/ }).first().click();
      }
      const remainingAdd = await page.locator('.signaturePad button', { hasText: 'Add signature' }).count();
      check(remainingAdd === 0, 'Both signatures captured (no "Add signature" buttons remain)');

      await page.getByRole('button', { name: 'Go to Review' }).click();
      await page.waitForSelector('text=Readiness');

      const pendingItems = await page.locator('.incidentReadinessItem.pending').count();
      check(pendingItems === 0, `Readiness checklist fully satisfied (${pendingItems} pending item(s))`);

      await page.getByRole('button', { name: 'Finish Document', exact: true }).click();
      await page.locator('.dialogPanel', { hasText: 'Finish this document?' }).getByRole('button', { name: 'Finish Document', exact: true }).click();
      await page.waitForTimeout(300);
      // .badge renders text-transform:uppercase — innerText reflects that
      // CSS-rendered casing, so compare case-insensitively against the
      // underlying "Finished" label the component actually sets.
      const badgeText = await page.locator('.builderHeaderBadges .badge').innerText();
      check(badgeText.trim().toLowerCase() === 'finished', `Status badge reads "Finished" after confirming Finish Document (got "${badgeText.trim()}")`);

      await page.getByRole('button', { name: /Create Document/ }).click();
      await page.waitForSelector('.pdfReadyPanel', { timeout: 30000 });
      const headline = await page.locator('.pdfReadyHeadline').innerText();
      console.log(`  PDF ready: ${headline}`);
      check(/^1 page$/.test(headline.trim()), `Normal-length content fits on 1 page (got "${headline.trim()}")`);

      const downloadPromise = page.waitForEvent('download');
      await page.locator('button', { hasText: 'Download Document' }).click();
      const download = await downloadPromise;
      const pdfPath = path.join(outDir, 'ui-workflow-generated.pdf');
      await download.saveAs(pdfPath);
      console.log('  Saved PDF ->', pdfPath);

      // Reload and confirm the draft (now completed) persisted.
      await page.reload({ waitUntil: 'networkidle' });
      const raw = await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY);
      const persisted = JSON.parse(raw || 'null');
      check(Boolean(persisted) && persisted.employeeName === 'Jordan Blake', 'Draft persisted to localStorage under sdc.discipline.draft.v1 after reload');
      check(persisted?.status === 'completed', `Status is "completed" after a successful PDF export (got "${persisted?.status}")`);

      check(consoleErrors.length === 0, `No console errors (${consoleErrors.length} found)${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`);
      check(pageErrors.length === 0, `No page errors (${pageErrors.length} found)${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`);

      // Clean up this draft so it doesn't leak into later sections.
      await page.evaluate(key => window.localStorage.removeItem(key), STORAGE_KEY);
      await context.close();
    }

    // ── 2. Draft collision isolation: Disciplinary draft must not touch JSA/Incident keys ──
    console.log('\n=== 2. Draft key isolation ===');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(json => window.localStorage.setItem('sdc.discipline.draft.v1', json), loadFixture('disciplinary-normal.json'));
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      const keys = await page.evaluate(() => Object.keys(window.localStorage));
      check(keys.includes('sdc.discipline.draft.v1'), 'Disciplinary draft key present');
      const jsaDraftUntouched = await page.evaluate(() => window.localStorage.getItem('sdc.jsa.draft.v4'));
      check(jsaDraftUntouched === null, 'Seeding a Disciplinary draft does not create/touch sdc.jsa.draft.v4');
      const incidentDraftUntouched = await page.evaluate(() => window.localStorage.getItem('sdc.incident.draft.v1'));
      check(incidentDraftUntouched === null, 'Seeding a Disciplinary draft does not create/touch sdc.incident.draft.v1');
      await page.evaluate(() => window.localStorage.clear());
      await context.close();
    }

    // ── 3. PDF content fixtures: normal / long section / long multi-section ──
    console.log('\n=== 3. PDF fixtures (page count + no clipping) ===');
    const fixtures = [
      { name: 'disciplinary-normal.json', label: 'normal', expectMaxPages: 1 },
      { name: 'disciplinary-long-section1.json', label: 'long-section1', expectMaxPages: 2 },
      // All 7 numbered sections stuffed with long text simultaneously is a
      // deliberately pathological case (no real disciplinary notice would
      // ever have every section this long) — the important thing is safe,
      // uncapped-but-uncupped pagination (verified below via per-page
      // scrollHeight<=clientHeight), not hitting a specific page count.
      { name: 'disciplinary-long-multisection.json', label: 'long-multisection', expectMaxPages: 10 },
    ];
    const summary = [];
    for (const fx of fixtures) {
      console.log(`\n--- Fixture: ${fx.label} ---`);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(json => window.localStorage.setItem('sdc.discipline.draft.v1', json), loadFixture(fx.name));
      const page = await context.newPage();
      const consoleErrors = []; const pageErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => pageErrors.push(String(e)));

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      // Load the fixture via the real Drafts -> Open Draft path (the entry
      // point that actually populates the editable model — "Start" always
      // begins a blank document, see makeDraftEntryPoints in main.jsx).
      await page.locator('.sidebarNavItem, .mobileNavItem', { hasText: 'Drafts' }).first().click();
      const draftRow = page.locator('.listItem', { hasText: 'Warning level' });
      await draftRow.getByRole('button', { name: 'Open Draft' }).click();
      await page.waitForSelector('text=Notice Details').catch(() => {});

      await page.getByRole('button', { name: 'Next' }).click().catch(() => {});
      await page.getByRole('button', { name: 'Go to Review' }).click().catch(() => {});
      await page.waitForSelector('text=Readiness', { timeout: 5000 }).catch(() => {});
      await page.getByRole('button', { name: /Create Document/ }).click();
      await page.waitForSelector('.pdfReadyPanel', { timeout: 30000 });
      const headline = (await page.locator('.pdfReadyHeadline').innerText()).trim();
      const pageCount = parseInt(headline, 10);
      console.log(`  PDF ready: ${headline}`);
      check(Number.isFinite(pageCount) && pageCount >= 1 && pageCount <= fx.expectMaxPages, `Page count within expected range (got ${pageCount}, expected 1-${fx.expectMaxPages})`);

      // Check every generated page for clipped content (real DOM measurement
      // against the .docPdfPage's own fixed geometry, same check the
      // Incident/Superintendent regressions already use).
      const overflowReport = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll('.docPdfExportRoot[data-doc-id="disciplinary"] .docPdfPage'));
        return pages.map((p, i) => ({ index: i + 1, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight }));
      });
      overflowReport.forEach(p => {
        check(p.scrollHeight <= p.clientHeight + 2, `page ${p.index}: no clipped content (scrollHeight ${p.scrollHeight}px <= clientHeight ${p.clientHeight}px, +2px tolerance)`);
      });

      check(consoleErrors.length === 0, `No console errors (${consoleErrors.length} found)`);
      check(pageErrors.length === 0, `No page errors (${pageErrors.length} found)`);

      // Reveal the off-screen export root before screenshotting it — same
      // technique verify-jsa-pdf.mjs uses; a locator screenshot on a
      // position:fixed;left:-20000px element captures the visible viewport
      // instead of the element itself, not the intended off-screen page.
      await page.addStyleTag({ content: '.docPdfExportRoot[data-doc-id="disciplinary"] { position: static !important; left: 0 !important; top: 0 !important; }' });
      const pngPath = path.join(outDir, `${fx.label}-page1.png`);
      await page.locator('.docPdfExportRoot[data-doc-id="disciplinary"] .docPdfPage').first().screenshot({ path: pngPath }).catch(() => {});

      summary.push({ fixture: fx.label, pageCount, overflowReport, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length });
      await context.close();
    }

    // ── 4. Mobile viewport (390px): no overflow, sidebar hidden, signature usable ──
    console.log('\n=== 4. Mobile viewport (390px) ===');
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e)));
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.locator('.mobileNavItem', { hasText: 'Documents' }).click();
      const row = page.locator('.listItem', { hasText: 'Employee Disciplinary Notice' });
      await row.getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('text=Notice Details');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `No horizontal overflow on phone (scrollWidth - clientWidth = ${overflow})`);
      const bottomNavHidden = await page.evaluate(() => {
        const el = document.querySelector('.mobileBottomNav');
        return !el || getComputedStyle(el).display === 'none';
      });
      check(bottomNavHidden, 'Bottom nav hidden while the Disciplinary Notice builder is open');

      // Smoke-test the shared SignaturePad's native touch listener path
      // (see src/incident/SignaturePad.jsx) with real CDP touch dispatch,
      // not synthetic JS calls into the component's internals.
      await page.getByRole('textbox', { name: 'Employee Name', exact: true }).fill('Touch Smoke Test');
      await page.getByRole('button', { name: 'Next' }).click();
      await page.waitForSelector('text=Corrective Action');
      await page.locator('.signaturePad button', { hasText: 'Add signature' }).first().click();
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

    // ── 5. Finish Document confirmation and editing lock ──
    console.log('\n=== 5. Finish Document confirmation and editing lock ===');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Documents', exact: false }).first().click();
      await page.locator('.listItem', { hasText: 'Employee Disciplinary Notice' }).getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('text=Notice Details');
      await page.getByRole('textbox', { name: 'Employee Name', exact: true }).fill('Finish Lock Test');
      await page.getByRole('textbox', { name: 'Supervisor', exact: true }).fill('Casey Renn');
      await page.getByRole('button', { name: 'Written Warning', exact: true }).click();
      await page.getByRole('textbox', { name: 'Describe what happened', exact: true }).fill('Test occurrence.');
      await page.getByRole('button', { name: 'Next' }).click();
      await page.waitForSelector('text=Corrective Action');
      await page.getByRole('textbox', { name: 'Corrective action', exact: true }).fill('Test corrective action.');
      for (let i = 0; i < 2; i += 1) {
        await page.locator('.signaturePad button', { hasText: 'Add signature' }).first().click();
        const canvas = page.locator('canvas.signatureCanvas').first();
        await canvas.scrollIntoViewIfNeeded();
        const box = await canvas.boundingBox();
        await page.mouse.move(box.x + 20, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2 - 10, { steps: 6 });
        await page.mouse.up();
        await page.locator('.signaturePadActions button', { hasText: /^Save$/ }).first().click();
      }
      await page.getByRole('button', { name: 'Go to Review' }).click();
      await page.waitForSelector('text=Readiness');

      const finishBtn = page.getByRole('button', { name: 'Finish Document', exact: true });
      check(await finishBtn.isEnabled(), 'Finish Document is enabled once the checklist is complete');
      await finishBtn.click();
      const dialog = page.locator('.dialogPanel', { hasText: 'Finish this document?' });
      check(await dialog.isVisible(), 'Confirmation dialog appears on Finish Document click');
      await dialog.getByRole('button', { name: 'Finish Document', exact: true }).click();
      await page.waitForTimeout(300);
      const badge = await page.locator('.builderHeaderBadges .badge').innerText();
      check(badge.toLowerCase() === 'finished', `Badge reads "Finished" after confirming (got "${badge}")`);

      await page.getByRole('tab', { name: /Notice Details/ }).click();
      const nameField = page.getByRole('textbox', { name: 'Employee Name', exact: true });
      check(await nameField.isDisabled(), 'Employee Name field is disabled once finished');
      const replaceBtn = page.locator('.signaturePadActions button', { hasText: 'Replace' });
      check(await replaceBtn.count() === 0, 'No Replace button remains on a finished signature');

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

  console.log(`\n[6/6] Done. ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
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
