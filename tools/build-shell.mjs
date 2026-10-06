#!/usr/bin/env node
// The site shell: what sits at the root of the deployed PWA and decides which
// of the two builds a visitor gets.
//
// DraconDex ships two front-ends for two shapes of device, and this repo
// deploys both side by side rather than picking one:
//
//   /d/  the Electron front-end, compiled for the browser (desktop, laptop)
//   /m/  the Flutter front-end, its web target        (phone, tablet)
//
// The router below is the only thing at the root. It picks a lane, remembers
// an explicit choice, and gets out of the way. Everything it emits — manifest,
// service worker, icons — is shared by both lanes so an install is one app,
// however it was reached.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = path.join(root, '.app-src');
const dist = path.join(root, 'dist');
const source = JSON.parse(fs.readFileSync(path.join(appSrc, 'source.json'), 'utf8'));

fs.mkdirSync(dist, { recursive: true });

// Icons come from the Flutter build's own web/icons — the same brand mark, in
// the sizes and maskable variants a manifest needs, already generated upstream
// from src/assets/flutter. No point re-cutting them here.
fs.cpSync(path.join(appSrc, 'flutter/web/icons'), path.join(dist, 'icons'), { recursive: true });
fs.copyFileSync(path.join(appSrc, 'flutter/web/favicon.png'), path.join(dist, 'favicon.png'));

// ── the tablet lane ────────────────────────────────────────────────────────
// /t/ is the SAME Flutter build as /m/, not a third compile. dist/m is ~50 MB;
// copying it would double the deploy for a build whose only difference is which
// shell its own responsive layout picks.
//
// The trick is Flutter's <base href>: this page keeps m/'s base, so every asset
// it loads — main.dart.js, canvaskit, the wasm — is fetched from /m/ and served
// from one copy. Only this ~2 KB HTML file is per-lane.
//
// What /t/ actually buys, stated plainly: a stable URL and its own install
// shortcut for tablets, and a place to pin the tablet profile so a tablet-sized
// window is not treated as a large phone. The Flutter app is already responsive
// by window size (verify.mjs exercises 1194x834), so a tablet reaching /m/ is
// not broken — it just has no way to say "I am a tablet" and no distinct entry
// point. window.__ddxLane is the hook for the former; nothing reads it yet.
if (fs.existsSync(path.join(dist, 'm/index.html'))) {
  const mobileHtml = fs.readFileSync(path.join(dist, 'm/index.html'), 'utf8');
  const tabletHtml = mobileHtml.replace(
    '<meta charset="UTF-8">',
    `<meta charset="UTF-8">
  <!-- Served from /t/ but loading /m/'s assets via the <base href> above. -->
  <script>window.__ddxLane = 'tablet';</script>`
  );
  fs.mkdirSync(path.join(dist, 't'), { recursive: true });
  fs.writeFileSync(path.join(dist, 't/index.html'), tabletHtml);
  console.log(`[shell] tablet lane -> dist/t/index.html (${Buffer.byteLength(tabletHtml)} bytes, assets shared with dist/m)`);
} else {
  // build-mobile skips itself when no Flutter SDK is present; the tablet lane
  // has nothing to point at, and saying so beats emitting a page that 404s.
  console.warn('[shell] no dist/m — skipping the tablet lane');
}

// ── manifest ───────────────────────────────────────────────────────────────
// start_url is the router, not a lane: an install made on a phone and one made
// on a desktop are the same app, and each launch re-picks the right front-end
// for whatever it is launched on.
const manifest = {
  name: 'DraconDex',
  short_name: 'DraconDex',
  description: 'จัดการข้อมูลโลกในนิยาย — ตัวละคร สถานที่ ไทม์ไลน์ ความสัมพันธ์ และโน้ต',
  // Moves with the repo: the Pages origin changed from ldktc.github.io to
  // zydraxyl.github.io in the same migration, so no existing install could
  // have carried over anyway. Do not change it again without that excuse —
  // a new id makes every install a different app to the browser.
  id: '/DraconDex-PWA/',
  start_url: './',
  scope: './',
  display: 'standalone',
  display_override: ['window-controls-overlay', 'standalone'],
  orientation: 'any',
  background_color: '#050506',
  theme_color: '#050506',
  lang: 'th',
  dir: 'ltr',
  categories: ['productivity', 'books', 'utilities'],
  prefer_related_applications: false,
  icons: [
    { src: 'icons/Icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/Icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/Icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/Icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'เดสก์ท็อป', short_name: 'Desktop', url: './d/', icons: [{ src: 'icons/Icon-192.png', sizes: '192x192' }] },
    { name: 'แท็บเล็ต', short_name: 'Tablet', url: './t/', icons: [{ src: 'icons/Icon-192.png', sizes: '192x192' }] },
    { name: 'มือถือ', short_name: 'Mobile', url: './m/', icons: [{ src: 'icons/Icon-192.png', sizes: '192x192' }] },
  ],
};
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

// ── the router ─────────────────────────────────────────────────────────────
const router = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#050506">
<title>DraconDex</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.png">
<link rel="apple-touch-icon" href="icons/Icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="DraconDex">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#050506;color:#e7e7ea;
       font-family:"Noto Sans Thai","Segoe UI",system-ui,-apple-system,sans-serif;padding:24px}
  .wrap{width:100%;max-width:560px;text-align:center}
  .logo{width:96px;height:96px;object-fit:contain;margin-bottom:18px}
  h1{font-size:1.5rem;margin:0 0 6px;font-weight:650;letter-spacing:.02em}
  p{margin:0 0 28px;color:#9a9aa6;font-size:.94rem;line-height:1.6}
  .lanes{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
  a.lane{display:block;padding:18px 20px;border:1px solid #26262e;border-radius:14px;background:#0d0d12;
         color:inherit;text-decoration:none;text-align:left;transition:border-color .15s,background .15s}
  a.lane:hover,a.lane:focus-visible{border-color:#6366f1;background:#12121a;outline:none}
  .lane b{display:block;font-size:1rem;margin-bottom:4px}
  .lane span{color:#8b8b98;font-size:.82rem;line-height:1.5}
  .note{margin-top:26px;color:#6b6b78;font-size:.76rem}
  .note code{color:#8b8b98}
  #status{margin-bottom:22px;color:#8b8b98;font-size:.85rem;min-height:1.2em}
</style>
</head>
<body>
<div class="wrap">
  <img class="logo" src="src/assets/brand/DraconDex_WhiteOut.png" alt="DraconDex">
  <h1>DraconDex</h1>
  <p>เลือกเวอร์ชันที่เหมาะกับอุปกรณ์ของคุณ — ข้อมูลทั้งหมดเก็บอยู่ในเครื่องนี้เท่านั้น</p>
  <div id="status"></div>
  <div class="lanes">
    <a class="lane" href="d/" data-lane="d"><b>เดสก์ท็อป</b><span>หน้าจอใหญ่ คีย์บอร์ด เมาส์ — เวอร์ชันเดียวกับแอป Windows / macOS</span></a>
    <a class="lane" href="t/" data-lane="t"><b>แท็บเล็ต / iPad</b><span>จอกลาง ทัชสกรีน — เวอร์ชันเดียวกับแอปมือถือ แต่จัดหน้าแบบแท็บเล็ต</span></a>
    <a class="lane" href="m/" data-lane="m"><b>มือถือ</b><span>ทัชสกรีน — เวอร์ชันเดียวกับแอป iOS / Android</span></a>
  </div>
  <div class="note">DraconDex ${source.version} · เปิดหน้านี้ด้วย <code>?lane=choose</code> เพื่อเลือกใหม่ได้เสมอ · Created by LDKTC</div>
</div>
<script>
(function(){
  var KEY = 'ddx-lane';
  var params = new URLSearchParams(location.search);
  var asked = params.get('lane');

  // Touch-first and small — the same two questions the Flutter build itself is
  // designed around. UA sniffing only as a tiebreaker for iPadOS, which
  // reports itself as a desktop Safari but is a tablet by every other measure.
  function detect(){
    var ua = navigator.userAgent;
    // iPadOS reports itself as desktop Safari and is a tablet by every other
    // measure, so it needs the touch-points tiebreaker. It used to be detected
    // only to push it into 'm'; now it gets a lane of its own.
    var iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    var tabletUA = /iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/.test(ua) || iPadOS
      || (/Android/.test(ua) && !/Mobile/.test(ua));   // Android drops "Mobile" on tablets
    var phoneUA = /Android.*Mobile|iPhone|iPod|Windows Phone/.test(ua);
    var coarse = matchMedia('(pointer: coarse)').matches;
    // any-pointer, not pointer: a touchscreen laptop has a coarse PRIMARY
    // pointer while a mouse or trackpad is still attached, and it wants the
    // desktop lane. Asking "is a fine pointer available at all" separates it
    // from a tablet, which has none.
    var hasFine = matchMedia('(any-pointer: fine)').matches;
    var shortSide = Math.min(screen.width, screen.height);

    if (phoneUA) return 'm';
    if (tabletUA) return 't';
    // No useful UA: go by the questions the Flutter build is designed around —
    // is it touch-first, is there a real pointer, and how much room is there.
    if (coarse && !hasFine) return shortSide < 600 ? 'm' : 't';
    return shortSide < 600 ? 'm' : 'd';
  }

  function go(lane){
    try { localStorage.setItem(KEY, lane); } catch (e) {}
    location.replace(lane + '/');
  }

  document.querySelectorAll('a.lane').forEach(function(a){
    a.addEventListener('click', function(e){ e.preventDefault(); go(a.dataset.lane); });
  });

  if (asked === 'choose') return;
  if (asked === 'd' || asked === 't' || asked === 'm') { go(asked); return; }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var lane = (saved === 'd' || saved === 't' || saved === 'm') ? saved : detect();
  var laneName = { d: 'เวอร์ชันเดสก์ท็อป', t: 'เวอร์ชันแท็บเล็ต', m: 'เวอร์ชันมือถือ' }[lane];
  document.getElementById('status').textContent = 'กำลังเปิด' + laneName + '…';
  // A tick of daylight, so this page is visible (and its links usable) if a
  // lane ever fails to load.
  setTimeout(function(){ go(lane); }, 60);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dist, 'index.html'), router);

// ── service worker ─────────────────────────────────────────────────────────
// Precaches the shell and the desktop lane, which is a fixed, known file list
// this build just produced. The Flutter lane is deliberately left alone: it
// ships its own service worker with its own versioned manifest, and two
// workers caching the same files would only fight.
function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

const precache = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.png',
  ...walk(path.join(dist, 'icons')).map((f) => `icons/${f}`),
  ...walk(path.join(dist, 'src')).map((f) => `src/${f}`),
  ...walk(path.join(dist, 'd')).map((f) => `d/${f}`).filter((f) => !f.endsWith('.map')),
  // The tablet lane is one small HTML file; its assets live under m/, which
  // ships its own service worker and is deliberately not precached here.
  ...(fs.existsSync(path.join(dist, 't/index.html')) ? ['t/index.html'] : []),
];

const version = crypto.createHash('sha1')
  .update(precache.join('\n'))
  .update(String(fs.statSync(path.join(dist, 'd/ddx-bridge.js')).size))
  .update(source.commit || '')
  .digest('hex').slice(0, 12);

const sw = `// DraconDex PWA service worker — generated by tools/build-shell.mjs.
// Cache name carries a build hash, so a deploy retires the previous cache
// wholesale instead of leaving half-old assets behind.
const CACHE = 'dracondex-${version}';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Individually, not addAll: one 404 must not throw away the whole install.
    await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key.startsWith('dracondex-')) await caches.delete(key);
    await self.clients.claim();
  })());
});

const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The Flutter lane manages its own cache — see the note in build-shell.mjs.
  if (url.pathname.startsWith(scopePath + 'm/')) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // Refresh in the background so the next load is current without ever
      // making this one wait on the network.
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) (await caches.open(CACHE)).put(req, fresh.clone());
        } catch (_) {}
      })());
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh.ok && url.pathname.startsWith(scopePath)) (await caches.open(CACHE)).put(req, fresh.clone());
      return fresh;
    } catch (err) {
      // Offline and not cached: a navigation still gets the app it asked for.
      if (req.mode === 'navigate') {
        const laneIndex = url.pathname.startsWith(scopePath + 'd/') ? scopePath + 'd/index.html'
          : url.pathname.startsWith(scopePath + 't/') ? scopePath + 't/index.html'
          : scopePath;
        return (await caches.match(laneIndex)) ||
          new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
      throw err;
    }
  })());
});
`;
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

// GitHub Pages runs everything through Jekyll unless told not to; a leading
// underscore anywhere in the Flutter build would otherwise be dropped.
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({
  app: source.version, appCommit: source.commit, cache: version, builtAt: new Date().toISOString(),
}, null, 2) + '\n');

console.log(`[shell] router + manifest + sw (cache ${version}, ${precache.length} precached files)`);
