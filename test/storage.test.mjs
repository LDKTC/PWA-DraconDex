// The desktop lane's storage: shim/sqlite.js (sqlite's own wasm build on a
// VFS) writing into shim/vfs.js, which flushes changed 64 KB chunks to
// IndexedDB. Runs the real modules against fake-indexeddb, and "reloads" by
// dropping everything in memory and hydrating again from IndexedDB alone —
// the one thing that proves the bytes that reached storage are a database.
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import vfs, { hydrate, CHUNK } from '../shim/vfs.js';
import { Database, initSqlite, persistAll } from '../shim/sqlite.js';

const IDB = 'dracondex-pwa';
const VAULT = '/ddx/DraconDex/novel-manager-data/vaults/T-1.ddx';

function idbRequest(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
async function idbAll() {
  const db = await idbRequest(indexedDB.open(IDB, 1));
  const tx = db.transaction('files', 'readonly');
  const [keys, values] = await Promise.all([idbRequest(tx.objectStore('files').getAllKeys()), idbRequest(tx.objectStore('files').getAll())]);
  db.close();
  return keys.map((k, i) => [k, values[i]]);
}
async function reload() {
  vfs._forget();
  await hydrate();
}

await initSqlite();
await hydrate();

test('a vault written page by page survives a reload, and only changed chunks are flushed', async () => {
  const db = new Database(VAULT);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT)');
  db.exec('CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE, body TEXT)');
  const ins = db.prepare('INSERT INTO child (parent_id, body) VALUES (?, ?)');
  db.prepare('INSERT INTO parent (name) VALUES (?)').run(['p']);
  db.exec('BEGIN');
  for (let i = 0; i < 3000; i++) ins.run([1, 'x'.repeat(1000)]);
  db.exec('COMMIT');
  await persistAll();
  const size = vfs.read(VAULT).length;
  assert.ok(size > 2 * 1048576, `vault is ${size} bytes`);

  const rows = await idbAll();
  const header = rows.find(([k]) => k === VAULT)?.[1];
  assert.equal(header.chunks, Math.ceil(size / CHUNK), 'stored as a chunked file');

  // One small write afterwards touches a couple of chunks, not the vault.
  const before = new Map(rows.filter(([k]) => Array.isArray(k)).map(([k, v]) => [k[1], new Uint8Array(v.bytes)]));
  const { lastInsertRowid } = ins.run([1, 'typed']);
  await persistAll();
  const after = (await idbAll()).filter(([k]) => Array.isArray(k) && k[0] === VAULT);
  const changed = after.filter(([k, v]) => !Buffer.from(before.get(k[1]) || []).equals(Buffer.from(new Uint8Array(v.bytes))));
  assert.ok(changed.length > 0 && changed.length <= 4, `${changed.length} chunk(s) changed`);

  // The connection was never closed or reopened, so the pragma still holds:
  // under sql.js every save reset it to OFF.
  assert.equal(db.get('PRAGMA foreign_keys').foreign_keys, 1);
  db.exec('DELETE FROM parent');
  assert.equal(db.get('SELECT count(*) AS n FROM child').n, 0, 'ON DELETE CASCADE ran');
  db.close();
  await persistAll();

  await reload();
  const again = new Database(VAULT);
  assert.equal(again.get('PRAGMA integrity_check').integrity_check, 'ok');
  assert.equal(again.get('SELECT count(*) AS n FROM parent').n, 0);
  assert.ok(lastInsertRowid > 3000);
  again.close();
});

test('a file stored whole by an older build opens, and is rewritten in chunks once', async () => {
  // Build a real database, then put it into IndexedDB the way the sql.js
  // build did: one { bytes } record under its path.
  const path = '/ddx/legacy.ddx';
  const db = new Database(path);
  db.exec('CREATE TABLE t (v TEXT)');
  db.exec('BEGIN');
  for (let i = 0; i < 500; i++) db.prepare('INSERT INTO t VALUES (?)').run(['y'.repeat(1000)]);
  db.exec('COMMIT');
  db.close();
  const image = vfs.read(path).slice();
  vfs.remove(path, false);
  await persistAll();
  const idb = await idbRequest(indexedDB.open(IDB, 1));
  const tx = idb.transaction('files', 'readwrite');
  tx.objectStore('files').put({ bytes: image.buffer, mtime: Date.now() }, path);
  await new Promise((r) => { tx.oncomplete = r; });
  idb.close();

  await reload();
  const legacy = new Database(path);
  assert.equal(legacy.get('SELECT count(*) AS n FROM t').n, 500);
  legacy.prepare('INSERT INTO t VALUES (?)').run(['new']);
  await persistAll();
  const rows = (await idbAll()).filter(([k]) => k === path || (Array.isArray(k) && k[0] === path));
  assert.equal(rows.find(([k]) => k === path)[1].chunks, Math.ceil(vfs.read(path).length / CHUNK), 'now chunked');
  legacy.close();

  await reload();
  const back = new Database(path);
  assert.equal(back.get('SELECT count(*) AS n FROM t').n, 501);
  assert.equal(back.get('PRAGMA integrity_check').integrity_check, 'ok');
  back.close();
});

test('VACUUM INTO writes a complete copy onto the virtual disk', async () => {
  const db = new Database('/ddx/src.ddx');
  db.exec('CREATE TABLE t (v INTEGER)');
  db.prepare('INSERT INTO t VALUES (?)').run([42]);
  db.prepare('VACUUM INTO ?').run(['/ddx/downloads/copy.ddx']);
  db.close();
  const bytes = vfs.read('/ddx/downloads/copy.ddx');
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 15)), 'SQLite format 3');
  const copy = new Database('/ddx/downloads/copy.ddx', { readOnly: true });
  assert.equal(copy.get('SELECT v FROM t').v, 42);
  copy.close();
  // The journal of the transaction never reached the disk.
  assert.ok(![...vfs.files.keys()].some((k) => k.endsWith('-journal')));
});

test('errors carry sqlite\'s own message, as node-sqlite3-wasm throws it', () => {
  const db = new Database('/ddx/err.ddx');
  db.exec('CREATE TABLE u (v TEXT UNIQUE)');
  db.prepare('INSERT INTO u VALUES (?)').run(['a']);
  assert.throws(() => db.prepare('INSERT INTO u VALUES (?)').run(['a']), /^Error: UNIQUE constraint failed: u\.v$|^SQLite3Error: UNIQUE constraint failed: u\.v$/);
  // the statement is usable again after the failure
  assert.equal(db.prepare('INSERT INTO u VALUES (?)').run(['b']).changes, 1);
  db.close();
});

test('nothing is flushed while a transaction is open', async () => {
  const db = new Database('/ddx/tx.ddx');
  db.exec('CREATE TABLE t (v INTEGER)');
  await persistAll();
  db.exec('BEGIN');
  db.prepare('INSERT INTO t VALUES (?)').run([1]);
  // sqlite may not have touched the file yet inside the transaction, so
  // give the flush something else to carry: it must still hold everything.
  vfs.write('/ddx/other.json', new TextEncoder().encode('{}'));
  await persistAll();
  assert.ok(vfs.pending(), 'held back until COMMIT');
  db.exec('COMMIT');
  await persistAll();
  assert.ok(!vfs.pending());
  db.close();
});
