#!/usr/bin/env node
// ============================================================================
// beta-interact.mjs — true interaction tests, user perspective:
// render each tool in a DOM, click "Load demo scenario", click the primary
// run action, await the result, assert the outcome is visible.
// External network is blocked except the npm registry (allowed sandbox host);
// unreachable endpoints must surface as graceful errors, never crashes.
// ============================================================================

import { mkdirSync, rmSync } from 'node:fs';
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
  /* node 22 navigator getter is fine for our purposes */
}
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// fetch: npm registry real (allowed), everything else fails fast (degradation path)
const realFetch = globalThis.fetch?.bind(globalThis);
globalThis.fetch = async (url, init) => {
  if (String(url).includes('registry.npmjs.org') && realFetch) return realFetch(url, init);
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

// [component, run-button regex, outcome regex, optional second step, wait ms]
const tools = [
  ['SlotGuard7702', /analy|run|check|scan/i, /delegation|unreachable|error|throttled/i, null, 4000],
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

mkdirSync('.beta-cache', { recursive: true });

for (const [name, runRe, outcomeRe, secondRe, waitMs] of tools) {
  try {
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
    const mod = await import(`../.beta-cache/${name}.mjs?${Date.now()}`);
    const Comp = mod.default;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Comp));
    });
    const initialHtml = container.innerHTML;

    // 1) click "Load demo scenario"
    const demoBtn = [...container.querySelectorAll('button')].find((b) => /load demo/i.test(b.textContent ?? ''));
    t(`${name}: demo button clickable`, !!demoBtn);
    if (demoBtn) {
      await act(async () => {
        demoBtn.click();
      });
    }

    // 2) click the primary run action (btn-primary, not demo/export/copy/print)
    const runBtn = [...container.querySelectorAll('button')].find(
      (b) =>
        /btn-primary/.test(b.className) &&
        runRe.test(b.textContent ?? '') &&
        !/demo|export|download|print|copy|csv|json|html/i.test(b.textContent ?? ''),
    );
    t(`${name}: primary run action found`, !!runBtn);
    if (runBtn) {
      await act(async () => {
        runBtn.click();
        await sleep(waitMs); // let async analysis + endpoint backoff/degradation settle
      });
    }

    // optional second step (e.g. DAC8: "Generate challenge" → "Verify")
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

    // 3) outcome visible (result or graceful error) — DOM must have changed
    const html = container.innerHTML;
    t(`${name}: run produced visible outcome`, html !== initialHtml && outcomeRe.test(html), outcomeRe.toString());
    t(`${name}: no uncaught crash (container intact)`, container.isConnected && html.length > 800);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  } catch (e) {
    t(`${name}: interaction flow`, false, String((e && e.message) || e));
  }
}

rmSync('.beta-cache', { recursive: true, force: true });

console.log(`\n${pass + fail} interaction checks, ${fail} failure(s)`);
if (fail) console.log('Failed:', failed.join(' | '));
process.exit(fail ? 1 : 0);
