'use strict';
// ═══ Page templates (Procress 14, APP docs/TEMPLATES.md §3) ══════════════
// What a page looks like when a module is made, and what "Use template…"
// swaps it for. The templates are DATA vendored from DraconDex-SDB
// (electron/templates/pages.json, read and translated by db/page-template.js);
// a user's own are presets that carry a page (db/preset.js), so "Save this
// page as template…" is "Save as preset" and they share one list.
//
//   click a kind          → a module with its ★ template (a Classifier's ★
//                           follows its catType)
//   the kind's flyout     → pick another template (or a preset) first
//   page ⋯ "Use template…" → replace this page's layout, with Undo

// { loc, templates } — the kind picker is synchronous, so the list is
// fetched with the preset cache (hub/presets.js refreshPresetCache).
let _pageTplCache = { loc: null, templates: [] };
async function refreshPageTemplates() {
  const loc = S.settings?.language || 'en';
  if (_pageTplCache.loc === loc && _pageTplCache.templates.length) return _pageTplCache.templates;
  try { _pageTplCache = { loc, templates: ((await api.template.catalog(loc)) || {}).templates || [] }; }
  catch (_) { _pageTplCache = { loc, templates: [] }; }
  return _pageTplCache.templates;
}

// A kind's templates, ★ first.
const templatesFor = (kind) => _pageTplCache.templates.filter((tp) => tp.kind === kind)
  .sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0));
function starTemplateId(kind, catType = 'object') {
  const ts = templatesFor(kind).filter((tp) => tp.default);
  if (kind !== 'classifier') return ts[0]?.id || null;
  return (ts.find((tp) => (tp.for || []).includes(catType)) || ts.find((tp) => (tp.for || []).includes('object')))?.id || null;
}

// The flyout's template rows for a kind (hub/presets.js openPresetSubmenu).
function templateMenuHtml(kind, pid) {
  const list = templatesFor(kind);
  if (!list.length) return '';
  return `<div class="ctx-head">${t('tplGallery')}</div>
    ${list.map((tp) => `<div class="kind-list-item" onclick="closeAllPopups();quickCreateModule('${kind}',${pid},null,${xj(tp.id)})">
      <span class="kicon" aria-hidden="true">${tp.default ? I.star : ''}</span><span class="kli-text"><span class="kli-name">${x(tp.name)}</span>
      <span class="kli-desc">${x(tp.description || '')}</span></span></div>`).join('')}
    <div class="kind-list-item" onclick="closeAllPopups();openTemplatePicker('${kind}',${pid})">
      <span class="kicon" aria-hidden="true">${I.layer || ''}</span><span class="kli-text"><span class="kli-name">${t('tplBrowse')}</span></span></div>`;
}

// A new module's first page: its ★ (or the picked template).
async function applyStartTemplate(moduleId, kind, tplId = null, { fields = true } = {}) {
  await refreshPageTemplates();
  const id = tplId || starTemplateId(kind);
  if (!id) return;
  try { await api.template.apply(moduleId, id, { locale: S.settings?.language || 'en', fields }); } catch (_) { /* default layout on open */ }
}

// ── The gallery (mockup 07-module-templates) ─────────────────────────────
// One window for both ways in: "Use template…" on a page (its kind fixed)
// and "More templates…" from the kind flyout (a kind sidebar, then Create).
// Cards carry a thumbnail drawn from the template's own blocks; the pane
// below previews the picked one — its module page and element page, block
// by block, and the fields it brings.
let _tg = null; // { moduleId?, parentId?, kind, sel, fields }

// A block list as a tiny diagram: a bar per block, columns side by side, the
// kind's own view (and the hero-like blocks) in the accent.
function tplThumbHtml(blocks) {
  const tall = (id) => /\.(view|spotlight|map|board|graph|timeline|progress)$/.test(id || '');
  const bar = (b) => `<i class="${tall(b?.component) ? 'a' : ''}" style="height:${tall(b?.component) ? 22 : 9}px"></i>`;
  return (Array.isArray(blocks) ? blocks : []).slice(0, 6).map((b) => (b?.type === 'columns'
    ? `<span class="tpt-row">${(b.children || []).slice(0, 3).map((col) => `<span class="tpt-col">${(col || []).slice(0, 3).map(bar).join('')}</span>`).join('')}</span>`
    : bar(b))).join('');
}

// The same blocks, larger and named — the component's own label.
function tplBlocksHtml(blocks) {
  const box = (b) => {
    const comp = typeof COMPONENTS !== 'undefined' ? COMPONENTS[b?.component] : null;
    const label = b?.type === 'text' ? t('pbText') : componentLabel(comp);
    return `<span class="tpv-box${/\.(view|spotlight)$/.test(b?.component || '') ? ' a' : ''}">${x(label)}</span>`;
  };
  return (Array.isArray(blocks) ? blocks : []).map((b) => (b?.type === 'columns'
    ? `<span class="tpv-row">${(b.children || []).map((col) => `<span class="tpv-col">${(col || []).map(box).join('')}</span>`).join('')}</span>`
    : box(b))).join('');
}

// Every card the gallery offers for a kind: ★ first, then the rest, then mine.
function tplEntries(kind, catType = null) {
  const star = starTemplateId(kind, catType || 'object');
  const builtIn = templatesFor(kind)
    .filter((tp) => kind !== 'classifier' || !catType || !tp.for || tp.for.includes(catType))
    .map((tp) => ({ ref: tp.id, name: tp.name, desc: tp.description || '', star: tp.id === star, page: tp.page, itemPage: tp.itemPage, fields: tp.preset?.fields || [] }));
  const own = presetsFor(kind).filter((p) => p.own).map((p) => ({ p, s: presetSpec(kind, p.ref) })).filter(({ s }) => s?.page)
    .map(({ p, s }) => ({ ref: p.ref, name: p.name, desc: '', own: true, page: s.page, itemPage: s.itemPage, fields: s.fields || [] }));
  return [...builtIn, ...own];
}

async function openTemplateGallery(moduleId) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  await refreshPageTemplates();
  _tg = { moduleId, kind: m.kind, catType: m.cat_type || 'object', sel: null, fields: true };
  tplGalleryOpen();
}

async function openTemplatePicker(kind, parentId) {
  await Promise.all([refreshPageTemplates(), typeof refreshPresetCache === 'function' ? refreshPresetCache() : null]);
  _tg = { parentId, kind, catType: null, sel: null, fields: true };
  tplGalleryOpen();
}

function tplGalleryOpen() {
  const create = _tg.moduleId == null;
  openModal(create ? t('tplGallery') : t('tplUse'), `
    <div class="tpg${create ? '' : ' tpg-use'}">
      ${create ? '<nav class="tpg-kinds" id="tpg-kinds" role="listbox" aria-label="kind"></nav>' : ''}
      <div class="tpg-main" id="tpg-main"></div>
    </div>
    <div class="mfoot">
      <label class="fv-useimg tpg-fields" id="tpg-fields"><input type="checkbox" checked onchange="_tg.fields=this.checked"> ${t('tplFields')}</label>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" id="tpg-go" onclick="tplGalleryGo()">${create ? t('create') : t('apply')}</button>
    </div>`, { size: 'xl', focus: '.tpg-card.on' });
  tplGalleryRender();
}

function tplGallerySel(kind, ref) {
  if (!_tg) return;
  if (kind && kind !== _tg.kind) { _tg.kind = kind; _tg.sel = null; }
  if (ref !== undefined) _tg.sel = ref;
  tplGalleryRender();
}

function tplGalleryRender() {
  if (!_tg) return;
  const create = _tg.moduleId == null;
  const nav = q('#tpg-kinds');
  if (nav) {
    const kinds = [...new Set(_pageTplCache.templates.map((tp) => tp.kind))];
    nav.innerHTML = kinds.map((k) => `<div class="tpg-kind${k === _tg.kind ? ' on' : ''}" role="option" aria-selected="${k === _tg.kind}" tabindex="0"
        onclick="tplGallerySel('${k}')" onkeydown="if(event.key==='Enter')tplGallerySel('${k}')">
        <span class="tpg-dot" style="background:${KIND_COLOR[k] || 'var(--t3)'}"></span><span class="tpg-kn">${x(kindLabel(k))}</span>
        <span class="tpg-kc">${t('tplKindCount').replace('{n}', tplEntries(k).length)}</span></div>`).join('');
  }
  const list = tplEntries(_tg.kind, create ? null : _tg.catType);
  if (!list.some((e) => e.ref === _tg.sel)) _tg.sel = (list.find((e) => e.star) || list[0])?.ref ?? null;
  const cur = list.find((e) => e.ref === _tg.sel);
  const main = q('#tpg-main');
  if (!main) return;
  main.innerHTML = `
    <div class="tpg-head"><span class="tpg-dot" style="background:${KIND_COLOR[_tg.kind] || 'var(--t3)'}"></span><b>${x(kindLabel(_tg.kind))}</b>
      <span class="tpg-sub">${create ? '' : t('tplUseHint')}</span></div>
    <div class="tpg-grid" role="radiogroup">${list.map((e) => `<div class="tpg-card${e.ref === _tg.sel ? ' on' : ''}" role="radio" aria-checked="${e.ref === _tg.sel}" tabindex="0"
        onclick="tplGallerySel(null,${xj(e.ref)})" ondblclick="tplGalleryGo()" onkeydown="if(event.key==='Enter')tplGalleryGo();else if(event.key===' '){event.preventDefault();tplGallerySel(null,${xj(e.ref)})}">
        <span class="tpt">${tplThumbHtml(e.page)}</span>
        <span class="tpg-cn"><b${e.own ? ' data-no-i18n' : ''}>${x(e.name)}</b>${e.star ? `<span class="tpl-star">${I.star} ${t('tplDefault')}</span>` : e.own ? `<span class="tpl-own">${t('tplMine')}</span>` : ''}</span>
        ${e.desc ? `<span class="tpg-cd">${x(e.desc)}</span>` : ''}</div>`).join('')}
      ${create ? '' : `<div class="tpg-card tpg-add" role="button" tabindex="0" onclick="closeModal();openSavePresetModal(${_tg.moduleId})" onkeydown="if(event.key==='Enter'){closeModal();openSavePresetModal(${_tg.moduleId})}">
        <span class="tpg-plus">+</span><span class="tpg-cn"><b>${t('tplSave')}</b></span></div>`}
    </div>
    ${cur ? `<div class="tpg-prev">
      <div class="tpg-pcol"><h6 class="exd-h">${t('tplModulePage')}</h6><div class="tpv">${tplBlocksHtml(cur.page)}</div></div>
      ${cur.itemPage?.length ? `<div class="tpg-pcol"><h6 class="exd-h">${t('tplItemPage')}</h6><div class="tpv">${tplBlocksHtml(cur.itemPage)}</div></div>` : ''}
      ${cur.fields.length ? `<div class="tpg-pcol"><h6 class="exd-h">${t('gameFields')}</h6>${cur.fields.map((f) => `<span class="tpg-chip">${x(f.name || '')}</span>`).join('')}</div>` : ''}
    </div>` : ''}`;
  const fl = q('#tpg-fields');
  if (fl) fl.hidden = !cur?.fields.length;
  const go = q('#tpg-go');
  if (go) go.disabled = !cur;
}

async function tplGalleryGo() {
  if (!_tg?.sel) return;
  const { moduleId, parentId, kind, sel, fields } = _tg;
  if (moduleId != null) { await useTemplateNow(moduleId, sel, { fields }); return; }
  closeModal();
  const own = String(sel).startsWith('u:');
  await quickCreateModule(kind, parentId, own ? sel : null, own ? null : sel, { fields });
}

async function useTemplateNow(moduleId, ref, { fields = true } = {}) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  const tpl = String(ref).startsWith('u:') ? (() => { const s = presetSpec(m.kind, ref); return { page: s?.page, itemPage: s?.itemPage, preset: s }; })() : ref;
  let r;
  try { r = await api.template.apply(moduleId, tpl, { locale: S.settings?.language || 'en', fields }); }
  catch (_) { toast(t('driveErrServer'), 'err'); return; }
  if (!r?.ok) { toast(t('driveErrServer'), 'err'); return; }
  closeModal();
  await reloadModulePage(moduleId, null);
  if (r.dropped) toast(t('tplBorrowDropped').replace('{n}', r.dropped), 'warn');
  toastAction(t('tplApplied'), t('scUndo'), async () => {
    await api.template.restore(moduleId, r.old);
    await reloadModulePage(moduleId, null);
  });
}
