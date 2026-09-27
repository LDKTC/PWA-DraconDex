'use strict';
// ═══ Media on a page (Procress 14, APP docs/MEDIA-EMBED.md M1–M4, M6) ══
// Video and audio play straight from ddx-file:// — the protocol already
// streams with Range, so a 2 GB film seeks without being read whole. A PDF
// is drawn page by page with pdf.js from bytes main hands over; a 3D model
// is in media-3d.js. core.media mixes pictures, videos and models in one
// grid. Every file is a file_<id> in config.opts, chosen with the picture
// picker filtered to its class (page/imagepick.js).

const pcFileUrl = (id, frag = '') => `${displayImageUrl(id)}${frag}`;
const pcNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── Video: poster, a trimmed range, loop, muted autoplay, subtitles ─────
registerComponent('core.video', {
  kind: 'core', labelKey: 'pcVideo',
  options: () => [
    { key: 'file', type: 'image', cls: 'video', label: 'pcVideo' },
    { key: 'poster', type: 'image', label: 'pcOptPoster' },
    { key: 'posterAt', type: 'number', label: 'pcOptPosterAt', min: 0, max: 86400 },
    { key: 'start', type: 'number', label: 'pcOptClipStart', min: 0, max: 86400 },
    { key: 'end', type: 'number', label: 'pcOptClipEnd', min: 0, max: 86400 },
    { key: 'loop', type: 'toggle', label: 'pcOptLoop', default: false },
    { key: 'autoplay', type: 'toggle', label: 'pcOptAutoplay', default: false },
    { key: 'track', type: 'image', cls: 'track', label: 'pcOptSubtitles' },
    { key: 'caption', type: 'text', label: 'pcOptCaption', max: 200 },
  ],
  render: (c) => {
    const id = pbFileId(pbOpt(c, 'file'));
    if (!id) return pcPickHint(c, 'pcMediaEmpty');
    const start = pcNum(pbOpt(c, 'start'));
    const end = pcNum(pbOpt(c, 'end'));
    const at = pcNum(pbOpt(c, 'posterAt'));
    // a media fragment: where playing starts (or, with no poster picture,
    // which frame the still shows)
    const frag = start != null || end != null ? `#t=${start ?? 0}${end != null ? `,${end}` : ''}` : at != null ? `#t=${at}` : '';
    const poster = pbFileId(pbOpt(c, 'poster'));
    const track = pbFileId(pbOpt(c, 'track'));
    const auto = pbOpt(c, 'autoplay');
    const cap = pbOpt(c, 'caption');
    return `<figure class="pc-video">
      <video controls preload="metadata" src="${pcFileUrl(id, frag)}"${poster ? ` poster="${pcFileUrl(poster)}"` : ''}${auto ? ' autoplay muted playsinline' : ''}>
        ${track ? `<track kind="subtitles" src="${pcFileUrl(track)}" default>` : ''}</video>
      ${cap ? `<figcaption data-no-i18n>${x(cap)}</figcaption>` : ''}</figure>`;
  },
  // the trimmed range, looped: a fragment only says where to start
  mount: (c) => {
    const v = c.root.querySelector('.pc-video video');
    if (!v) return;
    const start = pcNum(pbOpt(c, 'start')) ?? 0;
    const end = pcNum(pbOpt(c, 'end'));
    const loop = pbOpt(c, 'loop');
    if (end == null) { v.loop = !!loop; return; }
    v.addEventListener('timeupdate', () => {
      if (v.currentTime < end) return;
      if (loop) { v.currentTime = start; v.play().catch(() => {}); } else v.pause();
    });
  },
});

// ── Audio: one track, or a playlist; a cover and a title ────────────────
registerFilled('core.audio', {
  kind: 'core', labelKey: 'pcAudio', needsSource: false,
  options: () => [
    { key: 'files', type: 'images', cls: 'audio', label: 'pcAudio' },
    { key: 'title', type: 'text', label: 'pbHeaderTitle', max: 120 },
    { key: 'cover', type: 'image', label: 'pcOptCover' },
    { key: 'loop', type: 'toggle', label: 'pcOptLoop', default: false },
  ],
}, async (c) => {
  const ids = (pbOpt(c, 'files') || []).map(pbFileId).filter(Boolean);
  if (!ids.length) return pcPickHint(c, 'pcMediaEmpty');
  const rows = await Promise.all(ids.map((id) => api.importdock.get(id).catch(() => null)));
  const tracks = ids.map((id, i) => ({ id, name: rows[i]?.file_name || `#${id}` }));
  const cover = pbFileId(pbOpt(c, 'cover'));
  const title = pbOpt(c, 'title') || '';
  const on = Math.min(tracks.length - 1, c.state.track ?? 0);
  return `<div class="pc-audio" data-iid="${x(c.iid)}">
    ${cover ? pcImgTag(cover, 'pc-audio-cover') : `<span class="pc-audio-cover pc-audio-icon" aria-hidden="true">♪</span>`}
    <div class="pc-audio-main">
      ${title ? `<div class="pc-audio-title" data-no-i18n>${x(title)}</div>` : ''}
      <div class="pc-audio-now" data-no-i18n>${x(tracks[on].name)}</div>
      <audio controls preload="metadata" src="${pcFileUrl(tracks[on].id)}"${pbOpt(c, 'loop') && tracks.length === 1 ? ' loop' : ''}
        onended="pcAudioNext(${xj(c.iid)},${xv(tracks.map((tk) => tk.id))},${pbOpt(c, 'loop') ? 1 : 0})"></audio>
      ${tracks.length > 1 ? `<ol class="pc-audio-list">${tracks.map((tk, i) => `<li class="${i === on ? 'on' : ''}" role="button" tabindex="0"
        onclick="pcAudioPlay(${xj(c.iid)},${xv(tracks.map((t2) => t2.id))},${i})"
        onkeydown="if(event.key==='Enter'){event.preventDefault();pcAudioPlay(${xj(c.iid)},${xv(tracks.map((t2) => t2.id))},${i})}" data-no-i18n>${x(tk.name)}</li>`).join('')}</ol>` : ''}
    </div></div>`;
});
function pcAudioPlay(iid, ids, i) {
  const box = pbRoot(iid)?.querySelector('.pc-audio');
  const a = box?.querySelector('audio');
  if (!a || ids[i] == null) return;
  pbState(iid).track = i;
  a.src = pcFileUrl(ids[i]);
  a.play().catch(() => {});
  box.querySelectorAll('.pc-audio-list li').forEach((li, j) => li.classList.toggle('on', j === i));
  const now = box.querySelector('.pc-audio-now');
  const li = box.querySelectorAll('.pc-audio-list li')[i];
  if (now && li) now.textContent = li.textContent;
}
function pcAudioNext(iid, ids, loop) {
  if (ids.length < 2) return;
  const i = (pbState(iid).track ?? 0) + 1;
  if (i < ids.length) pcAudioPlay(iid, ids, i); else if (loop) pcAudioPlay(iid, ids, 0);
}

// ── PDF: pages drawn with pdf.js, one at a time or as a strip ───────────
const PC_PDF = new Map(); // iid → { doc, id }
PB_DISPOSERS.push((iid) => { PC_PDF.get(iid)?.doc?.destroy?.(); PC_PDF.delete(iid); });

registerComponent('core.pdf', {
  kind: 'core', labelKey: 'pcPdf',
  options: () => [
    { key: 'file', type: 'image', cls: 'pdf', label: 'pcPdf' },
    { key: 'page', type: 'number', label: 'pcOptStartPage', min: 1, max: 100000, default: 1 },
    { key: 'layout', type: 'select', label: 'pcOptLayout', choices: ['single', 'strip'], default: 'single', choiceKey: (v) => `pcPdf${pbCap(v)}` },
  ],
  render: (c) => {
    const id = pbFileId(pbOpt(c, 'file'));
    if (!id) return pcPickHint(c, 'pcMediaEmpty');
    return `<div class="pc-pdf" data-layout="${pbOpt(c, 'layout')}">
      <div class="pc-pdf-bar">
        <button class="btn btn-g btn-i" onclick="pcPdfStep(${xj(c.iid)},-1)" aria-label="${t('pbPrev')}">${I.chevronLeft}</button>
        <span class="pc-pdf-n" data-no-i18n>…</span>
        <button class="btn btn-g btn-i" onclick="pcPdfStep(${xj(c.iid)},1)" aria-label="${t('pbNext')}">${I.chevronRight}</button>
        <span class="pc-pdf-grow"></span>
        <button class="btn btn-g btn-sm" onclick="pcPdfFull(${xj(c.iid)})">${t('pcPdfFull')}</button>
        <button class="btn btn-g btn-sm" onclick="api.importdock.openPath(${id})">${t('pcOpenExternal')} ↗</button>
      </div>
      <div class="pc-pdf-body"><div class="pc-loading">${t('loading')}</div></div>
      <img class="pc-pdf-poster" src="${pcImgSrc(id, true)}" alt="" onerror="this.remove()"></div>`;
  },
  mount: (c) => { pcPdfMount(c).catch((e) => { console.error('pdf block:', e); pcPdfFail(c, 'failed'); }); },
});

function pcPdfFail(c, code) {
  const body = c.root?.querySelector('.pc-pdf-body');
  if (body) body.innerHTML = pbMediaError(code);
}

async function pcPdfMount(c) {
  const id = pbFileId(pbOpt(c, 'file'));
  const prev = PC_PDF.get(c.iid);
  let doc = prev?.id === id ? prev.doc : null;
  if (!doc) {
    prev?.doc?.destroy?.();
    const r = await api.importdock.readBinary(id);
    if (!r?.ok) { pcPdfFail(c, r?.error); return; }
    const lib = await pbPdfLib();
    try {
      doc = await lib.getDocument({ data: pbBytes(r), isEvalSupported: false, useSystemFonts: true }).promise;
    } catch (e) {
      pcPdfFail(c, e?.name === 'PasswordException' ? 'password' : 'failed');
      return;
    }
    PC_PDF.set(c.iid, { doc, id });
  }
  const st = c.state;
  st.page = Math.min(doc.numPages, Math.max(1, st.page ?? (Number(pbOpt(c, 'page')) || 1)));
  if (pbOpt(c, 'layout') === 'strip') await pcPdfStrip(c, doc, id);
  else await pcPdfShow(c.iid);
}

// One page into a canvas as wide as its box (sharp at the screen's scale).
async function pcPdfPaint(doc, n, canvas, width, maxHeight = Infinity) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.min(width, (maxHeight * base.width) / base.height); // a whole page in view
  const vp = page.getViewport({ scale: (w / base.width) * dpr });
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  canvas.style.width = `${Math.round(vp.width / dpr)}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

async function pcPdfShow(iid) {
  const root = pbRoot(iid);
  const s = PC_PDF.get(iid);
  const body = root?.querySelector('.pc-pdf-body');
  if (!s || !body) return;
  const n = pbState(iid).page || 1;
  body.innerHTML = '<canvas class="pc-pdf-page"></canvas>';
  const canvas = body.firstChild;
  await pcPdfPaint(s.doc, n, canvas, Math.min(900, (body.clientWidth || 620) - 20), window.innerHeight * 0.7);
  const lbl = root.querySelector('.pc-pdf-n');
  if (lbl) lbl.textContent = `${n} / ${s.doc.numPages}`;
  if (n === 1) pcPosterOnce(s.id, canvas);
}

// Every page as a thumbnail, drawn as it scrolls into view.
async function pcPdfStrip(c, doc, id) {
  const body = c.root.querySelector('.pc-pdf-body');
  const lbl = c.root.querySelector('.pc-pdf-n');
  if (lbl) lbl.textContent = `${doc.numPages}`;
  const n = Math.min(doc.numPages, 200);
  body.innerHTML = `<div class="pc-pdf-strip">${Array.from({ length: n }, (_, i) =>
    `<div class="pc-pdf-thumb" role="button" tabindex="0" data-p="${i + 1}" onclick="pbState(${xj(c.iid)}).page=${i + 1};pcPdfFull(${xj(c.iid)})"><canvas></canvas><span data-no-i18n>${i + 1}</span></div>`).join('')}</div>`;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || e.target.dataset.drawn) continue;
      e.target.dataset.drawn = '1';
      const p = Number(e.target.dataset.p);
      const cv = e.target.querySelector('canvas');
      pcPdfPaint(doc, p, cv, 140).then(() => { if (p === 1) pcPosterOnce(id, cv); }).catch(() => {});
    }
  }, { root: body.querySelector('.pc-pdf-strip'), rootMargin: '0px 200px' });
  body.querySelectorAll('.pc-pdf-thumb').forEach((el) => io.observe(el));
}

function pcPdfStep(iid, d) {
  const s = PC_PDF.get(iid);
  if (!s) return;
  const st = pbState(iid);
  st.page = Math.min(s.doc.numPages, Math.max(1, (st.page || 1) + d));
  pcPdfShow(iid);
}

// The page large, over the window — the lightbox's frame, a canvas inside.
async function pcPdfFull(iid) {
  const s = PC_PDF.get(iid);
  if (!s) return;
  pbLightboxClose();
  const el = document.createElement('div');
  el.id = 'pb-lightbox';
  el.className = 'pb-lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  _pbLb = { ids: [], i: 0, pdf: iid };
  const draw = async () => {
    const n = pbState(iid).page || 1;
    el.innerHTML = `<canvas class="pb-lb-img"></canvas>
      <button class="btn btn-g btn-i pb-lb-close" onclick="pbLightboxClose()" aria-label="${t('close')}">${I.close}</button>
      <button class="btn btn-g btn-i pb-lb-prev" onclick="pcPdfFullStep(-1)" aria-label="${t('pbPrev')}">${I.chevronLeft}</button>
      <button class="btn btn-g btn-i pb-lb-next" onclick="pcPdfFullStep(1)" aria-label="${t('pbNext')}">${I.chevronRight}</button>
      <span class="pb-lb-n" data-no-i18n>${n} / ${s.doc.numPages}</span>`;
    await pcPdfPaint(s.doc, n, el.querySelector('canvas'), Math.min(window.innerWidth * 0.9, 1100), window.innerHeight * 0.88);
  };
  _pbLb.draw = draw;
  await draw();
}
function pcPdfFullStep(d) {
  const iid = _pbLb?.pdf;
  const s = iid && PC_PDF.get(iid);
  if (!s) return;
  const st = pbState(iid);
  st.page = Math.min(s.doc.numPages, Math.max(1, (st.page || 1) + d));
  _pbLb.draw();
}

// A poster for the file once per session (main keeps the first one).
const _pcPosterDone = new Set();
function pcPosterOnce(id, canvas) {
  if (_pcPosterDone.has(id)) return;
  _pcPosterDone.add(id);
  pbSavePoster(id, canvas);
}

// ── Mixed media: pictures, videos and models in one grid ────────────────
registerFilled('core.media', {
  kind: 'core', labelKey: 'pcMedia', needsSource: false,
  options: () => [
    { key: 'files', type: 'images', cls: 'media', label: 'pcMedia' },
    { key: 'layout', type: 'select', label: 'pcOptLayout', choices: ['grid', 'strip'], default: 'grid', choiceKey: (v) => `pcGal${pbCap(v)}` },
    { key: 'cols', type: 'select', label: 'pbColumns', choices: ['2', '3', '4', '5'], default: '3' },
  ],
}, async (c) => {
  const ids = (pbOpt(c, 'files') || []).map(pbFileId).filter(Boolean);
  if (!ids.length) return pcPickHint(c, 'pcMediaEmpty');
  const rows = await Promise.all(ids.map((id) => api.importdock.get(id).catch(() => null)));
  const items = ids.map((id, i) => ({ id, cls: pbFileClass(rows[i]?.file_type), name: rows[i]?.file_name || '', proxy: !!rows[i]?.has_proxy }))
    .filter((it) => ['image', 'video', 'model'].includes(it.cls));
  const all = xv(items.map((it) => ({ id: it.id, cls: it.cls })));
  return `<div class="pc-gallery pc-media" data-layout="${pbOpt(c, 'layout')}" style="--cols:${Number(pbOpt(c, 'cols'))}">${items.map((it, i) => `<figure class="pc-gal-item" data-cls="${it.cls}"
      role="button" tabindex="0" onclick="pbMediaBox(${all},${i})" onkeydown="if(event.key==='Enter'){event.preventDefault();pbMediaBox(${all},${i})}">
      ${it.cls === 'image' ? pcImgTag(it.id, '', '', it.name)
        : it.cls === 'video' ? `<video preload="metadata" muted src="${pcFileUrl(it.id, '#t=1')}"></video><span class="pc-media-badge" aria-hidden="true">▶</span>`
          : `${it.proxy ? `<img src="${pcImgSrc(it.id, true)}" alt="">` : `<span class="pc-media-3d">${I.layer}</span>`}<span class="pc-media-badge" aria-hidden="true">3D</span>`}
    </figure>`).join('')}</div>`;
});

// The lightbox for mixed media: a picture, a playing video, or a model.
function pbMediaBox(items, i) {
  const it = items[i];
  if (!it) return;
  if (it.cls === 'image') { pbLightbox(items.filter((x2) => x2.cls === 'image').map((x2) => x2.id), items.filter((x2) => x2.cls === 'image').indexOf(it)); return; }
  pbLightboxClose();
  const el = document.createElement('div');
  el.id = 'pb-lightbox';
  el.className = 'pb-lightbox';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.addEventListener('click', (e) => { if (e.target === el) pbLightboxClose(); });
  el.innerHTML = `${it.cls === 'video' ? `<video class="pb-lb-img" controls autoplay src="${pcFileUrl(it.id)}"></video>`
    : '<div class="pb-lb-3d"></div>'}
    <button class="btn btn-g btn-i pb-lb-close" onclick="pbLightboxClose()" aria-label="${t('close')}">${I.close}</button>`;
  document.body.appendChild(el);
  _pbLb = { ids: [], i: 0 };
  if (it.cls === 'model' && typeof pc3dView === 'function') pc3dView(el.querySelector('.pb-lb-3d'), it.id, { autoRotate: true }).catch(() => {});
}
