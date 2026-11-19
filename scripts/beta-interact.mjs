#!/usr/bin/env node
// ============================================================================
// beta-interact.mjs — true interaction tests, user perspective.
//   Phase 1: render → load demo → run → outcome visible (per tool)
//   Phase 2: run WITHOUT input → validation feedback visible, no crash
//   Phase 3: cross-check verdicts end-to-end with a mocked chain —
//            SlotGuard bytecode match/mismatch, DAC8 certificate match/mismatch
// External network is blocked except the npm registry (allowed sandbox host);
// unreachable endpoints must surface as graceful errors, never crashes.
// ============================================================================

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';

// ---- DOM environment -------------------------------------------------------
const window = new Window({ url: 'https://localhost/' });
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {
  /* node 22 navigator getter is fine */
}
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---- network: npm registry real; JSON-RPC + esplora via mutable mocks; rest blocked
let evmCodeMock = null; // hex string returned for eth_getCode
let btcTxMock = null; // object returned for GET .../tx/<txid>
const realFetch = globalThis.fetch?.bind(globalThis);
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('registry.npmjs.org') && realFetch) return realFetch(url, init);
  if (btcTxMock && /\/tx\/[0-9a-f]{64}$/.test(u)) {
    return new window.Response(JSON.stringify(btcTxMock), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (init?.method === 'POST' && typeof init.body === 'string') {
    try {
      const req = JSON.parse(init.body);
      if (req.method === 'eth_getCode' && evmCodeMock != null) {
        return new window.Response(JSON.stringify({ jsonrpc: '2.0', id: req.id ?? 1, result: evmCodeMock }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    } catch {
      /* fall through */
    }
  }
  throw new Error('beta-interact: external fetch blocked (simulating offline/unreachable)');
};

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const esbuild = await import('esbuild');

let pass = 0;
let fail = 0;
const failed = [];
function t(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(` OK  ${name}`);
  } else {
    fail++;
    failed.push(name);
    console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bundleTool(name) {
  await esbuild.build({
    entryPoints: [join('src/components/tools', `${name}.tsx`)],
    bundle: true,
    write: true,
    outfile: join('.beta-cache', `${name}.mjs`),
    format: 'esm',
    jsx: 'automatic',
    packages: 'external',
    logLevel: 'silent',
  });
  return (await import(`../.beta-cache/${name}.mjs?${Date.now()}`)).default;
}

async function mount(Comp) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Comp));
  });
  return {
    container,
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const clickRun = async (container, runRe) => {
  const btn = [...container.querySelectorAll('button')].find(
    (b) =>
      /btn-primary/.test(b.className) &&
      runRe.test(b.textContent ?? '') &&
      !/demo|export|download|print|copy|csv|json|html/i.test(b.textContent ?? '') &&
      !b.disabled,
  );
  if (btn) {
    await act(async () => {
      btn.click();
    });
  }
  return !!btn;
};

mkdirSync('.beta-cache', { recursive: true });

// ============================================================================
// Phase 1: demo → run → outcome
// ============================================================================
const tools = [
  ['SlotGuard7702', /analy|run|check|scan/i, /delegation|unreachable|error|throttled|matches chain/i, null, 6000],
  ['UseropAutopsy', /analy|run|autopsy/i, /Receipt not found|unreachable|Error|margin/i, null, 4000],
  ['PasskeyContinuity', /test|check|run|probe/i, /error|revert|active|empty|unreachable|throttled/i, null, 20000],
  ['Dac8SelfProof', /generate challenge/i, /challenge|StackAutopsy\/DAC8|error|manual|block/i, /verify/i, 4000],
  ['BitVaultStress', /stress|analy|run|compile/i, /sane|Compiler|dust|pattern|error/i, null, 4000],
  ['BundleWatchEns', /compare|check|audit|run/i, /match|mismatch|identical|diff|error/i, null, 4000],
  ['X402PaywallGuard', /analy|scan|audit|run|check/i, /critical|V12-|finding|error|registry/i, null, 4000],
  ['IntentLens7683', /decode|analy|run|check/i, /spread|order|deadline|refund|error/i, null, 4000],
  ['StealthAudit5564', /scan|run|check/i, /error|worker|unavailable|hits|offline/i, null, 4000],
  ['StvaUpgradeDiff', /diff|compare|analy|run/i, /error|unreachable|pattern|impl|throttled/i, null, 4000],
];

for (const [name, runRe, outcomeRe, secondRe, waitMs] of tools) {
  try {
    const Comp = await bundleTool(name);
    const { container, cleanup } = await mount(Comp);
    const initialHtml = container.innerHTML;

    const demoBtn = [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? ''));
    t(`P1 ${name}: demo button clickable`, !!demoBtn);
    if (demoBtn) {
      await act(async () => {
        demoBtn.click();
      });
    }

    const ran = await clickRun(container, runRe);
    t(`P1 ${name}: primary run action found`, ran);
    await act(async () => sleep(waitMs));

    if (secondRe) {
      const secondBtn = [...container.querySelectorAll('button')].find(
        (b) => /btn-primary/.test(b.className) && secondRe.test(b.textContent ?? '') && !b.disabled,
      );
      if (secondBtn) {
        await act(async () => {
          secondBtn.click();
          await sleep(1500);
        });
      }
    }

    const html = container.innerHTML;
    t(`P1 ${name}: run produced visible outcome`, html !== initialHtml && outcomeRe.test(html), outcomeRe.toString());
    t(`P1 ${name}: no uncaught crash (container intact)`, container.isConnected && html.length > 800);
    await cleanup();
  } catch (e) {
    t(`P1 ${name}: interaction flow`, false, String((e && e.message) || e));
  }
}

// ============================================================================
// Phase 2: run WITHOUT input → visible validation feedback, no crash
// ============================================================================
const VALIDATION_RE = /provide|paste|enter|valid|select|required|please|no |invalid|error/i;
for (const [name, runRe] of tools) {
  try {
    const Comp = await bundleTool(name);
    const { container, cleanup } = await mount(Comp);
    await clickRun(container, runRe);
    await act(async () => sleep(1200));
    const html = container.innerHTML;
    t(`P2 ${name}: empty run → visible validation feedback`, VALIDATION_RE.test(html));
    await cleanup();
  } catch (e) {
    t(`P2 ${name}: empty run`, false, String((e && e.message) || e));
  }
}

// ============================================================================
// Phase 3: cross-check verdicts with mocked chain (Wave 36/37 end-to-end)
// ============================================================================
{
  // --- SlotGuard: pasted bytecode vs mocked eth_getCode ----------------------
  const sgSrc = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  const demoCode = sgSrc
    .match(/DEMO_BYTECODE = ([^;]+);/)[1]
    .split('+')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .join('');

  const SlotGuard = await bundleTool('SlotGuard7702');

  evmCodeMock = demoCode; // chain says: exactly the pasted bytecode
  let { container, cleanup } = await mount(SlotGuard);
  await act(async () => {
    [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? '')).click();
  });
  await clickRun(container, /analy|run|check|scan/i);
  await act(async () => sleep(2500));
  t('P3 SlotGuard: pasted == chain → "matches chain ✓"', container.innerHTML.includes('matches chain ✓'));
  await cleanup();

  evmCodeMock = '0xdeadbeef'; // chain disagrees
  ({ container, cleanup } = await mount(SlotGuard));
  await act(async () => {
    [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? '')).click();
  });
  await clickRun(container, /analy|run|check|scan/i);
  await act(async () => sleep(2500));
  t('P3 SlotGuard: pasted != chain → "MISMATCH vs chain" + anti-forgery note', container.innerHTML.includes('MISMATCH vs chain') && /stale|manipulated/i.test(container.innerHTML));
  await cleanup();
  evmCodeMock = null;

  // --- DAC8: certificate/manual facts vs mocked esplora ----------------------
  const d8Src = readFileSync('src/components/tools/Dac8SelfProof.tsx', 'utf8');
  const mBlock = d8Src.match(/manualBlock: '([^']+)'/)[1];
  const mTime = d8Src.match(/manualTime: '([^']+)'/)[1];

  const Dac8 = await bundleTool('Dac8SelfProof');

  btcTxMock = { status: { block_hash: mBlock, block_height: 868000, block_time: Math.floor(Date.parse(mTime) / 1000), confirmed: true }, vout: [{ value: 50000 }], vin: [{ prevout: { value: 60000 } }] };
  ({ container, cleanup } = await mount(Dac8));
  await act(async () => {
    [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? '')).click();
  });
  await clickRun(container, /generate challenge/i);
  await act(async () => sleep(2500));
  t('P3 DAC8: certificate facts == chain → "matches chain ✓"', container.innerHTML.includes('matches chain ✓'));
  await cleanup();

  btcTxMock = { status: { block_hash: '0'.repeat(64), block_height: 868000, block_time: Math.floor(Date.parse(mTime) / 1000), confirmed: true }, vout: [{ value: 50000 }], vin: [{ prevout: { value: 60000 } }] };
  ({ container, cleanup } = await mount(Dac8));
  await act(async () => {
    [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? '')).click();
  });
  await clickRun(container, /generate challenge/i);
  await act(async () => sleep(2500));
  t('P3 DAC8: forged block hash → "MISMATCH vs chain" (anti-forgery fires)', container.innerHTML.includes('MISMATCH vs chain'));
  await cleanup();
  btcTxMock = null;
}

// ============================================================================
// Phase 4: export flows — JSON/CSV/print downloads produce valid content
// (6 tools expose export buttons after demo+run; verified as a user clicks them)
// ============================================================================
const capturedBlobs = [];
URL.createObjectURL = (b) => {
  capturedBlobs.push(b);
  return 'blob:mock-' + capturedBlobs.length;
};
URL.revokeObjectURL = () => {};
window.open = () => null;

const exportTools = [
  ['UseropAutopsy', /analy|run|autopsy/i, null, 4000],
  ['PasskeyContinuity', /test|check|run|probe/i, null, 20000],
  ['BitVaultStress', /stress|analy|run|compile/i, null, 4000],
  ['BundleWatchEns', /compare|check|audit|run/i, null, 4000],
  ['X402PaywallGuard', /analy|scan|audit|run|check/i, null, 4000],
  ['IntentLens7683', /decode|analy|run|check/i, null, 4000],
];

for (const [name, runRe, secondRe, waitMs] of exportTools) {
  try {
    const Comp = await bundleTool(name);
    const { container, cleanup } = await mount(Comp);
    const demoBtn = [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? ''));
    if (demoBtn) {
      await act(async () => {
        demoBtn.click();
      });
    }
    await clickRun(container, runRe);
    await act(async () => sleep(waitMs));
    if (secondRe) {
      const s2 = [...container.querySelectorAll('button')].find(
        (b) => /btn-primary/.test(b.className) && secondRe.test(b.textContent ?? '') && !b.disabled,
      );
      if (s2) {
        await act(async () => {
          s2.click();
          await sleep(1500);
        });
      }
    }
    const expBtns = [...container.querySelectorAll('button')].filter((b) => /⬇/.test(b.textContent ?? ''));
    let valid = expBtns.length > 0;
    const detail = [];
    for (const eb of expBtns) {
      capturedBlobs.length = 0;
      await act(async () => {
        eb.click();
      });
      const label = (eb.textContent ?? '').trim();
      if (capturedBlobs.length === 0) {
        valid = false;
        detail.push(`${label}:no-blob`);
        continue;
      }
      const text = await capturedBlobs[0].text();
      if (text.length < 20) {
        valid = false;
        detail.push(`${label}:empty`);
      } else if (/JSON/.test(label)) {
        try {
          JSON.parse(text);
        } catch {
          valid = false;
          detail.push(`${label}:invalid-json`);
        }
      } else if (/CSV/.test(label)) {
        if (!text.includes(';') || !text.includes('\r\n')) {
          valid = false;
          detail.push(`${label}:bad-csv`);
        }
      } else if (/Druck|HTML/.test(label)) {
        if (!/<!doctype html|<html/i.test(text)) {
          valid = false;
          detail.push(`${label}:bad-html`);
        }
      }
    }
    t(`P4 ${name}: ${expBtns.length} export flow(s) produce valid downloads`, valid, detail.join(','));
    await cleanup();
  } catch (e) {
    t(`P4 ${name}: export flows`, false, String((e && e.message) || e));
  }
}

rmSync('.beta-cache', { recursive: true, force: true });

console.log(`\n${pass + fail} interaction checks, ${fail} failure(s)`);
if (fail) console.log('Failed:', failed.join(' | '));
process.exit(fail ? 1 : 0);
