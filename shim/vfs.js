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
//
// ── How a file is stored (Procress 19 part 5, F7) ──────────────────────────
// sqlite writes straight into these arrays, page by page, through the VFS in
// shim/sqlite.js (writeAt/truncate below). So the disk always holds the live
// database, and what has to reach IndexedDB after a keystroke is the handful
// of pages that keystroke changed — not the whole vault. To make that
// possible IndexedDB holds a file larger than CHUNK as a header plus fixed
// 64 KB chunks:
//
//   key  '/ddx/…/vaults/x.ddx'        { chunks: n, size, mtime }
//   key  ['/ddx/…/vaults/x.ddx', i]   { bytes }      i = 0 … n-1
//
// and a file of CHUNK or less as one record, { bytes, mtime } — which is
// exactly the record every file had before this, so data written by an older
// build reads back unchanged, and is rewritten in chunks the first time it is
// flushed (once; `stored` remembers which shape IndexedDB holds).
//
// Header and record share a key on purpose: an old tab still open across a
// deploy writes the whole-file record over the header, and whichever wrote
// last wins atomically, rather than the two shapes getting mixed.
//
// Measured on a 50 MB vault: one write used to cost a 37 ms sqlite export
// plus a 161 ms IndexedDB transaction carrying 50 MB; it now flushes two
// chunks (128 KB).
import { dirname, normalize, join } from './path.js';

const IDB_NAME = 'dracondex-pwa';
const IDB_STORE = 'files';
const IDB_VERSION = 1;
export const CHUNK = 64 * 1024;

const files = new Map(); // path -> Uint8Array
const dirs = new Set(['/']);
const dirty = new Set();       // paths to rewrite whole (replaced by vfs.write)
const dirtyChunks = new Map(); // path -> Set<chunk index> written in place since the last flush
const removed = new Set();
const stored = new Map();      // path -> 'whole' | 'chunked': the shape IndexedDB holds right now
const orphans = new Map();     // path -> first chunk index IndexedDB holds but no header claims
// ArrayBuffers this module allocated (or read fresh out of IndexedDB) and
// nobody else references — the only ones it is safe to write into in place.
// An array handed in through write() may still be held by its caller.
const owned = new WeakSet();

let idb = null;
let flushing = null;
let flushGuard = null;
let failures = 0;
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

const toBytes = (value) => (value instanceof ArrayBuffer ? new Uint8Array(value)
  : value?.bytes ? new Uint8Array(value.bytes)
  : new Uint8Array(0));

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
  const headers = new Map(); // path -> { chunks, size }
  const parts = new Map();   // path -> Map<index, Uint8Array>
  for (const [key, value] of rows) {
    if (Array.isArray(key)) {
      const [path, i] = key;
      if (!parts.has(path)) parts.set(path, new Map());
      parts.get(path).set(i, toBytes(value));
      continue;
    }
    if (value && value.dir) { addDirs(key); continue; }
    if (value && typeof value.chunks === 'number') { headers.set(key, value); continue; }
    const bytes = toBytes(value);
    owned.add(bytes.buffer);
    files.set(key, bytes);
    stored.set(key, 'whole');
    addDirs(dirname(key));
  }
  for (const [path, head] of headers) {
    const bytes = new Uint8Array(head.size);
    const mine = parts.get(path) || new Map();
    let missing = 0;
    for (let i = 0; i < head.chunks; i++) {
      const part = mine.get(i);
      if (!part) { missing++; continue; }
      bytes.set(part.subarray(0, Math.min(part.length, head.size - i * CHUNK)), i * CHUNK);
    }
    // Cannot happen short of a broken IndexedDB — header and chunks are only
    // ever written in the same transaction — but say so rather than hand
    // sqlite a silently zero-filled page.
    if (missing) console.error(`[vfs] ${path}: ${missing} of ${head.chunks} chunks missing`);
    owned.add(bytes.buffer);
    files.set(path, bytes);
    stored.set(path, 'chunked');
    addDirs(dirname(path));
  }
  // Chunks no header claims: left behind when an older build replaced a
  // chunked file with a whole record, or past the end of a file that shrank.
  for (const [path, mine] of parts) {
    const head = headers.get(path);
    const from = head ? head.chunks : 0;
    if ([...mine.keys()].some((i) => i >= from)) orphans.set(path, from);
  }
  if (orphans.size) scheduleFlush();
  return true;
}

// ── Coalescing ─────────────────────────────────────────────────────────────
// A flush is cheap now (only changed chunks), but it is still an IndexedDB
// transaction, and while someone types every keystroke is a write. So: wait
// until writes have been quiet for QUIET_MS (the user stopped typing), then
// run at the browser's next idle moment — but never leave a change unflushed
// for more than MAX_DELAY_MS after the first one. That bound is the most a
// crash or a killed tab can lose; a tab that is merely closed, hidden or
// reloaded is flushed at once (pagehide/visibilitychange below, and the
// bridge's beforeunload, which also holds the page while a flush is in
// flight).
const QUIET_MS = 400;
const MAX_DELAY_MS = 2000;
let firstAt = 0;
let lastAt = 0;
let timer = null;
let idleId = null;

function scheduleFlush(delay) {
  if (!idb) return;
  const now = Date.now();
  lastAt = now;
  if (!firstAt) firstAt = now;
  if (!timer && idleId == null) timer = setTimeout(onQuietCheck, delay ?? QUIET_MS);
}

function onQuietCheck() {
  timer = null;
  const now = Date.now();
  const waited = now - firstAt;
  const quietFor = now - lastAt;
  if (quietFor < QUIET_MS && waited < MAX_DELAY_MS) {
    timer = setTimeout(onQuietCheck, Math.min(QUIET_MS - quietFor, MAX_DELAY_MS - waited));
    return;
  }
  const run = () => { idleId = null; flushNow(); };
  if (typeof requestIdleCallback === 'function') {
    // The timeout keeps a page that is never idle (an animation, a long
    // render) from postponing the flush past the cap.
    idleId = requestIdleCallback(run, { timeout: Math.max(50, MAX_DELAY_MS - waited) });
  } else run();
}

function cancelSchedule() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (idleId != null) { cancelIdleCallback(idleId); idleId = null; }
  firstAt = 0;
}

const hasWork = () => dirty.size || dirtyChunks.size || removed.size || orphans.size;

export function flushNow() {
  if (!idb || !hasWork()) { cancelSchedule(); return Promise.resolve(); }
  if (flushing) return flushing.then(() => flushNow());
  // sqlite writes pages into these arrays as it goes, so in the middle of a
  // transaction they hold a half-written database. conn.js's transactions are
  // synchronous — no timer or event can land inside one — but an explicit
  // BEGIN left open across an await would be the one way to capture that
  // state, so shim/sqlite.js answers whether every connection is between
  // transactions, and if not this waits for the next quiet moment.
  if (flushGuard && !flushGuard()) { cancelSchedule(); scheduleFlush(); return Promise.resolve(); }
  cancelSchedule();

  const whole = [...dirty];
  const partial = [...dirtyChunks].filter(([p]) => !dirty.has(p));
  const deletes = [...removed];
  const strays = [...orphans];
  dirty.clear();
  dirtyChunks.clear();
  removed.clear();
  orphans.clear();
  const touched = [...whole, ...partial.map(([p]) => p)];

  // Undo for a failed transaction: everything it carried is rewritten in full
  // next time, because IndexedDB may hold any mix of old and new for it.
  const requeue = () => {
    for (const p of touched) { if (files.has(p)) dirty.add(p); stored.delete(p); }
    for (const p of deletes) if (!files.has(p)) removed.add(p);
    for (const [p, from] of strays) orphans.set(p, from);
  };

  flushing = new Promise((resolve) => {
    let tx;
    try {
      tx = idb.transaction(IDB_STORE, 'readwrite');
    } catch (err) {
      console.warn('[vfs] flush failed:', err?.message || err);
      requeue();
      return resolve(false);
    }
    const store = tx.objectStore(IDB_STORE);
    const mtime = Date.now();
    const chunksFrom = (path, n) => IDBKeyRange.bound([path, n], [path, Infinity]);
    // Copies, every one: the live arrays are written again by sqlite before
    // the transaction commits, and structured clone would then capture a
    // half-written image.
    const putFile = (path, bytes, only) => {
      const size = bytes.length;
      if (size <= CHUNK) {
        store.put({ bytes: bytes.slice().buffer, mtime }, path);
        if (stored.get(path) !== 'whole') store.delete(chunksFrom(path, 0));
        stored.set(path, 'whole');
        return;
      }
      const n = Math.ceil(size / CHUNK);
      const put = (i) => store.put({ bytes: bytes.slice(i * CHUNK, Math.min(size, (i + 1) * CHUNK)).buffer }, [path, i]);
      if (only && stored.get(path) === 'chunked') { for (const i of only) if (i < n) put(i); }
      else for (let i = 0; i < n; i++) put(i);
      store.put({ chunks: n, size, mtime }, path);
      store.delete(chunksFrom(path, n));
      stored.set(path, 'chunked');
    };
    for (const path of whole) { const b = files.get(path); if (b) putFile(path, b, null); }
    for (const [path, set] of partial) { const b = files.get(path); if (b) putFile(path, b, set); }
    for (const path of deletes) {
      store.delete(path);
      store.delete(chunksFrom(path, 0));
      stored.delete(path);
    }
    for (const [path, from] of strays) store.delete(chunksFrom(path, from));
    for (const d of dirs) store.put({ dir: true }, d);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => { console.warn('[vfs] flush error:', tx.error); };
    tx.onabort = () => { console.warn('[vfs] flush aborted:', tx.error?.message || tx.error); requeue(); resolve(false); };
  }).then((ok) => {
    flushing = null;
    if (ok) failures = 0;
    else {
      // A quota error, typically. Keep the data (it is still in memory and
      // still marked for writing) and retry with a growing gap rather than
      // spinning on a transaction that will fail the same way.
      failures++;
      scheduleFlush(Math.min(30000, 1000 * 2 ** failures));
    }
    for (const fn of listeners) fn();
  });
  return flushing;
}

function markRange(path, start, end) {
  if (dirty.has(path)) return; // going whole anyway
  let set = dirtyChunks.get(path);
  if (!set) dirtyChunks.set(path, (set = new Set()));
  for (let c = Math.floor(start / CHUNK), last = Math.floor((end - 1) / CHUNK); c <= last; c++) set.add(c);
}

// The array at `path`, `size` bytes long, over a buffer this module may write
// into. Grows in whole chunks with half again as headroom: a bulk import
// appends page after page, and reallocating (= copying the vault) on every one
// would be quadratic.
function writable(path, size) {
  const cur = files.get(path);
  const oldLen = cur ? cur.length : 0;
  if (cur && cur.byteOffset === 0 && owned.has(cur.buffer) && cur.buffer.byteLength >= size) {
    if (size === oldLen) return cur;
    const view = new Uint8Array(cur.buffer, 0, size);
    // Capacity past the old end can still hold bytes from before a truncate.
    if (size > oldLen) view.fill(0, oldLen, size);
    files.set(path, view);
    return view;
  }
  const buffer = new ArrayBuffer(Math.ceil(Math.max(size * 1.5, CHUNK) / CHUNK) * CHUNK);
  owned.add(buffer);
  const view = new Uint8Array(buffer, 0, size);
  if (cur) view.set(cur.subarray(0, Math.min(oldLen, size)));
  files.set(path, view);
  addDirs(dirname(path));
  return view;
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
    dirtyChunks.delete(path);
    removed.delete(path);
    scheduleFlush();
  },
  // In-place writes, for sqlite's VFS: only the chunks a write touches are
  // flushed. `path` must already be normalised (the VFS does it once per open
  // file, not once per page).
  writeAt(path, src, offset) {
    const oldLen = files.get(path)?.length ?? 0;
    const end = offset + src.length;
    writable(path, Math.max(oldLen, end)).set(src, offset);
    removed.delete(path);
    // A write past the old end zero-filled the gap: that is new content too.
    markRange(path, Math.min(offset, oldLen), end);
    scheduleFlush();
  },
  truncate(path, size) {
    const cur = files.get(path);
    const oldLen = cur ? cur.length : 0;
    if (cur && size === oldLen) return;
    if (cur && size < oldLen) files.set(path, cur.subarray(0, size));
    else writable(path, size);
    removed.delete(path);
    markRange(path, Math.min(oldLen, size), Math.max(oldLen, size));
    scheduleFlush();
  },
  mkdir(p) { addDirs(norm(p)); scheduleFlush(); },
  remove(p, recursive) {
    const path = norm(p);
    const drop = (f) => { files.delete(f); dirty.delete(f); dirtyChunks.delete(f); removed.add(f); };
    if (files.has(path)) drop(path);
    if (dirs.has(path)) {
      if (recursive) {
        const prefix = path.endsWith('/') ? path : path + '/';
        for (const f of [...files.keys()]) if (f.startsWith(prefix)) drop(f);
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
  pending: () => !!(hasWork() || flushing),
  onFlush(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // shim/sqlite.js: () => true when no connection is inside a transaction.
  setFlushGuard(fn) { flushGuard = fn; },
  // test/storage.test.mjs only: drop everything held in memory, as a reload
  // would, so the next hydrate() reads purely from IndexedDB.
  _forget() {
    cancelSchedule();
    for (const set of [files, dirty, dirtyChunks, removed, stored, orphans]) set.clear();
    dirs.clear();
    dirs.add('/');
    try { idb?.close(); } catch (_) {}
    idb = null;
  },
};

// Best effort against a closed tab: both events fire before teardown, and an
// IndexedDB transaction opened here is allowed to finish.
if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => flushNow());
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
}

export default vfs;
