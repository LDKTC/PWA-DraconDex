'use strict';
// ═══ Icon Collection picker (progress.md Phase 5) ═════════════════════
// Embedded markup (no modal chrome of its own) used to pick a module's
// icon + color, with a live nest-row preview — hosted inside the module's
// live-save icon popup (openModuleIconPopup) and the object forms. Three
// working tabs — Icons (this app's `I.*` SVG dict), Symbols (the
// existing `symbol_collection`, already user-extendable via Navigator),
// and Uploaded (native <input type=file> + canvas circular crop, no libs).
//
// Selection is stored as `svg:<I-key>`, `sym:<glyph>` or `img:<dataURI>`
// in `module.icon`; see moduleIconHtml() in hub.js for how it's rendered
// back out.

// Procress 14 (EXPORT-DECOR D1): every icon in core/icon-catalog.js, by
// category and findable by word, instead of a hand-picked 32; an Emoji tab
// (stored as sym:, like a symbol); and the ones used last on top.

// Upload-crop module-scope state (iconpicker.js has no shared store beyond
// DOM queries — a few `let`s is the right amount of state for this).
let icropImg = null;       // loaded Image (or null before a file is picked)
let icropZoom = 1;         // 1..3
let icropPanX = 0;         // px offset, clamped to keep image covering the canvas
let icropPanY = 0;
let icropDragging = false;
let icropDragStartX = 0, icropDragStartY = 0;
let icropPanStartX = 0, icropPanStartY = 0;
const ICROP_CANVAS = 220;  // preview/crop canvas size
const ICROP_OUTPUT = 128;  // stored icon size

async function iconPicker(selIcon, selColorId, previewName, previewKind) {
  const symbols = await api.color.getSymbolCollection();
  const selImg = selIcon && selIcon.startsWith('img:') ? selIcon.slice(4) : null;
  const selKey = selIcon && selIcon.startsWith('svg:') ? selIcon.slice(4) : (selIcon && !selIcon.startsWith('sym:') && !selImg ? selIcon : null);
  const selSym = selIcon && selIcon.startsWith('sym:') ? selIcon.slice(4) : null;
  return `<div class="ipk-wrap">
    <div class="ipk-preview-row">
      <span class="pk">${t('preview')}</span>
      <div class="li" id="ipk-preview" style="pointer-events:none;display:inline-flex;width:auto">
        <span class="kicon" id="ipk-preview-icon" style="color:${x((S.colors.find(c=>c.id===selColorId)||{}).color_code || 'var(--accent)')}">${selSym ? `<span class="kicon-glyph">${x(selSym)}</span>` : (selImg ? `<img src="${x(selImg)}" class="icrop-preview-img">` : (I[selKey] || I.layer))}</span>
        <span class="name">${x(previewName||'')}</span>
        ${previewKind ? `<span class="kind">${x(previewKind)}</span>` : ''}
      </div>
    </div>
    <div class="ipk-tabs">
      <div class="ipk-tab active" data-ipktab="icons" onclick="switchIconPickerTab('icons')">${t('iconTabIcons')}</div>
      <div class="ipk-tab" data-ipktab="emoji" onclick="switchIconPickerTab('emoji')">${t('iconTabEmoji')}</div>
      <div class="ipk-tab" data-ipktab="symbols" onclick="switchIconPickerTab('symbols')">${t('iconTabSymbols')}</div>
      <div class="ipk-tab" data-ipktab="uploaded" onclick="switchIconPickerTab('uploaded')">${t('iconTabUploaded')}</div>
    </div>
    <div id="ipk-icon-pane">
      <input type="search" class="ipk-search" placeholder="${x(t('iconSearchPh'))}" aria-label="${x(t('iconSearchPh'))}" oninput="filterIconPicker(this.value)">
      ${iconRecent().length ? `<div class="ipk-recent"><span class="pk">${t('iconRecent')}</span>${iconRecent().map((r) => r.startsWith('sym:')
        ? `<div class="ipk-cell ipk-symbol${selSym === r.slice(4) ? ' sel' : ''}" onclick="pickIconPickerSymbol(this,${xj(r.slice(4))})">${x(r.slice(4))}</div>`
        : (I[r.slice(4)] ? `<div class="ipk-cell${selKey === r.slice(4) ? ' sel' : ''}" onclick="pickIconPickerIcon(this,${xj(r.slice(4))})" title="${x(r.slice(4))}">${I[r.slice(4)]}</div>` : '')).join('')}</div>` : ''}
      <div class="ipk-grid" id="ipk-icon-grid">
        ${iconCatalogKeys().map(({ key: k, cat }) => `<div class="ipk-cell${selKey===k?' sel':''}" data-name="${k}" data-cat="${cat}" onclick="pickIconPickerIcon(this,'${k}')" title="${k}">${I[k]}</div>`).join('')}
      </div>
    </div>
    <div class="ipk-grid" id="ipk-emoji-grid" style="display:none">
      ${emojiList().map((e) => `<div class="ipk-cell ipk-symbol${selSym===e?' sel':''}" onclick="pickIconPickerSymbol(this,${xj(e)})" data-no-i18n>${e}</div>`).join('')}
    </div>
    <div class="ipk-grid" id="ipk-symbol-grid" style="display:none">
      ${symbols.map(s => `<div class="ipk-cell ipk-symbol${selSym===s.glyph?' sel':''}" data-name="${x((s.label||'').toLowerCase())}" onclick="pickIconPickerSymbol(this,${xj(s.glyph)})" title="${x(s.label||'')}">${x(s.glyph)}</div>`).join('')}
    </div>
    <div class="ipk-grid" id="ipk-upload-pane" style="display:none">${icropUploadPromptHtml()}</div>
    <input type="file" accept="image/*" id="icrop-file-input" style="display:none" onchange="handleIconUpload(this)">
    <div class="ipk-color-row">
      <span class="pk">${t('color')}</span>
      <div class="ipk-colors" id="ipk-colors">${sortColorsByHex(S.colors).map(c =>
        `<div class="cswatch${selColorId===c.id?' sel':''}" style="background:${c.color_code}" data-cid="${c.id}" onclick="pickIconPickerColor(this,${c.id})"></div>`
      ).join('')}</div>
    </div>
    <input type="hidden" id="ipk-icon-value" value="${x(selIcon||'')}">
    <input type="hidden" id="sel-color" value="${selColorId||''}">
  </div>`;
}

function switchIconPickerTab(tabName) {
  document.querySelectorAll('.ipk-tab[data-ipktab]').forEach(b => b.classList.toggle('active', b.dataset.ipktab === tabName));
  const q1 = q('#ipk-icon-pane'), q2 = q('#ipk-symbol-grid'), q3 = q('#ipk-upload-pane'), q4 = q('#ipk-emoji-grid');
  if (q1) q1.style.display = tabName === 'icons' ? '' : 'none';
  if (q4) q4.style.display = tabName === 'emoji' ? '' : 'none';
  if (q2) q2.style.display = tabName === 'symbols' ? '' : 'none';
  if (q3) q3.style.display = tabName === 'uploaded' ? '' : 'none';
}

// Uploaded-tab pane states ────────────────────────────────────────────

function icropUploadPromptHtml() {
  return `<div class="icrop-empty" onclick="q('#icrop-file-input').click()">
    ${I.folder || ''}
    <span>${t('iconUploadPrompt')}</span>
  </div>`;
}

function updateIconPickerPreviewName(name, kind) {
  const nameEl = q('#ipk-preview .name');
  if (nameEl) nameEl.textContent = name || '';
  const kindEl = q('#ipk-preview .kind');
  if (kindEl) kindEl.textContent = kind || '';
}

function filterIconPicker(query) {
  document.querySelectorAll('#ipk-icon-grid .ipk-cell').forEach((c) => { c.style.display = iconMatches(c.dataset.name, query) ? '' : 'none'; });
}

function pickIconPickerIcon(el, key) {
  document.querySelectorAll('.ipk-wrap .ipk-cell').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  q('#ipk-icon-value').value = `svg:${key}`;
  iconRecentPush(`svg:${key}`);
  const prevIcon = q('#ipk-preview-icon');
  if (prevIcon) prevIcon.innerHTML = I[key] || I.layer;
}

function pickIconPickerSymbol(el, glyph) {
  document.querySelectorAll('.ipk-wrap .ipk-cell').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  q('#ipk-icon-value').value = `sym:${glyph}`;
  iconRecentPush(`sym:${glyph}`);
  const prevIcon = q('#ipk-preview-icon');
  if (prevIcon) prevIcon.innerHTML = `<span class="kicon-glyph">${x(glyph)}</span>`;
}

async function pickIconPickerColor(el, id) {
  q('#ipk-colors')?.querySelectorAll('.cswatch').forEach(s => s.classList.remove('sel'));
  el.classList.add('sel');
  q('#sel-color').value = id;
  const code = (S.colors || []).find(c => c.id === id)?.color_code;
  const prevIcon = q('#ipk-preview-icon');
  if (prevIcon && code) prevIcon.style.color = code;
  await api.color.markUsed(id);
}

const getIconPickerValue = () => q('#ipk-icon-value')?.value || '';

// ═══ Uploaded tab: native <input type=file> + FileReader + <canvas> ═══
// circular crop, no libs. Crop state lives in the module-scope `let`s
// declared above (icropImg/icropZoom/icropPanX/icropPanY).

function handleIconUpload(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      icropImg = img;
      icropZoom = 1;
      icropPanX = 0;
      icropPanY = 0;
      icropRenderCropUI();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  inputEl.value = ''; // allow re-picking the same file later
}

function icropRenderCropUI() {
  const pane = q('#ipk-upload-pane');
  if (!pane || !icropImg) return;
  pane.innerHTML = `
    <div class="icrop-stage">
      <canvas id="icrop-canvas" width="${ICROP_CANVAS}" height="${ICROP_CANVAS}" onmousedown="icropStartDrag(event)"></canvas>
      <div class="icrop-mask"></div>
    </div>
    <input type="range" class="icrop-zoom" min="1" max="3" step="0.01" value="${icropZoom}" oninput="icropOnZoom(this.value)">
    <div class="icrop-actions">
      <button type="button" class="btn btn-s icrop-cancel" onclick="icropReset()">${t('cancel')}</button>
      <button type="button" class="btn btn-p icrop-confirm" onclick="icropConfirm()">${t('save')}</button>
    </div>`;
  icropRedraw();
}

// Scale/size the image would be drawn at for the current zoom — a "cover"
// base fit (like CSS background-size:cover) times the zoom factor, so any
// source image size always fills the circular mask at zoom 1.
function icropDrawSize() {
  const baseScale = Math.max(ICROP_CANVAS / icropImg.naturalWidth, ICROP_CANVAS / icropImg.naturalHeight);
  const scale = baseScale * icropZoom;
  return { scale, w: icropImg.naturalWidth * scale, h: icropImg.naturalHeight * scale };
}

function icropClampPan() {
  const { w, h } = icropDrawSize();
  const maxX = Math.max(0, (w - ICROP_CANVAS) / 2);
  const maxY = Math.max(0, (h - ICROP_CANVAS) / 2);
  icropPanX = Math.max(-maxX, Math.min(maxX, icropPanX));
  icropPanY = Math.max(-maxY, Math.min(maxY, icropPanY));
}

function icropRedraw() {
  const canvas = q('#icrop-canvas');
  if (!canvas || !icropImg) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ICROP_CANVAS, ICROP_CANVAS);
  const { w, h } = icropDrawSize();
  const dx = (ICROP_CANVAS - w) / 2 + icropPanX;
  const dy = (ICROP_CANVAS - h) / 2 + icropPanY;
  ctx.drawImage(icropImg, dx, dy, w, h);
}

function icropOnZoom(val) {
  icropZoom = parseFloat(val) || 1;
  icropClampPan();
  icropRedraw();
}

function icropStartDrag(e) {
  if (!icropImg) return;
  icropDragging = true;
  icropDragStartX = e.clientX;
  icropDragStartY = e.clientY;
  icropPanStartX = icropPanX;
  icropPanStartY = icropPanY;
  document.addEventListener('mousemove', icropOnDrag);
  document.addEventListener('mouseup', icropStopDrag);
}

function icropOnDrag(e) {
  if (!icropDragging) return;
  icropPanX = icropPanStartX + (e.clientX - icropDragStartX);
  icropPanY = icropPanStartY + (e.clientY - icropDragStartY);
  icropClampPan();
  icropRedraw();
}

function icropStopDrag() {
  icropDragging = false;
  document.removeEventListener('mousemove', icropOnDrag);
  document.removeEventListener('mouseup', icropStopDrag);
}

function icropConfirm() {
  if (!icropImg) return;
  const out = document.createElement('canvas');
  out.width = ICROP_OUTPUT;
  out.height = ICROP_OUTPUT;
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.arc(ICROP_OUTPUT / 2, ICROP_OUTPUT / 2, ICROP_OUTPUT / 2, 0, Math.PI * 2);
  ctx.clip();
  const outScale = ICROP_OUTPUT / ICROP_CANVAS;
  const { w, h } = icropDrawSize();
  const dx = ((ICROP_CANVAS - w) / 2 + icropPanX) * outScale;
  const dy = ((ICROP_CANVAS - h) / 2 + icropPanY) * outScale;
  ctx.drawImage(icropImg, dx, dy, w * outScale, h * outScale);
  ctx.restore();
  const dataUrl = out.toDataURL('image/png');

  q('#ipk-icon-value').value = 'img:' + dataUrl;
  document.querySelectorAll('#ipk-icon-grid .ipk-cell, #ipk-symbol-grid .ipk-cell').forEach(b => b.classList.remove('sel'));
  const prevIcon = q('#ipk-preview-icon');
  if (prevIcon) prevIcon.innerHTML = `<img src="${dataUrl}" class="icrop-preview-img">`;

  icropShowResult(dataUrl);
}

function icropShowResult(dataUrl) {
  const pane = q('#ipk-upload-pane');
  if (!pane) return;
  pane.innerHTML = `<div class="icrop-result">
    <img src="${dataUrl}" class="icrop-result-img">
    <button type="button" class="btn btn-s icrop-change" onclick="icropReset()">${t('iconUploadPrompt')}</button>
  </div>`;
}

// Discards any in-progress crop (Cancel) and returns the pane to the
// initial upload-prompt state — also reused as "change image" from the
// post-confirm result state.
function icropReset() {
  icropImg = null;
  icropZoom = 1;
  icropPanX = 0;
  icropPanY = 0;
  const pane = q('#ipk-upload-pane');
  if (pane) pane.innerHTML = icropUploadPromptHtml();
}
