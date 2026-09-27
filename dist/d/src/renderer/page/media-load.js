'use strict';
// ═══ Loading what a media block needs (Procress 14, MEDIA-EMBED M4/M5) ══
// pdf.js 3.11.174 and three.js r147 (+ its GLTF/STL/OBJ loaders and
// OrbitControls) are vendored under electron/vendor/, like d3 and Konva —
// but loaded only when a page first shows a PDF or a model, since together
// they are ~2 MB of script most pages never need. Both are the last
// releases that ship classic (non-module) builds, which is what the rest
// of the renderer is.
//
// Bytes come from main (importdock:readBinary) and are parsed in place:
// nothing is ever fetched, so the CSP keeps connect-src 'none'. The pdf.js
// worker is a file of the app, which script-src 'self' already allows (CSP
// has no worker-src, so it falls back to script-src).

const _pbScripts = new Map(); // src → Promise
function pbLoadScript(src) {
  if (_pbScripts.has(src)) return _pbScripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { _pbScripts.delete(src); reject(new Error(`load failed: ${src}`)); };
    document.head.appendChild(s);
  });
  _pbScripts.set(src, p);
  return p;
}

async function pbPdfLib() {
  await pbLoadScript('vendor/pdfjs/pdf.min.js');
  const lib = window.pdfjsLib;
  if (lib && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  return lib;
}

async function pbThree() {
  await pbLoadScript('vendor/three/three.min.js');
  await Promise.all(['GLTFLoader', 'STLLoader', 'OBJLoader', 'OrbitControls'].map((n) => pbLoadScript(`vendor/three/${n}.js`)));
  return window.THREE;
}

// importdock:readBinary's bytes, whatever shape the IPC delivered them in.
function pbBytes(r) {
  const d = r?.data;
  if (!d) return null;
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (Array.isArray(d?.data)) return new Uint8Array(d.data);
  if (typeof d === 'object') return new Uint8Array(Object.values(d));
  return null;
}

// The first page / the model's first frame, kept as the file's proxy so the
// picker, the Nest and exports have a picture of it. Main refuses a second
// one and anything that is not a small JPEG.
function pbSavePoster(fileId, canvas) {
  try {
    const max = 512;
    const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * k));
    c.height = Math.max(1, Math.round(canvas.height * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white'; // paper: a JPEG has no transparency
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.6, 0.4]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length * 0.75 < 190 * 1024) { api.importdock.setPoster(fileId, url); return; }
    }
  } catch (_) { /* a tainted or empty canvas: no poster, the class icon stays */ }
}

const pbMediaError = (code) => `<div class="pc-media-err">${I.info} ${t({ too_large: 'pcMediaTooLarge', missing: 'pbFileMissing', type: 'pcMediaType', external: 'pcModelExternal', password: 'pcPdfPassword' }[code] || 'pcLoadFailed')}</div>`;

// ── glTF: one file, nothing outside it (MEDIA-EMBED M5) ─────────────────
// A .gltf may carry its buffers and images as data: URIs; anything else — a
// sibling .bin, a texture file, an http(s) address — would be a read outside
// the file, and is refused with a note to export a .glb instead. → the list
// of offending URIs (empty = fine).
function pbGltfExternalUris(json) {
  const out = [];
  for (const list of [json?.buffers, json?.images]) {
    for (const it of Array.isArray(list) ? list : []) {
      if (it && typeof it.uri === 'string' && !/^data:[^,]*;base64,/i.test(it.uri)) out.push(it.uri);
    }
  }
  return out;
}

// data:…;base64,… → ArrayBuffer (a .gltf's embedded buffer). three's
// FileLoader would fetch() it, and connect-src 'none' forbids that, so
// the decoded bytes are handed to THREE.Cache under the same URI instead.
function pbDataUriBytes(uri) {
  const m = /^data:[^,]*;base64,(.*)$/is.exec(String(uri || ''));
  if (!m) return null;
  const bin = atob(m[1].replace(/\s+/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
