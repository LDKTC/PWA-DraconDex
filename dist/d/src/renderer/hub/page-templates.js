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
      <span class="kicon">${tp.default ? I.star : ''}</span><span class="kli-text"><span class="kli-name">${x(tp.name)}</span>
      <span class="kli-desc">${x(tp.description || '')}</span></span></div>`).join('')}`;
}

// A new module's first page: its ★ (or the picked template).
async function applyStartTemplate(moduleId, kind, tplId = null, { fields = true } = {}) {
  await refreshPageTemplates();
  const id = tplId || starTemplateId(kind);
  if (!id) return;
  try { await api.template.apply(moduleId, id, { locale: S.settings?.language || 'en', fields }); } catch (_) { /* default layout on open */ }
}

// ── Use template… ───────────────────────────────────────────────────────
async function openTemplateGallery(moduleId) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  await refreshPageTemplates();
  const star = starTemplateId(m.kind, m.cat_type || 'object');
  const own = presetsFor(m.kind).filter((p) => p.own && presetSpec(m.kind, p.ref)?.page);
  const card = (ref, name, desc, badge) => `<div class="tpl-card" onclick="useTemplateNow(${moduleId},${xj(ref)})" tabindex="0"
      onkeydown="if(event.key==='Enter')useTemplateNow(${moduleId},${xj(ref)})">
      <div class="tpl-card-head"><b${badge === 'own' ? ' data-no-i18n' : ''}>${x(name)}</b>${badge === 'star' ? `<span class="tpl-star">${I.star} ${t('tplDefault')}</span>` : badge === 'own' ? `<span class="tpl-own">${t('tplMine')}</span>` : ''}</div>
      ${desc ? `<p class="drafter-hint">${x(desc)}</p>` : ''}
    </div>`;
  const list = templatesFor(m.kind).filter((tp) => m.kind !== 'classifier' || !tp.for || tp.for.includes(m.cat_type || 'object'));
  const others = m.kind === 'classifier' ? templatesFor(m.kind).filter((tp) => !list.includes(tp)) : [];
  openModal(t('tplUse'), `
    <p class="drafter-hint">${t('tplUseHint')}</p>
    <div class="tpl-grid">${list.map((tp) => card(tp.id, tp.name, tp.description, tp.id === star ? 'star' : '')).join('')}
      ${own.map((p) => card(p.ref, p.name, '', 'own')).join('')}</div>
    ${others.length ? `<details class="tpl-more"><summary>${t('tplOtherTypes')}</summary><div class="tpl-grid">${others.map((tp) => card(tp.id, tp.name, tp.description, '')).join('')}</div></details>` : ''}
    <div class="mfoot"><button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button></div>`);
}

async function useTemplateNow(moduleId, ref) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  const tpl = String(ref).startsWith('u:') ? (() => { const s = presetSpec(m.kind, ref); return { page: s?.page, itemPage: s?.itemPage, preset: s }; })() : ref;
  let r;
  try { r = await api.template.apply(moduleId, tpl, { locale: S.settings?.language || 'en', fields: true }); }
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
