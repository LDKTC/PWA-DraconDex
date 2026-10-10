#!/usr/bin/env node
// Static server for dist/, for local checks and for tools/verify.mjs.
// Mirrors GitHub Pages closely enough for what matters here: a project-page
// prefix (/DraconDex-PWA/), directory index.html, and correct wasm/js types.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

// The path prefix this site is served under. Derived from the COMMITTED build
// rather than hardcoded, because those two can disagree and only one of them is
// the truth about dist/.
//
// Flutter bakes an absolute `--base-href` into dist/m/index.html at build time,
// and only a real Flutter build can rewrite it. So when the repo moved from
// LDKTC/PWA-DraconDex to ZYDRAXYL/DraconDex-PWA, the constant here changed the
// moment the source did — while dist/m kept asking for /PWA-DraconDex/m/
// assets. Serving at the new prefix meant every Flutter asset 404'd and the
// engine never booted, which is exactly how verify.mjs failed in CI.
//
// Reading the base href instead makes the server serve what is actually there,
// at the path that build expects, and it follows along automatically once
// refresh.yml rebuilds dist/ under the new prefix.
const DEFAULT_PREFIX = '/DraconDex-PWA';

function prefixFromBuild() {
  try {
    const html = fs.readFileSync(path.join(dist, 'm/index.html'), 'utf8');
    const base = /<base href="([^"]*)">/.exec(html)?.[1] || '';
    // '/DraconDex-PWA/m/' -> '/DraconDex-PWA'; './' or '/' -> served at the root
    const m = /^(\/.*?)\/m\/$/.exec(base);
    if (m) return m[1];
    if (base === '/' || base === './' || base === '') return '';
  } catch (_) { /* no Flutter lane built — fall through */ }
  return DEFAULT_PREFIX;
}

export const PREFIX = process.env.BASE_PATH
  ? process.env.BASE_PATH.replace(/\/$/, '')
  : prefixFromBuild();

// no-store by default: verify.mjs and a working session must always see the
// build on disk. GitHub Pages itself sends max-age=600; DDX_CACHE_CONTROL
// lets tools/perf.mjs (--pages-cache) measure under that instead, since what a
// service worker costs on a first visit depends on it (see build-shell.mjs).
const CACHE_CONTROL = process.env.DDX_CACHE_CONTROL || 'no-store';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8', '.symbols': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};

export function createServer() {
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.startsWith(PREFIX)) urlPath = urlPath.slice(PREFIX.length) || '/';
    let filePath = path.join(dist, urlPath);
    if (!filePath.startsWith(dist)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + urlPath); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': CACHE_CONTROL,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2]) || 8099;
  createServer().listen(port, () => console.log(`serving dist/ on http://localhost:${port}${PREFIX}/`));
}
