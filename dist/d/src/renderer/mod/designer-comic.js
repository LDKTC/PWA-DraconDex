'use strict';
// ═══ Designer — comic pages (v5 Part 7, APP docs/V5.md §11.6 "Framer") ═══
// The user folded the would-be Framer module into Designer + Sketcher: one
// Designer module is one comic page (an episode is a Collector of them).
//   panel     a frame of its own size (w/h) showing what its linker_key
//             names — a Sketcher page (skpg_, drawn by mod/sketch-render.js)
//             or an image asset (file_) — with an optional caption
//   balloon   a speech balloon: node_text is the line, linker_key the speaker
//   read_order   the reading sequence, shown as numbers on the page when the
//             toggle is on; "Number by position" fills it top-to-bottom,
//             left-to-right (db/designer.js renumberDesignReadOrder)
// Hooks called from mod/designer.js: dgComicNodeHtml (the inside of the
// node), dgComicDecorate (size, resize grip, order badge, panel image),
// dgComicFieldsHtml / dgComicSubmit (the node modal).

const DG_COMIC_SHAPES = ['panel', 'balloon'];
const DG_COMIC_SIZE = { panel: [240, 160], balloon: [170, 70] };
const dgIsComic = (shape) => DG_COMIC_SHAPES.includes(shape);

function dgComicNodeHtml(n, col) {
  if (n.shape === 'panel') {
    return `<div class="dg-panel-img" data-panel-img="${n.id}"></div>
      ${n.node_text ? `<span class="dg-panel-cap" data-no-i18n>${x(n.node_text)}</span>` : ''}`;
  }
  if (n.shape === 'balloon') {
    return `${n.entity ? `<span class="dg-balloon-who" style="color:${x(col)}" data-no-i18n>${x(n.entity.name)}</span>` : ''}
      <span class="dg-label" data-no-i18n>${x(n.node_text || '…')}</span>`;
  }
  return null;
}

// Size + grip + order badge, then the panel's picture (async, so a page of
// panels paints its frames at once and fills them as they arrive).
function dgComicDecorate(el, n, zoomOf, redraw) {
  const [dw, dh] = DG_COMIC_SIZE[n.shape];
  el.style.width = `${n.w || dw}px`;
  el.style.height = `${n.h || dh}px`;
  el.style.setProperty('--dg-col', n.color || DG_COLORS[1]);
  if (S.designerData?.showOrder && n.read_order != null) {
    el.insertAdjacentHTML('beforeend', `<span class="dg-order" data-no-i18n>${n.read_order}</span>`);
  }
  const grip = document.createElement('span');
  grip.className = 'dg-resize';
  grip.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    try { grip.setPointerCapture(ev.pointerId); } catch (_) {}
    const sx = ev.clientX, sy = ev.clientY, ow = el.offsetWidth, oh = el.offsetHeight;
    const mv = (e3) => {
      n.w = Math.max(40, ow + (e3.clientX - sx) / zoomOf());
      n.h = Math.max(30, oh + (e3.clientY - sy) / zoomOf());
      el.style.width = `${n.w}px`; el.style.height = `${n.h}px`;
      redraw();
    };
    const up = async () => {
      grip.removeEventListener('pointermove', mv);
      grip.removeEventListener('pointerup', up);
      await api.designer.resizeNode(n.id, n.w, n.h);
      if (n.shape === 'panel') dgComicFillPanel(el, n);
    };
    grip.addEventListener('pointermove', mv);
    grip.addEventListener('pointerup', up);
  });
  el.appendChild(grip);
  if (n.shape === 'panel') dgComicFillPanel(el, n);
}

async function dgComicFillPanel(el, n) {
  const box = el.querySelector('.dg-panel-img');
  if (!box) return;
  const key = n.linker_key || '';
  const page = /^skpg_(\d+)$/.exec(key), file = /^file_(\d+)$/.exec(key);
  if (page) {
    const url = await sketchPageFitDataUrl(Number(page[1]), box.clientWidth || 200, box.clientHeight || 120);
    box.innerHTML = `<img src="${url}" alt="">`;
  } else if (file) {
    box.innerHTML = `<img src="${displayImageUrl(Number(file[1]))}" onerror="queueDisplayImageFallback(this,${Number(file[1])})" alt="">`;
  } else box.innerHTML = '';
}

// ── node modal ──────────────────────────────────────────────────────────
async function dgComicFieldsHtml(n) {
  if (!dgIsComic(n.shape)) return '';
  const idx = await api.viewer.index(S.nexus.id);
  const opt = (e) => `<option value="${x(e.key)}"${e.key === n.linker_key ? ' selected' : ''}>${x(e.name)}${e.moduleName ? ` — ${x(e.moduleName)}` : ''}</option>`;
  const src = n.shape === 'panel'
    ? `<optgroup label="${x(t('dgPanelFromSketch'))}">${idx.filter(e => e.kind === 'page').map(opt).join('')}</optgroup>
       <optgroup label="${x(t('dgPanelFromImage'))}">${idx.filter(e => e.kind === 'file' && /^(png|jpe?g|gif|webp|bmp|svg)$/i.test(e.fileType || '')).map(opt).join('')}</optgroup>`
    : idx.filter(e => e.kind === 'object').map(opt).join('');
  return `<div class="fg"><label>${t(n.shape === 'panel' ? 'dgPanelShows' : 'dgBalloonSpeaker')}</label>
      <select id="dn-comic-key"><option value="">—</option>${src}</select></div>
    <div class="fg"><label>${t('dgReadOrder')}</label>
      <input id="dn-comic-order" type="number" min="1" step="1" value="${x(n.read_order ?? '')}" style="width:7em" data-no-i18n></div>`;
}

async function dgComicSubmit(id) {
  const keyEl = q('#dn-comic-key');
  if (!keyEl) return;
  await api.designer.setComic(id, keyEl.value || null, q('#dn-comic-order')?.value ?? null);
  dropSketchFitCache();
}

// ── commands ────────────────────────────────────────────────────────────
async function toggleDesignerReadOrder() {
  const d = S.designerData;
  if (!d) return;
  d.showOrder = !d.showOrder;
  await api.module.setUi(d.moduleId, 'showReadOrder', d.showOrder ? '1' : '');
  renderNexusHome();
}

async function renumberDesignerReadOrder() {
  const d = S.designerData;
  if (!d) return;
  const r = await api.designer.renumber(d.moduleId, false);
  d.showOrder = true;
  await api.module.setUi(d.moduleId, 'showReadOrder', '1');
  await reloadSource(d.moduleId);
  toast(`${t('dgRenumbered')} · ${r.count}`, 'ok');
}
