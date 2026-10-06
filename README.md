<p align="center">
  <img src="dist/src/assets/brand/DraconDex_Color.png" alt="DraconDex logo" width="150">
</p>

<h1 align="center">DraconDex-PWA</h1>

<p align="center">
  DraconDex as an installable web app — the desktop build for desktop browsers,
  the mobile build for phones and tablets, both from the same source.
</p>

<p align="center">
  <em>DraconDex บนเว็บ (ติดตั้งเป็นแอปได้) — เดสก์ท็อปได้เวอร์ชัน Electron
  มือถือได้เวอร์ชัน Flutter ข้อมูลทั้งหมดอยู่ในเครื่องผู้ใช้เอง</em>
</p>

<p align="center"><b><a href="https://zydraxyl.github.io/DraconDex-PWA/">zydraxyl.github.io/DraconDex-PWA</a></b></p>

---

## What this is

[DraconDex](https://github.com/ZYDRAXYL/DraconDex-EXE) is a world-building
manager for novelists — characters, places, timelines, relationships and
Obsidian-style markdown notes with `[[wikilinks]]`, all in a local SQLite
database. It ships as an Electron app for Windows/macOS and as a Flutter app
for Android/iOS.

This repository is its **third front door: the browser**. It holds no app
source of its own. It fetches DraconDex, builds both front-ends for the web,
and deploys them side by side to GitHub Pages, behind a router that sends each
device to the build made for it:

| Lane | Path | What it is | For |
|---|---|---|---|
| Desktop | `/d/` | the **Electron** front-end, running in the page | desktop and laptop browsers |
| Tablet | `/t/` | the same Flutter build, tablet layout profile | tablets and iPads |
| Mobile | `/m/` | the **Flutter** front-end's web target | phones |

> `/t/` is not a third build. It is one ~2 KB HTML file whose `<base href>`
> points at `/m/`, so the whole 50 MB Flutter bundle is served from one copy —
> verified in a real browser: loading `/t/` fetches **zero** resources from
> `/t/` itself.

Both are the real app, not a demo or a cut-down viewer: the desktop lane runs
DraconDex's own renderer, its own `preload.js` contract and its whole
`src/db/**` data layer, unmodified. The mobile lane is the same `lib/` that
ships on Android and iOS.

> ทำไมต้องสองเวอร์ชัน — Electron กับ Flutter ออกแบบ UI คนละแบบ
> (จอใหญ่+เมาส์ กับ ทัชสกรีน) การยัดอันเดียวให้ทำได้ทั้งคู่คือการทำให้ทั้งคู่แย่ลง
> เว็บนี้จึง deploy ทั้งสองแล้วให้ตัว router ที่หน้าแรกเลือกให้ตามอุปกรณ์

## Your data stays on your device

There is no account, no server and no sync. Every lane stores its database in
the browser's own storage, on the machine it is running on:

- **Desktop lane** — the app's `.ddx` vault files live in a virtual filesystem
  backed by IndexedDB (see [`docs/BROWSER-BUILD.md`](docs/BROWSER-BUILD.md)).
- **Mobile lane** — `sqflite_common_ffi_web`'s IndexedDB store, exactly as the
  Flutter build already documents.

Two consequences worth knowing before you rely on it:

1. **Data belongs to the browser and the origin.** A different browser, a
   different device, or clearing site data means a different (or empty)
   library. Private/incognito windows forget everything on close.
2. **The two lanes do not share a database.** They are separate stores in
   separate formats. Moving a world between them — or to and from the desktop
   app — is an explicit export/import of a `.ddx` file, which is supported in
   both directions because all three builds use the same SQLite schema
   (`src/schema/vault.sql` upstream).

> ข้อมูลผูกกับเบราว์เซอร์และโดเมนนี้เท่านั้น ล้าง site data = ข้อมูลหาย
> และเลนเดสก์ท็อปกับเลนมือถือเก็บคนละที่ ย้ายข้อมูลกันด้วยการ export/import
> ไฟล์ `.ddx` (ใช้ schema เดียวกันทั้งสามแพลตฟอร์ม)

**Back your work up.** Export DB in the desktop lane writes a real `.ddx` file
that the Windows/macOS app opens directly.

## Installing it

Open the site and use the browser's install action — "Install app" in
Chrome/Edge, "Add to Home Screen" in Safari. It installs as one app whichever
lane you were on: the launcher opens the router, which picks the right lane for
whatever device it was launched on. Both lanes work offline after the first
load.

## What the browser cannot do

Everything that is genuinely about the desktop OS is unavailable here, and says
so rather than failing quietly:

- **Google Drive backup and Google sign-in** in the desktop lane — the desktop
  flow needs a loopback HTTP server, which a page cannot run.
- **Plugins** — they are separate windows/processes with filesystem access.
- **Reveal in folder / open with the OS**, and imported files staying linked to
  their original path on disk (an imported file is copied into the browser's
  storage instead).
- **The update notice** — a page has no installer to replace; the service
  worker fetches the new build on the next load.
- **Multiple windows** — "open in a new window" opens a browser tab.

Cloud Sync is off across the whole project upstream, so it is not a web
limitation. See [`docs/BROWSER-BUILD.md`](docs/BROWSER-BUILD.md) for the
mechanics behind each of these.

## Building it

```bash
npm install

# Pull DraconDex (private repo — needs access), then build both lanes.
npm run build

# Or build from a checkout you already have beside this one:
npm run build -- --local ../DraconDex-EXE

# Drive the built site in a real browser and check it works.
npm run verify

# Serve dist/ the way GitHub Pages does, at /DraconDex-PWA/.
npm run serve
```

Requirements: **Node 22+** for the desktop lane, and the **Flutter SDK**
(3.44.4, matching DraconDex-EXE's own web workflow) for the mobile lane. Without
Flutter the mobile lane is skipped with a warning and everything else still
builds.

`npm run verify` is the check that matters: it opens the built site, walks the
first-run wizard, creates a Nexus and a module, exports the vault, reloads the
page and confirms the data is still there — which it can only be if sqlite and
the storage layer really ran.

## What is in this repository

```
dist/            THE DEPLOYED SITE — committed on purpose (see below)
  index.html       the router: picks a lane, remembers the choice
  d/               desktop lane (DraconDex's renderer + the bridge bundle)
  m/               mobile lane (Flutter web build)
  src/assets/      brand images, shared by both lanes at the path they expect
  sw.js            service worker (precaches the shell and the desktop lane)
shim/            the browser stand-ins for what Electron's main process gave the app
  entry.js         the bridge: window.api -> main.js's IPC handlers, in-page
  electron.js      app/BrowserWindow/ipcMain/dialog/Menu/shell
  fs.js, vfs.js    a filesystem, backed by IndexedDB
  sqlite.js        node-sqlite3-wasm's API, on sql.js
  dialogs.js       save/open dialogs as downloads and file pickers
  buffer.js, path.js, os.js, crypto.js, http.js, async_hooks.js, globals.js
tools/           fetch-app, build-desktop, build-mobile, build-shell, build, verify, serve
docs/            BROWSER-BUILD.md — how the desktop lane actually works
app-source.json  which DraconDex-EXE commit dist/ was built from
```

**`dist/` is committed.** The deployed site is the artefact this repository
exists to produce, and committing it keeps the app's own source out of a public
repository while still letting Pages deploy without reaching into a private one.
`.app-src/` (the fetched DraconDex source) is never committed.

To catch the site up after DraconDex changes, either rebuild locally and commit
`dist/`, or run the **Rebuild from DraconDex-EXE** workflow, which does the same
thing in CI and opens a PR (it needs an `APP_SOURCE_TOKEN` secret that can read
the private repo).

## Credit and licence

The application is [DraconDex](https://github.com/ZYDRAXYL/DraconDex-EXE) by
ZYDRAXYL, created by LDKTC, MIT-licensed — see [LICENSE](LICENSE); this repository is the build and hosting layer around it.
