'use strict';
// The virtual disk the whole data layer runs on.
//
// DraconDex's src/db/** is written against a real filesystem: app.ddx plus one
// <name>-<id>.ddx per Nexus under vaults/, moved with renameSync, copied with
// copyFileSync, probed with existsSync (see docs/VAULTS.md upstream). None of
// that survives a port to fetch()/localStorage, so instead of rewriting the
// data layer for the browser this build gives it a filesystem: an in-memory
// tree of Uint8Arrays, mirrored into IndexedDB so it is still there on the next
// visit. Same failure modes as any browser storage — it is per-origin, and
// clearing site data clears it — which is exactly what the Flutter web build
// documents for its own IndexedDB store.
import { dirname, normalize, join } from './path.js';

const IDB_NAME = 'dracondex-pwa';
const IDB_STORE = 'files';
const IDB_VERSION = 1;

const files = new Map(); // path -> Uint8Array
const dirs = new Set(['/']);
const dirty = new Set();  // paths whose bytes changed since the last flush
const removed = new Set();

let idb = null;
let flushTimer = null;
let flushing = null;
const listeners = new Set();

const norm = (p) => normalize(String(p));

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Every directory on the way down, so existsSync('/ddx/vaults') is true after a
// single mkdirSync('/ddx/vaults/x', {recursive:true}).
function addDirs(path) {
  let p = norm(path);
  while (p && p !== '/' && !dirs.has(p)) {
    dirs.add(p);
    p = dirname(p);
  }
}

export async function hydrate() {
  try {
    idb = await openIdb();
  } catch (err) {
    // Private windows and "block site data" settings both land here. The app
    // still runs — it just forgets everything when the tab closes, which is
    // better than refusing to boot.
    console.warn('[vfs] IndexedDB unavailable, running in memory only:', err?.message || err);
    return false;
  }
  const rows = await new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const out = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return resolve(out);
      out.push([cursor.key, cursor.value]);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  for (const [path, value] of rows) {
    if (value && value.dir) { addDirs(path); continue; }
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
      : value?.bytes ? new Uint8Array(value.bytes)
      : new Uint8Array(0);
    files.set(path, bytes);
    addDirs(dirname(path));
  }
  return true;
}

// Writes are batched: sqlite hands us a whole database image on every flush, so
// a per-statement write-through would re-serialise the entire vault for each
// keystroke in the editor. 400ms of quiet (or an explicit flushNow) is the
// trade, and pagehide/visibilitychange below close the window on losing work.
function scheduleFlush() {
  if (!idb) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; flushNow(); }, 400);
}

export function flushNow() {
  if (!idb || (!dirty.size && !removed.size)) return Promise.resolve();
  if (flushing) return flushing.then(() => flushNow());
  const writes = [...dirty];
  const deletes = [...removed];
  dirty.clear();
  removed.clear();
  flushing = new Promise((resolve) => {
    let tx;
    try {
      tx = idb.transaction(IDB_STORE, 'readwrite');
    } catch (err) {
      console.warn('[vfs] flush failed:', err?.message || err);
      return resolve();
    }
    const store = tx.objectStore(IDB_STORE);
    for (const path of writes) {
      const bytes = files.get(path);
      if (!bytes) continue;
      // A copy: the live Uint8Array can be mutated again before the
      // transaction commits, and structured clone would then capture a
      // half-written image.
      store.put({ bytes: bytes.slice().buffer, mtime: Date.now() }, path);
    }
    for (const path of deletes) store.delete(path);
    for (const d of dirs) store.put({ dir: true }, d);
    tx.oncomplete = () => resolve();
    tx.onerror = () => { console.warn('[vfs] flush error:', tx.error); resolve(); };
    tx.onabort = () => resolve();
  }).then(() => { flushing = null; for (const fn of listeners) fn(); });
  return flushing;
}

export const vfs = {
  files,
  dirs,
  exists: (p) => files.has(norm(p)) || dirs.has(norm(p)),
  isDir: (p) => dirs.has(norm(p)),
  isFile: (p) => files.has(norm(p)),
  read: (p) => files.get(norm(p)),
  write(p, bytes) {
    const path = norm(p);
    files.set(path, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    addDirs(dirname(path));
    dirty.add(path);
    removed.delete(path);
    scheduleFlush();
  },
  mkdir(p) { addDirs(norm(p)); scheduleFlush(); },
  remove(p, recursive) {
    const path = norm(p);
    if (files.delete(path)) { dirty.delete(path); removed.add(path); }
    if (dirs.has(path)) {
      if (recursive) {
        const prefix = path.endsWith('/') ? path : path + '/';
        for (const f of [...files.keys()]) if (f.startsWith(prefix)) { files.delete(f); dirty.delete(f); removed.add(f); }
        for (const d of [...dirs]) if (d === path || d.startsWith(prefix)) dirs.delete(d);
      } else dirs.delete(path);
    }
    scheduleFlush();
  },
  list(p) {
    const path = norm(p).replace(/\/+$/, '') || '/';
    const prefix = path === '/' ? '/' : path + '/';
    const names = new Set();
    for (const f of files.keys()) if (f.startsWith(prefix)) names.add(f.slice(prefix.length).split('/')[0]);
    for (const d of dirs) if (d !== path && d.startsWith(prefix)) names.add(d.slice(prefix.length).split('/')[0]);
    return [...names];
  },
  join,
  flushNow,
  // true while bytes are still on their way to IndexedDB
  pending: () => !!(dirty.size || removed.size || flushing),
  onFlush(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// Best effort against a closed tab: both events fire before teardown, and an
// IndexedDB transaction opened here is allowed to finish.
if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => flushNow());
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
}

export default vfs;
