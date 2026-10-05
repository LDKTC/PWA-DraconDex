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
run('flutter', ['build', 'web', '--release', '--no-web-resources-cdn', '--base-href', `${basePath}m/`]);

fs.rmSync(lane, { recursive: true, force: true });
fs.cpSync(path.join(flutterDir, 'build/web'), lane, { recursive: true });

// One app, one manifest. Flutter writes its own manifest.json with a
// lane-local start_url; pointing this page at the site manifest instead means
// installing from a phone and installing from a desktop produce the same
// installed app, whose start_url is the router.
let html = fs.readFileSync(path.join(lane, 'index.html'), 'utf8');
html = html.replace('<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="../manifest.webmanifest">');
fs.writeFileSync(path.join(lane, 'index.html'), html);

const size = execSync(`du -sh ${JSON.stringify(lane)}`).toString().split('\t')[0];
console.log(`[mobile] Flutter web -> dist/m (${size})`);
