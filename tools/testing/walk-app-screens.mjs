// Product-forensics screenshot walk: captures every top-level screen and
// each document workflow's steps at the mission's priority viewports.
//
//   node tools/testing/walk-app-screens.mjs [--viewport=WxH:name ...]
//
// Defaults: tablet portrait 820x1180, tablet landscape 1180x820,
// desktop 1440x900, phone 390x844.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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
  { name: 'phone', width: 390, height: 844, touch: true },
];

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

async function shoot(page, vp, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, `${vp.name}-${name}.png`), fullPage: false });
}

async function walkViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.touch ? { hasTouch: true, isMobile: vp.width < 500 } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await shoot(page, vp, '01-home');

  const navTo = async (label) => {
    await page.locator('.sidebarNavItem, .mobileNavItem', { hasText: label }).first().click();
    await page.waitForTimeout(250);
  };

  await navTo('Documents');
  await shoot(page, vp, '02-documents');
  await navTo('Drafts');
  await shoot(page, vp, '03-drafts');
  await navTo('Templates');
  await shoot(page, vp, '04-templates');
  await navTo('Settings');
  await shoot(page, vp, '05-settings');

  // open each document workflow's first screen
  const starts = [
    ['Job Safety Analysis', 'jsa'],
    ['Incident Report', 'incident'],
    ['Employee Disciplinary Notice', 'disciplinary'],
    ['Uncontrolled Event Report', 'uncontrolled'],
    ['Employee Medical Event', 'medical'],
    ['Employee Separation', 'separation'],
  ];
  for (const [title, slug] of starts) {
    await navTo('Documents');
    const row = page.locator('.listItem', { hasText: title }).first();
    if (await row.count() === 0) continue;
    const startBtn = row.getByRole('button', { name: /Start|Open/ }).first();
    if (await startBtn.count() === 0) continue;
    await startBtn.click();
    await page.waitForTimeout(500);
    await shoot(page, vp, `10-${slug}-step1`);
    // walk remaining steps quickly via Next / Go to Review
    for (let s = 2; s <= 6; s += 1) {
      const review = page.getByRole('button', { name: 'Go to Review' });
      const next = page.getByRole('button', { name: 'Next', exact: true });
      if (await review.count() > 0 && await review.first().isVisible().catch(() => false)) {
        await review.first().click();
        await page.waitForTimeout(400);
        await shoot(page, vp, `10-${slug}-review`);
        break;
      }
      if (await next.count() > 0 && await next.first().isVisible().catch(() => false)) {
        await next.first().click();
        await page.waitForTimeout(400);
        await shoot(page, vp, `10-${slug}-step${s}`);
      } else break;
    }
    // leave the workflow: Back to Documents via header back button if present
    const back = page.locator('button', { hasText: /Back to|Exit|Close/ }).first();
    if (await back.count() > 0 && await back.isVisible().catch(() => false)) await back.click().catch(() => {});
    await page.waitForTimeout(250);
  }

  if (errors.length) console.log(`  [${vp.name}] PAGE ERRORS: ${errors.join(' | ')}`);
  await context.close();
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForServer(BASE_URL, 20000);
    const browser = await chromium.launch();
    for (const vp of VIEWPORTS) {
      console.log(`Walking ${vp.name} (${vp.width}x${vp.height})...`);
      await walkViewport(browser, vp);
    }
    await browser.close();
  } finally {
    server.kill();
    process.exit(0);
  }
}

main().catch(err => { console.error('walk crashed:', err); process.exit(1); });
