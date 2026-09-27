'use strict';
// Wyvern workspace style (Plan.md part2 #New Workspace, spec'd in
// featureplan.md) — the newcomer/simple layout: one toolbar + one Builder
// pane (no splits, no left panel/Nexus Nest tree), drill-down navigation
// instead. Every toolbar action reuses an existing Drake function verbatim
// (see each button below) rather than reimplementing it — Wyvern is a
// different chrome around the same app, not a second app.

// ═══ Toolbar shell (#workspace-toolbar, index.html) ═════════════════════
// Re-rendered whenever the workspace/nexus/view-set state changes — unlike
// the static nav-sidebar buttons bindNav() wires once at boot, every button
// here carries its own onclick so a full innerHTML replace never loses a
// listener.
function renderWyvernToolbar(){
  const bar = q('#workspace-toolbar');
  if (!bar) return;
  if (S.settings.workspaceStyle !== 'wyvern' || !S.nexus) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  // "Create module" only where featureplan.md scopes it — browsing/viewing
  // the Nexus Nest itself, not while Sage Hut/Import Dock is up.
  const atNest = !S.sageHut && !S.importDockPage;
  bar.innerHTML = `
    <button class="nav-btn" onclick="event.stopPropagation();openWyvernViewSetMenu(this)" title="${t('wyvernViewSet')}">${I.layer}<span class="nav-label">${t('wyvernViewSet')}</span></button>
    <div class="wyvern-toolbar-sep"></div>
    <button class="nav-btn" onclick="importDatabaseFile()" title="${t('importDb')}">${I.import}<span class="nav-label">${t('importDb')}</span></button>
    <button class="nav-btn" onclick="exportDatabaseFile()" title="${t('exportDb')}">${I.export}<span class="nav-label">${t('exportDb')}</span></button>
    <button class="nav-btn" onclick="wyvernGoToView('hashtag')" title="${t('hashtag')}">${I.hashtag}<span class="nav-label">${t('hashtag')}</span></button>
    <button class="nav-btn" onclick="wyvernGoToView('colors')" title="${t('colors')}">${I.colors}<span class="nav-label">${t('colors')}</span></button>
    ${atNest ? `<div class="wyvern-toolbar-sep"></div>
    <button class="nav-btn" onclick="event.stopPropagation();openKindPopup(wyvernCreateParentId(),this)" title="${t('createMajorModule')}">${I.plus}<span class="nav-label">${t('createMajorModule')}</span></button>` : ''}
  `;
}

// data-panel nav-btns are normally bound once in bindNav() (core/views.js) —
// this toolbar redraws on every state change, so its buttons call this
// directly instead of relying on a listener that would go stale.
function wyvernGoToView(view){
  document.querySelectorAll('.nav-btn[data-panel]').forEach(b => b.classList.remove('active'));
  S.view = view;
  updateTopNavButton();
  switchView(view);
}

// Nexus-root if browsing at the top, else whatever module the user has
// drilled into — "create where you're currently looking," not always a
// new top-level module.
function wyvernCreateParentId(){
  return S.wyvernBrowsePath.length ? S.wyvernBrowsePath[S.wyvernBrowsePath.length - 1] : null;
}

// View-set menu: Nexus Nest / Sage Hut / Import Dock — each just launching
// the existing Drake function for that view unchanged. The 4th "Import DB"
// option (openImportDbHub) was removed with the legacy view's other entry
// points (Plan process2 part2 #1.2).
function openWyvernViewSetMenu(anchor){
  closeAllPopups();
  const pop = document.createElement('div');
  pop.className = 'kind-popup kind-list-popup';
  pop.innerHTML = `
    <div class="kind-list-item" onclick="closeAllPopups();goToNexusNestHub()"><span class="kli-name">${x(t('nexusNest'))}</span></div>
    <div class="kind-list-item" onclick="closeAllPopups();openSageTab('dataSize')"><span class="kli-name">${x(t('sageHut'))}</span></div>
    <div class="kind-list-item" onclick="closeAllPopups();goToImportDockPage()"><span class="kli-name">${x(t('importDock'))}</span></div>
  `;
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

// ═══ Drill-down browse (replaces the docked Nexus Nest tree) ════════════
function wyvernBrowseCurrentList(){
  if (!S.wyvernBrowsePath.length) return S.moduleTree;
  const parent = findModuleNode(S.wyvernBrowsePath[S.wyvernBrowsePath.length - 1]);
  return parent?.children || [];
}
function wyvernBrowseBreadcrumbHtml(){
  const crumbs = [`<span class="wyvern-crumb" onclick="wyvernDrillUp(-1)" data-no-i18n>${x(S.nexus.name)}</span>`];
  S.wyvernBrowsePath.forEach((id, i) => {
    const m = findModuleNode(id);
    if (!m) return;
    crumbs.push(`<span class="wyvern-crumb" onclick="wyvernDrillUp(${i})" data-no-i18n>${x(m.name)}</span>`);
  });
  return crumbs.join('<span class="wyvern-crumb-sep">›</span>');
}
// A module with children drills deeper by default (matches Drake's own
// tree — a folder expands, it doesn't immediately open); a childless
// module opens its detail page directly since there's nowhere to drill.
// Collector is folder-only (no detail page at all, per KIND_PAGE)
// so it always drills, never offers the separate "open" button.
function wyvernBrowseCardHtml(m, totalModules){
  const hasChildren = !!(m.children && m.children.length);
  const canOpen = m.kind !== 'collector';
  const primary = hasChildren || !canOpen ? `wyvernDrillInto(${m.id})` : `openModuleNode(${m.id})`;
  return `<div class="typecard" onclick="${primary}" oncontextmenu="openModuleContextMenu(event,${m.id})">
    <h5 style="color:${x(m.icon_color_code || m.color_code || '#6366f1')}" data-no-i18n>${moduleIconHtml(m)} ${x(m.name)}</h5>
    <p data-no-i18n>${x(kindLabel(m.kind))}${hasChildren ? ` · ${m.children.length}:${totalModules}` : ''}</p>
    ${hasChildren && canOpen ? `<button class="btn btn-s btn-sm" onclick="event.stopPropagation();openModuleNode(${m.id})">${t('open')}</button>` : ''}
  </div>`;
}
function buildWyvernBrowseHtml(){
  const list = wyvernBrowseCurrentList();
  const totalModules = flattenModulesByKind(S.moduleTree).length;
  const body = list.length
    ? `<div class="typegrid">${list.map(m => wyvernBrowseCardHtml(m, totalModules)).join('')}</div>`
    : `<div class="empty"><div class="ei">${I.layer}</div><h3>${t('nestEmpty')}</h3></div>`;
  return `${pageHeadHtml({ bare: true, titleText: S.nexus?.name || '', sub: `<div class="wyvern-breadcrumb">${wyvernBrowseBreadcrumbHtml()}</div>` })}
    ${body}`;
}
function wyvernDrillInto(id){
  if (!findModuleNode(id)) return;
  S.wyvernBrowsePath = [...S.wyvernBrowsePath, id];
  renderNexusHome();
}
function wyvernDrillUp(index){
  S.wyvernBrowsePath = index < 0 ? [] : S.wyvernBrowsePath.slice(0, index + 1);
  renderNexusHome();
}

// ═══ Home entry point (renderNexusHome's workspace-style branch) ════════
// Defers to the shared builder-page precedence chain whenever anything is
// open (a module/file/item/sagehut/kindBrowser/importDock page — all
// chrome-agnostic already); only the empty-state welcome fallback is
// replaced with Wyvern's own drill-down browse view.
function buildWyvernPageHtml(){
  const somethingOpen = S.activeItemNode || S.activeModuleNode || S.filePreview || S.sageHut || S.importDockPage;
  return somethingOpen ? buildBuilderPageHtml() : buildWyvernBrowseHtml();
}
// renderNexusPicker() (core/nexus.js) writes its actual pickable Nexus list
// into #left-panel-inner — hidden in Wyvern — and leaves #main-inner with
// only a generic "select a Nexus" message and no way to act on it. Wyvern
// has no left panel at all, so when there's a real list to choose from,
// mirror it into #main-inner too (same row markup, reused verbatim).
function buildWyvernNexusPickerHtml(){
  return `<div class="ph"><h4>${t('nexus')}</h4>
      <button class="btn btn-p btn-sm" onclick="openNexusModal()">+ ${t('nexusNew')}</button>
    </div>
    <div class="typegrid">${S.nexuses.map(n => `
      <div class="typecard" onclick="selectNexus(${n.id})">
        <h5 data-no-i18n><span class="nexus-vault-dot" style="${n.color_code ? `background:${x(n.color_code)}` : ''}"></span> ${x(n.name)}</h5>
        <p>${n.project_count} ${t('nexus')}</p>
      </div>`).join('')}</div>`;
}
function renderWyvernHome(){
  S.view = 'nexus';
  S.activeModule = null;
  document.body.classList.toggle('renaming-lock', S.renamingModuleId != null);
  updateTopNavButton();
  q('#main-inner')?.classList.remove('relation-main');
  if (!S.nexus) {
    renderNexusPicker();
    if (S.nexuses.length) q('#main-inner').innerHTML = buildWyvernNexusPickerHtml();
    renderWyvernToolbar();
    return;
  }
  renderWyvernToolbar();
  renderBuilderPanes(buildWyvernPageHtml, runBuilderMounts);
}
