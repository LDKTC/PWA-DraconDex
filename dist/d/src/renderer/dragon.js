'use strict';
// Dragon workspace style — the "ERP" layout: a structured operations
// console over the Nexus nest instead of the freeform drag-to-arrange
// board this style shipped with first (that board is gone; positions are
// no longer a thing Dragon stores). What replaces it is the shape every
// ERP launchpad uses: a toolbar with search + view switch + create, a KPI
// strip summarising the level you are standing on, and the level's modules
// as either grouped app tiles or a record table.
// Like Drake and Wyvern, Dragon only owns how the tree gets BROWSED —
// opening a module still renders through buildBuilderPageHtml()/
// KIND_PAGE unchanged.

// ═══ Drill-down state — identical shape/semantics to S.wyvernBrowsePath.
// Needed because collector-kind modules have no standalone detail page
// (hub/open.js's openModuleNode toggles the left-panel tree instead) and
// Dragon has no left-panel tree to expand them in — each level renders as
// its own console page instead. ════════════════════════════════════════
function dragonBrowseCurrentList() {
  if (!S.dragonBrowsePath.length) return S.moduleTree;
  const parent = findModuleNode(S.dragonBrowsePath[S.dragonBrowsePath.length - 1]);
  return parent?.children || [];
}
function dragonBreadcrumbHtml() {
  const crumbs = [`<span class="wyvern-crumb" onclick="dragonDrillUp(-1)" data-no-i18n>${x(S.nexus.name)}</span>`];
  S.dragonBrowsePath.forEach((id, i) => {
    const m = findModuleNode(id);
    if (!m) return;
    crumbs.push(`<span class="wyvern-crumb" onclick="dragonDrillUp(${i})" data-no-i18n>${x(m.name)}</span>`);
  });
  return crumbs.join('<span class="wyvern-crumb-sep">›</span>');
}
// Drilling/leaving a level clears the search box with it — the query was
// only ever about the list being looked at, and carrying it across levels
// silently hides rows the user never filtered.
function dragonDrillInto(id) {
  if (!findModuleNode(id)) return;
  S.dragonBrowsePath = [...S.dragonBrowsePath, id];
  S.dragonSearch = '';
  renderNexusHome();
}
function dragonDrillUp(index) {
  S.dragonBrowsePath = index < 0 ? [] : S.dragonBrowsePath.slice(0, index + 1);
  S.dragonSearch = '';
  renderNexusHome();
}
// A module with children drills deeper (a folder expands before it opens,
// same as Drake's tree and Wyvern's cards); a childless one opens its
// detail page. Collector has no detail page at all (KIND_PAGE), so
// it always drills.
function dragonActivate(id) {
  const m = findModuleNode(id);
  if (!m) return;
  if ((m.children && m.children.length) || m.kind === 'collector') dragonDrillInto(id);
  else openModuleNode(id);
}
// "Create where you're currently looking" — Nexus root at the top level,
// otherwise the module drilled into (mirrors wyvernCreateParentId()).
function dragonCreateParentId() {
  return S.dragonBrowsePath.length ? S.dragonBrowsePath[S.dragonBrowsePath.length - 1] : null;
}

// ═══ Console ══════════════════════════════════════════════════════════
// Mutually exclusive with the console exactly like Wyvern's somethingOpen —
// same precedence chain, just named per-file since dragon.js has no other
// reason to share state with wyvern.js.
function dragonSomethingOpen() {
  return !!(S.activeItemNode || S.activeModuleNode || S.filePreview || S.sageHut || S.importDockPage);
}
// Per-module accent, falling back to the theme accent rather than a literal
// so an uncolored module still tracks the active theme.
function dragonNodeColor(m) {
  const c = m.icon_color_code || m.color_code;
  return c ? x(c) : 'var(--accent)';
}
function dragonView() {
  return DRAGON_VIEW_OPTIONS.includes(S.settings.dragonView) ? S.settings.dragonView : 'tiles';
}
// Name OR kind label, so typing a kind ("Locator", or its Classic alias)
// narrows to that group the same way clicking one would. Every name the kind
// answers to, whatever the mode (§10.5) — Classic became the default, and an
// English word must still find it.
function dragonFilteredList() {
  const list = dragonBrowseCurrentList();
  const term = (S.dragonSearch || '').trim().toLowerCase();
  if (!term) return list;
  return list.filter(m => `${m.name || ''} ${kindSearchText(m.kind)}`.toLowerCase().includes(term));
}

// KPI strip — the level's own numbers, deliberately NOT filtered by the
// search box: these describe where you are standing, and having them jump
// while typing would make them unreadable.
function dragonKpiHtml() {
  const list = dragonBrowseCurrentList();
  const descendants = flattenModulesByKind(list, []).length - list.length;
  const kinds = new Set(list.map(m => m.kind)).size;
  const total = flattenModulesByKind(S.moduleTree, []).length;
  const cells = [
    [list.length, t('dragonStatModules')],
    [descendants, t('dragonStatChildren')],
    [kinds, t('dragonStatKinds')],
    [total, t('dragonStatTotal')],
  ];
  return `<div class="erp-kpis">${cells.map(([v, label]) => `<div class="erp-kpi">
      <div class="erp-kpi-v" data-no-i18n>${v}</div>
      <div class="erp-kpi-l">${label}</div>
    </div>`).join('')}</div>`;
}

function dragonToolbarHtml() {
  const view = dragonView();
  // btn btn-g gives the ghost fill/hover/typography every other button in
  // the app has; .erp-viewtab only tightens it into a segmented control and
  // paints the selected segment (workspace.css, last in the cascade).
  const tab = (id, icon, label) => `<button class="btn btn-g erp-viewtab${view === id ? ' active' : ''}" onclick="dragonSetView('${id}')" title="${label}">${icon}<span class="erp-viewtab-l">${label}</span></button>`;
  return `<div class="erp-toolbar">
    <div class="erp-search">${I.search}<input id="dragon-search" type="text" autocomplete="off" value="${x(S.dragonSearch || '')}" placeholder="${t('search')}" oninput="dragonSetSearch(this.value)"></div>
    <div class="erp-viewtabs">
      ${tab('tiles', I.layer, t('dragonViewTiles'))}
      ${tab('table', I.table, t('dragonViewTable'))}
    </div>
    <button class="btn btn-p btn-sm" onclick="event.stopPropagation();openKindPopup(dragonCreateParentId(),this)">+ ${t('createMajorModule')}</button>
  </div>`;
}

// Tiles view — modules bucketed by kind, in MODULE_KINDS order so the
// sections don't reshuffle as the tree changes (an ERP launchpad's app
// groups stay put).
function dragonTileHtml(m) {
  const childCount = m.children?.length || 0;
  const color = dragonNodeColor(m);
  return `<div class="erp-tile" onclick="dragonActivate(${m.id})" oncontextmenu="openModuleContextMenu(event,${m.id})">
    <span class="erp-tile-ic" style="color:${color};border-color:${color}">${moduleIconHtml(m)}</span>
    <div class="erp-tile-body">
      <div class="erp-tile-name" data-no-i18n>${x(m.name)}</div>
      <div class="erp-tile-meta" data-no-i18n>${x(kindLabel(m.kind))}</div>
    </div>
    ${childCount ? `<span class="erp-tile-badge" data-no-i18n>${childCount}</span>` : ''}
  </div>`;
}
function dragonTilesHtml(list) {
  const order = MODULE_KINDS.filter(k => list.some(m => m.kind === k));
  return order.map(kind => {
    const rows = list.filter(m => m.kind === kind);
    return `<section class="erp-group">
      <div class="erp-group-head">
        <span class="erp-group-dot" style="background:${KIND_COLOR[kind] || 'var(--accent)'}"></span>
        <span class="erp-group-name" data-no-i18n>${x(kindLabel(kind))}</span>
        <span class="erp-group-count" data-no-i18n>${rows.length}</span>
      </div>
      <div class="erp-tiles">${rows.map(dragonTileHtml).join('')}</div>
    </section>`;
  }).join('');
}

// Table view — the same records as a flat ERP list: one row per module,
// sortable-looking header, click-through on the row, explicit Open action
// for anything that has a detail page of its own.
function dragonTableHtml(list) {
  const rows = list.map(m => {
    const childCount = m.children?.length || 0;
    const canOpen = m.kind !== 'collector';
    return `<tr onclick="dragonActivate(${m.id})" oncontextmenu="openModuleContextMenu(event,${m.id})">
      <td><span class="erp-row-ic" style="color:${dragonNodeColor(m)}">${moduleIconHtml(m)}</span><span data-no-i18n>${x(m.name)}</span></td>
      <td data-no-i18n>${x(kindLabel(m.kind))}</td>
      <td class="erp-num" data-no-i18n>${childCount || '—'}</td>
      <td class="erp-act">${canOpen ? `<button class="btn btn-s btn-sm" onclick="event.stopPropagation();openModuleNode(${m.id})">${t('open')}</button>` : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="erp-table-wrap"><table class="erp-table">
    <thead><tr>
      <th>${t('name')}</th><th>${t('moduleKind')}</th>
      <th class="erp-num">${t('dragonColChildren')}</th><th class="erp-act"></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// Everything below the KPI strip — re-rendered on its own while typing in
// the search box (dragonSetSearch) so the input element itself survives and
// keeps focus/caret, instead of going through a full renderNexusHome().
function dragonBodyHtml() {
  if (!dragonBrowseCurrentList().length) {
    return `<div class="empty"><div class="ei">${I.layer}</div><h3>${t('nestEmpty')}</h3></div>`;
  }
  const list = dragonFilteredList();
  if (!list.length) return `<div class="empty"><div class="ei">${I.search}</div><h3>${t('dragonNoMatch')}</h3></div>`;
  return dragonView() === 'table' ? dragonTableHtml(list) : dragonTilesHtml(list);
}
function buildDragonConsoleHtml() {
  return `${pageHeadHtml({ bare: true, cls: 'erp-head', titleText: S.nexus?.name || '', sub: `<div class="wyvern-breadcrumb">${dragonBreadcrumbHtml()}</div>` })}
    ${dragonToolbarHtml()}
    ${dragonKpiHtml()}
    <div id="dragon-body">${dragonBodyHtml()}</div>`;
}
function dragonSetView(view) {
  if (!DRAGON_VIEW_OPTIONS.includes(view) || dragonView() === view) return;
  S.settings.dragonView = view;
  saveUiSettings();
  renderNexusHome();
}
function dragonSetSearch(value) {
  S.dragonSearch = value;
  const body = q('#dragon-body');
  if (body) body.innerHTML = dragonBodyHtml();
}

// ═══ Home entry point (renderNexusHome's workspace-style branch) ════════
// Defers to the shared builder-page precedence chain whenever anything is
// open (a module/file/item/sagehut/kindBrowser/importDock page — all
// chrome-agnostic already); only the empty-state welcome fallback is
// replaced with Dragon's own console.
function buildDragonPageHtml() {
  return dragonSomethingOpen() ? buildBuilderPageHtml() : buildDragonConsoleHtml();
}
// No dedicated toolbar element unlike renderWyvernHome() — Dragon keeps the
// normal nav-sidebar tools, its own toolbar lives inside the console page.
function renderDragonHome() {
  S.view = 'nexus';
  S.activeModule = null;
  document.body.classList.toggle('renaming-lock', S.renamingModuleId != null);
  updateTopNavButton();
  q('#main-inner')?.classList.remove('relation-main');
  if (!S.nexus) {
    renderNexusPicker();
    if (S.nexuses.length) q('#main-inner').innerHTML = buildWyvernNexusPickerHtml();
    return;
  }
  renderBuilderPanes(buildDragonPageHtml, runBuilderMounts);
}
