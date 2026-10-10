#!/usr/bin/env node
// The desktop lane: DraconDex's Electron build, running in a browser tab.
//
// The renderer, its CSS and the preload contract are shipped exactly as they
// are in DraconDex-EXE — no fork, no edits. What gets built here is the piece
// underneath them: one bundle (ddx-bridge.js) containing main.js, the whole
// src/db data layer, and the browser shims from shim/ that stand in for
// Electron, the filesystem, and node-sqlite3-wasm.
//
// The output directory layout is not arbitrary. The app's CSS and renderer
// reach the brand images with '../src/assets/brand/…' (from d/index.html) and
// '../../src/assets/brand/…' (from d/css/*.css). Putting the shared assets at
// the SITE root and the lane one level down makes both of those resolve
// unchanged, which is why nothing in the app's own source needs rewriting.
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = path.join(root, '.app-src');
const dist = path.join(root, 'dist');
const lane = path.join(dist, 'd');

if (!fs.existsSync(appSrc)) {
  console.error('[desktop] .app-src is missing — run `npm run fetch` first');
  process.exit(1);
}
const source = JSON.parse(fs.readFileSync(path.join(appSrc, 'source.json'), 'utf8'));

const shim = (name) => path.join(root, 'shim', name);
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };

fs.rmSync(lane, { recursive: true, force: true });
fs.mkdirSync(lane, { recursive: true });

// ── The app's own front-end, verbatim ──────────────────────────────────────
copy(path.join(appSrc, 'electron/css'), path.join(lane, 'css'));
copy(path.join(appSrc, 'electron/src/renderer'), path.join(lane, 'src/renderer'));
if (fs.existsSync(path.join(appSrc, 'electron/vendor'))) copy(path.join(appSrc, 'electron/vendor'), path.join(lane, 'vendor'));
copy(path.join(appSrc, 'src/assets/brand'), path.join(dist, 'src/assets/brand'));
// The design tokens SDB generates, linked first from index.html as
// '../src/design/generated/tokens.css' — the same shared-root placement as the
// brand images above. Missing, every page 404s it and draws on the fallbacks.
if (fs.existsSync(path.join(appSrc, 'src/design'))) copy(path.join(appSrc, 'src/design'), path.join(dist, 'src/design'));

// ── sqlite, SQLite's own WebAssembly build ─────────────────────────────────
// Its JavaScript is bundled into ddx-bridge.js (shim/sqlite.js imports it);
// the .wasm is fetched from vendor/ at boot. See shim/sqlite.js for why this
// replaced sql.js (Procress 19 part 5, F7).
copy(path.join(root, 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'), path.join(lane, 'vendor', 'sqlite3.wasm'));

// ── The bridge ─────────────────────────────────────────────────────────────
const nodeShims = {
  electron: shim('electron.js'),
  fs: shim('fs.js'),
  path: shim('path.js'),
  os: shim('os.js'),
  crypto: shim('crypto.js'),
  http: shim('http.js'),
  'node-sqlite3-wasm': shim('sqlite.js'),
  'node:async_hooks': shim('async_hooks.js'),
  'node:fs': shim('fs.js'),
  'node:path': shim('path.js'),
  'node:os': shim('os.js'),
  'node:crypto': shim('crypto.js'),
  'node:http': shim('http.js'),
  zlib: shim('zlib.js'),
  'node:zlib': shim('zlib.js'),
  // main.js's ddx-file:// handler (never registered here; see shim/stream.js)
  stream: shim('stream.js'),
  'node:stream': shim('stream.js'),
};

const result = await esbuild.build({
  entryPoints: [shim('entry.js')],
  outfile: path.join(lane, 'ddx-bridge.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  alias: nodeShims,
  inject: [shim('globals.js')],
  define: { 'globalThis.__DDX_VERSION__': JSON.stringify(source.version) },
  minify: true,
  // Off for the committed build. The bundle contains DraconDex-EXE's main
  // process and its whole data layer, and that repository is private — a
  // source map on a public site would republish all of it in readable form.
  // DDX_SOURCEMAP=1 turns it on for local debugging.
  sourcemap: process.env.DDX_SOURCEMAP === '1',
  legalComments: 'none',
  logLevel: 'info',
  // The sqlite package locates its .wasm (and its OPFS worker, which this
  // build never starts) through import.meta.url, empty in an IIFE bundle.
  // shim/sqlite.js passes locateFile instead, so the warning is noise.
  logOverride: { 'empty-import-meta': 'silent' },
  metafile: true,
});

// ── index.html ─────────────────────────────────────────────────────────────
// Four changes, all of them forced by the move off Electron:
//   1. a CSP that allows wasm and same-origin fetch (the desktop policy is
//      connect-src 'none', which would block loading sqlite's .wasm);
//   2. viewport/manifest/theme-color, so the page is installable;
//   3. the two boot scripts, ahead of the app's own;
//   4. web.css, for the chrome that only makes sense with a real OS window.
let html = fs.readFileSync(path.join(appSrc, 'electron/index.html'), 'utf8');

// The DDX Transfer service origin, allowed through the CSP below. Keep this
// in step with DEFAULT_BASE in electron/src/db/transfer.js — a user who points
// the app at their own deployment will also have to serve this build with a
// CSP that names it.
const TRANSFER_ORIGIN = 'https://dracondex-transfer.netlify.app';

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "manifest-src 'self'",
  // Same-origin for the wasm binary and the app's own files, plus the one
  // host this build genuinely talks to: the DDX Transfer service
  // (DraconDex-TRX). src/db/transfer.js reaches it with global fetch — which
  // is exactly why that feature works here at all, unlike Token Sync's Google
  // login, which needs a loopback HTTP server the browser cannot give it.
  //
  // Without this line the transfer page fails with a CSP violation and no
  // network error, which reads as "the service is down" and is not.
  `connect-src 'self' ${TRANSFER_ORIGIN}`,
  "worker-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

html = html.replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?">/, `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
html = html.replace('<title>Novel Manager</title>', `<title>DraconDex</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#050506">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="../manifest.webmanifest">
  <link rel="icon" href="../icons/Icon-192.png">
  <link rel="apple-touch-icon" href="../icons/Icon-192.png">`);
html = html.replace('<link rel="stylesheet" href="css/welcome.css">', '<link rel="stylesheet" href="css/welcome.css">\n  <link rel="stylesheet" href="web.css">');
html = html.replace('<script src="src/renderer/i18n.js"></script>', `<script src="ddx-bridge.js"></script>
  <script src="src/renderer/i18n.js"></script>`);
html = html.replace('</body>', `<script>
  // Offline support. Registered from the lane, with the site root as its
  // scope, so one worker covers the router and both lanes.
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch((e) => console.warn('[sw]', e)));
  }
</script>
</body>`);
fs.writeFileSync(path.join(lane, 'index.html'), html);

// ── web.css ────────────────────────────────────────────────────────────────
// The app draws its own title bar because the desktop window is frameless.
// A browser tab already has one, and minimise/maximise/close have no meaning
// here (window:minimize and friends are intercepted in shim/entry.js), so the
// controls come off rather than sitting there doing nothing.
fs.writeFileSync(path.join(lane, 'web.css'), `/* Web-only chrome adjustments for the browser build. Generated by
   tools/build-desktop.mjs — the app's own css/ is shipped untouched. */
#window-controls{display:none}
.title-drag{-webkit-app-region:no-drag}
body{overscroll-behavior:none}
/* iPadOS and large phones land on this lane when someone asks for it from the
   router; keep the panels usable rather than clipping them off-screen. */
@media (max-width:820px){
  #left-panel{max-width:60vw}
}
`);

const bytes = fs.statSync(path.join(lane, 'ddx-bridge.js')).size;
console.log(`[desktop] DraconDex ${source.version} -> dist/d (bridge ${(bytes / 1024).toFixed(0)} KB)`);
void result;
