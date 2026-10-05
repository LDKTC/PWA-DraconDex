'use strict';
// Electron's file dialogs, mapped onto what a browser actually has.
//
// SAVE: there is no "pick a path" step. The handler is handed a path inside
// the virtual filesystem's download folder, writes its .ddx/.md/.zip there
// exactly as it would on the desktop, and the bridge then hands the finished
// bytes to the browser as a download and drops them from the VFS (see
// drainDownloads below) — so the upstream export code is untouched.
//
// OPEN: a real <input type="file">. The chosen file is copied into the virtual
// filesystem and its virtual path returned, so import paths that go on to
// readFileSync/copyFileSync it keep working. Directory picking uses
// webkitdirectory, which is what importdock's "add a folder" needs.
import { basename, join } from './path.js';
import vfs from './vfs.js';

export const DOWNLOAD_DIR = '/ddx/downloads';
export const UPLOAD_DIR = '/ddx/uploads';

const pendingDownloads = new Set();
let counter = 0;

const sanitize = (name) => String(name || 'dracondex').replace(/[\\/:*?"<>|]/g, '_');

export function showSaveDialog(_win, options = {}) {
  const suggested = sanitize(basename(options.defaultPath || 'dracondex-export'));
  const filePath = join(DOWNLOAD_DIR, `${counter++}-${suggested}`);
  pendingDownloads.add(filePath);
  return Promise.resolve({ canceled: false, filePath });
}

function accepts(filters) {
  const exts = (filters || []).flatMap((f) => f.extensions || []).filter((e) => e && e !== '*');
  return exts.length ? exts.map((e) => `.${e}`).join(',') : '';
}

function pick({ directory = false, multi = false, accept = '' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (directory) input.webkitdirectory = true;
    if (multi) input.multiple = true;
    if (accept && !directory) input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    // 'cancel' is not universally fired; the focus fallback keeps the promise
    // from hanging forever when someone dismisses the picker.
    let settled = false;
    const done = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...input.files]));
    input.addEventListener('cancel', () => done([]));
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) done([]); }, 1500), { once: true });
    input.click();
  });
}

export async function showOpenDialog(_win, options = {}) {
  const properties = options.properties || [];
  const directory = properties.includes('openDirectory');
  const accept = accepts(options.filters);
  // A module file is a pair since DraconDex 16 part 3a (.ddata + .dpage): let
  // both be picked, so they land side by side and the app reads them as one.
  const pair = /\.ddata\b/.test(accept);
  const files = await pick({
    directory,
    multi: properties.includes('multiSelections') || pair,
    accept,
  });
  if (pair) files.sort((a, b) => Number(b.name.endsWith('.ddata')) - Number(a.name.endsWith('.ddata')));
  if (!files.length) return { canceled: true, filePaths: [] };

  const stamp = `${Date.now()}-${counter++}`;
  const paths = [];
  let rootDir = null;
  for (const file of files) {
    // webkitRelativePath keeps the folder structure a directory pick came with.
    const rel = file.webkitRelativePath || file.name;
    const target = join(UPLOAD_DIR, stamp, rel);
    vfs.write(target, new Uint8Array(await file.arrayBuffer()));
    paths.push(target);
    if (directory && !rootDir) rootDir = join(UPLOAD_DIR, stamp, rel.split('/')[0]);
  }
  return { canceled: false, filePaths: directory ? [rootDir] : paths };
}

// Anything a save-dialog path actually received bytes at is handed to the
// browser and then dropped: keeping export copies in IndexedDB would double
// every vault the user ever backs up.
//
// Two ways to hand it over, in order of how close they are to the desktop
// experience:
//   1. showSaveFilePicker — a real "where do you want this?" dialog, which is
//      what the app's own code thinks it just showed. Needs the click that
//      started this to still count as user activation, which it does: the
//      export finishes in well under the browser's activation window.
//   2. a download link — everywhere else. Note that Chromium drops a
//      non-ASCII `download` filename on a blob URL (measured, with a Thai
//      vault name), so this path also carries an ASCII fallback name rather
//      than letting the file arrive called "download".
async function handOver(path) {
  const bytes = vfs.read(path);
  if (!bytes) return;
  pendingDownloads.delete(path);
  const name = basename(path).replace(/^\d+-/, '');
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

  // __ddxForceDownloadLink is how tools/verify.mjs takes path 2: a headless
  // browser has nobody to answer a save dialog, so the picker would just hang
  // there and the export could never be checked end to end.
  if (!globalThis.__ddxForceDownloadLink && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: ext ? [{ description: `${ext.slice(1).toUpperCase()} file`, accept: { 'application/octet-stream': [ext] } }] : [],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      vfs.remove(path, false);
      return;
    } catch (err) {
      // The user said no. Don't then push the file at them anyway.
      if (err && err.name === 'AbortError') { vfs.remove(path, false); return; }
      // Anything else (no activation left, unsupported in this context) falls
      // through to the link below.
    }
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  // eslint-disable-next-line no-control-regex
  a.download = /^[\x20-\x7e]+$/.test(name) ? name : `dracondex-export-${new Date().toISOString().slice(0, 10)}${ext}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  // Removing the anchor in the same tick can cost the download its filename,
  // so let the click settle before tidying up.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 10000);
  vfs.remove(path, false);
}

export function drainDownloads() {
  for (const path of [...pendingDownloads]) {
    // A writer may put siblings beside the file it was given — a module's
    // .ddata comes with its .dpage (DraconDex Procress 16 part 3a). Same
    // name, other extension, same downloads folder: they go to the user too.
    const stem = path.replace(/\.[^./]+$/, '');
    for (const other of [...vfs.files.keys()]) {
      if (other !== path && other.startsWith(`${DOWNLOAD_DIR}/`) && other.startsWith(`${stem}.`)) handOver(other);
    }
    handOver(path);
  }
}

export function installDialogs(dialog) {
  dialog._save = showSaveDialog;
  dialog._open = showOpenDialog;
}

export default { showSaveDialog, showOpenDialog, drainDownloads, installDialogs, DOWNLOAD_DIR, UPLOAD_DIR };
