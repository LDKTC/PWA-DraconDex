'use strict';
// ═══ Component collection (Procress 16 part 3b · B10, Suggestion.md) ═════
// While the open page is being arranged, the left panel holds every block
// the page can take instead of the Nest — searchable, "recently used" on
// top, then by category: text · layout · data · media · navigation & wiki ·
// this module's own views · another module's view (a borrow, §12.12).
// Each card has a drawn preview of its shape. A card is dragged onto the
// page — above / below / beside a block (page/arrange.js pbDragOver) or into
// an empty column's "Add block" — or clicked, which adds it after the block
// last selected (or at the end). The "Add block" buttons and "/" while
// arranging open the same set as a popup; that is where the old picker's
// blocks went.
//
// An entry's key: t:<block_type> · c:<component id> · b:<module id> (borrow).

const PBC_CATS = [
  ['text', 'pbcText', ['t:text', 't:heading', 'c:core.linktext', 'c:core.callout', 'c:core.hatnote', 'c:core.banner']],
  ['layout', 'pbcLayout', ['t:columns', 'c:core.tabs', 'c:core.toggle', 'c:core.divider', 'c:core.iconrow']],
  ['data', 'pbcData', ['c:core.datatable', 'c:core.properties', 'c:core.related', 'c:core.infobox', 'c:core.stats', 'c:core.children']],
  ['media', 'pbcMedia', ['t:image', 'c:core.figure', 'c:core.gallery', 'c:core.video', 'c:core.audio', 'c:core.pdf', 'c:core.model3d', 'c:core.media']],
  ['nav', 'pbcNav', ['c:core.search', 'c:core.categories', 'c:core.toc', 'c:core.linkbar', 'c:core.linkcard', 'c:core.seealso', 'c:core.references', 'c:core.navbox']],
];
// the shape a card's preview draws (css/page.css .pbc-pic[data-pic])
const PBC_PIC = { text: 'lines', layout: 'cols', data: 'table', media: 'media', nav: 'chips', this: 'kind', other: 'kind' };
const PBC_PIC_OF = { 't:heading': 'title', 'c:core.banner': 'title', 't:columns': 'cols', 'c:core.tabs': 'tabs', 'c:core.toggle': 'toggle',
  'c:core.divider': 'rule', 'c:core.infobox': 'card', 'c:core.search': 'search', 'c:core.linktext': 'lines', 'c:core.categories': 'chips', 'c:core.linkcard': 'card', 'c:core.stats': 'stats', 'c:core.callout': 'callout' };
const PBC_RECENT_KEY = 'dracondex-pbc-recent';

let _pbcQuery = '';
let _pbCursor = null; // { page: pageKey, blockId } — where a click inserts

const pbcPage = () => {
  const moduleId = S.activeItemNode?.moduleId ?? S.activeModuleNode?.id;
  return moduleId ? pageOf(moduleId, pbItemKeyOf(S.activeItemNode)) : null;
};
const pbcWanted = () => pbArranging(pbcPage());

function pbcRecent() {
  try { const v = JSON.parse(localStorage.getItem(PBC_RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
}
function pbcRemember(key) {
  try { localStorage.setItem(PBC_RECENT_KEY, JSON.stringify([key, ...pbcRecent().filter((k) => k !== key)].slice(0, 6))); } catch (_) {}
}

// Every entry this page can take now: [{key, label, cat, sub?}]
function pbcEntries(page, where = null) {
  const m = findModuleNode(page.moduleId);
  if (!m) return [];
  const have = new Set(page.blocks.map((b) => b.component).filter(Boolean));
  const room = !where || pbDepthOf(page, where.parentId) + 2 <= PB_MAX_DEPTH;
  const ok = (key) => {
    if (key === 't:columns') return room;
    if (!key.startsWith('c:')) return true;
    const c = COMPONENTS[key.slice(2)];
    return !!c && !(c.once && have.has(c.id)) && !(c.container && !room);
  };
  const label = (key) => (key.startsWith('t:') ? t(PB_TYPE_KEY[key.slice(2)]) : componentLabel(COMPONENTS[key.slice(2)]));
  const out = [];
  const listed = new Set();
  for (const [cat, , keys] of PBC_CATS) for (const k of keys) { listed.add(k); if (ok(k)) out.push({ key: k, label: label(k), cat }); }
  // a core component added later than this list still shows (under data)
  for (const c of Object.values(COMPONENTS)) {
    const k = `c:${c.id}`;
    if (listed.has(k) || !ok(k)) continue;
    if (c.kind === 'core') out.push({ key: k, label: label(k), cat: 'data' });
    else if (c.kind === m.kind || (page.itemKey && c.kind === 'item')) out.push({ key: k, label: label(k), cat: 'this' });
  }
  for (const r of flattenModuleTree(S.moduleTree, 0)) {
    const o = r.m;
    if (o.id !== m.id && COMPONENTS[`${o.kind}.view`]?.borrow) out.push({ key: `b:${o.id}`, label: o.name, sub: kindLabel(o.kind), cat: 'other', mod: o });
  }
  return out;
}

function pbcCardHtml(e, where) {
  const pic = e.mod
    ? `<span class="pbc-pic" data-pic="kind" style="color:${x(e.mod.color_code || KIND_COLOR[e.mod.kind] || 'var(--accent)')}">${moduleIconHtml(e.mod)}</span>`
    : `<span class="pbc-pic" data-pic="${PBC_PIC_OF[e.key] || PBC_PIC[e.cat]}" aria-hidden="true"><i></i><i></i><i></i></span>`;
  return `<button class="btn pbc-card" draggable="true" data-key="${x(e.key)}"
      ondragstart="pbcDragStart(event,${xj(e.key)})" ondragend="_pbNew=null"
      onclick="pbcInsert(${xj(e.key)},${xv(where)})">${pic}
    <span class="pbc-name"${e.mod ? ' data-no-i18n' : ''}>${x(e.label)}</span>${e.sub ? `<span class="pbc-sub">${x(e.sub)}</span>` : ''}</button>`;
}

// The body: search, recent, categories. `where` = an empty column's slot.
function pbcBodyHtml(page, where = null) {
  const all = pbcEntries(page, where);
  const q = _pbcQuery.trim().toLowerCase();
  const hit = (e) => !q || `${e.label} ${e.sub || ''}`.toLowerCase().includes(q);
  const sec = (title, list) => (list.length ? `<section class="pbc-sec"><h4>${title}</h4><div class="pbc-grid">${list.map((e) => pbcCardHtml(e, where)).join('')}</div></section>` : '');
  const byKey = new Map(all.map((e) => [e.key, e]));
  const recent = q ? [] : pbcRecent().map((k) => byKey.get(k)).filter(Boolean);
  const cats = [...PBC_CATS.map(([c, key]) => [c, t(key)]), ['this', t('pbcThis')], ['other', t('pbcOther')]];
  const body = cats.map(([c, title]) => sec(title, all.filter((e) => e.cat === c && hit(e)))).join('');
  return `${sec(t('pbcRecent'), recent)}${body || `<p class="drafter-hint">${t('pbNoMatch')}</p>`}`;
}

// The left panel while arranging (hub/activity.js buildLeftPanelHtml).
function pbcPanelHtml() {
  const page = pbcPage();
  if (!page) return '';
  return `${leftPanelHead(t('pbcTitle'), `<button class="btn btn-p btn-sm" onclick="togglePageArrange()">${t('pbArrangeDone')}</button>`)}
    <div class="pbc-search"><input type="search" id="pbc-q" value="${x(_pbcQuery)}" placeholder="${x(t('search'))}" aria-label="${x(t('search'))}" oninput="pbcFilter(this)"></div>
    <p class="drafter-hint pbc-hint">${t('pbcHint')}</p>
    <div class="left-dest-body pbc-body" id="pbc-body">${pbcBodyHtml(page)}</div>`;
}

function pbcFilter(input) {
  _pbcQuery = input.value;
  const page = pbcPage();
  const body = input.closest('.pbc-search')?.parentElement?.querySelector('.pbc-body');
  if (page && body) body.innerHTML = pbcBodyHtml(page, body._where || null);
}

// The same set as a popup: "Add block" buttons, and "/" while arranging.
function openPbcPopup(where = null) {
  const page = pbcPage();
  if (!page) return;
  _pbcQuery = '';
  openModal(t('pbAddBlock'), `<div class="pbc-search"><input type="search" id="pbc-q" placeholder="${x(t('search'))}" aria-label="${x(t('search'))}" oninput="pbcFilter(this)"></div>
    <div class="pbc-body pbc-pop" id="pbc-pop-body">${pbcBodyHtml(page, where)}</div>`);
  const body = q('#pbc-pop-body');
  if (body) body._where = where;
  q('#pbc-q')?.focus();
}

// ── insert ──────────────────────────────────────────────────────────────
function pbcSpec(key) {
  const [kind, id] = [key.slice(0, 1), key.slice(2)];
  if (kind === 't') return { type: id, ...(id === 'columns' ? { config: { widths: [6, 6], n: 2 } } : {}) };
  if (kind === 'c') return { type: 'component', component: id };
  const src = findModuleNode(Number(id));
  return src ? { type: 'component', component: `${src.kind}.view`, sourceKey: `module_${src.id}` } : null;
}

// at: {targetId, pos: before|after|left|right} · {parentId, col} (a slot) ·
// null (after the selected block, else the end)
async function pbcInsert(key, at = null) {
  const page = pbcPage();
  const spec = pbcSpec(key);
  if (!page || !spec) return;
  if (!at && _pbCursor?.page === pageKey(page.moduleId, page.itemKey)) at = { targetId: _pbCursor.blockId, pos: 'after' };
  const target = at?.targetId != null ? page.blocks.find((b) => b.id === at.targetId) : null;
  if (target) {
    spec.parentId = target.parent_id ?? null;
    if (target.parent_id != null) spec.config = { ...(spec.config || {}), col: target.config?.col ?? 0 };
    spec.at = target.block_order + (at.pos === 'before' || at.pos === 'left' ? 0 : 1);
  } else if (at?.parentId != null) {
    spec.parentId = at.parentId;
    spec.config = { ...(spec.config || {}), col: at.col };
  }
  const id = await api.block.add(page.moduleId, pbLayoutKey(page.moduleId, page.itemKey), spec);
  if (target && (at.pos === 'left' || at.pos === 'right')) await api.block.moveBeside(target.id, id?.id ?? id, at.pos);
  pbcRemember(key);
  closeModal();
  _pbCursor = { page: pageKey(page.moduleId, page.itemKey), blockId: id?.id ?? id };
  await reloadModulePage(page.moduleId, page.itemKey);
}

// A card dragged out of the panel: arrange.js's drop targets take it.
let _pbNew = null;
function pbcDragStart(ev, key) {
  _pbNew = key;
  ev.dataTransfer.effectAllowed = 'copy';
  try { ev.dataTransfer.setData('text/plain', `pbc:${key}`); } catch (_) {}
}

// The block last clicked while arranging is where a click on a card inserts.
document.addEventListener('mousedown', (e) => {
  const el = e.target.closest?.('.page-blocks.arranging .pblock[data-block]');
  if (!el) return;
  const i = pbInst(el.dataset.iid);
  if (!i) return;
  _pbCursor = { page: pageKey(i.moduleId, i.itemKey), blockId: i.blockId };
  document.querySelectorAll('.pblock.pb-cursor').forEach((n) => n.classList.remove('pb-cursor'));
  el.classList.add('pb-cursor');
  // Procress 16 part 7: the Properties panel follows the selection
  if (typeof pbPopDockable === 'function' && pbPopDockable() && !e.target.closest('.pb-gear')) openPbStyle(el.dataset.iid, 'style', { toggle: false });
}, true);

// "/" while arranging, with nothing typed-into focused: the popup.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !pbcWanted()) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openPbcPopup();
}, true);
