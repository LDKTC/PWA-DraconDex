// The Hub panel's accordion shell and its non-tree sections: Sage Hut rows,
// the Kind Browser (modules grouped by kind) and the import-choice modal
// that picks between 'import as nest' and 'import as DB'.
// ═══ HUB PANEL — accordion shell (Phase 2) + Nexus nest tree (Phase 3) ═
// Process 7 part 1: animates the open/close — see core/ui.js's
// animateToggleOpen()/animateToggleCloseThenCommit() for why opening and
// closing need different treatment under this app's full-rerender model.
function toggleHubSection(name) {
  const opening = !S.hubOpen[name];
  const commit = () => {
    S.hubOpen[name] = opening;
    localStorage.setItem(HUB_OPEN_KEY, JSON.stringify(S.hubOpen));
    renderNexusHome();
    if (opening) animateToggleOpen(q(`.acc-body[data-key="${name}"]`));
  };
  if (opening) { commit(); return; }
  animateToggleCloseThenCommit(q(`.acc-body[data-key="${name}"]`), commit);
}

function toggleMajorExpand(id) {
  const expanding = S.moduleCollapsed.has(id);
  const commit = () => {
    if (expanding) S.moduleCollapsed.delete(id); else S.moduleCollapsed.add(id);
    renderNexusHome();
    if (expanding) animateToggleOpen(q(`.nest-children[data-parent-id="${id}"]`));
  };
  if (expanding) { commit(); return; }
  animateToggleCloseThenCommit(q(`.nest-children[data-parent-id="${id}"]`), commit);
}

// Nexus Nest display options (Plan part1 #2) — lightweight setters, deliberately
// not reusing the generic setUiSetting() since that fires an unwanted toast
// plus unrelated re-renders meant for the full Settings modal.
function toggleNestOption(key) {
  S.settings[key] = !S.settings[key];
  saveUiSettings();
  renderNexusHome();
  const pop = document.querySelector('.nest-options-popup');
  if (pop) pop.innerHTML = buildNestOptionsPopupHtml();
}
// Process 8 part 1: no longer a toggle — the signature slot after a Nest row's
// name now picks between three things (kind label / kind icon / the module's
// handle), so the caller names the mode instead of flipping a boolean.
function setNestSignatureMode(mode) {
  S.settings.nestSignatureMode = ['icon', 'handle'].includes(mode) ? mode : 'name';
  saveUiSettings();
  renderNexusHome();
  const pop = document.querySelector('.nest-options-popup');
  if (pop) pop.innerHTML = buildNestOptionsPopupHtml();
}

function buildHubHtml() {
  // Vertical drag-resize (Plan part1 #2.1): once >1 section is open, an open
  // section's stored height wins over the default equal-share flex:1 — see
  // startHubSectionResize (core/ui.js). With 0-1 open there's no pair to
  // redistribute between, so skip it and let flex:1 fill the space as before.
  const heights = S.hubSectionHeights || {};
  // v5 Part 7 (§11.9): this is the Activity Bar's Nest destination now —
  // Sage Hut moved to its own destination, the Kind Browser into the Nest's
  // "group by kind" option (hub/activity.js).
  const openCount = ['nest', 'dock'].filter(k => S.hubOpen[k]).length;
  const h = (key) => openCount > 1 ? heights[key] : null;
  const sections = [
    { key: 'nest', html: buildAccSection('nest', t('nexusNest'), nestByKind() ? buildKindBrowserHtml() : buildNestTreeHtml(),
        // Plan part1 #6: one-click Collector create, no popup/name-prompt
        // needed — quickCreateModule already auto-names + enters inline
        // rename mode for every kind when called with no cat_type decision.
        `<button class="btn btn-g btn-i" onclick="event.stopPropagation();quickCreateModule('collector',null)" title="${kindLabel('collector')}">${I[KIND_ICON.collector]}</button>
         <button class="btn btn-g btn-i" data-cmd="app.newModule" onclick="event.stopPropagation();runCommand('app.newModule',{},this)" title="${t('createMajorModule')}">${I.plus}</button>
         <button class="btn btn-g btn-i" onclick="event.stopPropagation();openNestOptionsPopup(this)" title="${t('nestOptionsTitle')}">${I.options}</button>`, h('nest')) },
    { key: 'dock', html: buildAccSection('dock', t('importDock'),
        typeof buildImportDockRows === 'function' ? buildImportDockRows() : '',
        `<button class="btn btn-g btn-i" onclick="event.stopPropagation();importDockPickFolder()" title="${t('importFolder')}">${I.import}</button>
         <button class="btn btn-g btn-i" data-cmd="app.importDock" onclick="event.stopPropagation();runCommand('app.importDock')" title="${t('importDock')}">${I.panelRight}</button>`, h('dock')) },
    // Plan part2 §2: this accordion section is removed — legacy import is
    // now offered via the conversion preview (hub/legacy-migrate.js's
    // openLegacyMigratePreviewModal) that importDatabaseFile() (core/views.js)
    // opens automatically after a merge brings in un-migrated legacy data,
    // instead of a standing Hub section.
  ];
  // Plan process1 part3 #3 (replaces the old Plan part1 #2 stable-sort):
  // section order (nest, sage, dock) never changes regardless of collapse
  // state — no more grouping every collapsed section after every open one.
  // #hub-body is a flex column where each open .acc-body is flex:1 and each
  // collapsed one is display:none (nav-hub.css), so a collapsed section's
  // head naturally sits flush against whatever follows it: pinned to the
  // bottom of the preceding open section's body if something later is open,
  // or to the very bottom of the hub body if it's the last section in order.
  // A resize handle only makes sense between two sections that are BOTH open
  // (a collapsed section takes no flex space, so there'd be nothing to drag
  // against) — checked in this post-sort order so e.g. Nest+Dock open with
  // Sage Hut collapsed still get a handle between the two open ones.
  const out = [];
  sections.forEach((s, i) => {
    out.push(s.html);
    const next = sections[i + 1];
    if (S.hubOpen[s.key] && next && S.hubOpen[next.key]) {
      out.push(`<div class="panel-resize-handle panel-resize-handle-v" onmousedown="startHubSectionResize(event,'${s.key}','${next.key}')" title="${t('resizePanel')}"></div>`);
    }
  });
  return `<div id="hub-body">${out.join('')}</div>`;
}

// ═══ SAGE HUT SECTION (Phase 17) ═══════════════════════════════════════
// Four analytics rows (mockup 25); each opens the Sage Hut page in the
// builder with that view active (openSageTab lives in mod/sagehut.js).
// Count badges appear once the stats have been loaded this session.
function buildSageHutRows() {
  const st = S.sageHut?.stats;
  const rows = [
    ['dataSize', t('sageDataSize'), I.sage, st ? fmtBytes(st.bytes) : ''],
    ['objectAmount', t('sageObjectAmount'), I.layer, st ? String(st.objects) : ''],
    ['linkerList', t('sageLinkerList'), I.list, st ? String(st.links) : ''],
    ['linkerGraph', t('sageLinkerGraph'), I.relation, ''],
  ];
  return rows.map(([tab, label, icon, badge]) => `
    <div class="li${!S.activeModuleNode && S.sageHut?.tab === tab ? ' sel' : ''}" onclick="openSageTab('${tab}')">
      <span class="kicon">${icon}</span><span class="name">${x(label)}</span>
      ${badge ? `<span class="cnt" data-no-i18n>${x(badge)}</span>` : ''}
    </div>`).join('');
}

// ═══ KIND BROWSER SECTION (Plan part2 #1) ═══════════════════════════════
// Replaces the old legacy-only Explorer panel (wiki:explorerTree, blind to
// the v3 module table) with a view classifying every module in this Nexus
// by its kind, using data already in memory (S.moduleTree) — no new IPC.
function flattenModulesByKind(nodes = S.moduleTree, out = []) {
  for (const m of nodes) {
    out.push(m);
    if (m.children?.length) flattenModulesByKind(m.children, out);
  }
  return out;
}

function groupModulesByKind() {
  const groups = {};
  for (const m of flattenModulesByKind()) (groups[m.kind] ||= []).push(m);
  return groups;
}

function buildKindBrowserHtml() {
  const groups = groupModulesByKind();
  const kinds = MODULE_KINDS.filter(k => groups[k]?.length);
  if (!kinds.length) return nestEmptyHtml();
  return kinds.map(k => {
    const mods = groups[k].slice().sort((a, b) => a.name.localeCompare(b.name));
    const open = S.kindBrowserOpen.has(k);
    return `
      <div class="li" onclick="toggleKindGroup('${k}')">
        <svg class="icon tree-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="${open ? '6 9 12 15 18 9' : '9 18 15 12 9 6'}"/></svg>
        <span class="kicon" style="color:${x(KIND_COLOR[k])}">${I[KIND_ICON[k]]}</span>
        <span class="name">${x(kindLabel(k))}</span>
        <span class="kind" data-no-i18n>${mods.length}</span>
      </div>
      ${open ? mods.map(m => `
        <div class="li indent1" onclick="event.stopPropagation();openModuleNode(${m.id})">
          <span class="name">${x(m.name)}</span>
        </div>`).join('') : ''}`;
  }).join('');
}

function toggleKindGroup(kind) {
  if (S.kindBrowserOpen.has(kind)) S.kindBrowserOpen.delete(kind); else S.kindBrowserOpen.add(kind);
  renderNexusHome();
}

// Plan process2 part1 #2: reverts "Plan part2 §2"'s earlier move (Kind
// Browser promoted to its own full Builder page) — it's back in the Hub
// accordion now, so this nav-rail button no longer opens a competing page
// state; it just goes to Hub home (same reset as goToNexusNestHub()) and
// expands the 'kinds' section, same persistence toggleHubSection() uses.
function goToKindBrowserHub() {
  S.activeModuleNode = null;
  S.activeItemNode = null;
  S.filePreview = null;
  S.sageHut = null;
  S.importDockPage = false;
  // v5 Part 7 (§11.9): the Kind Browser is the Nest grouped by kind.
  setNestByKind(true);
  S.hubOpen.nest = true;
  localStorage.setItem(HUB_OPEN_KEY, JSON.stringify(S.hubOpen));
  showLeftDest('nest');
  renderNexusHome();
}

// Plan part1 #2: resizable page view — Sage Hut / Import Dock file preview /
// Kind Browser have no other resize lever (unlike Module Detail, which
// already gets one via the Module Inspector dock's own #inspector-resize),
// so wrap their existing full-page markup in a shell with a drag handle.
// S.pageViewWidth unset ⇒ .page-view has no inline style ⇒ fills the shell
// exactly as before this feature existed.
function wrapPageView(innerHtml) {
  const w = S.pageViewWidth;
  return `<div class="page-view-shell">
    <div class="page-view" style="${w ? `flex:0 0 ${w}px;max-width:${w}px` : ''}">${innerHtml}</div>
    <div id="page-view-resize" class="panel-resize-handle" onmousedown="startPageViewResize(event)" title="${t('resizePageView')}"></div>
    <div class="page-view-filler"></div>
  </div>`;
}

// Plan part2 #New Workspace: same "promoted out of the accordion into its
// own full page" move goToKindBrowserHub used to make (Process 2 part1 #2
// reverted that move for Kind Browser, but Import Dock's own page stays) —
// Wyvern's View-set menu needs Import Dock as a standalone page (today
// it's accordion-only), and this is the exact precedent to copy.
// buildImportDockRows() (mod/fileviewer.js) is reused verbatim; only its
// container moved.
function goToImportDockPage() {
  S.activeModuleNode = null;
  S.activeItemNode = null;
  S.filePreview = null;
  S.sageHut = null;
  S.importDockPage = true;
  renderNexusHome();
}

function buildImportDockPageHtml() {
  return wrapPageView(`${pageHeadHtml({
      title: x(t('importDock')), titleText: t('importDock'),
      sub: `<span data-no-i18n>${x(S.nexus.name)}</span>`,
    })}
    <div class="acc-body" style="display:block">${typeof buildImportDockRows === 'function' ? buildImportDockRows() : ''}</div>`);
}

// Plan process2 part2 #1.2: the old two-card "import choice" modal
// (convert to Nexus Nest vs open the read-only legacy Import DB view) is
// gone now that the legacy view has no entry point left to offer — a
// database merge that brings in legacy-shaped data goes straight to the
// comparison-list preview (hub/legacy-migrate.js's
// openLegacyMigratePreviewModal), same as the boot-detected legacy-data
// prompt flow. See importDatabaseFile() (core/views.js) for the call site.

