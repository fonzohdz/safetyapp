// Regression coverage for JSA list-aware speech (Tasks/Hazards/Controls
// only -- one spoken item becomes one JSA PDF cell). SpeechRecognition is
// mocked; the pure parsing logic itself has a separate, framework-free test
// at verify-jsa-speech-list-parsing.mjs. This suite verifies the
// integration: SpeakButton's list mode actually wires into these three
// fields (and only these three), the visible textarea shows real line
// breaks before any PDF is generated, and the existing PrintTaskTable
// renders each line as its own row/cell -- with zero JSA PDF markup
// changes. Run standalone:
//   node tools/testing/verify-jsa-speech-list.mjs
//
// IMPORTANT: the mock simulates each pause-separated phrase as its own
// SEPARATELY-FINALIZED entry in event.results, with NO punctuation --
// that's how real continuous browser dictation actually behaves (a first
// version of this suite fed one big final string WITH literal periods
// already in it, which passed against a bug where periods never show up
// from real pauses; this is what actually caught it).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { killTree } from './lib/killTree.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'jsa-speech-list');
mkdirSync(outDir, { recursive: true });

const PORT = 4363;
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

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  [PASS] ${label}`);
  else { console.log(`  [FAIL] ${label}`); failures++; }
}

// Installed once via context.addInitScript, BEFORE any page script runs --
// useSpeechToText.js resolves window.SpeechRecognition/webkitSpeechRecognition
// into a module-level const the moment the app bundle first executes, so the
// mock has to already be in place at that point.
//
// window.__mockPhrases is an array of strings, each one a separate
// pause-separated utterance with NO trailing punctuation (matching real
// dictation) -- start() finalizes them one at a time, each as its own
// results[] entry, exactly like real continuous recognition does at a
// natural pause, with an interim partial shown first for realism.
const MOCK_INIT_SCRIPT = `
  window.__mockPhrases = [];
  class MockSpeechRecognition {
    constructor() { this.continuous = false; this.interimResults = false; }
    start() {
      const phrases = window.__mockPhrases.slice();
      const finalized = [];
      const emitNext = (i) => {
        if (i >= phrases.length) { if (this.onend) this.onend(); return; }
        const phrase = phrases[i];
        const partial = phrase.slice(0, Math.max(1, Math.floor(phrase.length / 2)));
        if (this.onresult) {
          this.onresult({ results: [...finalized, { 0: { transcript: partial }, isFinal: false, length: 1 }], length: finalized.length + 1 });
        }
        setTimeout(() => {
          finalized.push({ 0: { transcript: phrase }, isFinal: true, length: 1 });
          if (this.onresult) this.onresult({ results: [...finalized], length: finalized.length });
          setTimeout(() => emitNext(i + 1), 50);
        }, 50);
      };
      setTimeout(() => emitNext(0), 40);
    }
    stop() { if (this.onend) this.onend(); }
  }
  window.SpeechRecognition = MockSpeechRecognition;
  window.webkitSpeechRecognition = MockSpeechRecognition;
`;

async function speakInto(page, fieldLabel, phrases) {
  const phraseList = Array.isArray(phrases) ? phrases : [phrases];
  await page.evaluate((phraseList) => { window.__mockPhrases = phraseList; }, phraseList);
  const micBtn = page.locator('label.field', { hasText: fieldLabel }).getByRole('button', { name: 'Dictate this field' });
  await micBtn.click();
  await page.waitForTimeout(150 * phraseList.length + 300);
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(MOCK_INIT_SCRIPT);
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('dialog', d => d.accept());
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.homeLayout');
    await page.getByRole('button', { name: 'Start JSA' }).click();
    await page.waitForTimeout(200);

    // ── 1. Narrative field is NOT list-split (mode isolation) ──
    console.log('\n=== 1. Narrative fields join separate phrases as plain prose ===');
    await page.getByRole('tab', { name: /Meeting Info/ }).click();
    await page.waitForTimeout(150);
    await speakInto(page, 'Tailgate Safety Topic', ['spread lime', 'move lime', 'mix lime']);
    const topicVal = await page.locator('label.field', { hasText: 'Tailgate Safety Topic' }).locator('textarea').inputValue();
    check(topicVal === 'spread lime move lime mix lime', `Narrative field joins phrases as one line of prose, properly spaced (got: "${topicVal}")`);
    check(!topicVal.includes('\n'), 'Narrative field has no injected line breaks');

    // ── 2. Tasks: three separately-finalized phrases (no punctuation at all,
    //        matching real dictation) -> 3 separate lines ──
    console.log('\n=== 2. Tasks: 3 pause-separated phrases (no punctuation) -> 3 lines ===');
    await page.getByRole('tab', { name: /Tasks/ }).click();
    await page.waitForTimeout(150);
    await speakInto(page, 'Tasks for Today', ['spread lime', 'move lime', 'mix lime']);
    let tasksVal = await page.locator('label.field', { hasText: 'Tasks for Today' }).locator('textarea').inputValue();
    check(tasksVal === 'spread lime\nmove lime\nmix lime', `Tasks textarea shows 3 real newline-separated lines with zero punctuation spoken (got: ${JSON.stringify(tasksVal)})`);

    // ── 3. Hazards: same, different field ──
    console.log('\n=== 3. Hazards: 3 pause-separated phrases -> 3 lines ===');
    await speakInto(page, 'Hazards in Work Area', ['equipment traffic', 'dust exposure', 'uneven ground']);
    const hazardsVal = await page.locator('label.field', { hasText: 'Hazards in Work Area' }).locator('textarea').inputValue();
    check(hazardsVal === 'equipment traffic\ndust exposure\nuneven ground', `Hazards textarea shows 3 lines from natural pauses alone (got: ${JSON.stringify(hazardsVal)})`);

    // ── 4. Controls: explicit "next control" spoken WITHIN one continuous
    //        phrase (no pause) still splits correctly ──
    console.log('\n=== 4. Controls: "next control" spoken with no pause -> 3 lines, phrase removed ===');
    await speakInto(page, 'Controls and Mitigations', ['maintain safe distance next control use spotter when backing next control wear required P P E']);
    const controlsVal = await page.locator('label.field', { hasText: 'Controls and Mitigations' }).locator('textarea').inputValue();
    check(controlsVal === 'maintain safe distance\nuse spotter when backing\nwear required P P E', `Controls textarea shows 3 lines, "next control" removed from text (got: ${JSON.stringify(controlsVal)})`);
    check(!controlsVal.toLowerCase().includes('next control'), 'The spoken separator phrase itself never appears in the final text');

    // ── 5. Append: existing manual content is never overwritten, across
    //        multiple pause-separated phrases in one session ──
    console.log('\n=== 5. Speech appends below existing manually-typed lines ===');
    const tasksTa = page.locator('label.field', { hasText: 'Tasks for Today' }).locator('textarea');
    await tasksTa.fill('Spread lime\nMove lime');
    await speakInto(page, 'Tasks for Today', ['mix lime', 'clean spreader']);
    tasksVal = await tasksTa.inputValue();
    check(tasksVal === 'Spread lime\nMove lime\nmix lime\nclean spreader', `Existing lines preserved, new items appended below, one per pause (got: ${JSON.stringify(tasksVal)})`);

    // ── 6. Commas and "and" never cause bad splitting (one phrase, no pause) ──
    console.log('\n=== 6. Commas and "and" are preserved within one item ===');
    await tasksTa.fill('');
    await speakInto(page, 'Tasks for Today', ['inspect the truck, including tires, mirrors, and lights']);
    tasksVal = await tasksTa.inputValue();
    check(tasksVal === 'inspect the truck, including tires, mirrors, and lights', `One single item, commas and "and" intact, no bad splitting (got: ${JSON.stringify(tasksVal)})`);
    check(!tasksVal.includes('\n'), 'No line breaks introduced by commas/and');

    // ── 7. Manual typing with real newlines still works exactly as before ──
    console.log('\n=== 7. Manual typing (no speech) is completely unaffected ===');
    await tasksTa.fill('Typed task one\nTyped task two\nTyped task three');
    tasksVal = await tasksTa.inputValue();
    check(tasksVal === 'Typed task one\nTyped task two\nTyped task three', 'Manually-typed newline-separated lines pass through unchanged');

    // ── 8. Existing PrintTaskTable renders each line as its own row/cell,
    //        independent columns, no PDF markup change needed ──
    console.log('\n=== 8. Print DOM: independent columns, one row per line, no forced pairing ===');
    // Clear all three fields first -- Hazards/Controls still hold content
    // from tests 3/4, and speech appends rather than overwrites (by
    // design), so a stale field here would double up, not indicate a bug.
    await tasksTa.fill('');
    await page.locator('label.field', { hasText: 'Hazards in Work Area' }).locator('textarea').fill('');
    await page.locator('label.field', { hasText: 'Controls and Mitigations' }).locator('textarea').fill('');
    await speakInto(page, 'Tasks for Today', ['spread lime', 'move lime', 'mix lime']);
    await speakInto(page, 'Hazards in Work Area', ['equipment traffic', 'dust exposure', 'uneven ground']);
    await speakInto(page, 'Controls and Mitigations', ['maintain safe distance', 'use spotter when backing', 'wear required PPE', 'use water for dust control']);
    await page.addStyleTag({ content: `.pdfExportRoot { position: static !important; left: 0 !important; top: 0 !important; } .toast { display: none !important; }` });
    await page.waitForTimeout(200);
    const rowTexts = await page.locator('.pdfExportRoot .printTaskTable').first().locator('tbody tr').evaluateAll(
      trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())),
    );
    // The main page's table always renders a fixed number of row slots
    // (existing, protected print geometry -- blank rows are normal, same as
    // a paper form with printed blank lines) -- so this only checks that
    // enough rows exist to hold the content, not an exact count.
    check(rowTexts.length >= 4, `At least 4 row slots available for the 4 content rows (max of 3 tasks / 3 hazards / 4 controls), got ${rowTexts.length}`);
    check(rowTexts[0][0] === 'spread lime' && rowTexts[1][0] === 'move lime' && rowTexts[2][0] === 'mix lime' && rowTexts[3][0] === '', `Task column: 3 spoken phrases in separate cells, 4th row blank (got: ${JSON.stringify(rowTexts.map(r => r[0]))})`);
    check(rowTexts[0][1] === 'equipment traffic' && rowTexts[1][1] === 'dust exposure' && rowTexts[2][1] === 'uneven ground' && rowTexts[3][1] === '', `Hazard column: independent from Task column, correct positional values (got: ${JSON.stringify(rowTexts.map(r => r[1]))})`);
    check(rowTexts[0][2] === 'maintain safe distance' && rowTexts[3][2] === 'use water for dust control', `Control column: independent 4-item list, not paired 1:1 with tasks/hazards (got: ${JSON.stringify(rowTexts.map(r => r[2]))})`);
    await page.screenshot({ path: path.join(outDir, 'print-task-table.png') });

    check(pageErrors.length === 0, `No uncaught page errors (${pageErrors.length})${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`);

    await browser.close();
  } finally {
    killTree(server);
  }

  console.log(`\n[6/6] Done. ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) {
    console.log('--- preview server output (tail) ---');
    console.log(serverOutput.slice(-2000));
    process.exit(1);
  }
}

main().then(() => {
  // Explicit success exit: the spawned 'vite preview' grandchild keeps Node's
  // event loop alive on Windows even after server.kill(), so a PASSING run
  // would otherwise hang until the caller's timeout instead of finishing.
  process.exit(0);
}).catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
