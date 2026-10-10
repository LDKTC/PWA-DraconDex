#!/usr/bin/env node
// Procress 19 part 1 — the numbers behind Plan.md's PWA rows. Drives the
// built site in Chromium and prints each number next to its target:
//
//   desktop lane (/d/) : first load, reload with the service worker, the cost
//                        of ONE write at a 5 MB and a 50 MB vault (F7), JS heap
//   mobile lane  (/m/) : first load, reload, bytes fetched, JS heap (F11)
//
//   node tools/perf.mjs              # both lanes
//   node tools/perf.mjs --lane d     # just one
//
// A tool, not a test (it prints, it does not assert). The write cost is the
// whole path a keystroke pays once the coalescing window closes, in two parts:
// persistAll()'s synchronous main-thread part (under sql.js, the export of the
// whole vault; since F7, preparing the changed chunks) and the IndexedDB
// transaction that stores them (vfs.flushNow), measured until it commits.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer, PREFIX } from './serve.mjs';

const argv = process.argv.slice(2);
const only = argv.includes('--lane') ? argv[argv.indexOf('--lane') + 1] : null;
const PORT = 8098;
const base = `http://localhost:${PORT}${PREFIX}`;
const row = (what, value, target = '') => console.log(`${what.padEnd(44)} ${String(value).padEnd(22)} ${target}`);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const server = createServer();
await new Promise((resolve) => server.listen(PORT, resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddx-perf-'));
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  headless: true,
  args: ['--no-sandbox', '--enable-precise-memory-info'],
  viewport: { width: 1280, height: 800 },
});

async function heap(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  await cdp.detach();
  return usedSize;
}

// bytes = what came over the network (transferSize is 0 for a response the
// service worker or the HTTP cache answered), so a reload shows what the SW saved.
async function timedLoad(page, url, ready) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector(ready, { timeout: 90000 });
  const ms = Date.now() - t0;
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((n, r) => n + (r.transferSize || 0), 0)
    + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
  return { ms, bytes };
}

try {
  if (only !== 'm') {
    console.log('\ndesktop lane (/d/)');
    const page = browser.pages()[0] ?? await browser.newPage();
    const READY = '.welcome-hero, .welcome-wizard, #hub-body';
    const first = await timedLoad(page, `${base}/d/`, READY);
    row('first load → Welcome', `${first.ms} ms · ${mb(first.bytes)}`, '(no target — baseline)');
    await page.waitForTimeout(1500); // let the service worker install
    const again = await timedLoad(page, `${base}/d/`, READY);
    row('reload (service worker)', `${again.ms} ms · ${mb(again.bytes)} net`, '');

    // A Nexus to write into — created through the data layer, the UI path is verify.mjs's job.
    const nx = await page.evaluate(async () => {
      await window.__ddx.ready;
      const r = await window.api.nexus.create(`Perf ${Date.now()}`, '', '#585ced');
      return r?.id ?? r;
    });
    await page.goto(`${base}/d/?nexus=${nx}`, { waitUntil: 'load' });
    await page.waitForSelector('#hub-body, #left-panel-inner .ph', { timeout: 30000 });
    await page.locator("button:has-text('Skip')").first().click({ timeout: 2000 }).catch(() => {});

    const setup = await page.evaluate(async (nx) => {
      const cls = await window.api.module.create({ nexus_ref: nx, parent_id: null, name: 'Perf', kind: 'classifier', cat_type: 'object' });
      const tpl = await window.api.classifier.createTemplate(cls, 'Text', 'text', false, false, null);
      return { cls, tpl };
    }, nx);

    const vaultFile = () => page.evaluate(() => {
      const f = [...window.__ddx.vfs.files.entries()].filter(([p]) => /\/vaults\/.*\.ddx$/.test(p)).sort((a, b) => b[1].length - a[1].length)[0];
      return f ? { path: f[0], size: f[1].length } : null;
    });

    for (const targetMb of [5, 50]) {
      // grow the vault with 1 KB values until it reaches the target size
      for (let guard = 0; guard < 400; guard++) {
        const f = await vaultFile();
        if (f && f.size >= targetMb * 1048576) break;
        await page.evaluate(async ({ cls, tpl }) => {
          const ids = await window.api.classifier.createObjects(cls, Array.from({ length: 500 }, (_, i) => ({ name: `Row ${i}` })));
          await window.api.classifier.upsertAttrs(ids.map((id) => ({ objectId: id, templateId: tpl, value: 'x'.repeat(1000) })));
          window.__ddx.persistAll();
          await window.__ddx.vfs.flushNow();
        }, setup);
      }
      const f = await vaultFile();
      const r = await page.evaluate(async ({ cls, tpl }) => {
        const out = { write: [], persist: [], flush: [] };
        for (let i = 0; i < 5; i++) {
          let t0 = performance.now();
          const id = await window.api.classifier.createObject(cls, `One ${i}`, null, null);
          await window.api.classifier.upsertAttrs([{ objectId: id, templateId: tpl, value: 'typed' }]);
          out.write.push(performance.now() - t0);
          t0 = performance.now(); window.__ddx.persistAll(); out.persist.push(performance.now() - t0);
          t0 = performance.now(); await window.__ddx.vfs.flushNow(); out.flush.push(performance.now() - t0);
        }
        const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
        return { write: med(out.write), persist: med(out.persist), flush: med(out.flush) };
      }, setup);
      row(`vault ${mb(f.size)}: one write (sqlite)`, `${r.write.toFixed(1)} ms`, '< 16 ms');
      row(`vault ${mb(f.size)}: persistAll() main thread`, `${r.persist.toFixed(1)} ms`, '< 16 ms (F7)');
      row(`vault ${mb(f.size)}: IndexedDB flush`, `${r.flush.toFixed(1)} ms`, '(off the main thread mostly)');
    }
    row('JS heap after the 50 MB vault', mb(await heap(page)), '');
  }

  if (only !== 'd') {
    console.log('\nmobile lane (/m/)');
    if (!fs.existsSync(new URL('../dist/m/index.html', import.meta.url))) {
      row('mobile lane', 'not built', '');
    } else {
      const phone = await browser.newPage();
      await phone.setViewportSize({ width: 414, height: 896 });
      const READY = 'flt-glass-pane, flutter-view';
      const first = await timedLoad(phone, `${base}/m/`, READY);
      row('first load → engine up', `${first.ms} ms · ${mb(first.bytes)}`, '(F11)');
      await phone.waitForTimeout(3000);
      const again = await timedLoad(phone, `${base}/m/`, READY);
      row('reload (service worker)', `${again.ms} ms · ${mb(again.bytes)} net`, '');
      await phone.waitForTimeout(3000);
      row('JS heap after boot', mb(await heap(phone)), '');
      const sizes = ['main.dart.js', 'canvaskit/canvaskit.wasm', 'canvaskit/chromium/canvaskit.wasm', 'canvaskit/skwasm.wasm']
        .map((f) => [f, new URL(`../dist/m/${f}`, import.meta.url)])
        .filter(([, u]) => fs.existsSync(u))
        .map(([f, u]) => `${f} ${mb(fs.statSync(u).size)}`);
      row('shipped', sizes.join(' · '), '');
      await phone.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
