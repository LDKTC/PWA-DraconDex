#!/usr/bin/env node
// Drives the built site in a real browser and checks it actually works.
//
// A DraconDex build is not "done" because it compiled: the whole point of this
// repo is that the app's own data layer runs in the browser, so the check that
// matters is a round trip through it — create a Nexus, create a module inside
// it, reload the page, and confirm both are still there, which they can only
// be if sqlite ran and the virtual filesystem reached IndexedDB.
//
//   npm run verify                 # both lanes
//   npm run verify -- --lane d     # just one
//   npm run verify -- --headed     # watch it happen
//
// Screenshots land in .verify/ regardless of pass or fail.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer, PREFIX } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, '.verify');
const argv = process.argv.slice(2);
const only = argv.includes('--lane') ? argv[argv.indexOf('--lane') + 1] : null;
const PORT = 8099;
const base = `http://localhost:${PORT}${PREFIX}`;

fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

const server = createServer();
await new Promise((resolve) => server.listen(PORT, resolve));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddx-verify-'));
const browser = await chromium.launchPersistentContext(profile, {
  acceptDownloads: true,
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  headless: !argv.includes('--headed'),
  args: ['--no-sandbox'],
  viewport: { width: 1280, height: 800 },
});

const pageErrors = [];
const page = browser.pages()[0] ?? await browser.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
const missing = [];
page.on('response', (r) => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });

try {
  // ── the router ───────────────────────────────────────────────────────────
  console.log('\nrouter');
  await page.goto(`${base}/?lane=choose`, { waitUntil: 'load' });
  await shot('01-router');
  const lanes = await page.locator('a.lane').evaluateAll((els) => els.map((e) => e.dataset.lane));
  check('router offers all three lanes', lanes.join(',') === 'd,t,m', `offered: ${lanes.join(', ') || '(none)'}`);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  check('router sends a desktop viewport to /d/', page.url().includes('/d/'), page.url());

  if (only !== 'm') {
    // ── the desktop lane ───────────────────────────────────────────────────
    console.log('\ndesktop lane (/d/)');
    await page.goto(`${base}/d/`, { waitUntil: 'load' });
    await page.waitForSelector('.welcome-hero, .welcome-wizard', { timeout: 20000 });
    await shot('02-welcome');
    check('the app boots to its Welcome screen', true);

    // Straight through the first-run wizard.
    for (let i = 0; i < 8; i++) {
      const next = page.locator('.welcome-wizard .btn-p').last();
      if (!(await next.count())) break;
      await next.click();
      await page.waitForTimeout(350);
    }
    await page.waitForSelector('[onclick="welcomeCreateNexus()"]', { timeout: 10000 });
    await shot('03-vault-list');

    // Create a Nexus through the UI the user would use.
    await page.locator('[onclick="welcomeCreateNexus()"]').first().click();
    await page.waitForSelector('#nx-name', { timeout: 10000 });
    await page.fill('#nx-name', 'Verify Nexus');
    // The create form offers a guided tour, on by default, whose overlay would
    // swallow every click that follows. A real user can take it; this run
    // wants the app underneath it.
    if (await page.locator('#nx-guide').count()) await page.uncheck('#nx-guide');
    await shot('04-new-nexus');
    await page.locator('[onclick="createNexusSubmit()"]').click();
    await page.waitForTimeout(2500);
    check('creating a Nexus opens it', /[?&]nexus=\d+/.test(page.url()), page.url());
    await page.waitForSelector('#left-panel-inner .ph, #hub-body', { timeout: 20000 });
    await shot('05-nexus');

    // And a module inside it, through the kind picker.
    await page.locator('[onclick*="openMainModuleModal"]').first().click();
    await page.waitForSelector('.kind-list-item', { timeout: 10000 });
    await shot('06-kind-picker');
    await page.locator('[onclick^="quickCreateModule(\'manager\'"]').first().click();
    await page.waitForTimeout(1500);
    const nexusId = Number(new URL(page.url()).searchParams.get('nexus'));
    const created = await page.evaluate((id) => window.api.module.getTree(id), nexusId);
    check('creating a module writes it to the vault', created.length > 0, `${created.length} node(s)`);
    await shot('07-module');

    // Exporting a vault: the app writes a .ddx through what it thinks is a
    // save dialog, and the browser has to end up with the file.
    await page.evaluate(() => { globalThis.__ddxForceDownloadLink = true; });
    const download = page.waitForEvent('download', { timeout: 30000 });
    await page.evaluate(() => window.api.db.exportFile());
    const file = path.join(shots, 'exported.ddx');
    await (await download).saveAs(file);
    const header = fs.readFileSync(file).subarray(0, 15).toString();
    check('exporting the vault produces a real sqlite file', header === 'SQLite format 3', `${(fs.statSync(file).size / 1024).toFixed(0)} KB, header "${header}"`);

    // And back the other way: a file the user picks has to reach the virtual
    // filesystem, or every import path in the app is dead on the web.
    page.once('filechooser', (chooser) => chooser.setFiles(file).catch(() => {}));
    const picked = await page.evaluate(() => window.api.db.pickImportFile());
    const pickedPath = picked?.filePath || picked?.filePaths?.[0] || (typeof picked === 'string' ? picked : null);
    const uploaded = pickedPath ? await page.evaluate((p) => !!window.__ddx.vfs.read(p), pickedPath) : false;
    check('a picked file reaches the virtual filesystem', uploaded, pickedPath || JSON.stringify(picked));
    fs.rmSync(file, { force: true });

    // The real test: does any of it survive the page going away?
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#left-panel-inner .ph, #hub-body', { timeout: 20000 });
    const afterReload = await page.evaluate((id) => window.api.module.getTree(id), nexusId);
    check('the vault survives a reload', afterReload.length === created.length, `${afterReload.length} node(s)`);
    const vaults = await page.evaluate(() => window.api.nexus.getAll());
    check('the Nexus is in the registry after a reload', vaults.some((v) => v.name === 'Verify Nexus'));
    const files = await page.evaluate(() => [...window.__ddx.vfs.files.keys()]);
    check('vault files exist on the virtual disk', files.some((f) => f.endsWith('.ddx')), files.join(', '));
    await shot('08-after-reload');
  }

  if (only !== 'd') {
    // ── the mobile lane ────────────────────────────────────────────────────
    console.log('\nmobile lane (/m/)');
    if (!fs.existsSync(path.join(root, 'dist/m/index.html'))) {
      check('the Flutter lane is built', false, 'dist/m is missing (build ran without a Flutter SDK)');
    } else {
      const phone = await browser.newPage();
      await phone.setViewportSize({ width: 414, height: 896 });
      const phoneErrors = [];
      phone.on('pageerror', (e) => phoneErrors.push(e.message));
      await phone.goto(`${base}/m/`, { waitUntil: 'load' });
      // Flutter paints into a canvas/shadow host; waiting for flt-glass-pane
      // (or a <canvas>) is how you know the engine actually started.
      await phone.waitForSelector('flt-glass-pane, flutter-view, canvas', { timeout: 60000 });
      await phone.waitForTimeout(4000);
      await phone.screenshot({ path: path.join(shots, '09-mobile.png') });
      check('the Flutter engine starts', true);
      check('the Flutter lane loads without page errors', phoneErrors.length === 0, phoneErrors.slice(0, 2).join(' | '));

      // The same build has to answer a tablet-shaped window with a different
      // shell — vertical rail, hub panel, content pane (DraconDex-EXE
      // docs/PWA.md §7) — instead of the phone's bottom bar stretched wide.
      // A tablet is most of what visits the mobile lane on a big screen, so
      // it is worth a pass of its own here.
      //
      // What is checked is what can honestly be checked from outside: the
      // engine survives the resize, nothing errors, nothing 404s. The layout
      // itself lives inside a canvas, and Flutter's accessibility DOM turns
      // out not to expose the rail (measured: enabling semantics surfaces the
      // content pane's nodes only), so asserting "the rail is there" from
      // here would be asserting on a proxy that does not track the thing.
      // The screenshot below is the artefact for that — read it.
      await phone.setViewportSize({ width: 1194, height: 834 });
      await phone.waitForTimeout(3000);
      await phone.screenshot({ path: path.join(shots, '10-mobile-tablet.png') });
      check('the Flutter lane survives a tablet viewport', phoneErrors.length === 0, phoneErrors.slice(0, 2).join(' | '));
      await phone.close();
    }

    // ── the tablet lane ────────────────────────────────────────────────────
    // /t/ is one HTML file that loads /m/'s assets through Flutter's <base
    // href>. That indirection is exactly the kind of thing that looks right in
    // the generator and 404s in a browser, so it gets a real load here rather
    // than a file-exists check.
    console.log('\ntablet lane (/t/)');
    if (!fs.existsSync(path.join(root, 'dist/t/index.html'))) {
      check('the tablet lane is built', false, 'dist/t is missing (build ran without a Flutter SDK)');
    } else {
      const tablet = await browser.newPage();
      await tablet.setViewportSize({ width: 1194, height: 834 });
      const tabletErrors = [];
      tablet.on('pageerror', (e) => tabletErrors.push(e.message));
      await tablet.goto(`${base}/t/`, { waitUntil: 'load' });
      await tablet.waitForSelector('flt-glass-pane, flutter-view, canvas', { timeout: 60000 });
      await tablet.waitForTimeout(4000);
      await tablet.screenshot({ path: path.join(shots, '11-tablet.png') });
      check('the tablet lane starts the Flutter engine', true);
      check('the tablet lane loads without page errors', tabletErrors.length === 0, tabletErrors.slice(0, 2).join(' | '));
      // The whole point of the lane: it must be serving /m/'s assets, not a
      // second copy of them. If the base href ever stopped resolving there,
      // this is what would catch it.
      const sharesAssets = await tablet.evaluate(() =>
        performance.getEntriesByType('resource').some((r) => /\/m\/main\.dart\.js/.test(r.name)));
      check('the tablet lane loads /m/ assets rather than its own copy', sharesAssets,
        sharesAssets ? 'main.dart.js served from /m/' : 'main.dart.js was NOT fetched from /m/ — the <base href> is wrong');
      const marked = await tablet.evaluate(() => window.__ddxLane);
      check('the tablet lane marks itself for the app', marked === 'tablet', `window.__ddxLane = ${marked}`);
      await tablet.close();
    }
  }

  check('nothing 404s', missing.length === 0, [...new Set(missing)].join(', '));

  // Console noise that is expected, with the reason it is expected:
  //   - 'wiki backfill error' — upstream behaviour, not a web-build problem:
  //     initVaultDB() reindexes wikilinks through getDB(), and creating a
  //     Nexus from the Welcome screen runs with no vault in context by design
  //     (src/db/vault-context.js fails closed). Upstream catches and logs it;
  //     the desktop app prints the same line.
  //   - a bare 'Failed to load resource' line, which is the console's echo of
  //     a 404 already checked above on its own.
  const BENIGN = /favicon|Failed to load resource|ServiceWorker|sw\.js/i;
  const realErrors = pageErrors.filter((e) => !BENIGN.test(e));
  check('no unexpected page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
} catch (err) {
  check('verification ran to completion', false, err.message);
  await shot('99-failure');
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

console.log(`\nscreenshots: ${path.relative(root, shots)}/`);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
