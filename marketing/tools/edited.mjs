// Renders edited marketing shots: screenshot inside a browser-chrome frame,
// dark backdrop, headline + subline + badge — then screenshots the composition.
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'marketing/edited';
mkdirSync(OUT, { recursive: true });

const shots = [
  {
    file: '00-landing.png',
    out: 'hero-landing.png',
    badge: 'BROWSER-LOCAL · NO SIGNUP',
    head: 'Verify Web3 security, before you sign.',
    sub: 'Ten forensic tools. Zero servers. Every result cross-checked live against the chains.',
  },
  {
    file: '7702-slotguard-result.png',
    out: 'ad-slotguard.png',
    badge: 'EIP-7702 FORENSICS',
    head: 'One wrong delegate. Two colliding slots.',
    sub: 'SlotGuard reads the 0xef0100 marker, diffs storage layouts and builds your panic-revoke package.',
  },
  {
    file: 'x402-paywallguard-result.png',
    out: 'ad-x402.png',
    badge: 'x402 SUPPLY-CHAIN AUDIT',
    head: '“Paid, not delivered” — caught before deploy.',
    sub: 'PaywallGuard rates your middleware against 8 protection dimensions and the live advisory matrix.',
  },
  {
    file: 'dac8-selfproof-result.png',
    out: 'ad-dac8.png',
    badge: 'DAC8 / CARF COMPLIANCE',
    head: 'Prove your own report. Before someone else does.',
    sub: 'Cryptographic self-disclosure with a challenge–response loop, verifiable against the public chain.',
  },
  {
    file: 'userop-autopsy-result.png',
    out: 'ad-userop.png',
    badge: 'ERC-4337 FORENSICS',
    head: 'The autopsy your failed UserOp deserves.',
    sub: 'Revert reasons, paymaster margins and bundler behavior — reconstructed client-side.',
  },
];

const html = (s, imgB64) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1600px; height:1000px; font-family: ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
    background: radial-gradient(1200px 700px at 70% 20%, #12312a 0%, #0a0f14 55%, #05080b 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:34px; }
  .badge { color:#34d399; border:1px solid #1f6f5c; border-radius:999px; padding:7px 18px;
    font-size:14px; letter-spacing:.22em; font-weight:600; }
  h1 { color:#f1f5f9; font-size:52px; font-weight:800; text-align:center; max-width:1200px; line-height:1.08; }
  .sub { color:#94a3b8; font-size:22px; text-align:center; max-width:1050px; }
  .frame { width:1180px; border-radius:14px; overflow:hidden; box-shadow:0 40px 90px rgba(0,0,0,.65), 0 0 0 1px #1e293b; }
  .bar { background:#111827; height:38px; display:flex; align-items:center; gap:7px; padding:0 14px; }
  .dot { width:11px; height:11px; border-radius:50%; }
  .r{background:#ef4444}.y{background:#f59e0b}.g{background:#22c55e}
  .url { margin-left:12px; background:#0b1220; color:#64748b; font-size:12px; border-radius:6px; padding:4px 12px; flex:1; }
  .frame img { display:block; width:100%; height:560px; object-fit:cover; object-position:top; }
  .foot { color:#475569; font-size:15px; letter-spacing:.06em; }
</style></head><body>
  <div class="badge">${s.badge}</div>
  <h1>${s.head}</h1>
  <div class="sub">${s.sub}</div>
  <div class="frame">
    <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="url">stackautopsy.pages.dev</span></div>
    <img src="data:image/png;base64,${imgB64}">
  </div>
  <div class="foot">Free &amp; open — no account, no tracking, no key custody</div>
</body></html>`;

const execPath = await chromium.executablePath();
const browser = await pw.launch({
  executablePath: execPath,
  args: [...chromium.args.filter((a) => !a.includes('single-process') && !a.includes('no-zygote')), '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromium-libs/al2023/lib', FONTCONFIG_PATH: '/tmp/chromium-libs/fonts' },
});

for (const s of shots) {
  const b64 = readFileSync(`marketing/screenshots/${s.file}`).toString('base64');
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  await page.setContent(html(s, b64), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.out}` });
  console.log(s.out, 'done');
  await page.close();
}
await browser.close();
console.log('edited shots done');
