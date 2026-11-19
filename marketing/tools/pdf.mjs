import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import { resolve } from 'node:path';
const execPath = await chromium.executablePath();
const browser = await pw.launch({
  executablePath: execPath,
  args: [...chromium.args.filter((a) => !a.includes('single-process') && !a.includes('no-zygote')), '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromium-libs/al2023/lib', FONTCONFIG_PATH: '/tmp/chromium-libs/fonts' },
});
const page = await browser.newPage();
await page.goto('file://' + resolve('marketing/kit.html'), { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.pdf({ path: 'marketing/StackAutopsy-Marketing-Kit.pdf', format: 'A4', printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } });
await browser.close();
console.log('pdf done');
