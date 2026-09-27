'use strict';
// ═══ Category "Classifier" (progress.md Phase 5, reworked v5 Part 3) ═══
// A Classifier module IS its category — objects live directly under it
// (src/db/classifier.js, a parallel schema; see progress.md Section C for why
// it doesn't reuse Director's object_* tables). Four views: Table · Detail
// (list + detail, default) · Relation · Grid.
//
// v5 Part 3 (APP docs/V5.md §7.4–§7.5) split this kind into four files, each
// under the ~500-line band:
//   classifier.js         data load, the view shell and the four views
//   classifier-detail.js  the body of ONE object (fields, levels, links)
//   classifier-fields.js  "Fields of this category" and per-object fields
//   classifier-ctx.js     right-click menus, object CRUD, quick start
// Relations are read-only here; they are authored in an Exhibitor (§3.5).

const CLASSIFIER_VIEWS = ['table', 'listDetail', 'relationCat', 'grid'];
// §7.5 bug #10: these rendered as raw English beside a translated toolbar.
const CLASSIFIER_VIEW_KEY = { table: 'clsViewTable', listDetail: 'clsViewDetail', relationCat: 'clsViewRelation', grid: 'clsViewGrid' };

// ── Data, per module (v5 Part 8, APP docs/V5.md §12.3) ──────────────────
// Was one S.classifierData for "the" open Classifier. A page can now show
// several — its own and borrowed ones (§12.12) — so data is cached per
// module, and what differs per instance (the preset, the selected object)
// lives on the instance (page/page.js pbState), never on a global.
const CLS = {};
const clsData = (moduleId) => CLS[moduleId] || { moduleId, objects: [], templates: [], relations: [], ui: {} };
const clsAllData = () => Object.values(CLS);
// An object or field wherever it is cached — handlers that get only an id.
const clsFindObject = (oid) => clsAllData().flatMap((d) => d.objects).find((o) => o.id === oid) || null;
const clsModuleOfObject = (oid) => clsAllData().find((d) => d.objects.some((o) => o.id === oid))?.moduleId ?? null;
const clsFindTemplate = (tid) => clsAllData().flatMap((d) => [...d.templates, ...d.objects.flatMap((o) => o.privateTemplates || [])])
  .find((tp) => tp.id === tid) || null;

// Plan part2 #2.1: 3 round-trips, not 4 + 2N — getObjectsFull hydrates
// attrMap / levelMap / privateTemplates server-side in one pass.
async function loadClassifierData(m) {
  // timeline.js is lazy and owns dateInputsHTML, which a 'date' field renders
  // with (classifier-detail.js) — without this the widget is undefined for
  // anyone who opens a classifier before ever opening a chronicler.
  await loadModule('src/renderer/timeline.js');
  const [full, ui, relations, index] = await Promise.all([
    api.classifier.getObjectsFull(m.id),
    api.module.getUi(m.id),
    api.viewer.getRelations(S.nexus.id),
    api.viewer.index(S.nexus.id),
  ]);
  const { objects, templates } = full;
  setClassifierLinkData(relations, index);
  CLS[m.id] = { moduleId: m.id, objects, templates, relations, ui };
  return CLS[m.id];
}

// The instance's view: its block's preset, else the module's saved one.
function clsViewOf(c) {
  const p = c.config?.preset || clsData(c.source.id).ui?.activeView;
  return CLASSIFIER_VIEWS.includes(p) ? p : 'listDetail';
}

// The instance's selected object: a link that just asked for one wins,
// then what this instance had, then the first object.
function clsSelectedOf(c, d) {
  const st = c.state;
  if (S.clsPendingSelect != null && d.objects.some((o) => o.id === S.clsPendingSelect)) {
    st.sel = S.clsPendingSelect;
    S.clsPendingSelect = null;
  }
  const sel = d.objects.find((o) => o.id === st.sel) || d.objects[0] || null;
  st.sel = sel?.id ?? null;
  return sel;
}

// A chip on the view bar: this instance's preset, and the module's default
// for the next page that shows it.
async function setClassifierView(iid, view) {
  const i = pbInst(iid);
  if (!i) return;
  const mid = i.sourceId ?? i.moduleId;
  await api.module.setUi(mid, 'activeView', view);
  if (CLS[mid]) CLS[mid].ui = { ...CLS[mid].ui, activeView: view };
  if (S.inspectorData?.moduleId === mid) S.inspectorData.ui = { ...S.inspectorData.ui, activeView: view };
  await pbSetConfig(iid, { preset: view });
}

// Reload after any write, whichever surfaces are live: the element's own
// page, and every Classifier instance on screen (a borrowed one included).
async function refreshClassifier() {
  if (S.activeItemNode?.itemKind === 'classifier') {
    await openItemNode('classifier', S.activeItemNode.moduleId, S.activeItemNode.id);
    return;
  }
  const ids = new Set(Object.values(PB_INST).filter((i) => i.component === 'classifier.view').map((i) => i.sourceId));
  if (S.activeModuleNode?.kind === 'classifier') ids.add(S.activeModuleNode.id);
  await Promise.all([...ids].map((id) => findModuleNode(id)).filter(Boolean).map(loadClassifierData));
  renderNexusHome();
}

registerComponent('classifier.view', {
  kind: 'classifier', label: () => kindLabel('classifier'), borrow: true,
  presets: () => CLASSIFIER_VIEWS, presetLabel: (p) => t(CLASSIFIER_VIEW_KEY[p]),
  load: (m) => loadClassifierData(m),
  render: (c) => buildClassifierMainHtml(c.source, c),
  mount: (c) => { if (clsViewOf(c) === 'relationCat') mountClassifierRelationGraph(c); },
});

function buildClassifierMainHtml(m, c) {
  const d = clsData(m.id);
  const view = clsViewOf(c);
  const iid = xj(c.iid);
  const viewBar = viewBarHtml(CLASSIFIER_VIEWS, view, v => `setClassifierView(${iid},'${v}')`, v => t(CLASSIFIER_VIEW_KEY[v]));
  // §7.1: one primary action on the toolbar; fields are the advanced tier.
  const toolbar = `<div class="classifier-toolbar" oncontextmenu="openCtx('classifier.category',event,{moduleId:${m.id}})">
    ${cmdBtn('classifier.addObject', { moduleId: m.id }, { cls: 'btn-p' })}
    ${cmdBtn('classifier.fields', { moduleId: m.id })}
    ${viewBar}
  </div>`;
  let body;
  if (!d.objects.length) {
    // §7.5 bug #3: this said "create your first Main module". §7.4: one click
    // to a usable category instead of ~10.
    body = kindEmptyStateHtml(m, {
      attrs: `oncontextmenu="openCtx('classifier.category',event,{moduleId:${m.id}})"`,
      extra: `<p class="drafter-hint">${t('clsQuickStartHint')}</p>`,
    });
  } else if (view === 'listDetail') body = renderClassifierListDetail(m, d, c);
  else if (view === 'grid') body = renderClassifierGrid(m, d);
  else if (view === 'relationCat') body = renderClassifierRelation(m, d);
  else body = renderClassifierTable(m, d);
  return `${toolbar}${body}`;
}

// ── Table view ──────────────────────────────────────────────────────────
// §7.5 bug #6: a levelable / conditioned field keeps its value in
// classifier_level rows, not in attribute_value — typing into a flat cell
// here wrote a value no view ever showed. Those cells are now a read-only
// summary that opens the element.
function classifierTableCellHtml(m, o, c) {
  if (c.levelable || c.has_condition) {
    const rows = o.levelMap?.[c.id] || [];
    const last = rows[rows.length - 1];
    const text = rows.length ? `${last.level_label || last.condition_value || last.info_value || '—'} · ${rows.length}` : '—';
    return `<td class="cls-cell cls-cell-ro" title="${x(t('clsLevelCellHint'))}" onclick="openItemNode('classifier',${m.id},${o.id})" data-no-i18n>${x(text)}</td>`;
  }
  return clsFieldCellHtml(m, o, c); // v5 Part 7 (§11.3), mod/cls-field-types.js
}

function renderClassifierTable(m, d) {
  let html = `<div class="cls-table-wrap"><table class="cls-table"><tr><th>${t('name')}</th>${d.templates.map(c => `<th>${x(c.description)}</th>`).join('')}<th></th></tr>`;
  for (const o of d.objects) {
    html += `<tr oncontextmenu="openCtx('classifier.object',event,{moduleId:${m.id},objectId:${o.id}})"><td><span class="dot" style="background:${x(o.color_code || 'var(--accent)')}"></span>${x(o.name)}</td>`;
    for (const c of d.templates) html += classifierTableCellHtml(m, o, c);
    html += `<td class="cls-rowacts">
      <button class="btn btn-g btn-i" onclick="openClassifierObjectModal(${m.id},${o.id})" title="${t('edit')}">${I.edit}</button>
      <button class="btn btn-g btn-i" onclick="deleteClassifierObjectRow(${o.id})" title="${t('delete')}">${I.delete}</button>
    </td></tr>`;
  }
  html += `</table></div>`;
  return html;
}

async function saveClassifierAttrCell(el) {
  const oid = Number(el.dataset.oid), tid = Number(el.dataset.tid);
  const value = el.textContent.trim();
  await api.classifier.upsertAttr(oid, tid, value);
  const obj = clsFindObject(oid);
  if (obj) obj.attrMap[tid] = value;
}

// An object's own icon (iconPicker()'s svg:/sym:/img: value), falling back
// to the category's default glyph.
function classifierObjectIconHtml(o, m) {
  return iconRefHtml(o.icon, m.cat_type === 'character' ? I.person : I.item);
}

// ── Grid view ───────────────────────────────────────────────────────────
// §7.5 bug #9: a card opened the rename/icon modal; it opens the element now
// (rename and colour moved to the card's right-click menu).
function renderClassifierGrid(m, d) {
  return `<div class="cls-grid" oncontextmenu="if(event.target===this)openCtx('classifier.category',event,{moduleId:${m.id}})">${d.objects.map(o => {
    const col = o.color_code || 'var(--accent)';
    return `
    <div class="cls-card" style="border-top:3px solid ${x(col)}" onclick="openItemNode('classifier',${m.id},${o.id})"
        oncontextmenu="openCtx('classifier.object',event,{moduleId:${m.id},objectId:${o.id}})">
      <span class="disp-thumb"><img data-display-key="cobj_${o.id}" alt=""></span>
      <span class="cls-card-icon" style="border-color:${x(col)};color:${x(col)}">${classifierObjectIconHtml(o, m)}</span>
      <div class="cls-card-name">${x(o.name)}</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Detail view (list + detail, default) ────────────────────────────────
function renderClassifierListDetail(m, d, c) {
  const sel = clsSelectedOf(c, d);
  const list = d.objects.map(o => `<div class="li${sel && o.id === sel.id ? ' sel' : ''}" onclick="selectClassifierObject(${xj(c.iid)},${o.id})"
      oncontextmenu="openCtx('classifier.object',event,{moduleId:${m.id},objectId:${o.id}})">
    <span class="kicon" style="color:${x(o.color_code || 'var(--accent)')}">${classifierObjectIconHtml(o, m)}</span><span class="name">${x(o.name)}</span></div>`).join('');
  const detail = sel ? renderClassifierObjectDetail(m, sel, d.templates) : '';
  return `<div class="cls-listdetail"><div class="cls-list" oncontextmenu="if(event.target===this)openCtx('classifier.category',event,{moduleId:${m.id}})">${list}</div><div class="cls-detail">${detail}</div></div>`;
}

function selectClassifierObject(iid, id) {
  pbState(iid).sel = id;
  S.classifierSelectedObject = id; // the palette's target (core/commands.js)
  renderNexusHome();
}

async function saveClassifierAttrInput(el) {
  const oid = Number(el.dataset.oid), tid = Number(el.dataset.tid);
  const value = el.value.trim();
  await api.classifier.upsertAttr(oid, tid, value);
  const obj = clsFindObject(oid);
  if (obj) obj.attrMap[tid] = value;
}

// ── Relation view (read-only, v5) ───────────────────────────────────────
// §7.4 "one relation surface": this view and the detail page's Linked
// elements used to write entity_relation through two unrelated modals.
// Both now READ through classifierRelationRowsHtml (classifier-detail.js) —
// this one for every relation touching the category, the detail for one
// object — and both hand off to the Exhibitor to author (§3.5).
function renderClassifierRelation(m, d) {
  const keys = new Set(d.objects.map(o => `cobj_${o.id}`));
  return `<div class="cls-rel-wrap">
    <div class="cls-rel-graph" data-r="rel-graph"></div>
    <button class="btn btn-p cls-rel-add" onclick="openExhibitorFor(${m.id})">${I.relation} ${t('openInExhibitor')}</button>
    <div class="cls-link-list">${classifierRelationRowsHtml(keys) || `<div class="cls-lv-empty">${t('noLinkedElements')}</div>`}</div>
  </div>`;
}

const classifierModuleRelations = (m, d) => {
  const keys = new Set(d.objects.map(o => `cobj_${o.id}`));
  return (d.relations || []).filter(r => keys.has(r.from_key) && keys.has(r.to_key));
};

async function mountClassifierRelationGraph(c) {
  const m = c.source;
  const d = clsData(m.id);
  const box = c.root.querySelector('[data-r="rel-graph"]');
  if (!box) return;
  await loadModule('src/renderer/sage.js'); // buildSageGraph lives there
  const nodes = d.objects.map(o => ({
    id: `cobj_${o.id}`, objId: o.id, module: 'obj', label: o.name,
    fill: o.color_code || m.color_code || '#8b5cf6',
  }));
  const edges = classifierModuleRelations(m, d).map(r => ({ source: r.from_key, target: r.to_key, color: r.color_code }));
  buildSageGraph({ nodes, edges }, new Set(), {
    container: box,
    colors: { obj: m.color_code || '#8b5cf6' },
    labels: { obj: x(m.name) },
    // §7.5 bug #9: a node opens the element, not the rename modal.
    onNodeClick: (n) => openItemNode('classifier', m.id, n.objId),
    onNodeContext: (n, e) => openCtx('classifier.object', e, { moduleId: m.id, objectId: n.objId }),
  });
}
