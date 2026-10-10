#!/usr/bin/env node
// The mobile lane: DraconDex's Flutter front-end, built for the web.
//
// This is the same lib/ that ships as the Android and iOS app — the web is its
// third build target, not a port (see docs/PWA.md in DraconDex-EXE). Two files
// it needs at runtime, sqlite3.wasm and sqflite_sw.js, are resolved by a real
// Dart toolchain run rather than checked in anywhere, so `dart run
// sqflite_common_ffi_web:setup` runs here before every build.
//
//   node tools/build-mobile.mjs                  # build into dist/m
//   BASE_PATH=/DraconDex-PWA/ node tools/...     # where the site is served from
//
// Without a Flutter SDK on PATH this exits 0 and leaves any existing dist/m
// alone: the desktop lane must stay buildable on a machine that has never seen
// Dart. It says so loudly rather than pretending it built something.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swRegisterScript } from './sw-register.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = path.join(root, '.app-src');
const flutterDir = path.join(appSrc, 'flutter');
const dist = path.join(root, 'dist');
const lane = path.join(dist, 'm');
const basePath = process.env.BASE_PATH || '/DraconDex-PWA/';

function hasFlutter() {
  try { execSync('flutter --version', { stdio: 'ignore' }); return true; } catch (_) { return false; }
}

if (!fs.existsSync(flutterDir)) {
  console.error('[mobile] .app-src/flutter is missing — run `npm run fetch` first');
  process.exit(1);
}
if (!hasFlutter()) {
  console.warn('[mobile] no Flutter SDK on PATH — skipping the mobile lane.');
  console.warn(`[mobile] dist/m is ${fs.existsSync(lane) ? 'left as it was' : 'NOT built; the router will fall back to the desktop lane'}`);
  process.exit(0);
}

// flutter and dart are .bat files on Windows, which only start through a shell
const run = (cmd, args, cwd = flutterDir) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

run('flutter', ['pub', 'get']);
run('dart', ['run', 'sqflite_common_ffi_web:setup']);
// --no-web-resources-cdn is load-bearing, not a preference: without it the
// built loader resolves CanvasKit from www.gstatic.com at runtime (verified —
// the local canvaskit/ folder is emitted either way but never used), which
// means the app cannot start offline and reaches a third-party host on every
// cold load. With it, buildConfig carries useLocalCanvasKit and the engine
// loads from the copy sitting next to it.
//
// --wasm (Procress 19 part 5, F11) builds the app twice, and the loader picks
// per browser: dart2wasm + the skwasm renderer where WasmGC is supported and
// the engine allows it (Chromium-based browsers), dart2js + CanvasKit
// everywhere else (Firefox, Safari). Measured on Chromium with
// tools/perf.mjs and Flutter's own first-frame event:
//
//                       first frame   bytes on first load
//   dart2js + CanvasKit   ~2.0 s       13.9 MB  (main.dart.js 6.9 MB + canvaskit.wasm 5.5 MB)
//   dart2wasm + skwasm    ~0.9 s       11.7 MB  (main.dart.wasm 6.7 MB + skwasm.wasm 3.4 MB)
//
// Both builds share sqflite_common_ffi_web's IndexedDB store; a library
// written by the dart2js build opens unchanged in the wasm one (checked in
// a real browser before this was switched on). skwasm runs single-threaded
// here — multi-threaded needs cross-origin isolation (COOP/COEP headers),
// which GitHub Pages cannot send.
run('flutter', ['build', 'web', '--release', '--wasm', '--no-web-resources-cdn', '--base-href', `${basePath}m/`]);

fs.rmSync(lane, { recursive: true, force: true });
fs.cpSync(path.join(flutterDir, 'build/web'), lane, { recursive: true });

// One app, one manifest. Flutter writes its own manifest.json with a
// lane-local start_url; pointing this page at the site manifest instead means
// installing from a phone and installing from a desktop produce the same
// installed app, whose start_url is the router. The site's service worker is
// registered here too — before the bootstrap script, see sw-register.mjs.
let html = fs.readFileSync(path.join(lane, 'index.html'), 'utf8');
html = html.replace('<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="../manifest.webmanifest">');
html = html.replace('  <script src="flutter_bootstrap.js" async></script>', `  ${swRegisterScript('../sw.js', '../')}
  <script src="flutter_bootstrap.js" async></script>`);
if (!html.includes("navigator.serviceWorker.register('../sw.js'")) throw new Error('[mobile] could not place the service-worker script in index.html');
fs.writeFileSync(path.join(lane, 'index.html'), html);

// The loader call at the end of flutter_bootstrap.js. Two changes:
//   - no serviceWorkerSettings. In Flutter 3.44 flutter_service_worker.js is
//     a stub that unregisters itself and reloads every page it controls; asked
//     for on every load, it was installed, activated and thrown away each
//     time, and it is scoped to /m/, so while it existed it — not the site's
//     worker — owned the lane. The file itself stays in dist/m: it is what
//     retires a worker an older Flutter build left registered on a device.
//   - canvasKitVariant 'full'. The dart2js fallback otherwise loads
//     canvaskit/chromium/ on Chromium without WasmGC (Chrome < 119) and
//     canvaskit/ everywhere else; with the wasm build taking every current
//     Chromium, the chromium/ variant (5.5 MB of deploy) is kept for
//     browsers four years old. The full variant runs there too.
const bootPath = path.join(lane, 'flutter_bootstrap.js');
let boot = fs.readFileSync(bootPath, 'utf8');
const LOAD_RE = /_flutter\.loader\.load\(\{[\s\S]*?serviceWorkerSettings[\s\S]*?\}\);\s*$/;
if (!LOAD_RE.test(boot)) throw new Error('[mobile] flutter_bootstrap.js: loader call not found — check the Flutter version');
boot = boot.replace(LOAD_RE, "_flutter.loader.load({\n  config: { canvasKitVariant: 'full' }\n});\n");
fs.writeFileSync(bootPath, boot);

// What the loader can never fetch with this build and that config — read off
// flutter_bootstrap.js, not guessed:
//   canvaskit/chromium/               dropped by canvasKitVariant 'full' above
//   canvaskit/experimental_webparagraph/  only for canvasKitVariant 'experimentalWebParagraph'
//   canvaskit/wimp.*                  only with config.enableWimp
//   **/*.symbols                      debug symbols; nothing at runtime asks for them
// Kept: canvaskit/canvaskit.* (the dart2js fallback), skwasm.* (Chromium),
// skwasm_heavy.* (skwasm where ImageDecoder is missing — an insecure context).
const prune = [
  'canvaskit/chromium',
  'canvaskit/experimental_webparagraph',
  'canvaskit/wimp.js',
  'canvaskit/wimp.wasm',
];
for (const rel of prune) fs.rmSync(path.join(lane, rel), { recursive: true, force: true });
(function dropSymbols(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) dropSymbols(full);
    else if (e.name.endsWith('.symbols')) fs.rmSync(full);
  }
})(lane);

const size = execSync(`du -sh ${JSON.stringify(lane)}`).toString().split('\t')[0];
console.log(`[mobile] Flutter web -> dist/m (${size})`);
