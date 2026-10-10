# เลนเดสก์ท็อป — DraconDex ฝั่ง Electron ทำงานในเบราว์เซอร์ได้อย่างไร

> เอกสารนี้อธิบาย **หลักการ** ของเลน `/d/` เป็นหลัก (เลน `/m/` คือ
> `flutter build web` ของโค้ด Flutter ชุดเดิม — อ่าน `docs/PWA.md` ใน
> DraconDex-EXE ได้โดยตรง สิ่งที่ฝั่งนี้เพิ่ม — `--no-web-resources-cdn`,
> `--wasm` และ service worker — อยู่ในหัวข้อ 10)

## 1. โจทย์

DraconDex ฝั่งเดสก์ท็อปแบ่งเป็นสองซีก:

```
renderer (vanilla JS, ~19k บรรทัด)   ← เป็น "เว็บ" อยู่แล้ว 100%
        │ window.api.<ns>.<fn>()  (preload.js)
        │ ipcRenderer.invoke
main process (main.js + src/db/**)   ← เป็น Node ล้วน: fs, node-sqlite3-wasm, Electron
```

ซีกบนรันในเบราว์เซอร์ได้ทันทีโดยไม่ต้องแก้อะไรเลย (สคริปต์ธรรมดา + CSS ธรรมดา)
ซีกล่างรันไม่ได้ — ไม่มี Node, ไม่มีไฟล์ระบบ, ไม่มี Electron

ทางเลือกที่ **ไม่** ใช้: เขียน data layer ใหม่สำหรับเว็บ นั่นคือการ fork
โค้ด 9,500 บรรทัดที่จะ drift ออกจากต้นทางทันทีที่แอปหลักขยับ และจะกลายเป็น
"เวอร์ชันเว็บที่พฤติกรรมไม่ตรงกับแอปจริง" ภายในไม่กี่รอบ

สิ่งที่ทำแทนคือ **ยกซีกล่างทั้งซีกมารันในหน้าเว็บ** แล้วเปลี่ยนเฉพาะสี่อย่าง
ที่เบราว์เซอร์ไม่มีจริง ๆ ข้างใต้มัน — ไม่แตะโค้ดแอปแม้แต่บรรทัดเดียว

```
renderer (ไฟล์เดิม)  →  window.api (preload.js ตัวจริง)
                      →  __ddxInvoke            (shim/entry.js)
                      →  IPC handlers ของ main.js ตัวจริง
                      →  src/db/** ตัวจริง  บน sqlite-wasm + virtual filesystem
```

แนวคิดนี้ไม่ใช่ของใหม่ในโปรเจกต์ — `.claude/skills/run-dracondex/web-driver.mjs`
ของ DraconDex-EXE ก็รัน renderer จริงใน Chromium โดย stub เฉพาะเปลือก Electron
ต่างกันตรงที่ตัวนั้นยังมี Node เป็น main process อยู่หลัง bridge ส่วนอันนี้
ย้ายทั้งหมดเข้ามาในหน้าเว็บ

## 2. สี่อย่างที่ถูกสลับข้างใต้

| ของจริงบนเดสก์ท็อป | ตัวแทนในเบราว์เซอร์ | ไฟล์ |
|---|---|---|
| `require('electron')` — app/BrowserWindow/ipcMain/dialog/Menu/shell | สตับที่เก็บ handler ลง Map แทน `ipcMain.handle` | `shim/electron.js` |
| `require('fs')` — ไฟล์ `.ddx` จริงบนดิสก์ | virtual filesystem ในหน่วยความจำ + IndexedDB | `shim/fs.js`, `shim/vfs.js` |
| `node-sqlite3-wasm` | `@sqlite.org/sqlite-wasm` (SQLite ตัวทางการ) + VFS ลง vfs | `shim/sqlite.js` |
| หน้าต่าง (เปิด/ปิด/ย่อ/ขยาย) | การนำทางของหน้าเว็บ (`?nexus=`, แท็บใหม่) | `shim/entry.js` |

ที่เหลือเป็นของประกอบ: `path`/`os`/`crypto`/`http`/`node:async_hooks`/`Buffer`
— ทั้งหมดเขียนเท่าที่ `src/db/**` เรียกใช้จริง (นับจากซอร์ส ไม่ใช่เดา) และ
อะไรที่ไม่มีทางทำได้ก็โยน error ที่บอกเหตุผลตรง ๆ แทนที่จะเงียบ

`esbuild` เป็นตัวประกอบทั้งหมดนี้เป็นไฟล์เดียว (`dist/d/ddx-bridge.js`,
~1 MB รวม SQLite) โดย alias ชื่อโมดูล Node ไปที่ shim และ inject `process`/`__dirname`
ให้ main.js เดินเข้า branch ของ build แบบ packaged (branch dev ของมันอ้าง
`__dirname/../tmp-user-data` ซึ่งไม่มีอยู่ในเบราว์เซอร์)

## 3. ไฟล์ `.ddx` ในเบราว์เซอร์

ตั้งแต่ v4.9.0 แอปเก็บข้อมูลเป็น `app.ddx` หนึ่งไฟล์ + `.ddx` ต่อหนึ่ง Nexus
(อ่าน `docs/VAULTS.md` ต้นทาง) โค้ดชั้นนี้เรียก `fs.existsSync`,
`fs.renameSync`, `fs.copyFileSync` ตรง ๆ ~28 จุด — เลยให้มัน "มีไฟล์ระบบ" ไปเลย

```
shim/vfs.js     path -> Uint8Array ในหน่วยความจำ, mirror ลง IndexedDB เป็น chunk ละ 64 KB
shim/fs.js      fs API ที่ src/db/** ใช้จริง แปะบน vfs
shim/sqlite.js  SQLite ตัวทางการ (@sqlite.org/sqlite-wasm) + VFS ชื่อ "ddx"
                sqlite อ่าน/เขียนทีละ page ลง Uint8Array ของ vfs ตรง ๆ
```

โครงพาธที่ได้ (มาจาก branch packaged ของ main.js เอง):

```
/ddx/DraconDex/novel-manager-data/app.ddx
/ddx/DraconDex/novel-manager-data/vaults/<ชื่อ>-<id>.ddx
```

### การเขียนหนึ่งครั้งเสียอะไรบ้าง (Procress 19 part 5, F7)

เดิมเลนนี้ใช้ `sql.js` ซึ่งเก็บฐานไว้ในไฟล์ระบบในหน่วยความจำของ emscripten และ
มีทางเอาข้อมูลออกทางเดียวคือ `export()` = serialize **ทั้งฐาน** และทำโดย
**ปิดแล้วเปิดฐานใหม่** ผลคือทุกการเขียน (หลังหน่วง 250 ms) ต้อง copy ทั้ง vault
แล้วส่งทั้งก้อนลง IndexedDB อีกรอบ — วัดที่ vault 50 MB ได้ export 41 ms +
transaction 265 ms ต่อการเขียนหนึ่งครั้ง, แคช prepared statement ของ `conn.js`
ตายทุกรอบ และ (เจอตอนไล่โค้ด) **PRAGMA ทุกตัวกลับเป็นค่า default** —
`foreign_keys = ON` หายหลังการบันทึกครั้งแรกของ session ทำให้ `ON DELETE
CASCADE` ไม่ทำงานบนเว็บมาตลอด

ตอนนี้ใช้ SQLite build ทางการ ซึ่งเปิดให้เขียน VFS ด้วย JavaScript ได้ —
`shim/sqlite.js` ลงทะเบียน VFS ที่ทำงาน **synchronous บน main thread**
(ตรงกับที่ `conn.js` ต้องการ) sqlite เขียน page ลง array ของ `shim/vfs.js`
โดยตรง vfs จดว่า chunk 64 KB ไหนถูกแตะ แล้ว flush ลง IndexedDB **เฉพาะ chunk
นั้น** ไม่มี export ไม่มีปิด-เปิดฐานอีกเลย

| vault | ก่อน (sql.js) | หลัง |
|---|---|---|
| 5 MB | export 4.0 ms + IndexedDB 19.2 ms | flush 1.4 ms |
| 50 MB | export 40.8 ms + IndexedDB 265 ms | flush 2.0 ms |

(`node tools/perf.mjs --lane d`)

รูปแบบใน IndexedDB (store เดิม `files` ไม่เปลี่ยน version):

```
'<path>'          { chunks: n, size, mtime }   header ของไฟล์ที่ใหญ่กว่า 64 KB
['<path>', i]     { bytes }                    chunk ที่ i
'<path>'          { bytes, mtime }             ไฟล์เล็ก — รูปแบบเดียวกับของเดิมทุกไฟล์
```

ข้อมูลที่ build เก่าเขียนไว้ (record เดียวทั้งไฟล์) อ่านได้ตามเดิม และถูกเขียน
ใหม่เป็น chunk ครั้งเดียวตอน flush ครั้งแรก (`npm run verify` มีขั้นตอนที่แปลง
vault กลับเป็นรูปแบบเก่าแล้ว reload เพื่อเช็คทางนี้) header กับ record เก่า
ใช้ key เดียวกันโดยตั้งใจ: แท็บเก่าที่ยังเปิดค้างข้ามการ deploy เขียนทับ header
ด้วย record ทั้งไฟล์ได้ และอันที่เขียนทีหลังชนะแบบ atomic ไม่ปนกัน
ข้อจำกัดที่ต้องรู้: **ถอย dist/ กลับไปก่อน commit นี้** แล้ว build เก่าจะอ่าน
header เป็นไฟล์ว่าง — ถ้าต้อง rollback จริงต้องย้อนรูปแบบข้อมูลด้วย

ทำไมไม่ใช้ OPFS ("opfs-sahpool") ที่ Plan เสนอ: `FileSystemSyncAccessHandle`
มีให้ใช้เฉพาะใน dedicated worker แต่ data layer นี้ synchronous และรันในหน้า —
จะใช้ได้ต้องย้าย main.js + `src/db/**` ทั้งหมดเข้า worker หลัง bridge แบบ async
(รื้อ `shim/entry.js`, dialogs, downloads) ซึ่งไม่ใช่แค่การเปลี่ยน storage
ส่วน "คง sql.js แล้วจับ dirty page" ทำไม่ได้เพราะ build release ของ sql.js
ไม่ export ไฟล์ระบบของมัน (ชื่อถูก minify หมด) — ต้อง build sql.js เอง
ส่วนเพิ่มที่ได้ฟรี: SQLite ทางการมี FTS5 จึงสร้าง `search_index` แบบ trigram
ได้เหมือนเดสก์ท็อป (เดิมตกไปใช้ LIKE) — vault ที่ export จึงใหญ่ขึ้นตาม index

### เมื่อไหร่ถึง flush

ยังหน่วงอยู่ แต่เพื่อลดจำนวน transaction ไม่ใช่เพื่อเลี่ยง export: รอจนการเขียน
เงียบ 400 ms (ผู้ใช้หยุดพิมพ์) แล้วรอช่วง idle ของเบราว์เซอร์
(`requestIdleCallback`) แต่ **ไม่เกิน 2 วินาที** นับจากการเขียนแรกที่ยังไม่ลง
และ flush ทันทีเมื่อ `pagehide`/`visibilitychange`/`beforeunload` (ระหว่างที่
ยังมีของค้างส่ง เบราว์เซอร์จะถามก่อนปิดหน้าเหมือนเดิม) — 2 วินาทีคือเพดานที่
แท็บ crash จะทำข้อมูลหายได้

flush เกิดได้เฉพาะ **ระหว่าง transaction** เท่านั้น: `shim/sqlite.js` ตอบ vfs
ว่าทุก connection อยู่ใน autocommit หรือไม่ (`sqlite3_get_autocommit`) ถ้ามี
BEGIN ค้างอยู่ก็เลื่อนไปก่อน — ภาพใน IndexedDB จึงเป็นฐานที่ commit แล้วเสมอ
ไฟล์ journal และ temp ของ sqlite อยู่ใน map ส่วนตัวในหน่วยความจำ ไม่เคยลง
IndexedDB (journal ที่หลุดลงไปจะถูกอ่านเป็น hot journal แล้ว rollback ทับ
ข้อมูลดีในการเปิดครั้งหน้า)

### `VACUUM INTO`

export/duplicate Nexus ใช้ `VACUUM INTO ?` — ตอนนี้ sqlite เขียนไฟล์ปลายทาง
ผ่าน VFS ของเราเองจริง ๆ ได้ไฟล์ที่บีบอัดแล้วแบบเดียวกับเดสก์ท็อป (สมัย sql.js
ต้องดักแล้วเขียน `export()` แทน ซึ่งไม่ได้ compact)

## 4. Vault context (AsyncLocalStorage)

`src/db/vault-context.js` ใช้ ALS เพราะบนเดสก์ท็อปสองหน้าต่างที่เปิดคนละ Nexus
ใช้ event loop เดียวกัน — handler ที่ `await` แล้วกลับมาต้องเห็น vault ของตัวเอง
ไม่ใช่ของหน้าต่างอื่น (ต้นทางอธิบายไว้ว่าทำไม module-scoped variable ถึงผิด)

เบราว์เซอร์ไม่มี ALS จริง `shim/async_hooks.js` จึงเก็บ store ไว้ตลอดช่วง
promise ของ `run()` แล้วคืนค่าเดิมเมื่อ settle (ถ้าใช้ try/finally เฉย ๆ store
จะหลุดตั้งแต่ `await` แรก และ vault resolution จะพังทันที) สิ่งที่มันทำไม่ได้คือ
`run()` สอง call ที่ vault ต่างกันซ้อนเวลากัน — ซึ่งในหนึ่งแท็บมีแค่ `?nexus=`
เดียว และ dialog ในเบราว์เซอร์ไม่ค้างรอ picker แบบฝั่งเดสก์ท็อป กรณีนั้นจึง
ไม่เกิดในทางปฏิบัติ (เขียนไว้ตรง ๆ ในไฟล์ว่านี่คือขอบเขตของมัน)

`windowNexus` ถูก seed ด้วย window id ปลอม (1) จาก `?nexus=` ตอนบูต —
เหมือนที่ `createWindow()` ทำ ถ้าไม่ทำ ทุก handler ที่แตะ vault จะโยน
"no active vault" เพราะ vault-context ตั้งใจ fail closed

## 5. หน้าต่าง → การนำทาง

`window:*` เป็น IPC channel ปกติ จึงถูก **แทนที่ตามชื่อ channel** ใน
`shim/entry.js` ไม่ใช่ด้วยการแก้ main.js

| channel | ในเบราว์เซอร์ |
|---|---|
| `window:openNexus` | เปิดแท็บใหม่ `?nexus=<id>` |
| `window:openNexusReplace` | เปลี่ยน URL ของแท็บนี้ (Welcome → vault) |
| `window:openWelcome` | `?welcome=1` |
| `window:openBuilderTab` | แท็บใหม่ `?nexus&tab&popup=1` |
| `window:toggleMaximize` | fullscreen ของเบราว์เซอร์ |
| `window:minimize` / `close` | ไม่ทำอะไร (ปุ่มถูกซ่อนด้วย `web.css`) |
| `window:moveTabToMain` | คืน `false` — ไม่มี IPC ข้ามแท็บ |
| `update:check` | ตอบ "เป็นเวอร์ชันล่าสุด" — service worker อัปเดตเองอยู่แล้ว |

URL เปล่า (ไม่มี `?welcome=` และไม่มี `?nexus=`) ไม่ใช่สถานะที่แอปมี — บนเดสก์ท็อป
main.js เป็นคนตัดสินใจแล้วส่งมาเป็น query string หน้าเว็บจึงต้องตัดสินใจแทน
ก่อนสคริปต์ renderer ตัวแรกจะอ่าน `location.search` (ทำใน `shim/entry.js`)

## 6. Save / Open dialog

- **Save** — ไม่มีขั้นตอน "เลือกที่เก็บ" handler จะได้พาธใน `/ddx/downloads/`
  เขียนไฟล์ลงไปตามปกติ แล้ว bridge ค่อยส่งไฟล์นั้นให้เบราว์เซอร์
  (`showSaveFilePicker` ถ้ามี ไม่งั้นเป็นลิงก์ดาวน์โหลด) แล้วลบทิ้งจาก vfs
  โค้ด export ของแอปจึงไม่ต้องแก้อะไรเลย
- **Open** — `<input type="file">` จริง ไฟล์ที่เลือกถูกคัดลอกเข้า vfs แล้วคืน
  พาธเสมือน โค้ดที่ `readFileSync`/`copyFileSync` ต่อจากนั้นทำงานได้ตามเดิม
  (โฟลเดอร์ใช้ `webkitdirectory` เพื่อให้ Import Dock ยังเพิ่มทั้งโฟลเดอร์ได้)

หมายเหตุที่วัดมาแล้ว: Chromium ตัด **ชื่อไฟล์ที่ไม่ใช่ ASCII** ทิ้งเมื่อใช้
`a[download]` กับ blob URL (ชื่อ Nexus ภาษาไทยจะกลายเป็น `download`) เส้นทาง
ลิงก์จึงมีชื่อสำรองเป็น ASCII ให้ ส่วน `showSaveFilePicker` ไม่มีปัญหานี้

## 7. `ddx-file://` และรูปภาพ

โปรโตคอลนี้ลงทะเบียนไม่ได้ในหน้าเว็บ — `shim/electron.js` จึงไม่ export
`protocol` เลย (main.js มี `if (protocol)` ครอบอยู่แล้ว) ผลคือ `<img>` ที่ชี้
`ddx-file://` จะ error แล้วตกลง fallback `importdock:readFiles` ที่ renderer
มีอยู่แล้ว — เป็นเส้นทางที่แอปรองรับอยู่แล้ว ไม่ใช่ของที่เพิ่มใหม่

## 8. สิ่งที่ทำไม่ได้จริง ๆ (และทำไม)

| ฟีเจอร์ | เหตุผล |
|---|---|
| Google Drive backup / Google sign-in | flow เดสก์ท็อปต้องเปิด loopback HTTP server (`shim/http.js` โยน error ที่บอกแบบนี้ตรง ๆ) |
| Plugins | เป็นหน้าต่าง/โปรเซสแยกที่แตะไฟล์ระบบและติดตั้งจาก git |
| Reveal in folder / เปิดด้วยแอปอื่น | ไม่มี OS file manager ให้เรียก |
| ไฟล์ที่ import ยังลิงก์กับพาธเดิมบนดิสก์ | เบราว์เซอร์ไม่ให้พาธจริง ไฟล์จึงถูก "คัดลอกเข้ามา" แทน |
| Cloud Sync | ปิดทั้งโปรเจกต์อยู่แล้วตั้งแต่ต้นทาง ไม่ใช่ข้อจำกัดของเว็บ |

### DDX Transfer ใช้ได้ — และเหตุผลที่ Google login ใช้ไม่ได้คือเหตุผลเดียวกัน

**DDX Transfer** (`electron/src/db/transfer.js`) ทำงานใน lane `/d/` ได้ครบ
ทั้งส่งและรับ ทั้งที่ Token Sync ใช้ไม่ได้ — ความต่างอยู่ที่สิ่งที่แต่ละอันต้องใช้:

| | ต้องการอะไร | บนเว็บ |
|---|---|---|
| Token Sync (Google login) | loopback HTTP server รับ OAuth redirect | `shim/http.js` โยน `ERR_WEB_UNSUPPORTED` — เบราว์เซอร์เปิดเซิร์ฟเวอร์ไม่ได้ |
| DDX Transfer | `fetch` ระดับโลกอย่างเดียว | ใช้ได้ตามปกติ |

DDX Transfer **ไม่มี OAuth เลย** (ไม่มีบัญชี มีแค่รหัสกับ PIN), ไม่แตะ
`http.createServer`, ไม่เปิด dialog เลือกไฟล์ (snapshot อยู่ในหน่วยความจำตั้งแต่
ต้นจนจบ) และไม่แตะ `shim/fs.js` — สามอย่างที่เป็นข้อจำกัดจริงของ lane นี้

**ข้อเดียวที่ต้องทำคือ CSP** — `connect-src 'self'` เดิมบล็อกคำขอไปยังโดเมนของ
บริการ และบล็อกแบบ*ไม่มี network error* ซึ่งอ่านออกมาเหมือน "เซิร์ฟเวอร์ล่ม"
`tools/build-desktop.mjs` จึงใส่ `TRANSFER_ORIGIN` เข้าไปใน `connect-src`
(ต้องตรงกับ `DEFAULT_BASE` ใน `electron/src/db/transfer.js`) ส่วนฝั่งบริการ
มี allowlist CORS ที่มี origin ของ GitHub Pages อยู่แล้ว

## 9. Content-Security-Policy

`index.html` ของแอปมี CSP ที่ตั้งใจให้ `connect-src 'none'` (renderer เดสก์ท็อป
ไม่ต้องต่อเน็ตเองเลย ทุกอย่างผ่าน IPC) บนเว็บต้องผ่อนสองข้อ เพราะไม่งั้น
sqlite ไม่ทำงาน:

- `script-src` เพิ่ม `'wasm-unsafe-eval'` (คอมไพล์ wasm)
- `connect-src 'self'` (โหลด `sqlite3.wasm` และไฟล์ของตัวเอง)
- `manifest-src 'self'` (ติดตั้งเป็นแอปได้)

ยังคง `default-src 'none'` และไม่มี host ภายนอกในรายการใด ๆ ทั้งสิ้น — build
นี้ไม่ต่อออกไปไหนเลยนอกจาก origin ตัวเอง

## 10. เลนมือถือ: `--no-web-resources-cdn`

`flutter build web` ปกติจะให้ตัว loader ไปดึง CanvasKit จาก
`www.gstatic.com` ตอน runtime (โฟลเดอร์ `canvaskit/` ถูก emit ไว้ก็จริง
แต่ไม่ถูกใช้ — วัดแล้ว: ปิดเน็ตแล้วแอปไม่ขึ้นเลย) แฟล็กนี้ทำให้ `buildConfig`
มี `useLocalCanvasKit` แล้วโหลดจากไฟล์ข้าง ๆ แทน ซึ่งเป็นเงื่อนไขของทั้ง
"ใช้งาน offline ได้" และ "ไม่ยิงไปหา third-party ทุกครั้งที่เปิด"

manifest ของเลนมือถือถูกชี้กลับไปที่ manifest ของทั้งไซต์ด้วย เพื่อให้
"ติดตั้งจากมือถือ" กับ "ติดตั้งจากเดสก์ท็อป" เป็นแอปเดียวกัน (start_url คือ
router ซึ่งเลือกเลนให้ใหม่ทุกครั้งที่เปิด)

### `--wasm` (Procress 19 part 5, F11)

build นี้ออกมา **สองชุด** แล้วให้ loader เลือกตามเบราว์เซอร์: dart2wasm +
renderer skwasm บนเบราว์เซอร์ตระกูล Chromium (มี WasmGC) และ dart2js +
CanvasKit บนที่เหลือ (Firefox, Safari) วัดบน Chromium:

| | first frame | โหลดครั้งแรก |
|---|---|---|
| dart2js + CanvasKit (เดิม) | ~2.0 s | 13.9 MB |
| dart2wasm + skwasm | ~0.9 s | 11.7 MB |

ข้อมูลที่ build dart2js เขียนไว้เปิดใน build wasm ได้ตามเดิม (ใช้ store
IndexedDB ของ `sqflite_common_ffi_web` ตัวเดียวกัน — ทดสอบจริงในเบราว์เซอร์)
skwasm รันแบบ single-thread เพราะแบบ multi-thread ต้องมี COOP/COEP header
ซึ่ง GitHub Pages ส่งไม่ได้

`tools/build-mobile.mjs` แก้ loader call ท้าย `flutter_bootstrap.js` สองข้อ:
เอา `serviceWorkerSettings` ออก (ดูหัวข้อถัดไป) และใส่
`canvasKitVariant: 'full'` — ทางสำรอง dart2js จึงไม่ขอ `canvaskit/chromium/`
อีก (เดิมใช้เฉพาะ Chromium ที่ไม่มี WasmGC = Chrome < 119) แล้วลบสิ่งที่
loader ไม่มีวันขอออกจาก `dist/m` (อ่านจาก `flutter_bootstrap.js` ไม่ใช่เดา):
`canvaskit/chromium/`, `experimental_webparagraph/`, `wimp.*` (ใช้เมื่อตั้ง
`enableWimp` เท่านั้น) และไฟล์ `*.symbols` ทั้งหมด — `dist/m` จาก 53.4 MB
เหลือ 38.9 MB `skwasm_heavy.*` ยังเก็บไว้ (skwasm ใช้ตัวนี้เมื่อไม่มี
`ImageDecoder`) `npm run verify` บังคับให้หน้าหนึ่งตกไปทางสำรอง
(`WebAssembly.validate` → false) เพื่อให้ทางนี้ถูกทดสอบด้วย เพราะ Chromium
เองจะไม่มีวันเดินทางนี้

### Service worker

ทั้งไซต์มี service worker ตัวเดียว (`dist/sw.js`, เขียนโดย
`tools/build-shell.mjs`) scope ครอบ router และทั้งสามเลน และทุกเลนเป็นคน
register (`tools/sw-register.mjs`)

เดิม worker ตัวนี้ precache เลนเดสก์ท็อปทั้งเลน (207 ไฟล์ ~11 MB รวม library
ที่ผู้ใช้อาจไม่เคยเปิด) และ **ข้าม `/m/`** โดยเชื่อว่า Flutter มี worker ของ
ตัวเอง — แต่ตั้งแต่ Flutter 3.44 `flutter_service_worker.js` เป็นแค่ stub ที่
unregister ตัวเองแล้ว reload หน้า แถม scope เป็น `/m/` จึงแย่งเลนไปจาก worker
ของไซต์ทุกครั้งที่ถูก register ผลคือไม่มีอะไร cache `/m/` เลย: reload
`/m/` ดาวน์โหลดใหม่ 13.8 MB ทุกครั้ง (`tools/perf.mjs`)

ตอนนี้:

- precache เฉพาะ shell (router, manifest, icon ที่ manifest อ้าง, โลโก้ของ
  router) ที่เหลือ **cache เมื่อถูกใช้** แบบ cache-first — ภาษาก็เช่นกัน:
  `/d/` มีทุกภาษาอยู่ใน `i18n.js` ไฟล์เดียวของแอป ส่วน `/m/` โหลดคู่มือของ
  ภาษาที่ใช้ (`assets/templates/guide/<lang>.json`) เฉพาะตอนเปิด การ cache
  เมื่อใช้จึงเก็บเฉพาะภาษาที่ใช้จริง
- register ทันที ไม่รอ `load` และหน้ารายงานรายการไฟล์ที่โหลดไปก่อน worker
  จะคุมหน้า worker เก็บที่ยังไม่มี (ดึงด้วย `cache: 'force-cache'` จึงได้จาก
  HTTP cache ของเบราว์เซอร์ — Pages ส่ง `max-age=600`) ครั้งแรกเข้าครั้งเดียว
  ครั้งต่อไปก็มาจาก cache แล้ว
- `FILES` ใน `sw.js` คือ hash เนื้อไฟล์ของทุกไฟล์ใน build ทุก deploy ได้
  cache ใหม่ และตอน install/activate จะยกไฟล์ที่ hash ไม่เปลี่ยนมาจาก cache
  เก่า — deploy ที่แก้ไฟล์เดียว ผู้ใช้ที่กลับมาดาวน์โหลดแค่ `sw.js` กับไฟล์นั้น
  (ทดสอบแล้ว) ไม่ใช่ทั้งเลน
- `sw.js`, `version.json` และ stub ของ Flutter ไม่อยู่ใน `FILES` เพื่อให้การ
  เช็คอัปเดตของเบราว์เซอร์เห็นของจริงเสมอ stub ยังอยู่ใน `dist/m` เพราะมันคือ
  ตัวที่ปลด worker ที่ Flutter รุ่นเก่าเคย register ไว้บนเครื่องผู้ใช้

| `node tools/perf.mjs --lane m` | ก่อน | หลัง |
|---|---|---|
| reload | 13.8 MB, ~5 s | 0.0 MB, ~0.6 s |
| โหลดครั้งแรก (`--pages-cache`, header แบบ Pages) | 13.9 MB | 12.6 MB (รวม shell 0.7 MB) |
| โหลดครั้งแรก (server ของ repo, `no-store`) | 13.9 MB | 22.9 MB |

แถวสุดท้ายคือราคาที่ต้องรู้: Flutter ขอ engine ห่างจาก `sw.js` ไม่กี่ ms
ไม่มี worker ตัวไหน active ทันในการเข้าครั้งแรก ไฟล์ชุดนั้นจึงต้องถูกดึงซ้ำ
หนึ่งครั้งเพื่อเข้า cache — บน Pages ได้จาก HTTP cache (แถวที่สอง) บน host
ที่ห้าม cache (`tools/serve.mjs` ตั้ง `no-store` เพื่อให้ verify เห็น build
ล่าสุดเสมอ) จึงเป็นการดาวน์โหลดซ้ำ `perf.mjs` นับ byte ที่ฝั่ง server
เพราะ `transferSize` ของหน้าเป็น 0 สำหรับทุกอย่างที่ worker ตอบ แม้ worker
จะไปดึงจาก network มาเอง

## 11. ตรวจว่าใช้ได้จริง

`npm run verify` เปิดไซต์ที่ build แล้วด้วย Chromium จริง แล้วเดินจริงทั้งเส้น:
ผ่าน wizard → สร้าง Nexus → สร้าง module → export `.ddx` (เช็ค header ว่าเป็น
`SQLite format 3`) → เลือกไฟล์เข้ามา → **reload** → ยืนยันว่าข้อมูลยังอยู่
ข้อสุดท้ายคือข้อที่สำคัญที่สุด เพราะมันจะจริงได้ก็ต่อเมื่อ sqlite ทำงานจริงและ
virtual filesystem ลง IndexedDB จริงเท่านั้น สกรีนช็อตทุกขั้นอยู่ใน `.verify/`
