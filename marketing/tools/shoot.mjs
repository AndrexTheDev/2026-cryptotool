// Screenshot suite: landing + all 10 tools with demo loaded and result visible.
// External network blocked except npm registry (reproducible, deterministic shots).
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'marketing/screenshots';
mkdirSync(OUT, { recursive: true });

const execPath = await chromium.executablePath();
const browser = await pw.launch({
  executablePath: execPath,
  args: [...chromium.args.filter((a) => !a.includes('single-process') && !a.includes('no-zygote')), '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromium-libs/al2023/lib', FONTCONFIG_PATH: '/tmp/chromium-libs/fonts' },
});

const BASE = 'http://127.0.0.1:8901';
const tools = [
  ['7702-slotguard', /analy|run|check|scan/i, 6000],
  ['userop-autopsy', /analy|run|autopsy/i, 4000],
  ['passkey-continuity', /test|check|run|probe/i, 21000],
  ['dac8-selfproof', /generate challenge/i, 4000],
  ['bitvault-stress', /stress|analy|run|compile/i, 4000],
  ['bundlewatch-ens', /compare|check|audit|run/i, 4000],
  ['x402-paywallguard', /analy|scan|audit|run|check/i, 4000],
  ['intentlens-7683', /decode|analy|run|check/i, 4000],
  ['stealthaudit-5564', /scan|run|check/i, 4000],
  ['stva-upgradediff', /diff|compare|analy|run/i, 4000],
];

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (u.includes('registry.npmjs.org')) return route.continue();
    return route.abort();
  });
  return page;
}

// landing page
{
  const page = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00-landing.png` });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/00b-landing-tools.png` });
  console.log('landing done');
  await page.close();
}

for (const [slug, runRe, waitMs] of tools) {
  try {
    const page = await newPage();
    await page.goto(`${BASE}/tools/${slug}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500); // React hydration
    const demoBtn = page.locator('button', { hasText: /load demo/i }).first();
    if (await demoBtn.count()) await demoBtn.click();
    await page.waitForTimeout(400);
    const runBtn = page
      .locator('button.btn-primary')
      .filter({ hasText: runRe })
      .first();
    if (await runBtn.count()) await runBtn.click();
    // wait until the run finishes: primary button re-enabled and no busy label
    await page
      .waitForFunction(
        () => {
          const btns = [...document.querySelectorAll('button.btn-primary')];
          return btns.every((b) => !b.disabled && !/analyzing|running|checking|scanning|testing|verifying|…|\.\.\./i.test(b.textContent ?? ''));
        },
        { timeout: 60000 },
      )
      .catch(() => {});
    await page.waitForTimeout(800);
    // DAC8: second step (verify) for a full-looking result
    if (slug === 'dac8-selfproof') {
      const s2 = page.locator('button.btn-primary', { hasText: /verify/i }).first();
      if (await s2.count()) {
        await s2.click();
        await page.waitForTimeout(1500);
      }
    }
    await page.screenshot({ path: `${OUT}/${slug}.png` });
    // scrolled shot of the result area
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${slug}-result.png` });
    console.log(slug, 'done');
    await page.close();
  } catch (e) {
    console.log(slug, 'FAILED', String(e).slice(0, 140));
  }
}
await browser.close();
console.log('all screenshots done');
