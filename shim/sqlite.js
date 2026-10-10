'use strict';
// node-sqlite3-wasm's Database, reimplemented on SQLite's own WebAssembly
// build (@sqlite.org/sqlite-wasm), writing through a VFS onto shim/vfs.js.
//
// src/db/conn.js opens every .ddx file through `new Database(filePath)` and
// then adapts it (statement cache, transaction/readTx helpers). This module
// gives that code the same surface — prepare()/exec()/close() and statements
// with all/get/run/finalize/_reset — so the data layer runs unmodified.
//
// ── Why not sql.js any more (Procress 19 part 5, F7) ───────────────────────
// sql.js keeps the database in emscripten's in-memory filesystem and offers
// one way to get it out: export(), which serialises the WHOLE vault and does
// it by closing and reopening the database. Every coalesced write therefore
// cost a full copy (37 ms at 50 MB) plus an IndexedDB transaction carrying
// all of it (161 ms), threw away every prepared statement conn.js had cached,
// and — undocumented until it was looked for — reset every PRAGMA to its
// default, so `foreign_keys = ON` (and with it every ON DELETE CASCADE)
// silently stopped holding after the first save of a session.
//
// The official build exposes sqlite's VFS interface to JavaScript, so here
// sqlite reads and writes pages directly in shim/vfs.js's arrays, synchronously,
// on the main thread — the same thread conn.js's synchronous API demands.
// shim/vfs.js records which 64 KB chunks a write touched and flushes only
// those. Nothing is ever exported, closed or reopened.
//
// What was considered instead, and why not:
//   - the official OPFS "SAH pool" VFS: writes changed pages too, but
//     FileSystemSyncAccessHandle exists only in dedicated workers, and this
//     data layer is synchronous and runs in the page. Using it means moving
//     main.js and all of src/db into a worker behind an async bridge — a
//     rebuild of shim/entry.js, dialogs and downloads, not a storage swap.
//   - keeping sql.js and tracking dirty pages: its release build does not
//     expose its filesystem (closure-minified, no FS export), so there is
//     nothing to hook short of shipping a custom sql.js build.
//
// Files sqlite opens that are not main databases — rollback journals, temp
// files — live in a private in-memory map and never reach IndexedDB. A flush
// only ever happens between transactions (see the guard in shim/vfs.js), when
// no journal exists, so a journal has nothing to protect across a reload; and
// one persisted by accident would be read as hot on the next open and rolled
// back over good data.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import vfs from './vfs.js';
import { normalize } from './path.js';

const VFS_NAME = 'ddx';
let sqlite3 = null;
const openDatabases = new Set();

export async function initSqlite(locateFile) {
  if (sqlite3) return sqlite3;
  // Read once, at bootstrap. The library reports a failed sqlite3_step() on
  // the console before throwing it; here the error is thrown to the app,
  // which handles it (scribe.js retries on UNIQUE, for one), and a console
  // line on top reads as a crash — verify.mjs counts console errors.
  const quiet = (...args) => { if (!/^sqlite3_step\(\) rc=/.test(String(args[0]))) console.warn('[sqlite]', ...args); };
  globalThis.sqlite3ApiConfig = { warn: quiet, error: quiet, log: () => {}, debug: () => {} };
  sqlite3 = await sqlite3InitModule({
    ...(locateFile ? { locateFile } : {}),
    print: () => {},
    printErr: quiet,
  });
  installVfs(sqlite3);
  vfs.setFlushGuard(() => {
    for (const db of openDatabases) if (!sqlite3.capi.sqlite3_get_autocommit(db._db.pointer)) return false;
    return true;
  });
  return sqlite3;
}

// ── the VFS ────────────────────────────────────────────────────────────────
function installVfs({ capi, wasm, vfs: vfsApi }) {
  // Files that never reach the virtual disk: journals and temp files.
  const scratch = new Map(); // name -> { bytes: Uint8Array }
  const open = new Map();    // sqlite3_file* -> handle
  const locks = new Map();   // path -> Map<sqlite3_file*, lock level>
  let anon = 0;

  // One handle per open file. A main database reads and writes the array in
  // shim/vfs.js; anything else a buffer of its own.
  const persistent = (path) => ({
    size: () => vfs.files.get(path)?.length ?? 0,
    bytes: () => vfs.files.get(path) ?? new Uint8Array(0),
    write: (src, off) => vfs.writeAt(path, src, off),
    truncate: (n) => vfs.truncate(path, n),
  });
  const ephemeral = (name) => {
    const f = scratch.get(name);
    return {
      size: () => f.size,
      bytes: () => f.bytes.subarray(0, f.size),
      write(src, off) {
        const end = off + src.length;
        if (end > f.bytes.length) {
          const next = new Uint8Array(Math.max(end, f.bytes.length * 2, 4096));
          next.set(f.bytes.subarray(0, f.size));
          f.bytes = next;
        }
        if (off > f.size) f.bytes.fill(0, f.size, off);
        f.bytes.set(src, off);
        f.size = Math.max(f.size, end);
      },
      truncate(n) {
        if (n > f.bytes.length) { const next = new Uint8Array(n); next.set(f.bytes.subarray(0, f.size)); f.bytes = next; }
        else if (n > f.size) f.bytes.fill(0, f.size, n);
        f.size = n;
      },
    };
  };
  const isMainDb = (flags) => !!(flags & capi.SQLITE_OPEN_MAIN_DB);

  const ioMethods = {
    xCheckReservedLock(pFile, pOut) {
      // Another connection to the same file mid-write. Without this a second
      // connection would find the first one's journal, decide it was hot, and
      // roll back a transaction that is still running.
      const h = open.get(pFile);
      let held = 0;
      for (const [p, level] of locks.get(h.path) || []) if (p !== pFile && level >= capi.SQLITE_LOCK_RESERVED) held = 1;
      wasm.poke32(pOut, held);
      return 0;
    },
    xClose(pFile) {
      const h = open.get(pFile);
      open.delete(pFile);
      if (h) {
        locks.get(h.path)?.delete(pFile);
        if (h.deleteOnClose) scratch.delete(h.path);
      }
      return 0;
    },
    xDeviceCharacteristics() { return capi.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN; },
    xFileControl() { return capi.SQLITE_NOTFOUND; },
    xFileSize(pFile, pSz64) {
      wasm.poke64(pSz64, BigInt(open.get(pFile).io.size()));
      return 0;
    },
    xLock(pFile, level) {
      const h = open.get(pFile);
      if (!locks.has(h.path)) locks.set(h.path, new Map());
      locks.get(h.path).set(pFile, level);
      return 0;
    },
    xUnlock(pFile, level) {
      const h = open.get(pFile);
      locks.get(h.path)?.set(pFile, level);
      return 0;
    },
    xRead(pFile, pDest, n, offset64) {
      const bytes = open.get(pFile).io.bytes();
      const off = Number(offset64);
      const dest = Number(pDest);
      const heap = wasm.heap8u();
      const got = Math.max(0, Math.min(n, bytes.length - off));
      if (got) heap.set(bytes.subarray(off, off + got), dest);
      if (got < n) {
        heap.fill(0, dest + got, dest + n);
        return capi.SQLITE_IOERR_SHORT_READ;
      }
      return 0;
    },
    xSectorSize() { return 4096; },
    // Durability is shim/vfs.js's flush to IndexedDB, which runs between
    // transactions; there is nothing for a sync to do here.
    xSync() { return 0; },
    xTruncate(pFile, sz64) {
      try { open.get(pFile).io.truncate(Number(sz64)); return 0; }
      catch (e) { console.warn('[sqlite] truncate failed:', e); return capi.SQLITE_IOERR_TRUNCATE; }
    },
    xWrite(pFile, pSrc, n, offset64) {
      try {
        const src = Number(pSrc);
        // A view of wasm memory; writeAt copies it before anything else runs.
        open.get(pFile).io.write(wasm.heap8u().subarray(src, src + n), Number(offset64));
        return 0;
      } catch (e) {
        console.warn('[sqlite] write failed:', e);
        return capi.SQLITE_IOERR_WRITE;
      }
    },
  };
  const io = new capi.sqlite3_io_methods();
  io.$iVersion = 1;
  vfsApi.installVfs({ io: { struct: io, methods: ioMethods } });

  const exists = (path) => scratch.has(path) || vfs.isFile(path);
  const vfsMethods = {
    xAccess(pVfs, zName, flags, pOut) {
      wasm.poke32(pOut, exists(normalize(wasm.cstrToJs(zName))) ? 1 : 0);
      return 0;
    },
    xCurrentTime(pVfs, pOut) {
      wasm.poke(pOut, 2440587.5 + Date.now() / 864e5, 'double');
      return 0;
    },
    xCurrentTimeInt64(pVfs, pOut) {
      wasm.poke(pOut, 0xbfc83e532200 + Date.now(), 'i64');
      return 0;
    },
    xDelete(pVfs, zName) {
      const path = normalize(wasm.cstrToJs(zName));
      if (scratch.has(path)) scratch.delete(path);
      else if (vfs.isFile(path)) vfs.remove(path, false);
      return 0;
    },
    xFullPathname(pVfs, zName, nOut, pOut) {
      return wasm.cstrncpy(pOut, zName, nOut) < nOut ? 0 : capi.SQLITE_CANTOPEN;
    },
    xGetLastError() { return 0; },
    xOpen(pVfs, zName, pFile, flags, pOutFlags) {
      const named = zName && wasm.peek8(zName);
      const path = named ? normalize(wasm.cstrToJs(zName)) : `/.sqlite-temp/${++anon}`;
      const main = named && isMainDb(flags);
      if (!exists(path)) {
        if (!(flags & capi.SQLITE_OPEN_CREATE)) return capi.SQLITE_CANTOPEN;
        if (main) vfs.writeAt(path, new Uint8Array(0), 0);
        else scratch.set(path, { bytes: new Uint8Array(0), size: 0 });
      }
      // A non-main file at a path the disk already has (a journal some older
      // build persisted, say) is still read from the disk; only new ones go
      // to scratch.
      const handle = scratch.has(path) ? ephemeral(path) : persistent(path);
      open.set(pFile, { path, io: handle, deleteOnClose: !named || !!(flags & capi.SQLITE_OPEN_DELETEONCLOSE) });
      const file = new capi.sqlite3_file(pFile);
      file.$pMethods = io.pointer;
      file.dispose();
      wasm.poke32(pOutFlags, flags);
      return 0;
    },
  };
  const v = new capi.sqlite3_vfs();
  const pDefault = capi.sqlite3_vfs_find(null);
  if (pDefault) {
    const d = new capi.sqlite3_vfs(pDefault);
    v.$xRandomness = d.$xRandomness;
    v.$xSleep = d.$xSleep;
    d.dispose();
  }
  if (!v.$xRandomness) vfsMethods.xRandomness = (pVfs, nOut, pOut) => {
    const heap = wasm.heap8u();
    for (let i = 0; i < nOut; i++) heap[Number(pOut) + i] = (Math.random() * 256) & 255;
    return nOut;
  };
  if (!v.$xSleep) vfsMethods.xSleep = () => 0;
  v.$iVersion = 2;
  v.$szOsFile = capi.sqlite3_file.structInfo.sizeof;
  v.$mxPathname = 1024;
  vfsApi.installVfs({ vfs: { struct: v, name: VFS_NAME, methods: vfsMethods } });
}

// ── node-sqlite3-wasm's surface ────────────────────────────────────────────
const normalizeParam = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString();
  return v;
};
const normalizeParams = (params) => {
  if (params == null) return [];
  const list = Array.isArray(params) ? params : [params];
  // conn.js's adapter always forwards a positional array; an object would be
  // named binding, which this codebase never uses.
  return list.map(normalizeParam);
};

// The official build prefixes sqlite's message with its result code
// ("SQLITE_CONSTRAINT_UNIQUE: sqlite3 result code 2067: UNIQUE constraint
// failed: …"). node-sqlite3-wasm throws sqlite's message as it is, and that is
// what the app matches on (scribe.js: /UNIQUE/), so give it back that shape.
const PREFIX_RE = /^SQLITE_[A-Z_]+: sqlite3 result code \d+: /;
function rethrow(e) {
  if (e && typeof e.message === 'string' && PREFIX_RE.test(e.message)) {
    const msg = e.message.replace(PREFIX_RE, '');
    try { e.message = msg; } catch (_) { const err = new Error(msg); err.code = e.resultCode; throw err; }
  }
  throw e;
}

const toNumber = (v) => (typeof v === 'bigint' && v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v);

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.isFinalized = false;
    this._st = null;
  }
  _live(params) {
    if (this.isFinalized) throw new Error('statement is finalized');
    if (!this._st) this._st = this.db._db.prepare(this.sql);
    const st = this._st;
    st.reset();
    st.clearBindings();
    const list = normalizeParams(params);
    if (list.length) st.bind(list);
    return st;
  }
  all(params) {
    try {
      const st = this._live(params);
      const rows = [];
      while (st.step()) rows.push(st.get({}));
      st.reset();
      return rows;
    } catch (e) { return rethrow(e); }
  }
  get(params) {
    try {
      const st = this._live(params);
      const row = st.step() ? st.get({}) : null;
      st.reset();
      return row;
    } catch (e) { return rethrow(e); }
  }
  run(params) {
    try {
      const st = this._live(params);
      st.step();
      st.reset();
      return { changes: this.db._changes(), lastInsertRowid: this.db._lastInsertRowid() };
    } catch (e) {
      try { this._st?.reset(); } catch (_) {}
      return rethrow(e);
    }
  }
  _reset() {
    if (this._st) { this._st.reset(); this._st.clearBindings(); }
  }
  finalize() {
    if (this.isFinalized) return;
    this.isFinalized = true;
    if (this._st) { try { this._st.finalize(); } catch (_) {} }
    this._st = null;
    this.db._statements.delete(this);
  }
}

export class Database {
  constructor(filePath, options = {}) {
    if (!sqlite3) throw new Error('initSqlite() must finish before a Database is opened');
    this.filePath = normalize(String(filePath));
    // node-sqlite3-wasm creates a missing file unless told the file must
    // exist; conn.js does its own existence check first (openDdx).
    const flags = options.readOnly ? 'r' : 'c';
    try { this._db = new sqlite3.oo1.DB(this.filePath, flags, VFS_NAME); } catch (e) { rethrow(e); }
    this._statements = new Set();
    this.isOpen = true;
    if (options.readOnly) this.readOnly = true;
    openDatabases.add(this);
  }

  _changes() { return sqlite3.capi.sqlite3_changes(this._db.pointer); }
  _lastInsertRowid() { return toNumber(sqlite3.capi.sqlite3_last_insert_rowid(this._db.pointer)); }

  prepare(sql) {
    const st = new Statement(this, sql);
    this._statements.add(st);
    return st;
  }

  exec(sql) {
    try { this._db.exec(String(sql)); } catch (e) { rethrow(e); }
  }

  run(sql, params) {
    if (params === undefined) { this.exec(sql); return { changes: this._changes(), lastInsertRowid: this._lastInsertRowid() }; }
    const st = this.prepare(sql);
    try { return st.run(params); } finally { st.finalize(); }
  }
  all(sql, params) {
    const st = this.prepare(sql);
    try { return st.all(params); } finally { st.finalize(); }
  }
  get(sql, params) {
    const st = this.prepare(sql);
    try { return st.get(params); } finally { st.finalize(); }
  }

  // Nothing to write back: sqlite's pages are already on the virtual disk.
  // Kept because the bridge and older callers still call it.
  persist() {}

  close() {
    if (!this.isOpen) return;
    for (const st of [...this._statements]) st.finalize();
    try { this._db.close(); } catch (_) {}
    this.isOpen = false;
    openDatabases.delete(this);
  }
}

// Push everything to IndexedDB now — used before the tab goes away or
// navigates, and by tools that need the disk to be current.
export function persistAll() {
  return vfs.flushNow();
}

export default { Database, initSqlite, persistAll };
