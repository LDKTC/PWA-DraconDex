'use strict';
// ═══ Page head (v5 Part 4, APP docs/V5.md §8.2; v5 Part 8, §12.10) ═══════
// The one builder for the header every page opens with — the module page,
// an element (item) page, a file, the Import Dock, Sage Hut, Wyvern and
// Dragon each carried their own copy of the same `.detail-head.module-head`
// markup before.
//
// Since v5 Part 8 it is two parts: the ADDRESS ROW (page/address.js) is the
// sticky one — the scroller is .bpane-body / #main-inner, so it pins to the
// top of the pane while the page scrolls under it — and the title below it
// scrolls away with the page. The old sticky title and its fold toggle
// went: a one-line address row has nothing to fold.
//
//   o.addr       which page this is, for the address row (page/address.js)
//   o.color      accent for the left rule and the icon
//   o.icon       icon HTML; o.iconOnclick makes it a button
//   o.title      title HTML (already escaped — may be an inline input)
//   o.titleText  plain title
//   o.after      HTML after the title on the same line (handle, kind chip)
//   o.sub        a second line (hint text)
//   o.tags       the chips row (.mtags)
//   o.acts       the page's own buttons, at the end of the address row
//   o.cls        extra class names
//   o.bare       o.sub is the whole head (Wyvern / Dragon breadcrumbs —
//                those workspaces have no panes, so no address row)
//   o.layout     {align, cover, icon} from pageHeadLayout() — the title's
//                own layout, set per page (Procress 13 part 4, below)

function pageHeadHtml(o = {}) {
  const col = o.color || 'var(--accent)';
  const icon = o.icon ? `<span class="kicon" style="color:${x(col)}${o.iconOnclick ? ';cursor:pointer' : ''}"${o.iconOnclick ? ` onclick="event.stopPropagation();${o.iconOnclick}"` : ''} data-no-i18n>${o.icon}</span>` : '';
  const cls = ['detail-head', 'module-head', o.cls || ''].filter(Boolean).join(' ');
  if (o.bare) {
    return `<div class="${cls} page-navbar" style="border-left:4px solid ${x(col)}">
      <div class="navbar-row"><div class="navbar-grow">${o.sub || ''}</div></div>
    </div>`;
  }
  const lay = o.layout || null;
  const layCls = lay ? ` ph--${lay.align}${lay.cover ? ' has-cover' : ''}${lay.icon ? ' has-icon' : ''}` : '';
  if (lay?.cover) watchPageCovers();
  return `<div class="page-navbar addr-bar">${addressRowHtml(o.addr || { label: o.titleText }, o.acts)}</div>
    ${lay?.cover ? `<div class="ph-cover" data-cover-sha="${x(lay.cover)}" style="background-position:${pbFocusCss(lay.focus)}"></div>` : ''}
    <div class="${cls} page-title${layCls}" style="border-left:4px solid ${x(col)}">
      ${lay?.icon ? `<div class="ph-icon" data-no-i18n>${x(lay.icon)}</div>` : ''}
      <div class="navbar-row"><h2 class="navbar-h">${icon}${o.title || ''}${o.after || ''}</h2></div>
      ${o.sub ? `<div class="drafter-hint navbar-sub">${o.sub}</div>` : ''}
      ${o.tags ? `<div class="mtags">${o.tags}</div>` : ''}
    </div>`;
}

// ═══ Title layout per page (Procress 13 part 4, APP docs/REDESIGN.md C6) ══
// Stored in module_ui like the readable flag (page/focus.js): "pageHead" for
// a module page, "pageHead:<itemKey>" for an element page, value
// {align, cover, icon}. No row = today's look (left, no cover, no icon);
// setting everything back to that stores '' — the same "off" the readable
// flag uses — which reads back as the default.
// The cover is an Asset Nest image named by its sha256, not its id — ids
// differ on every device a vault is synced to, the hash does not. The key
// of an element page is remapped on snapshot import (db/sync.js).
const PAGE_HEAD_ALIGN = ['left', 'center', 'right'];
const pageHeadUiKey = (itemKey) => (itemKey ? `pageHead:${itemKey}` : 'pageHead');

function pageHeadLayout(moduleId, itemKey = null) {
  let v = null;
  try { v = JSON.parse(pageOf(moduleId, itemKey)?.props?.ui?.[pageHeadUiKey(itemKey)] || 'null'); } catch (_) {}
  return {
    align: PAGE_HEAD_ALIGN.includes(v?.align) ? v.align : 'left',
    // sha256, or file_<id> for a picture the vault has not hashed yet
    // (EXPORT-DECOR D3) — a hash is what survives a sync to another device
    cover: typeof v?.cover === 'string' && /^([a-f0-9]{64}|file_\d+)$/.test(v.cover) ? v.cover : null,
    focus: v?.focus && typeof v.focus === 'object' ? pbFocusOf(v.focus) : null,
    // A few graphemes at most — an emoji, not a paragraph.
    icon: typeof v?.icon === 'string' && v.icon.trim() ? [...v.icon.trim()].slice(0, 4).join('') : null,
  };
}

async function setPageHeadLayout(moduleId, itemKey, patch) {
  const next = { ...pageHeadLayout(moduleId, itemKey), ...patch };
  if (!next.cover) next.focus = null;
  if (!next.focus) delete next.focus;
  const val = next.align === 'left' && !next.cover && !next.icon ? '' : JSON.stringify(next);
  const key = pageHeadUiKey(itemKey);
  await api.module.setUi(moduleId, key, val);
  for (const p of Object.values(S.pages || {})) if (p.moduleId === moduleId && p.props?.ui) p.props.ui[key] = val;
  if (S.inspectorData?.moduleId === moduleId && S.inspectorData.ui) S.inspectorData.ui[key] = val;
  renderNexusHome();
}

// The page the layout command acts on: the open element page, else the
// open module page.
function pageHeadTarget() {
  const it = S.activeItemNode;
  if (it?.itemKey) return { moduleId: it.moduleId, itemKey: it.itemKey };
  return S.activeModuleNode ? { moduleId: S.activeModuleNode.id, itemKey: null } : null;
}

// ── covers: sha256 → the image's id on THIS machine, once per vault ────
let PH_ASSETS = null;
async function pageHeadImages(force = false) {
  const nx = S.nexus?.id;
  if (nx == null) return { images: [], bySha: new Map() };
  if (!force && PH_ASSETS?.nx === nx) return PH_ASSETS;
  const files = await api.importdock.list(nx).catch(() => []);
  const images = (files || []).filter((f) => assetClass(f) === 'image' && f.sha256 && !f.missing);
  PH_ASSETS = { nx, images, bySha: new Map(images.map((f) => [f.sha256, f.id])) };
  return PH_ASSETS;
}
// A cover is drawn as a placeholder in the page HTML and filled in once
// its id is known. The HTML is built as a string and inserted by whichever
// renderer called pageHeadHtml(), sometimes after an await — so watch the
// DOM for new covers instead of guessing when that insertion happens.
let PH_OBSERVER = null;
function watchPageCovers() {
  if (PH_OBSERVER || typeof MutationObserver !== 'function') return;
  PH_OBSERVER = new MutationObserver(() => { if (document.querySelector('.ph-cover:not([data-ph])')) hydratePageCovers(); });
  PH_OBSERVER.observe(document.body, { childList: true, subtree: true });
  setTimeout(hydratePageCovers, 0);
}
async function hydratePageCovers() {
  const els = [...document.querySelectorAll('.ph-cover:not([data-ph])')];
  if (!els.length) return;
  for (const el of els) el.dataset.ph = 'pending';
  const { bySha } = await pageHeadImages();
  for (const el of els) {
    const ref = el.dataset.coverSha;
    const id = /^file_\d+$/.test(ref) ? Number(ref.slice(5)) : bySha.get(ref);
    // A deleted or never-synced image is simply no cover (C6), not an error.
    if (id == null) { el.dataset.ph = 'gone'; continue; }
    el.style.backgroundImage = `url("${displayImageUrl(id)}")`;
    el.dataset.ph = 'ok';
  }
}

// ── the popover ──────────────────────────────────────────────────────────
async function openPageLayoutPopup(anchor) {
  const tgt = pageHeadTarget();
  if (!tgt) return;
  closeAllPopups();
  const { images } = await pageHeadImages(true);
  const lay = pageHeadLayout(tgt.moduleId, tgt.itemKey);
  const pop = document.createElement('div');
  pop.className = 'kind-popup ph-pop';
  const seg = PAGE_HEAD_ALIGN.map((a) => `<button type="button" class="btn btn-sm ${lay.align === a ? 'btn-p' : 'btn-s'}" data-align="${a}">${t(`align${a[0].toUpperCase()}${a.slice(1)}`)}</button>`).join('');
  const covers = images.slice(0, 24).map((f) => `<div role="button" tabindex="0" class="ph-cover-opt${lay.cover === f.sha256 ? ' active' : ''}" data-cover="${x(f.sha256)}" title="${x(f.file_name)}" style="background-image:url(&quot;${x(displayImageUrl(f.id))}&quot;)"></div>`).join('');
  pop.innerHTML = `<div class="ph-pop-h">${t('pageLayout')}</div>
    <div class="ph-pop-label">${t('titleAlign')}</div>
    <div class="ph-seg">${seg}</div>
    <div class="ph-pop-label">${t('pageIcon')}</div>
    <div class="fg"><input class="ph-icon-inp" maxlength="16" value="${x(lay.icon || '')}" placeholder="✦" data-no-i18n></div>
    <div class="ph-pop-label">${t('pageCover')}</div>
    ${images.length
      ? `<div class="ph-covers"><div role="button" tabindex="0" class="ph-cover-opt ph-cover-none${lay.cover ? '' : ' active'}" data-cover="" title="${t('pageCoverNone')}">✕</div>${covers}</div>`
      : `<div class="ph-pop-hint">${t('pageCoverEmpty')}</div>`}
    <div class="ph-seg"><button type="button" class="btn btn-s btn-sm" data-more="1">${t('pageCoverMore')}</button>
      ${lay.cover ? `<button type="button" class="btn btn-s btn-sm" data-focus="1">${t('pbFocusTitle')}</button>` : ''}</div>
    <div class="ph-pop-hint">${t('pageLayoutScope')}</div>`;
  document.body.appendChild(pop);
  pop.addEventListener('click', async (e) => {
    e.stopPropagation();
    const a = e.target.closest('[data-align]');
    const c = e.target.closest('[data-cover]');
    if (e.target.closest('[data-more]')) { pop.remove(); pageCoverPick(tgt); return; }
    if (e.target.closest('[data-focus]')) { pop.remove(); pageCoverFocus(tgt); return; }
    if (a) await setPageHeadLayout(tgt.moduleId, tgt.itemKey, { align: a.dataset.align });
    else if (c) await setPageHeadLayout(tgt.moduleId, tgt.itemKey, { cover: c.dataset.cover || null, focus: null });
    else return;
    openPageLayoutPopup(anchor); // redraw with the new state, same anchor
  });
  const inp = pop.querySelector('.ph-icon-inp');
  inp.addEventListener('change', () => setPageHeadLayout(tgt.moduleId, tgt.itemKey, { icon: inp.value.trim() || null }));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  positionPopupNear(pop, (anchor || document.querySelector('.page-title'))?.getBoundingClientRect() || { left: 200, top: 80, right: 200, bottom: 80, width: 0, height: 0 });
}

// Any picture in the Nexus as the cover, through the picture picker (D4):
// stored by its hash when it has one, else by id (D3).
function pageCoverPick(tgt) {
  openPbImagePicker({ moduleId: tgt.moduleId, onPick: async ([id]) => {
    if (id == null) return;
    const { images } = await pageHeadImages(true);
    const sha = images.find((f) => f.id === id)?.sha256;
    await setPageHeadLayout(tgt.moduleId, tgt.itemKey, { cover: sha || `file_${id}`, focus: null });
    renderNexusHome();
  } });
}

// Where the cover keeps its subject when the band crops it.
async function pageCoverFocus(tgt) {
  const lay = pageHeadLayout(tgt.moduleId, tgt.itemKey);
  if (!lay.cover) return;
  const id = /^file_\d+$/.test(lay.cover) ? Number(lay.cover.slice(5)) : (await pageHeadImages()).bySha.get(lay.cover);
  if (id == null) return;
  pbFocusPicker(id, lay.focus, async (focus) => {
    await setPageHeadLayout(tgt.moduleId, tgt.itemKey, { focus });
    renderNexusHome();
  });
}
