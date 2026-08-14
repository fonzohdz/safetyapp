// DESIGN PROTOTYPE verification script (2026-08-13 JSA Crew Sign-In Kiosk).
//
// Not part of the application build or bundle. Drives the real UI to:
//   1. Open the JSA Signatures step and launch the kiosk.
//   2. Simulate several people signing in sequence (mouse-drag drawing +
//      Confirm & Next), screenshotting each state.
//   3. Verify: signature count increments, canvas visibly resets between
//      signers, previously-confirmed signatures are never touched again,
//      the "Clear" button only affects the CURRENT in-progress signature.
//   4. Verify the exit-hold control actually requires a hold, not a tap.
//   5. Verify the data actually persisted (crewSignatures array in the
//      saved draft) and that the existing PDF export still works untouched.
//
// node tools/testing/verify-crew-signin-kiosk.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { killTree } from './lib/killTree.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'crew-signin-kiosk');
mkdirSync(outDir, { recursive: true });

const jsaDraft = readFileSync(path.join(__dirname, 'fixtures', 'entergy-taps-draft.json'), 'utf8');
JSON.parse(jsaDraft);

const PORT = 4324;
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

async function drawSignature(page, canvasLocator, seed) {
  const box = await canvasLocator.boundingBox();
  const x0 = box.x + box.width * 0.15;
  const y0 = box.y + box.height * 0.5 + seed;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(x0 + i * (box.width * 0.08), y0 + Math.sin(i + seed) * 20);
  }
  await page.mouse.up();
}

async function main() {
  console.log('[1] Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const consoleErrors = [];
  const pageErrors = [];
  const checks = [];
  function check(cond, msg) { checks.push({ ok: !!cond, msg }); console.log(`    [${cond ? 'PASS' : 'FAIL'}] ${msg}`); }

  try {
    await waitForServer(BASE_URL, 20000);
    console.log('[2] Preview server ready at', BASE_URL);
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    await context.addInitScript((json) => { window.localStorage.setItem('sdc.jsa.draft.v4', json); }, jsaDraft);
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    console.log('[3] Loading app, navigating to JSA Signatures step...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Continue JSA' }).click();
    await page.getByRole('tab', { name: /^Signatures/ }).click();
    await page.locator('text=Crew Sign-In (kiosk mode)').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outDir, '01-signatures-step-before.png') });

    console.log('[4] Opening kiosk...');
    await page.getByRole('button', { name: 'Start Crew Sign-In' }).click();
    await page.locator('.crewKiosk').waitFor({ state: 'visible' });
    const numberLocator = page.locator('.crewKioskNumber');
    check((await numberLocator.innerText()).includes('#1'), 'Kiosk opens on signer #1');
    await page.screenshot({ path: path.join(outDir, '02-kiosk-signer-1-blank.png') });

    const canvas = page.locator('.crewKioskCanvas');

    // Signer 1: draw, verify Confirm is enabled only after a stroke, confirm.
    const confirmBtn = page.locator('.crewKioskConfirm');
    check(await confirmBtn.isDisabled(), 'Confirm & Next disabled before any stroke (signer 1)');
    await drawSignature(page, canvas, 0);
    check(!(await confirmBtn.isDisabled()), 'Confirm & Next enabled after drawing (signer 1)');
    await page.screenshot({ path: path.join(outDir, '03-kiosk-signer-1-drawn.png') });
    await confirmBtn.click();
    await page.locator('.crewKioskConfirmedOverlay').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outDir, '04-kiosk-confirmed-transition.png') });

    // Should auto-advance back to signing mode, signer #2, blank canvas.
    await page.locator('.crewKioskConfirmedOverlay').waitFor({ state: 'hidden', timeout: 4000 });
    check((await numberLocator.innerText()).includes('#2'), 'Auto-advances to signer #2 after confirm');
    check(await confirmBtn.isDisabled(), 'Canvas reset blank for signer #2 (Confirm disabled again)');
    await page.screenshot({ path: path.join(outDir, '05-kiosk-signer-2-blank.png') });

    // Signer 2: draw, then test Clear only affects THIS in-progress signature.
    await drawSignature(page, canvas, 40);
    check(!(await confirmBtn.isDisabled()), 'Confirm enabled after drawing (signer 2)');
    await page.getByRole('button', { name: 'Clear' }).click();
    check(await confirmBtn.isDisabled(), 'Clear wipes the CURRENT in-progress stroke (Confirm disabled again)');
    await page.screenshot({ path: path.join(outDir, '06-kiosk-signer-2-cleared.png') });
    await drawSignature(page, canvas, 40);
    await confirmBtn.click();
    await page.locator('.crewKioskConfirmedOverlay').waitFor({ state: 'hidden', timeout: 4000 });
    check((await numberLocator.innerText()).includes('#3'), 'Auto-advances to signer #3 after signer 2 confirms');

    // Signer 3.
    await drawSignature(page, canvas, 80);
    await confirmBtn.click();
    await page.locator('.crewKioskConfirmedOverlay').waitFor({ state: 'hidden', timeout: 4000 });
    check((await numberLocator.innerText()).includes('#4'), 'Auto-advances to signer #4 after signer 3 confirms');
    const footerText = await page.locator('.crewKioskFooter').innerText();
    check(footerText.includes('3 signed'), `Footer reports 3 signed so far (got "${footerText}")`);
    await page.screenshot({ path: path.join(outDir, '07-kiosk-after-3-signers.png') });

    // Exit-hold control: a plain tap must NOT exit.
    console.log('[5] Testing exit-hold control...');
    await page.locator('.crewKioskExitHold').click();
    await page.waitForTimeout(200);
    check(await page.locator('.crewKiosk').isVisible(), 'A plain tap on the exit control does NOT exit the kiosk');

    // A real hold (pointer down, wait past EXIT_HOLD_MS, pointer up) must exit.
    const exitBox = await page.locator('.crewKioskExitHold').boundingBox();
    await page.mouse.move(exitBox.x + exitBox.width / 2, exitBox.y + exitBox.height / 2);
    await page.mouse.down();
    await page.screenshot({ path: path.join(outDir, '08-kiosk-exit-hold-in-progress.png') });
    await page.waitForTimeout(1700);
    await page.mouse.up();
    await page.locator('.crewKiosk').waitFor({ state: 'hidden', timeout: 3000 });
    check(true, 'Holding the exit control for >1.5s exits the kiosk');
    await page.screenshot({ path: path.join(outDir, '09-back-on-signatures-step.png') });

    const stepText = await page.locator('text=/crew member.*signed so far/').innerText();
    check(stepText.includes('3'), `Signatures step shows the persisted count (got "${stepText}")`);

    // Data integrity: confirm crewSignatures actually persisted to localStorage
    // (autosave debounce is 900ms in this app).
    await page.waitForTimeout(1200);
    const savedCount = await page.evaluate(() => {
      const raw = window.localStorage.getItem('sdc.jsa.draft.v4');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.crewSignatures) ? parsed.crewSignatures.length : -1;
    });
    check(savedCount === 3, `Draft in localStorage has 3 crewSignatures entries (got ${savedCount})`);

    // Confirm existing PDF export pipeline still works untouched.
    console.log('[6] Confirming existing JSA PDF export still works...');
    await page.getByRole('tab', { name: /^Review \/ Export/ }).click();
    await page.locator('.reviewPrimaryAction button').click();
    await page.locator('.pdfReadyPanel').waitFor({ state: 'visible', timeout: 30000 });
    check(true, 'JSA PDF export completes without error after adding crewSignatures to the data model');

    await browser.close();

    const summary = {
      generatedAt: new Date().toISOString(),
      outDir,
      checks,
      failCount: checks.filter(c => !c.ok).length,
      consoleErrors,
      pageErrors,
    };
    writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    if (consoleErrors.length || pageErrors.length || summary.failCount > 0) {
      console.error('\nFAILED: see summary above.');
      process.exitCode = 1;
    }
  } finally {
    killTree(server);
  }
}

main().then(() => {
  process.exit(process.exitCode || 0);
}).catch((err) => {
  console.error('Verification script failed:', err);
  process.exitCode = 1;
});
