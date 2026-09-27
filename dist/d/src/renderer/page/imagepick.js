'use strict';
// ═══ Choosing a picture (Procress 14, APP docs/EXPORT-DECOR.md D4) ═════
// One picker for every block that shows a Nexus file: search by name,
// narrow to one module, the ones picked last first, thumbnails from the
// proxy the vault keeps (fast, and there even when the original moved) —
// and "Import new…" right here, through main's own dialog, the new file
// selected as soon as it lands. The media blocks (MEDIA-EMBED) use the same
// picker for video, audio, PDF and models (opts.cls).
//
// A focal point — where a cover or banner keeps its subject when cropped —
// is set by clicking the picture (pbFocusPicker); it is stored as
// {x, y} percentages and drawn as object-position.

const PB_CLASS_EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
  video: ['mp4', 'webm', 'mov', 'mkv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
  pdf: ['pdf'],
  model: ['glb', 'gltf', 'stl', 'obj'],
  track: ['vtt'],
};
const pbFileClass = (type) => Object.keys(PB_CLASS_EXT).find((c) => PB_CLASS_EXT[c].includes(String(type || '').toLowerCase())) || null;
const pbFileId = (ref) => { const m = /^file_(\d+)$/.exec(String(ref || '')); return m ? Number(m[1]) : null; };

const PB_IMG_RECENT = 'ddx.imageRecent';
function pbImgRecent() {
  try { const v = JSON.parse(localStorage.getItem(PB_IMG_RECENT) || '[]'); return Array.isArray(v) ? v.filter(Number.isInteger).slice(0, 12) : []; } catch (_) { return []; }
}
function pbImgRecentPush(ids) {
  try { localStorage.setItem(PB_IMG_RECENT, JSON.stringify([...ids, ...pbImgRecent().filter((i) => !ids.includes(i))].slice(0, 12))); } catch (_) { /* no storage */ }
}

let _pbImg = null; // { cls, multi, sel: [], onPick, query, module, files, moduleId }

// opts: { cls = 'image', multi, selected: [ids], moduleId (import files it
// here), onPick(ids) }
async function openPbImagePicker(opts = {}) {
  if (!S.nexus) return;
  _pbImg = { cls: opts.cls || 'image', multi: !!opts.multi, sel: [...(opts.selected || [])], onPick: opts.onPick, query: '', module: '', files: null, moduleId: opts.moduleId ?? null };
  openModal(t(_pbImg.cls === 'image' ? 'pbChooseImage' : 'pbChooseFile'), `<div id="pb-imgpick" class="pb-imgpick"><p class="drafter-hint">${t('loading')}</p></div>`);
  await pbImgLoad();
  pbImgRender();
}

async function pbImgLoad() {
  const rows = (await api.importdock.list(S.nexus.id)) || [];
  if (!_pbImg) return;
  const want = _pbImg.cls === 'media' ? ['image', 'video', 'model'] : [_pbImg.cls];
  _pbImg.files = rows.filter((r) => r.source_kind === 'file' && want.includes(pbFileClass(r.file_type)));
}

function pbImgThumb(f) {
  // a picture — or a PDF / model / video that already has a poster
  if (pbFileClass(f.file_type) !== 'image' && !f.has_proxy) return `<span class="pb-img-kind">${x(String(f.file_type || '').toUpperCase())}</span>`;
  // the proxy first — small and fast; the original if there is none yet
  return `<img src="${displayImageUrl(f.id)}${f.has_proxy ? '?proxy=1' : ''}" loading="lazy" alt="" onerror="queueDisplayImageFallback(this,${f.id})">`;
}

function pbImgRender() {
  const el = q('#pb-imgpick');
  if (!el || !_pbImg) return;
  const s = _pbImg;
  const qy = s.query.trim().toLowerCase();
  const list = (s.files || []).filter((f) => (!s.module || String(f.module_ref ?? '') === s.module) && (!qy || String(f.file_name).toLowerCase().includes(qy)));
  const recent = pbImgRecent().map((id) => (s.files || []).find((f) => f.id === id)).filter(Boolean);
  const mods = [...new Set((s.files || []).map((f) => f.module_ref).filter((m) => m != null))].map((id) => findModuleNode(id)).filter(Boolean);
  const cell = (f) => `<div class="pb-img-pick${s.sel.includes(f.id) ? ' on' : ''}" role="${s.multi ? 'checkbox' : 'button'}" tabindex="0"
      aria-${s.multi ? 'checked' : 'pressed'}="${s.sel.includes(f.id)}" title="${x(f.file_name)}"
      onclick="pbImgToggle(${f.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pbImgToggle(${f.id})}">
      ${pbImgThumb(f)}<span class="pb-img-name" data-no-i18n>${x(f.file_name)}</span>${f.missing ? `<span class="pb-img-miss" title="${x(t('pbFileMissing'))}">!</span>` : ''}</div>`;
  el.innerHTML = `<div class="pb-imgpick-bar">
      <input type="search" value="${x(s.query)}" placeholder="${x(t('search'))}" aria-label="${x(t('search'))}"
        oninput="_pbImg.query=this.value;clearTimeout(this._t);this._t=setTimeout(()=>{pbImgRender();const i=q('#pb-imgpick input[type=search]');i.focus();i.setSelectionRange(i.value.length,i.value.length)},150)">
      <select aria-label="${x(t('pbImgModule'))}" onchange="_pbImg.module=this.value;pbImgRender()"><option value="">${t('pbImgAllModules')}</option>
        ${mods.map((m) => `<option value="${m.id}"${s.module === String(m.id) ? ' selected' : ''}>${x(m.name)}</option>`).join('')}</select>
      <button class="btn btn-s btn-sm" onclick="pbImgImport()">${I.import} ${t(s.cls === 'image' ? 'pbImportPicture' : 'pbImportFile')}</button>
    </div>
    ${recent.length && !qy && !s.module ? `<h6>${t('iconRecent')}</h6><div class="pb-img-grid">${recent.map(cell).join('')}</div><h6>${t('pbImgAll')}</h6>` : ''}
    <div class="pb-img-grid">${list.map(cell).join('') || `<p class="drafter-hint">${t(s.files?.length ? 'pbNoMatch' : 'pbNoImages')}</p>`}</div>
    ${s.multi ? `<div class="mfoot"><span class="drafter-hint">${s.sel.length} ${t('pbSelected')}</span>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="pbImgDone()"${s.sel.length ? '' : ' disabled'}>${t('pbUseSelected')}</button></div>` : ''}`;
}

function pbImgToggle(id) {
  if (!_pbImg) return;
  if (!_pbImg.multi) { _pbImg.sel = [id]; pbImgDone(); return; }
  _pbImg.sel = _pbImg.sel.includes(id) ? _pbImg.sel.filter((i) => i !== id) : [..._pbImg.sel, id];
  pbImgRender();
}

function pbImgDone() {
  const s = _pbImg;
  if (!s) return;
  _pbImg = null;
  closeModal();
  pbImgRecentPush(s.sel);
  if (s.onPick) s.onPick(s.sel);
}

// "Import new…": main's dialog, only this class of file, filed under the
// page's module; what came in is selected.
async function pbImgImport() {
  const s = _pbImg;
  if (!s) return;
  const r = await api.importdock.pickFiles(S.nexus.id, s.moduleId, s.cls === 'pdf' ? 'doc' : s.cls);
  if (!r?.ids?.length || _pbImg !== s) return;
  await pbImgLoad();
  if (typeof reloadNestAssets === 'function') reloadNestAssets();
  s.sel = s.multi ? [...new Set([...s.sel, ...r.ids])] : [r.ids[0]];
  if (!s.multi) { pbImgDone(); return; }
  pbImgRender();
}

// ── focal point ─────────────────────────────────────────────────────────
const pbFocusOf = (v) => {
  const x2 = Number(v?.x), y2 = Number(v?.y);
  return Number.isFinite(x2) && Number.isFinite(y2) ? { x: Math.min(100, Math.max(0, Math.round(x2))), y: Math.min(100, Math.max(0, Math.round(y2))) } : { x: 50, y: 50 };
};
const pbFocusCss = (v) => { const f = pbFocusOf(v); return `${f.x}% ${f.y}%`; };

let _pbFocus = null;
function pbFocusPicker(fileId, cur, onSet) {
  _pbFocus = { onSet, f: pbFocusOf(cur) };
  openModal(t('pbFocusTitle'), `<p class="drafter-hint">${t('pbFocusHint')}</p>
    <div class="pb-focus" onclick="pbFocusClick(event)">
      <img src="${displayImageUrl(fileId)}" alt="" onerror="queueDisplayImageFallback(this,${fileId})">
      <span class="pb-focus-dot" style="left:${_pbFocus.f.x}%;top:${_pbFocus.f.y}%"></span></div>
    <div class="mfoot"><button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="pbFocusSave()">${t('save')}</button></div>`);
}
function pbFocusClick(e) {
  const img = e.currentTarget.querySelector('img');
  const r = img.getBoundingClientRect();
  if (!_pbFocus || !r.width) return;
  _pbFocus.f = pbFocusOf({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  const dot = e.currentTarget.querySelector('.pb-focus-dot');
  dot.style.left = `${_pbFocus.f.x}%`;
  dot.style.top = `${_pbFocus.f.y}%`;
}
function pbFocusSave() {
  const s = _pbFocus;
  _pbFocus = null;
  closeModal();
  if (s?.onSet) s.onSet(s.f);
}
