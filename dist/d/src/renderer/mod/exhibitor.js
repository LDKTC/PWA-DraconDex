'use strict';
// ═══ Exhibitor (v5 Part 2, APP docs/V5.md §3) ═══════════════════════════
// One kind replacing the Analys "Viewer" and the Relation "Connector": a
// saved filter (module_ui 'filterDef') re-evaluated against api.viewer.index
// on every open, shown through six views —
//   scene  a Konva canvas whose nodes are real exhibit_node rows (mod/exhibitor-scene.js)
//   graph  the old Connector's auto-laid-out graph (mod/exhibitor-graph.js)
//   table · cards · board · edges  (mod/exhibitor-table.js)
// — the union of both old kinds' views plus the Scene, so nothing a user had
// before v5 is gone. After v5 this is the only place a relation is authored
// (§3.5): Classifier and Chronicler read relations and hand off here through
// openExhibitorFor. wiki_link edges are drawn dashed and stay read-only (§3.7).
//
// This file: shared state, the filter engine + its popup, the relation form,
// and the view shell. Split up front per dracondex-file-arch (§5 risk 6).

const EXH_VIEWS = ['scene', 'graph', 'table', 'cards', 'board', 'edges'];
const EXH_VIEW_LABEL = { scene: 'Scene', graph: 'Graph', table: 'Table', cards: 'Cards', board: 'Board', edges: 'Edges' };
// v5 Part 8 (§12.3): a scoped page component — data per module, view per
// instance, S.exhibitorData = the current instance (page/kind-state.js).
const EXH = kindState({ prop: 'exhibitorData', kind: 'exhibitor', component: 'exhibitor.view', views: EXH_VIEWS });
registerComponent('exhibitor.view', {
  kind: 'exhibitor', label: () => kindLabel('exhibitor'), borrow: true, canvas: true,
  presets: () => EXH_VIEWS, presetLabel: (p) => EXH_VIEW_LABEL[p],
  load: (m) => loadExhibitorData(m),
  render: (c) => buildExhibitorMainHtml(c.source, c),
  mount: () => mountExhibitor(),
});
// Locale-invariant item badges, like KIND_LABEL (A.3 #7).
const VIEWER_KIND_LABEL = { object: 'Object', event: 'Event', dialogue: 'Dialogue', chapter: 'Chapter', chat: 'Chat', module: 'Module', file: 'Asset', page: 'Page' };

const viewerTimeText = (it) => it.time && it.time.years != null
  ? fmtDate(it.time.day, it.time.month, it.time.years, it.time.hour, it.time.minute) : '';


// ── Load / view switching ───────────────────────────────────────────────
async function loadExhibitorData(m) {
  const nx = S.nexus.id;
  const [index, relations, graph, ui, scene, relTypes] = await Promise.all([
    api.viewer.index(nx), api.viewer.getRelations(nx), api.wiki.getGraph(nx),
    api.module.getUi(m.id), api.exhibitor.scene(m.id), api.viewer.relationTypes(nx),
  ]);
  const def = parseFilterDef(ui);
  const items = applyFilterGroups(index, def, m.id);
  const byKey = new Map(index.map(it => [it.key, it]));
  // wiki_link pairs (derived from [[...]] text, read-only, §3.7).
  const keyOfNode = new Map(graph.nodes.map(n => [n.id, n.key]));
  const wikiPairs = graph.edges.filter(e => e.wiki)
    .map(e => ({ from: keyOfNode.get(e.source), to: keyOfNode.get(e.target) }))
    .filter(p => p.from && p.to);
  let nodes = scene.nodes;
  // §4.3: a former Connector (or a fresh "Open in Exhibitor") lays its
  // current filter results out once, as saved rows, on the same circle the
  // old Connector computed at runtime — it opens looking the way it did.
  const seed = [];
  if (ui.seedScene === '1' && !nodes.length) {
    const R = Math.min(240, 90 + items.length * 18);
    items.forEach((it, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, items.length) - Math.PI / 2;
      seed.push({ linker_key: it.key, node_type: it.kind === 'file' ? 'asset' : 'entity', x: R * Math.cos(a), y: R * Math.sin(a) });
    });
  }
  const focus = S.exhibitorFocusKey;
  if (focus && byKey.has(focus) && !nodes.some(n => n.linker_key === focus) && !seed.some(n => n.linker_key === focus)) {
    const it = byKey.get(focus);
    seed.push({ linker_key: focus, node_type: it.kind === 'file' ? 'asset' : 'entity', x: 0, y: 0 });
  }
  if (seed.length) {
    await api.exhibitor.addNodes(m.id, seed);
    nodes = (await api.exhibitor.scene(m.id)).nodes;
  }
  if (ui.seedScene === '1') await api.module.setUi(m.id, 'seedScene', '0');
  const cls = await loadExhibitorClassifierValues(nodes, byKey);
  const fieldNames = await loadExhibitorFieldNames(relations); // mod/exhibitor-time.js
  const prev = EXH.M[m.id] || null;
  const focusNode = focus ? nodes.find(n => n.linker_key === focus)
    : nodes.find(n => n.id === S.pendingExhibitNode) || null;
  S.exhibitorFocusKey = null;
  S.pendingExhibitNode = null;
  EXH.setModule(m.id, {
    moduleId: m.id, ui, def, items, index: byKey, relations, wikiPairs, relTypes, cls, fieldNames,
    asOf: ui.relAsOf ? ui.relAsOf : null,
    treeRel: ui.treeRel || null, treeDir: ui.treeDir || null, // mod/exhibitor-tree.js
    groupBy: ui.boardGroupBy || 'module',
    nodes, camera: scene.view,
    sel: focusNode ? focusNode.id : (prev?.sel ?? null),
    linkFrom: null,
  });
}

// §7.9 cards and tables read live values: one getObjectsFull per category
// that has an object placed in this scene, on every load — never a copy.
async function loadExhibitorClassifierValues(nodes, byKey) {
  const mods = new Set();
  for (const n of nodes) {
    if (!n.linker_key?.startsWith('cobj_')) continue;
    const mid = byKey.get(n.linker_key)?.moduleId;
    if (mid != null) mods.add(mid);
  }
  const cls = { objects: new Map(), templates: new Map() };
  const full = await Promise.all([...mods].map(mid => api.classifier.getObjectsFull(mid)));
  [...mods].forEach((mid, i) => {
    cls.templates.set(mid, full[i].templates.filter(tp => tp.object_ref == null));
    for (const o of full[i].objects) cls.objects.set(o.id, o);
  });
  return cls;
}

async function setExhibitorView(view) {
  await EXH.setView(view); // the instance's preset (page/kind-state.js)
}

async function setExhibitorGroupBy(g) {
  const d = S.exhibitorData;
  d.groupBy = g;
  await api.module.setUi(d.moduleId, 'boardGroupBy', g);
  renderNexusHome();
}

// Reload in place after a write (relation, scene edit) without leaving the page.
async function refreshExhibitor() {
  const mid = S.exhibitorData?.moduleId;
  if (mid != null) await reloadSource(mid);
}

function openViewerItem(key, moduleId) {
  // Keys without a wiki page of their own (tlev_/sdlg_) open their source module.
  if (/^(tlev|sdlg)_/.test(key)) openModuleNode(moduleId);
  else openEntityByKey(key);
}

const exhNameOf = (key) => S.exhibitorData?.index.get(key)?.name || key;

// Relations among a key set; wiki pairs among the same set, minus any pair
// a real relation already covers (in either direction).
function exhibitorEdgesAmong(keys) {
  const d = S.exhibitorData;
  // v5 Part 7 (§11.6): "as of" a story year hides relations that do not
  // hold then (mod/exhibitor-time.js).
  const rels = d.relations.filter(r => keys.has(r.from_key) && keys.has(r.to_key) && exhRelHoldsAt(r, d.asOf))
    .map(r => ({ id: r.id, from: r.from_key, to: r.to_key, label: r.label || '', relType: exhRelTypeText(r.rel_type), span: exhSpanText(r),
      directed: r.directed !== 0, color: r.color_code || null, wiki: false }));
  const seen = new Set(rels.flatMap(e => [`${e.from}→${e.to}`, `${e.to}→${e.from}`]));
  const wiki = d.wikiPairs.filter(p => keys.has(p.from) && keys.has(p.to) && !seen.has(`${p.from}→${p.to}`))
    .map(p => ({ id: null, from: p.from, to: p.to, label: '', relType: '', directed: false, wiki: true }));
  return [...rels, ...wiki];
}

function buildExhibitorMainHtml(m, c) {
  const d = EXH.instance(c);
  if (!d) return `<div class="empty" style="margin-top:40px"><div class="ei">${moduleIconHtml(m)}</div><h3>${x(m.name)}</h3></div>`;
  const viewBar = viewBarHtml(EXH_VIEWS, d.view, v => `setExhibitorView('${v}')`, v => EXH_VIEW_LABEL[v], { noI18n: true });
  const toolbar = `<div class="classifier-toolbar">
    ${cmdBtn('exhibitor.addRelation', { moduleId: d.moduleId }, { cls: 'btn-p' })}
    <span class="vw-filterlabel">${t('exhibitorFilter')}</span>${filterChipsHtml(d.def)}
    ${exhAsOfInputHtml(d)}
    ${cmdBtn('exhibitor.editFilter', { moduleId: d.moduleId }, { iconOnly: true })}
    ${cmdBtn('exhibitor.treeLayout', { moduleId: d.moduleId }, { iconOnly: true })}
    ${viewBar}
  </div>`;
  if (d.view === 'scene') return toolbar + buildExhibitorSceneHtml(d);
  if (!d.items.length) {
    return toolbar + kindEmptyStateHtml(m, { note: t('noFilterResults') });
  }
  if (d.view === 'graph') return toolbar + buildExhibitorGraphHtml(d);
  if (d.view === 'edges') return toolbar + buildExhibitorEdgesHtml(d);
  if (d.view === 'cards') return toolbar + buildViewerCardsHtml(d);
  if (d.view === 'board') return toolbar + buildViewerBoardHtml(d);
  return toolbar + `<div class="drafter-hint">${t('viewerHint')}</div>` + buildViewerTableHtml(d);
}

// Called from core/views.js runBuilderMounts after every render.
function mountExhibitor() {
  const d = S.exhibitorData;
  if (!d) return;
  if (d.view === 'scene') mountExhibitorScene();
  else if (d.view === 'graph') mountExhibitorGraph();
}

// §4.2: the v5 entity_relation rebuild removes duplicate rows an old vault
// had piled up (the old UNIQUE never deduped NULL labels). The count is
// held in main until asked, so the user is told once, the first time.
async function reportRelationDedupe() {
  try {
    const n = await api.exhibitor.dedupeReport();
    if (n) toast(`${t('relationDedupeRemoved')} ${n}`, 'ok');
  } catch (_) { /* informational only */ }
}

// ── "Open in Exhibitor" (§3.5, §3.6) ────────────────────────────────────
// The hand-off every read-only relation surface uses. Opens the Exhibitor
// that belongs to moduleId, creating it on first use (next to the module,
// filtered to it, seeded as a Scene), and selects focusKey in the Scene.
async function openExhibitorFor(moduleId, focusKey) {
  closeAllPopups();
  if (moduleId == null || !S.nexus) return;
  let exId = await api.exhibitor.findFor(moduleId);
  if (!exId) {
    const src = findModuleNode(moduleId);
    exId = await api.module.create({
      nexus_ref: S.nexus.id, parent_id: src?.parent_id ?? null,
      name: `${src?.name || ''} · Exhibitor`, kind: 'exhibitor',
    });
    await api.module.setUi(exId, 'exhibitorFor', String(moduleId));
    await api.module.setUi(exId, 'filterDef', JSON.stringify({ groups: [{ rules: [{ field: 'childOf', moduleId }] }] }));
    await api.module.setUi(exId, 'activeView', 'scene');
    await api.module.setUi(exId, 'seedScene', '1');
    await reloadModuleTree();
  } else {
    await api.module.setUi(exId, 'activeView', 'scene');
  }
  S.exhibitorFocusKey = focusKey || null;
  await openModuleNode(exId);
}

// ── Relation form (create / edit) ───────────────────────────────────────
// rel_type and directed are the v5 columns (§3.5). Endpoints are the
// filtered items plus everything placed in the Scene, so a relation can be
// drawn to a node a user dragged in from outside the filter.
function exhibitorRelationTargets() {
  const d = S.exhibitorData;
  const keys = new Set([...d.items.map(it => it.key), ...d.nodes.map(n => n.linker_key).filter(Boolean)]);
  return [...keys].map(k => ({ key: k, name: exhNameOf(k) })).sort((a, b) => a.name.localeCompare(b.name));
}

function openExhibitorRelationModal(relId = null, fromKey = null, toKey = null) {
  const d = S.exhibitorData;
  if (!d) return;
  const rel = relId ? d.relations.find(r => r.id === relId) : null;
  const from = rel?.from_key ?? fromKey, to = rel?.to_key ?? toKey;
  const opts = (sel) => exhibitorRelationTargets()
    .map(o => `<option value="${x(o.key)}" ${o.key === sel ? 'selected' : ''}>${x(o.name)}</option>`).join('');
  openModal(rel ? t('moduleEdit') : t('addRelation'), `
    <div class="fg cls-rel-endpoints">
      <div><label>${t('relFrom')}</label><select id="xr-from" ${rel ? 'disabled' : ''}>${opts(from)}</select></div>
      <div><label>${t('relTo')}</label><select id="xr-to" ${rel ? 'disabled' : ''}>${opts(to)}</select></div>
    </div>
    <div class="fg"><label>${t('relationLabel')}</label><input id="xr-label" value="${x(rel?.label || '')}" autocomplete="off"></div>
    ${exhIsFieldRel(rel?.rel_type)
      // A field's row keeps its type (mod/exhibitor-time.js) — shown, not editable.
      ? `<div class="fg"><label>${t('relationType')}</label><input value="${x(exhRelTypeText(rel.rel_type))}" disabled data-no-i18n></div>`
      : `<div class="fg"><label>${t('relationType')}</label><input id="xr-type" list="xr-types" value="${x(rel?.rel_type || '')}" autocomplete="off">
      <datalist id="xr-types">${d.relTypes.filter(v => !exhIsFieldRel(v)).map(v => `<option value="${x(v)}">`).join('')}</datalist></div>`}
    <label class="fv-useimg"><input type="checkbox" id="xr-dir" ${!rel || rel.directed !== 0 ? 'checked' : ''}> ${t('relationDirected')}</label>
    ${exhSpanFieldsHtml(rel)}
    <div class="mfoot">
      ${rel ? `<button class="btn btn-d" onclick="deleteExhibitorRelation(${rel.id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitExhibitorRelation(${relId ?? 'null'})">${rel ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => pbQOr('#xr-label')?.focus(), 0);
}

async function submitExhibitorRelation(relId) {
  const d = S.exhibitorData;
  const label = pbQOr('#xr-label').value.trim();
  const opts = { directed: pbQOr('#xr-dir').checked, validFrom: readExhSpan('xr-vf'), validTo: readExhSpan('xr-vt') };
  if (pbQOr('#xr-type')) opts.relType = pbQOr('#xr-type').value.trim() || null; // a field's row keeps its type
  if (relId) {
    await api.viewer.updateRelation(relId, label, undefined, opts);
  } else {
    const from = pbQOr('#xr-from').value, to = pbQOr('#xr-to').value;
    // §7.5 bug #8 applies here too: same-endpoint used to be a silent no-op.
    if (!from || !to || from === to) { toast(t('relationSameEnds'), 'err'); return; }
    await api.viewer.createRelation(S.nexus.id, from, to, label, null, { ...opts, moduleRef: d.moduleId });
  }
  closeModal();
  await refreshExhibitor();
  toast(relId ? t('saved') : t('created'), 'ok');
}

async function deleteExhibitorRelation(id) {
  if (!await uiConfirm(t('relationDeleteConfirm'))) return;
  await api.viewer.deleteRelation(id);
  closeModal();
  await refreshExhibitor();
  toast(t('deleted'), 'ok');
}
