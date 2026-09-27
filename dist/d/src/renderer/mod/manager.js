'use strict';
// ═══ Manager — the "project" head module (v5 Part 4, APP docs/V5.md §8.9–§8.10)
// A Manager used to browse its own child modules. With children gone from
// every kind but collector (§8.8), it reads a SELECTION instead: the same
// viewer.index → saved filter path the Exhibitor reads (mod/filter.js), cut
// down to data modules (§9.2 — the kinds hub/kinds.js files as 'data'), plus
// modules picked by hand. The two are unioned:
//   filterDef      module_ui, the Obsidian-style rule groups (kind, childOf,
//                  hashtag, name, handle). No rules = every data module.
//   managerPicks   module_ui, a JSON list of module ids added by hand
// Every row is read live from the index on each open, never a snapshot, so
// a rename or a new element shows up the next time the Manager opens.
//
// A former v3 Manager lost its children to a collector at vault open and
// was given a childOf filter on that collector (db/module-parents.js), so it
// shows exactly what it showed before.

const MANAGER_VIEWS = ['cards', 'list', 'table', 'graph'];
const MANAGER_VIEW_LABEL = { cards: 'Cards', list: 'List', table: 'Table', graph: 'Graph' };

const isDataKind = (kind) => KIND_CATEGORY[kind] === 'data';

// v5 Part 8: a scoped page component (page/kind-state.js). The selection and
// its rows belong to the module; the view, the open list rows and the graph
// layout belong to each instance.
const MGR = kindState({
  prop: 'managerData', kind: 'manager', component: 'manager.view', views: MANAGER_VIEWS,
  instanceKeys: ['listOpen', 'nodePos'], defaults: () => ({ listOpen: new Set(), nodePos: null }),
});
registerComponent('manager.view', {
  kind: 'manager', label: () => kindLabel('manager'), borrow: true,
  presets: () => MANAGER_VIEWS, presetLabel: (p) => MANAGER_VIEW_LABEL[p],
  load: (m) => loadManagerData(m),
  render: (c) => buildManagerMainHtml(c.source, c),
  mount: () => { if (S.managerData?.view === 'graph') mountManagerGraph(); },
});

function parseManagerPicks(ui) {
  try {
    const ids = JSON.parse(ui.managerPicks || '[]');
    return new Set(Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : []);
  } catch (_) { return new Set(); }
}

async function loadManagerData(m) {
  const [ui, index, relations] = await Promise.all([
    api.module.getUi(m.id),
    api.viewer.index(S.nexus.id),
    api.viewer.getRelations(S.nexus.id),
  ]);
  const def = parseFilterDef(ui);
  const picks = parseManagerPicks(ui);
  const pool = index.filter(it => it.kind === 'module' && isDataKind(it.ownKind));
  const hasRules = def.groups.some(g => g.rules.length);
  const matched = new Set((hasRules ? applyFilterGroups(pool, def, m.id) : pool).map(it => it.id));
  for (const id of picks) matched.add(id);
  const rows = pool.filter(it => matched.has(it.id))
    .map(it => ({ ...it, picked: picks.has(it.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  MGR.setModule(m.id, { moduleId: m.id, ui, def, picks, rows, pool, relations });
}

async function setManagerView(view) {
  await MGR.setView(view); // the instance's preset (page/kind-state.js)
}

// Elements a selected module holds — the Nest's own item rows, already
// loaded for the whole vault when it opened (hub/tree.js seedNestItems).
function managerElementCount(id) {
  const items = S.nestItems.get(id);
  return Array.isArray(items) ? items.length : 0;
}

// The folder a module sits in, for the table's "where" column.
const managerFolderName = (id) => findModuleNode(findModuleNode(id)?.parent_id)?.name || '—';

function buildManagerMainHtml(m, c) {
  const d = MGR.instance(c);
  const view = d?.view || 'cards';
  const rows = d?.rows || [];
  const viewBar = viewBarHtml(MANAGER_VIEWS, view, v => `setManagerView('${v}')`, v => MANAGER_VIEW_LABEL[v]);
  const toolbar = `<div class="classifier-toolbar">
    <span class="vw-filterlabel">${t('exhibitorFilter')}</span>${d ? filterChipsHtml(d.def) : ''}
    ${cmdBtn('manager.editFilter', { moduleId: m.id }, { iconOnly: true })}
    ${cmdBtn('manager.pick', { moduleId: m.id }, { cls: 'btn-s btn-sm', extra: d?.picks.size ? ` <span class="cnt" data-no-i18n>${d.picks.size}</span>` : '' })}
    ${viewBar}
  </div>`;
  if (!rows.length) {
    return toolbar + kindEmptyStateHtml(m, { note: t('managerEmpty') });
  }
  let body;
  if (view === 'list') body = rows.map(r => buildManagerListRow(r)).join('');
  else if (view === 'table') body = renderManagerTable(rows);
  else if (view === 'graph') body = renderManagerGraphHtml(d);
  else body = renderManagerCards(rows);
  return `${toolbar}${body}`;
}

// Every row: click jumps to the module, right-click is the Nest's own menu
// (§7.1 — the same menu wherever a module appears), plus "remove from this
// Manager" when the row was picked by hand.
const managerRowEvents = (r) => `onclick="openModuleNode(${r.id})" oncontextmenu="openManagerRowMenu(event,${r.id})"`;

function managerRowIcon(r) {
  const mm = findModuleNode(r.id);
  return mm ? moduleIconHtml(mm) : (I[KIND_ICON[r.ownKind]] || I.layer);
}

function renderManagerCards(rows) {
  return `<div class="cls-grid">${rows.map(r => `
    <div class="cls-card mgr-card" ${managerRowEvents(r)}>
      <span class="disp-thumb"><img data-display-key="module_${r.id}" alt=""></span>
      <div class="mgr-card-icon" style="color:${x(r.color || 'var(--accent)')}">${managerRowIcon(r)}</div>
      <div class="cls-card-name" data-no-i18n>${x(r.name)}</div>
      <span class="kind">${x(kindLabel(r.ownKind))}</span>
      <span class="mgr-card-count">${managerElementCount(r.id)} ${t('minorElements')}</span>
    </div>`).join('')}</div>`;
}

function renderManagerTable(rows) {
  let html = `<div class="cls-table-wrap"><table class="cls-table">
    <tr><th>${t('name')}</th><th>${t('moduleHandle')}</th><th>${t('moduleKind')}</th><th>${t('managerFolder')}</th><th>${t('minorElements')}</th></tr>`;
  for (const r of rows) {
    html += `<tr ${managerRowEvents(r)} style="cursor:pointer">
      <td data-no-i18n><span class="dot" style="background:${x(r.color || 'var(--accent)')}"></span>${x(r.name)}${r.picked ? ` <span class="mgr-picked" title="${x(t('managerPicked'))}">${I.check}</span>` : ''}</td>
      <td data-no-i18n>${r.handle ? `@${x(r.handle)}` : ''}</td>
      <td>${x(kindLabel(r.ownKind))}</td>
      <td data-no-i18n>${x(managerFolderName(r.id))}</td>
      <td>${managerElementCount(r.id)}</td>
    </tr>`;
  }
  html += `</table></div>`;
  return html;
}

// ── List view — each module opens into its own elements ─────────────────
// A read-only lens: no drag or rename here, the same reasoning that keeps
// buildNestItemRow out of the Nest's buildNestRow recursion.
function buildManagerListRow(r, d) {
  const open = !!d?.listOpen.has(r.id);
  const mm = findModuleNode(r.id);
  if (mm && ITEM_KIND[mm.kind] && open) ensureNestItemsLoaded(r.id);
  const items = Array.isArray(S.nestItems.get(r.id)) ? S.nestItems.get(r.id) : [];
  const chev = items.length
    ? `<svg class="icon tree-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
        onclick="event.stopPropagation();toggleManagerListRow(${r.id})"><polyline points="${open ? '6 9 12 15 18 9' : '9 18 15 12 9 6'}"/></svg>`
    : '<span class="tree-chev-spacer"></span>';
  const below = open && mm ? items.map(it => buildManagerListItemRow(it, mm.kind, r.id)).join('') : '';
  return `<div class="li" ${managerRowEvents(r)}>
    ${chev}
    <span class="kicon" style="color:${x(r.color || 'var(--accent)')}">${managerRowIcon(r)}</span>
    <span class="name" data-no-i18n>${x(r.name)}</span>
    <span class="kind">${x(kindLabel(r.ownKind))}</span>
    <span class="mgr-row-count" data-no-i18n title="${t('minorElements')}">${items.length}</span>
  </div>${below}`;
}

function buildManagerListItemRow(item, kind, moduleId) {
  const reg = ITEM_KIND[kind];
  if (!reg) return '';
  return `<div class="li nest-item-row indent1" onclick="openItemNode('${kind}',${moduleId},${item.id})">
    <span class="tree-chev-spacer"></span>
    <span class="kicon" style="color:var(--t3-aa,var(--t2))">${reg.icon()}</span>
    <span class="name">${x(reg.nameOf(item))}</span>
  </div>`;
}

function toggleManagerListRow(id) {
  const open = S.managerData?.listOpen;
  if (!open) return;
  if (open.has(id)) open.delete(id); else open.add(id);
  rerenderPageBlocks((i) => i.iid === S.managerData.iid);
}

// ── Right-click ─────────────────────────────────────────────────────────
function openManagerRowMenu(ev, id) {
  if (!findModuleNode(id)) { ev?.preventDefault?.(); return; }
  openCtx('manager.row', ev, { moduleId: id, managerId: S.managerData?.moduleId });
}

// ── Hand-pick ───────────────────────────────────────────────────────────
async function setManagerPick(managerId, moduleId, on) {
  const picks = new Set(MGR.M[managerId]?.picks || []);
  if (on) picks.add(moduleId); else picks.delete(moduleId);
  await api.module.setUi(managerId, 'managerPicks', JSON.stringify([...picks]));
  await reloadSource(managerId);
}

function openManagerPickModal(managerId) {
  const d = MGR.M[managerId];
  if (!d) return;
  const rows = [...d.pool].sort((a, b) => a.name.localeCompare(b.name)).map(it => `
    <label class="fv-useimg mgr-pick-row" data-name="${x(it.name.toLowerCase())}">
      <input type="checkbox" class="mgr-pick" value="${it.id}" ${d.picks.has(it.id) ? 'checked' : ''}>
      <span data-no-i18n>${x(it.name)}</span>
      <span class="ghost" data-no-i18n>${x(kindLabel(it.ownKind))}${it.handle ? ` · @${x(it.handle)}` : ''} · ${x(managerFolderName(it.id))}</span>
    </label>`).join('');
  openModal(t('managerPick'), `
    <p class="drafter-hint">${t('managerPickHint')}</p>
    <input class="kind-search" placeholder="${x(t('kindSearch'))}" oninput="filterManagerPickRows(this.value)">
    <div class="mgr-pick-list">${rows || `<p class="cls-lv-empty">${t('managerEmpty')}</p>`}</div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitManagerPickModal(${managerId})">${t('save')}</button>
    </div>`);
}

function filterManagerPickRows(v) {
  const needle = String(v || '').trim().toLowerCase();
  document.querySelectorAll('.mgr-pick-row').forEach(row => {
    row.style.display = !needle || row.dataset.name.includes(needle) ? '' : 'none';
  });
}

async function submitManagerPickModal(managerId) {
  const ids = [...document.querySelectorAll('.mgr-pick:checked')].map(el => Number(el.value));
  closeModal();
  await api.module.setUi(managerId, 'managerPicks', JSON.stringify(ids));
  await reloadSource(managerId);
}
