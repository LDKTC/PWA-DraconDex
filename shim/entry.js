'use strict';
// The desktop lane's bridge: everything that, on the desktop, is the Electron
// main process — running inside the page instead.
//
//   renderer (unchanged)  ->  window.api (the real preload.js)
//                          ->  __ddxInvoke
//                          ->  the real main.js IPC handlers
//                          ->  the real src/db/** on sqlite-wasm + a virtual disk
//
// Nothing of DraconDex's own code is edited on the way in. The renderer, the
// preload contract and the whole data layer are the files from
// DraconDex-EXE; only the four things a browser genuinely cannot provide are
// swapped out underneath them (Electron's shell, the filesystem, sqlite's
// bindings, and window management).
import vfs, { hydrate, flushNow } from './vfs.js';
// window.api, built by the app's own preload.js against the contextBridge and
// ipcRenderer stubs in shim/electron.js. It only captures __ddxInvoke lazily,
// at call time, so it is safe for this to be evaluated before the bridge below
// exists — and it means window.api is defined before the first renderer script
// parses, which is the ordering the app assumes.
import '../.app-src/electron/preload.js';
// The app reads its template catalogs from its own folder (db/bundle-catalog.js,
// db/page-template.js). They ship inside this bundle and are laid on the
// virtual disk at boot, below — app files, not user data, so never persisted.
import bundlesJson from '../.app-src/electron/templates/bundles.json';
import pagesJson from '../.app-src/electron/templates/pages.json';
import { __setQuota } from './fs.js';
import { ipcHandlers, dialog } from './electron.js';
import { initSqlite, persistAll } from './sqlite.js';
import { installDialogs, drainDownloads } from './dialogs.js';

// A bare URL is not a state the app has: on the desktop, main.js decides
// between the Welcome window and a vault window and passes the answer as a
// query string. The page has to make that same choice for itself, before any
// renderer script reads location.search.
const params = new URLSearchParams(location.search);
if (!params.has('welcome') && !params.has('nexus')) {
  params.set('welcome', '1');
  history.replaceState(null, '', `${location.pathname}?${params}`);
}
const bootNexusId = Number(new URLSearchParams(location.search).get('nexus')) || null;

const withParams = (next) => {
  const url = new URL(location.href);
  url.search = new URLSearchParams(next).toString();
  return url.toString();
};

// Window management, which in a browser is navigation. These channels are
// registered by main.js like any other, so they are intercepted by channel
// name rather than by patching main.js.
const OVERRIDES = {
  'window:minimize': () => {},
  'window:toggleMaximize': async () => {
    // The closest real equivalent, and it needs the click's user gesture,
    // which is still live by the time this runs.
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return false; }
      await document.documentElement.requestFullscreen();
      return true;
    } catch (_) { return false; }
  },
  'window:close': async () => { await persistAll(); window.close(); },
  'window:getId': () => 1,
  // "Open in browser" after a folder export — there is no folder here (see htmlExport:write below)
  'htmlExport:open': () => 'unsupported',
  'window:openNexus': async (nexusId) => { await persistAll(); window.open(withParams({ nexus: nexusId }), '_blank'); },
  'window:openNexusReplace': async (nexusId) => { await persistAll(); location.href = withParams({ nexus: nexusId }); },
  'window:openWelcome': async () => { await persistAll(); location.href = withParams({ welcome: '1' }); },
  'window:openBuilderTab': async (nexusId, tabKey) => {
    await persistAll();
    window.open(withParams({ nexus: nexusId, tab: tabKey, popup: '1' }), '_blank');
  },
  // Relaying a tab back needs a second live window to send to; there is no
  // cross-tab IPC here, and the renderer already handles "no main window".
  'window:moveTabToMain': () => false,

  // The desktop build checks GitHub for a newer installer to download. A page
  // has no installer to replace — the service worker already fetches the new
  // build on the next load — so this answers "you are current" rather than
  // reaching for a release feed that is about Windows binaries.
  'update:check': () => ({ ok: true, available: false, current: globalThis.__DDX_VERSION__ || '' }),

  // Packages come from DraconDex-PKG's GitHub release downloads, which send no
  // CORS header (and the page's CSP does not name github.com), so a page can
  // never read them. Answer the way the desktop does when offline: the
  // Setting window shows its quiet "catalog unavailable" line instead of the
  // console filling with refused connections on every open.
  'pkg:catalog': () => ({ ok: false, code: 'network', error: 'packages are not available in the browser build' }),
  'pkg:install': () => ({ ok: false, code: 'network', error: 'packages are not available in the browser build' }),
};

let markReady;
const ready = new Promise((resolve) => { markReady = resolve; });
let bootError = null;

// Every call the renderer makes lands here. Calls made while the data layer is
// still booting (the renderer starts querying inside its first frame) simply
// wait for it — window.api itself exists from the first line of the page.
globalThis.__ddxInvoke = async (channel, args) => {
  await ready;
  if (bootError) throw bootError;
  const override = OVERRIDES[channel];
  if (override) return override(...args);
  // A website export "to a folder" would need a folder to write INTO; a page
  // can only offer one to read. The .zip is the same site (DraconDex 16 part 6).
  if (channel === 'htmlExport:write' && args[1]?.target === 'folder') args = [args[0], { ...args[1], target: 'zip' }];
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`no IPC handler for ${channel}`);
  try {
    const result = await handler({ sender: null }, ...args);
    return sanitize(result);
  } finally {
    // A handler that wrote to a save-dialog path has produced a file the user
    // asked for; hand it over while their click is still recent enough for the
    // browser to allow the download.
    drainDownloads();
  }
};

// Structured clone can't carry a BigInt rowid (node-sqlite3-wasm's own type)
// and the renderer only ever reads plain JSON out of these, so normalise once
// here — the same thing the Electron IPC boundary does implicitly.
function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'object') return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
  return out;
}

// No per-call persist timer any more: sqlite writes its pages straight onto
// the virtual disk, and shim/vfs.js schedules its own flush from those writes
// (quiet for 400 ms, then idle, never later than 2 s). A timer here, 300 ms
// after every IPC, used to export the whole vault on every call — the cost
// F7 measured.

async function boot() {
  await hydrate();
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) __setQuota({ total: est.quota, used: est.usage || 0 });
  } catch (_) { /* keep the default estimate in shim/fs.js */ }

  // vendor/ sits next to the page that loads this bundle (sqlite3.wasm).
  await initSqlite((file) => new URL(`vendor/${file}`, document.baseURI).href);
  installDialogs(dialog);

  // Registers every IPC handler. Imported here rather than at the top of the
  // file so that it runs AFTER the virtual disk and sqlite are ready — its
  // module body touches both.
  const enc = new TextEncoder();
  vfs.files.set('/templates/bundles.json', enc.encode(JSON.stringify(bundlesJson)));
  vfs.files.set('/templates/pages.json', enc.encode(JSON.stringify(pagesJson)));
  await import('../.app-src/electron/main.js');

  if (bootNexusId) {
    // The window -> vault mapping main.js's createWindow() would have made.
    // Without it every vault-scoped handler throws "no active vault"
    // (src/db/vault-context.js fails closed on purpose).
    const { windowNexus } = await import('../.app-src/electron/src/db/vault-context.js');
    windowNexus.set(1, bootNexusId);
  }
}

boot().then(markReady, (err) => {
  console.error('[dracondex] data layer failed to start:', err);
  bootError = err;
  markReady();
});

// pagehide alone loses a write made just before a reload: the IndexedDB
// transaction it starts is not waited for (measured — an import 0.6s before a
// reload was gone). So flush as soon as the tab is hidden, and while a write is
// still in flight, have the browser ask before the page goes. persistAll() is
// shim/vfs.js's flushNow(): it skips the quiet/idle wait the scheduled flush
// takes, which is what makes the 2 s coalescing window safe to have.
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistAll(); });
addEventListener('pagehide', () => { persistAll(); flushNow(); });
addEventListener('beforeunload', (e) => {
  persistAll();
  if (vfs.pending()) { e.preventDefault(); e.returnValue = ''; }
});

globalThis.__ddx = { vfs, persistAll, ipcHandlers, ready };
