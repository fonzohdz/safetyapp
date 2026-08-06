// Incident Report workflow regression script (PRE-MERGE CORRECTION PASS).
//
// Not part of the application build or bundle -- lives entirely under
// tools/testing/ and is invoked manually with
// `node tools/testing/verify-incident-workflow.mjs`. Requires `npm run
// build` to have already produced dist/, and the `playwright` dev
// dependency (+ `npx playwright install chromium`) to be installed.
//
// Covers three interactive behaviors that verify-incident-pdf.mjs (which
// only drives an already-loaded, already-populated draft straight to
// export) does not exercise:
//
//   1. Saved-draft replacement safeguard -- "Start Incident Report" /
//      "Start" (Documents) must confirm before discarding a meaningful
//      saved report, whether that report lives in memory or only in
//      localStorage; Cancel must preserve it, Continue must truly reset.
//   2. Save Now / Save failed -- manual save must reflect real success/
//      failure, and must never fall back to "Saved" after a failure.
//   3. Mark Ready -> edit -> reverts to Draft -- a report marked ready
//      must return to draft (and clear completedAt) the moment any printed
//      field is edited again.
//
// Exits nonzero if any check fails.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const PORT = 4321;
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

function makeAssertions(label) {
  const failures = [];
  return {
    check(condition, message) {
      if (!condition) {
        failures.push(message);
        console.error(`  [FAIL] ${message}`);
      } else {
        console.log(`  [ok]   ${message}`);
      }
    },
    failures,
    label,
  };
}

const SEEDED_DRAFT = JSON.stringify({
  id: 'seed-draft-0001',
  schemaVersion: 1,
  status: 'draft',
  createdAt: '2026-08-01T08:00:00.000Z',
  lastSavedAt: '2026-08-01T08:05:00.000Z',
  completedAt: '',
  reportNumber: '',
  workplaceLocation: 'PRE-EXISTING SAVED SITE -- DO NOT LOSE',
  incidentDate: '2026-08-01',
  incidentTime: '09:00',
  writtenReportDateTime: '2026-08-01T09:10',
  reportedToSupervisorDateTime: '2026-08-01T09:05',
  investigatorName: 'Original Investigator',
  investigatorTitle: 'Foreman',
  investigatorPhone: '', investigatorEmail: '',
  incidentSpecificLocation: 'Original location detail',
  detailedIncidentDescription: 'Original detailed description that must survive a cancelled replacement.',
  injuryOccurred: 'no', injuredPartyName: '', injuredPartyTitle: '', injuredPartyYearsWithCompany: '',
  injuredPartyCurrentTrade: '', injuredPartyPhone: '', injuredPartyEmail: '', injuryNature: [], injuryNatureOther: '',
  bodyPartsAffectedText: '', treatmentLevel: 'unselected', treatingPhysicianOrClinic: '', injuryRemarks: '', bodyDiagramMarks: [],
  witnesses: [],
  propertyDamageOccurred: 'no', propertyOrMaterialDamaged: '', natureOfDamage: '', objectMachineToolOrSubstance: '', approximateDamageCost: '',
  selectedCauses: [], primaryCause: null, unsafeActsOther: '', unsafeConditionsOther: '', managementDeficienciesOther: '',
  supervisorNotes: '', safetyConsultantNotes: '', investigationTeam: [],
  notes: '',
});

async function testDraftProtection(browser) {
  const a = makeAssertions('Draft protection (section 1)');
  console.log('\n=== 1. Saved-draft replacement safeguard ===');
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.addInitScript((json) => {
    window.localStorage.setItem('sdc.incident.draft.v1', json);
  }, SEEDED_DRAFT);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('  [page error]', err.message));

  console.log('  [1/6] Loading Home with a seeded saved draft...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  console.log('  [2/6] Clicking "Start Incident Report" and expecting a confirmation dialog...');
  let dialogMessage = null;
  page.once('dialog', (dialog) => { dialogMessage = dialog.message(); dialog.dismiss(); });
  await page.getByRole('button', { name: 'Start Incident Report' }).click();
  await page.waitForTimeout(300);
  a.check(dialogMessage != null, 'a confirmation dialog appeared before opening a blank report');
  a.check(/replace/i.test(dialogMessage || ''), `dialog message mentions replacing the current draft (got: "${dialogMessage}")`);

  console.log('  [3/6] Verifying Cancel preserved the saved draft...');
  await page.getByRole('button', { name: 'Continue Incident Report' }).click();
  // The first text field on the Details step is Workplace Location.
  const detailsWorkplaceValue = await page.locator('.stepPanel input').first().inputValue();
  a.check(detailsWorkplaceValue === 'PRE-EXISTING SAVED SITE -- DO NOT LOSE', `saved draft's workplace location survived Cancel (got: "${detailsWorkplaceValue}")`);

  console.log('  [4/6] Going back to Documents, starting again (via "Start" under Documents) and confirming replacement...');
  await page.getByRole('button', { name: '\u2190 Documents' }).click();
  let dialogMessage2 = null;
  page.once('dialog', (dialog) => { dialogMessage2 = dialog.message(); dialog.accept(); });
  await page.locator('.listItem', { hasText: 'Incident Report' }).getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(300);
  a.check(dialogMessage2 != null, 'Documents "Start" also showed a confirmation dialog for the existing saved report');

  console.log('  [5/6] Verifying the new report is genuinely blank (no old data retained)...');
  const workplaceAfterReplace = await page.locator('.stepPanel input').first().inputValue();
  a.check(workplaceAfterReplace === '', `new blank report's workplace location field is empty (got: "${workplaceAfterReplace}")`);

  console.log('  [6/6] Verifying the persisted draft in localStorage no longer has the old content...');
  const storedDraft = await page.evaluate(() => window.localStorage.getItem('sdc.incident.draft.v1'));
  const stillHasOldData = storedDraft != null && storedDraft.includes('PRE-EXISTING SAVED SITE');
  a.check(!stillHasOldData, 'localStorage draft no longer contains the discarded report\'s content');

  await context.close();
  return a;
}

async function testSaveNowAndFailure(browser) {
  const a = makeAssertions('Save Now / Save failed (section 2)');
  console.log('\n=== 2. Save Now / Save failed ===');
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('  [page error]', err.message));

  console.log('  [1/6] Starting a fresh incident report...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Incident Report' }).click();

  console.log('  [2/6] Typing into Workplace location and clicking Save Now immediately...');
  await page.locator('.stepPanel input').first().fill('Save Now Test Site');
  await page.getByRole('button', { name: 'Save Now' }).click();
  await page.waitForFunction(() => document.querySelector('.builderHeaderSaved')?.textContent === 'Saved', { timeout: 5000 }).catch(() => {});
  const savedLabel = await page.locator('.builderHeaderSaved').innerText();
  a.check(savedLabel === 'Saved', `Save Now shows "Saved" on success (got: "${savedLabel}")`);

  console.log('  [3/6] Simulating a storage failure and clicking Save Now again...');
  await page.evaluate(() => {
    const proto = Storage.prototype;
    const original = proto.setItem;
    window.__originalSetItem = original;
    proto.setItem = function patched(key, value) {
      if (key === 'sdc.incident.draft.v1') throw new Error('Simulated quota exceeded');
      return original.call(this, key, value);
    };
  });
  await page.locator('.stepPanel input').first().fill('Save Now Test Site (edited during failure)');
  await page.getByRole('button', { name: 'Save Now' }).click();
  await page.waitForFunction(() => document.querySelector('.builderHeaderSaved')?.textContent?.includes('Save failed'), { timeout: 5000 }).catch(() => {});
  const failedLabel = await page.locator('.builderHeaderSaved').innerText();
  a.check(failedLabel === 'Save failed \u2014 try Save Now', `Save Now shows the exact failure copy (got: "${failedLabel}")`);
  const hasErrorClass = await page.locator('.builderHeaderSaved.error').count();
  a.check(hasErrorClass === 1, 'the failed save status is styled with the .error modifier');

  console.log('  [4/6] Waiting past the autosave debounce window to confirm it never silently reports "Saved" after the failure...');
  await page.waitForTimeout(1500);
  const labelStillFailed = await page.locator('.builderHeaderSaved').innerText();
  a.check(labelStillFailed === 'Save failed \u2014 try Save Now', `status still shows failure after the autosave window elapses, never silently falls back to "Saved" (got: "${labelStillFailed}")`);

  console.log('  [5/6] Restoring storage and confirming Save Now recovers...');
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
  await page.getByRole('button', { name: 'Save Now' }).click();
  await page.waitForFunction(() => document.querySelector('.builderHeaderSaved')?.textContent === 'Saved', { timeout: 5000 }).catch(() => {});
  const recoveredLabel = await page.locator('.builderHeaderSaved').innerText();
  a.check(recoveredLabel === 'Saved', `Save Now recovers to "Saved" once storage works again (got: "${recoveredLabel}")`);

  console.log('  [6/6] Cleaning up (clearing the test draft from localStorage)...');
  await page.evaluate(() => window.localStorage.removeItem('sdc.incident.draft.v1'));

  await context.close();
  return a;
}

const READY_FIXTURE = JSON.stringify({
  id: 'ready-test-0001', schemaVersion: 1, status: 'draft', createdAt: '2026-08-01T08:00:00.000Z',
  lastSavedAt: '', completedAt: '', reportNumber: '',
  workplaceLocation: 'Mark Ready Test Site', incidentDate: '2026-08-01', incidentTime: '09:00',
  writtenReportDateTime: '2026-08-01T09:10', reportedToSupervisorDateTime: '2026-08-01T09:05',
  investigatorName: 'Test Investigator', investigatorTitle: 'Foreman', investigatorPhone: '601-555-0100', investigatorEmail: '',
  incidentSpecificLocation: 'Test location', detailedIncidentDescription: 'Test description long enough to be meaningful.',
  injuryOccurred: 'no', injuredPartyName: '', injuredPartyTitle: '', injuredPartyYearsWithCompany: '', injuredPartyCurrentTrade: '',
  injuredPartyPhone: '', injuredPartyEmail: '', injuryNature: [], injuryNatureOther: '', bodyPartsAffectedText: '',
  treatmentLevel: 'unselected', treatingPhysicianOrClinic: '', injuryRemarks: '', bodyDiagramMarks: [],
  witnesses: [],
  propertyDamageOccurred: 'no', propertyOrMaterialDamaged: '', natureOfDamage: '', objectMachineToolOrSubstance: '', approximateDamageCost: '',
  selectedCauses: ['managementDeficiencies::Insufficient job planning'], primaryCause: 'managementDeficiencies::Insufficient job planning',
  unsafeActsOther: '', unsafeConditionsOther: '', managementDeficienciesOther: '',
  supervisorNotes: 'Test supervisor notes.', safetyConsultantNotes: '',
  investigationTeam: [{ id: 't1', name: 'Test Member', title: 'Safety Coordinator', signatureData: null, date: '2026-08-01' }],
  notes: '',
});

async function testMarkReadyReversion(browser) {
  const a = makeAssertions('Mark Ready -> edit -> reverts to Draft (section 3)');
  console.log('\n=== 3. Mark Ready then edit reverts to Draft ===');
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.addInitScript((json) => {
    window.localStorage.setItem('sdc.incident.draft.v1', json);
  }, READY_FIXTURE);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('  [page error]', err.message));

  console.log('  [1/5] Loading the fully-complete draft and going to Review & Export...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continue Incident Report' }).click();
  await page.getByRole('tab', { name: /^Review & Export/ }).click();

  console.log('  [2/5] Clicking Mark Ready...');
  const markReadyBtn = page.getByRole('button', { name: 'Mark Ready' });
  a.check(await markReadyBtn.isEnabled(), 'Mark Ready is enabled once all readiness checks pass');
  await markReadyBtn.click();
  await page.waitForTimeout(300);
  // .badge is rendered with CSS text-transform: uppercase, so innerText
  // reflects the transformed case -- compare case-insensitively.
  const badgeAfterReady = await page.locator('.builderHeaderBadges .badge').innerText();
  a.check(badgeAfterReady.toLowerCase() === 'ready', `badge shows "Ready" after Mark Ready (got: "${badgeAfterReady}")`);

  console.log('  [3/5] Editing a printed field (Incident Details step)...');
  await page.getByRole('tab', { name: /^Incident Details/ }).click();
  await page.locator('.stepPanel input').first().fill('Mark Ready Test Site (edited after ready)');
  await page.waitForTimeout(300);

  console.log('  [4/5] Verifying the badge reverted to Draft...');
  const badgeAfterEdit = await page.locator('.builderHeaderBadges .badge').innerText();
  a.check(badgeAfterEdit.toLowerCase() === 'draft', `badge reverts to "Draft" after editing a printed field (got: "${badgeAfterEdit}")`);

  console.log('  [5/5] Verifying Review & Export now asks to Mark Ready again...');
  await page.getByRole('tab', { name: /^Review & Export/ }).click();
  const markReadyBtnAgain = page.getByRole('button', { name: 'Mark Ready' });
  a.check(await markReadyBtnAgain.count() === 1, 'Mark Ready button is offered again after the report reverted to draft');

  console.log('  [cleanup] Clearing the test draft from localStorage...');
  await page.evaluate(() => window.localStorage.removeItem('sdc.incident.draft.v1'));

  await context.close();
  return a;
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
    const results = [];
    results.push(await testDraftProtection(browser));
    results.push(await testSaveNowAndFailure(browser));
    results.push(await testMarkReadyReversion(browser));
    await browser.close();

    console.log('\n=== OVERALL SUMMARY ===');
    let anyFailed = false;
    for (const r of results) {
      const status = r.failures.length ? 'FAILED' : 'PASSED';
      if (r.failures.length) anyFailed = true;
      console.log(`  ${status}: ${r.label} (${r.failures.length} failure(s))`);
    }
    if (anyFailed) {
      console.error('\nFAILED: one or more workflow regression checks failed.');
      process.exitCode = 1;
    } else {
      console.log('\nAll workflow regression checks passed.');
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('Verification script failed:', err);
  process.exitCode = 1;
});
