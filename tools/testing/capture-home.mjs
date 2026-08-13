// Screenshots of Home at the four priority viewports, in both the states
// that matter: nothing started yet, and real work in progress across several
// document types.
//
//   node tools/testing/capture-home.mjs
//
// Home is the one screen every field user sees first, and the only one whose
// job is "help me find the right document fast". Reviewing it from a
// description is useless — this exists so a change to it can be looked at.
// Output: tools/testing/output/home/<state>-<viewport>.png (full page).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { killTree } from './lib/killTree.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'home');
mkdirSync(outDir, { recursive: true });

const PORT = 4337;
const BASE_URL = `http://localhost:${PORT}`;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true, mobile: true },
  { name: 'tabP', width: 820, height: 1180, touch: true },
  { name: 'tabL', width: 1180, height: 820, touch: true },
  { name: 'desk', width: 1440, height: 900, touch: false },
];

const fixture = name => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/* A half-finished draft in four of the six document types, which is what a
   superintendent's device actually looks like mid-week. Statuses are forced
   to 'draft' so Home shows in-progress work rather than finished documents;
   the shared fixtures ship some as 'ready' because other suites need that. */
function inProgressSeed() {
  const asDraft = json => JSON.stringify({ ...JSON.parse(json), status: 'draft' });
  return {
    'sdc.jsa.draft.v4': asDraft(fixture('entergy-taps-draft.json')),
    'sdc.incident.draft.v1': asDraft(fixture('incident-user-draft-fixture.json')),
    'sdc.uncontrolled.draft.v1': asDraft(fixture('uncontrolled-spill.json')),
    'sdc.medical.draft.v1': asDraft(fixture('medical-work-event.json')),
  };
}

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

async function shoot(browser, vp, state, seed) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.touch ? { hasTouch: true, isMobile: Boolean(vp.mobile) } : {}),
  });
  if (seed) {
    await context.addInitScript(entries => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seed);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${state}-${vp.name}.png`), fullPage: true });
  await context.close();
  return errors;
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bad = 0;
  try {
    await waitForServer(BASE_URL, 20000);
    const browser = await chromium.launch();
    const seed = inProgressSeed();
    for (const vp of VIEWPORTS) {
      for (const [state, s] of [['empty', null], ['working', seed]]) {
        const errors = await shoot(browser, vp, state, s);
        if (errors.length) { bad += 1; console.log(`  [${state}-${vp.name}] PAGE ERRORS: ${errors.join(' | ')}`); }
        else console.log(`  ${state}-${vp.name}.png`);
      }
    }
    await browser.close();
    console.log(bad === 0 ? 'Done. No page errors.' : `Done with ${bad} erroring captures.`);
  } finally {
    killTree(server);
    process.exit(0);
  }
}

main().catch(err => { console.error('capture-home crashed:', err); process.exit(1); });
