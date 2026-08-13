// Product-forensics screenshot walk: every top-level screen, and every step
// of every document workflow, at the mission's four priority viewports.
//
//   node tools/testing/walk-app-screens.mjs [--viewport=WxH:name ...]
//
// Defaults: tablet portrait 820x1180, tablet landscape 1180x820,
// desktop 1440x900, phone 390x844.
//
// TWO THINGS THIS DELIBERATELY DOES DIFFERENTLY
//
// It drives each workflow by its step TABS, not by hunting for a "Next" or
// "Go to Review" button. Every document renders its steps as a role="tablist"
// (see Stepper in FormPrimitives.jsx, and JSA's own copy in main.jsx), so one
// loop reaches every step of all six. The old button-hunting version could not
// reach JSA's Review step at all, because JSA never had the buttons it looked
// for — and a walk that silently skips the screen you most wanted to look at
// is worse than no walk.
//
// It also refuses to skip quietly. Every screen it means to capture is
// declared up front; anything it fails to reach is reported by name at the end
// and exits non-zero. The previous version `continue`d past missing selectors,
// which is how a phone walk that stopped after Home went unnoticed.
//
// Drafts are seeded so the steps contain real content — screenshots of six
// empty forms tell you nothing about layout.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { killTree } from './lib/killTree.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'output', 'walk');
mkdirSync(outDir, { recursive: true });

const PORT = 4335;
const BASE_URL = `http://localhost:${PORT}`;

const VIEWPORTS = [
  { name: 'tabP', width: 820, height: 1180, touch: true },
  { name: 'tabL', width: 1180, height: 820, touch: true },
  { name: 'desk', width: 1440, height: 900, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true, mobile: true },
];

/* Home now offers a "Continue <type>" button for every document type that has
   a draft, so one seeded draft per type gives the walk a single uniform way
   into all six builders. */
const DOCS = [
  { slug: 'jsa', key: 'sdc.jsa.draft.v4', fixture: 'entergy-taps-draft.json', open: 'Continue JSA' },
  { slug: 'incident', key: 'sdc.incident.draft.v1', fixture: 'incident-user-draft-fixture.json', open: 'Continue Incident Report' },
  { slug: 'uncontrolled', key: 'sdc.uncontrolled.draft.v1', fixture: 'uncontrolled-spill.json', open: 'Continue Uncontrolled Event' },
  { slug: 'medical', key: 'sdc.medical.draft.v1', fixture: 'medical-work-event.json', open: 'Continue Medical Event' },
  { slug: 'disciplinary', key: 'sdc.discipline.draft.v1', fixture: 'disciplinary-normal.json', open: 'Continue Disciplinary Notice' },
  { slug: 'separation', key: 'sdc.separation.draft.v1', fixture: 'separation-new-involuntary.json', open: 'Continue Employee Separation' },
];

const TABS = ['Documents', 'Drafts', 'Templates', 'Settings'];

function seed() {
  const out = {};
  for (const d of DOCS) {
    const raw = readFileSync(path.join(__dirname, 'fixtures', d.fixture), 'utf8');
    // Force 'draft' so every builder opens editable and Home lists it as
    // in-progress; some shared fixtures ship 'ready' for other suites.
    out[d.key] = JSON.stringify({ ...JSON.parse(raw), status: 'draft' });
  }
  return out;
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

async function walkViewport(browser, vp, seeded) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.touch ? { hasTouch: true, isMobile: Boolean(vp.mobile) } : {}),
  });
  await context.addInitScript(entries => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, seeded);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const captured = [];
  const missed = [];
  const shoot = async name => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `${vp.name}-${name}.png`), fullPage: false });
    captured.push(name);
  };

  /* Both navs are always in the DOM and only one is displayed, so a selector
     matching both picks the hidden one and the click hangs. Ask which is
     actually on screen rather than guessing from the width — the sidebar
     survives down to 680px (icon-only from 900), not 900. */
  let navSelector = '.sidebarNavItem';
  const navTo = async label => {
    await page.locator(navSelector, { hasText: label }).first().click();
    await page.waitForTimeout(250);
  };

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  if (!await page.locator('.sidebarNavItem').first().isVisible().catch(() => false)) {
    navSelector = '.mobileNavItem';
  }
  await shoot('01-home');

  for (const [i, label] of TABS.entries()) {
    try {
      await navTo(label);
      await shoot(`0${i + 2}-${label.toLowerCase()}`);
    } catch (e) {
      missed.push(`0${i + 2}-${label.toLowerCase()} (${String(e).split('\n')[0]})`);
    }
  }

  for (const doc of DOCS) {
    try {
      // Reload rather than hunting for a back button: seeded localStorage
      // survives, and the app always reopens on Home.
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: doc.open, exact: true }).click();
      await page.waitForSelector('[role="tab"]', { timeout: 10000 });

      const count = await page.locator('[role="tab"]').count();
      if (count === 0) { missed.push(`${doc.slug} (no step tabs)`); continue; }
      for (let s = 0; s < count; s += 1) {
        const tab = page.locator('[role="tab"]').nth(s);
        const label = ((await tab.getAttribute('aria-label')) || `step${s + 1}`).split(':')[0];
        const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await tab.click();
        await shoot(`10-${doc.slug}-${s + 1}-${slug}`);
      }
    } catch (e) {
      missed.push(`${doc.slug} (${String(e).split('\n')[0]})`);
    }
  }

  await context.close();
  return { captured, missed, errors };
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let problems = 0;
  try {
    await waitForServer(BASE_URL, 20000);
    const browser = await chromium.launch();
    const seeded = seed();
    for (const vp of VIEWPORTS) {
      console.log(`Walking ${vp.name} (${vp.width}x${vp.height})...`);
      const { captured, missed, errors } = await walkViewport(browser, vp, seeded);
      console.log(`  captured ${captured.length} screens`);
      for (const m of missed) { problems += 1; console.log(`  MISSED: ${m}`); }
      if (errors.length) { problems += 1; console.log(`  PAGE ERRORS: ${errors.join(' | ')}`); }
    }
    await browser.close();
    console.log(problems === 0 ? '\nDone. Every screen captured, no page errors.' : `\n${problems} problem(s) — see MISSED/PAGE ERRORS above.`);
  } finally {
    killTree(server);
    process.exit(problems === 0 ? 0 : 1);
  }
}

main().catch(err => { console.error('walk crashed:', err); process.exit(1); });
