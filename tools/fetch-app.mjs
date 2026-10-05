#!/usr/bin/env node
// Pull the DraconDex source this PWA is built from.
//
// DraconDex-EXE is a separate (and private) repository, and none of its source
// is committed here — this repo holds the build tooling, the browser shims and
// the built site. So every build starts by fetching the app at a pinned commit
// into .app-src/ (gitignored).
//
//   node tools/fetch-app.mjs                 # the ref pinned in app-source.json
//   node tools/fetch-app.mjs --ref main      # a different ref, and pin it
//   node tools/fetch-app.mjs --local ../DraconDex-EXE   # an existing checkout
//
// --local is what a working session uses when both repos are already on disk;
// it copies rather than clones, so an uncommitted change in the app checkout
// is what gets built.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.app-src');
const pinFile = path.join(root, 'app-source.json');
const pin = JSON.parse(fs.readFileSync(pinFile, 'utf8'));

const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
const local = argOf('--local');
// --ref applies to every source. Useful for building a matching feature branch
// across repos; pinning them independently is the normal case.
const refOverride = argOf('--ref');
// --commit KEY=SHA, repeatable. --local assembles ONE tree out of several
// repos, so that tree's HEAD describes at most one of them; every other
// source arrives as plain copied files with no git metadata left. Without
// this the local path stamped the same HEAD onto every source, which is how
// app-source.json came to pin APK at a commit that does not exist in APK.
const commitOverride = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--commit') continue;
  const [key, sha] = String(argv[i + 1] ?? '').split('=');
  if (!key || !sha) {
    console.error(`[fetch] --commit expects KEY=SHA, got "${argv[i + 1] ?? ''}"`);
    process.exit(1);
  }
  commitOverride[key] = sha;
}

// Which paths come from which repo. Kept explicit, and now in app-source.json
// rather than here, so a fetch cannot quietly start dragging in parts of a repo
// the PWA has no business shipping (tests, build scripts, packaging config) —
// and so the EXE/APK split is data rather than code.
//
// The union is deliberately identical to the old single-repo NEEDED list: the
// whole point of reassembling into .app-src/ is that build-desktop.mjs and the
// 13 shim/*.js files see the tree shape they always saw.
export const NEEDED = Object.values(pin.sources).flatMap((s) => s.paths);

// Build artefacts and platform folders a web build never reads. Copying a
// checkout that has already been built otherwise drags in ~200 MB of
// flutter/build and .dart_tool.
const SKIP = /(^|\/)(build|\.dart_tool|\.git|node_modules|android|ios|linux|macos|windows|test)(\/|$)/;

// Adds paths into .app-src; the caller clears it once first — clearing here
// made the second source of a multi-repo fetch wipe the first.
function copyInto(from, paths) {
  for (const rel of paths) {
    const src = path.join(from, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(target, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, {
      recursive: true,
      // '/' on every OS: SKIP is written with forward slashes
      filter: (srcPath) => !SKIP.test(path.relative(from, srcPath).split(path.sep).join('/')),
    });
  }
  // electron/test is only excluded here because electron/src is copied whole.
  fs.rmSync(path.join(target, 'electron', 'test'), { recursive: true, force: true });
}

function head(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch (_) { return null; }
}

const commits = {};
fs.rmSync(target, { recursive: true, force: true });
if (local) {
  // One checkout supplying everything — a monorepo-shaped working tree, or a
  // scratch dir someone assembled by hand. Still validated the same way.
  const from = path.resolve(local);
  if (!fs.existsSync(path.join(from, 'electron', 'main.js'))) {
    console.error(`[fetch] ${from} does not contain electron/main.js — not a DraconDex source tree`);
    process.exit(1);
  }
  copyInto(from, NEEDED);
  // The tree was just validated as containing electron/main.js, so its HEAD
  // belongs to whichever source declares that path. Anything else is unknown
  // here unless --commit stated it.
  const assembledHead = head(from);
  const treeOwner = Object.entries(pin.sources)
    .find(([, src]) => src.paths.includes('electron/main.js'))?.[0];
  for (const key of Object.keys(pin.sources)) {
    commits[key] = commitOverride[key] ?? (key === treeOwner ? assembledHead : null);
  }
  console.log(`[fetch] copied every source from ${from}${commits.EXE ? ` @ ${commits.EXE.slice(0, 12)}` : ''}`);
} else {
  for (const [key, src] of Object.entries(pin.sources)) {
    const ref = refOverride || src.ref;
    const clone = path.join(root, `.app-clone-${key}`);
    fs.rmSync(clone, { recursive: true, force: true });
    console.log(`[fetch] ${key}: cloning ${src.repo} @ ${ref}`);
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, src.repo, clone], { stdio: 'inherit' });
    // Each repo contributes only its own declared paths, so two sources can
    // never silently overwrite each other's files in .app-src.
    copyInto(clone, src.paths);
    commits[key] = commitOverride[key] ?? head(clone);
    fs.rmSync(clone, { recursive: true, force: true });
  }
}

const version = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).version;
// `commit` stays a single value for backward compatibility: build-shell.mjs
// hashes it into the service-worker cache name, and EXE is what the desktop
// lane is built from. `commits` carries the full picture.
fs.writeFileSync(path.join(target, 'source.json'),
  JSON.stringify({ commit: commits.EXE, commits, version, fetchedAt: new Date().toISOString() }, null, 2) + '\n');

// Re-pin whatever moved, so a build records exactly what it built from.
let moved = false;
for (const [key, src] of Object.entries(pin.sources)) {
  const ref = refOverride || src.ref;
  const sha = commits[key];
  // An unknown commit leaves the existing pin alone. Writing null would throw
  // away the last thing known to be true, and writing some other source's
  // HEAD — what this used to do — is worse than either.
  if (sha == null) {
    console.warn(
      `[fetch] ${key}: commit unknown for this build; pin left at ` +
      `${String(src.commit ?? '?').slice(0, 8)}. Pass --commit ${key}=<sha> to record it.`,
    );
    if (src.ref !== ref) { src.ref = ref; moved = true; }
    continue;
  }
  if (src.commit !== sha || src.ref !== ref) { src.commit = sha; src.ref = ref; moved = true; }
}
if (moved) fs.writeFileSync(pinFile, JSON.stringify(pin, null, 2) + '\n');
console.log(`[fetch] DraconDex ${version} ready in .app-src/ (${Object.entries(commits).map(([k, c]) => `${k}@${(c || '?').slice(0, 8)}`).join(' ')})`);
