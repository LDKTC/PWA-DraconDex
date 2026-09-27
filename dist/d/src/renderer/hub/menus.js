// Right-click context menus (nest row / nav sidebar), the move-to list,
// pane-direction submenu, and the kind-picker popup that creates a module
// instantly instead of opening the full form.
// ═══ Right-click context menus (Nest row / Nav-sidebar) ════════════════
// v5 Part 6 (§10.2): the menu is built from COMMANDS (core/commands.js), so
// every row here is also a palette command. openModuleContextMenu stays the
// one entry point the Nest, Wyvern, Dragon and Manager rows call.
function openModuleContextMenu(ev, id) {
  if (!findModuleNode(id)) { ev?.preventDefault?.(); return; }
  openCtx('nest.module', ev, { moduleId: id });
}

// Plan process3 part2: every module is "Major" now — Create/Import/Export/Pin
// are unconditional, except that v5 Part 4 (§8.8) makes "create inside",
// "import a module here" and "import a folder here" folder-only (each
// command's `when`). Open-in-tab/window/pane skip the collector, which has
// no page of its own (KIND_PAGE); the pane flyout is Drake-only.
CTX_PROVIDERS['nest.module'] = (c) => [
  cmdItem('module.create', c),
  cmdItem('module.importModule', c),
  cmdItem('module.exportAs', c),
  cmdItem('module.export', c),
  cmdItem('module.importFolder', c),
  cmdItem('module.addLink', c),
  { sep: true },
  cmdItem('module.openTab', c),
  cmdItem('module.openWindow', c),
  cmdItem('module.openPane', c),
  isFolderCtx(c) ? null : { sep: true },
  cmdItem('module.rename', c),
  cmdItem('module.handle', c),
  cmdItem('module.icon', c),
  cmdItem('module.duplicate', c),
  cmdItem('module.moveTo', c),
  cmdItem('module.savePreset', c),
  cmdItem('module.saveBundle', c),
  { sep: true },
  cmdItem('module.delete', c),
  { sep: true },
  cmdItem('module.pin', c),
];

// Plan part1 #3: pop a module's own Builder page into a fresh floating
// window — mirrors builderPopOutTab's own api.window.openBuilderTab call,
// but without its builderCloseTab step, since nothing existing is being
// moved/closed here (the module opens in the new window while the current
// pane/tab, if any, is left untouched).
// Plan procress1 part2 #1: explicit escape hatch for tab-accumulation now
// that builderNavigate's default open REPLACES the pane's active tab —
// pushes the key into pane.tabs itself first so builderNavigate's own
// "already includes" branch just switches to it instead of replacing.
async function openModuleInNewTab(id) {
  const m = findModuleNode(id);
  if (!m) return;
  const key = builderPageKey({ kind: 'module', id });
  const pane = builderState().panes[builderState().focused];
  if (!pane.tabs.includes(key)) pane.tabs.push(key);
  await openModuleNode(id);
}

async function openModuleInNewWindow(id) {
  const m = findModuleNode(id);
  if (!m) return;
  await api.window.openBuilderTab(S.nexus.id, builderPageKey({ kind: 'module', id }));
}

const PANE_DIR_MAP = { left: ['h', true], right: ['h', false], top: ['v', true], bottom: ['v', false] };
// Plan part1 #3: split the currently-focused Builder pane in the requested
// direction and open the module straight into the freshly created pane —
// same (dir,newFirst) convention already used by the drag-to-edge auto-split
// (onBodyDrop): left/top put the new pane before the original, right/bottom
// put it after.
async function openModuleInNewPane(id, dir) {
  const m = findModuleNode(id);
  if (!m) return;
  const [axis, newFirst] = PANE_DIR_MAP[dir];
  const newIdx = builderSplitPane(builderState().focused, axis, newFirst);
  if (newIdx == null) return;
  await builderFocusPane(newIdx, { kind: 'module', id });
}

// The builder pane's right-click (builder.js openBuilderPaneContextMenu) —
// registered here because builder.js loads before hub/ctxmenu.js.
CTX_PROVIDERS['builder.pane'] = (c) => [
  cmdItem('pane.split', c),
  cmdItem('pane.close', c) ? { sep: true } : null,
  cmdItem('pane.close', c),
];

// A Manager row is a module row, plus "unpick" when it was hand-picked.
CTX_PROVIDERS['manager.row'] = (c) => {
  const rest = CTX_PROVIDERS['nest.module'](c);
  const unpick = cmdItem('manager.unpick', c);
  return unpick ? [unpick, { sep: true }, ...rest] : rest;
};

async function ctxExportModule(id) {
  const m = findModuleNode(id);
  const r = await api.db.exportModuleFile(S.nexus.id, id, m?.name);
  if (r.canceled) return;
  if (!r.ok) return toast(t('driveErrServer'), 'error');
  toast(t('settingDbExportOk'), 'ok');
}
async function ctxImportModule(id) {
  const r = await api.db.importModuleFile(S.nexus.id, id);
  if (r.canceled) return;
  if (!r.ok) return toast(t('driveErrServer'), 'error');
  toastSnapshotResult(r, 'settingDbImportOk');
  await reloadModuleTree();
}

function flattenModuleTree(nodes, depth, out) {
  out = out || [];
  for (const m of nodes) {
    out.push({ m, depth });
    if (m.children?.length) flattenModuleTree(m.children, depth + 1, out);
  }
  return out;
}
function buildMoveToListHtml(id) {
  const node = findModuleNode(id);
  if (!node) return '';
  let html = '';
  if (node.parent_id != null) {
    html += `<div class="kind-list-item" onclick="moveModuleTo(${id},null)"><span class="kli-name">${x(t('moveToTopLevel'))}</span></div>`;
  }
  const all = flattenModuleTree(S.moduleTree, 0);
  for (const { m: target, depth } of all) {
    if (target.id === id || isSelfOrDescendant(node, target.id)) continue;
    if (target.kind !== 'collector') continue; // §8.8 — only a folder holds modules
    html += `<div class="kind-list-item" style="padding-left:${10 + depth * 14}px" onclick="moveModuleTo(${id},${target.id})"><span class="kli-name">${x(target.name)}</span></div>`;
  }
  return html || `<div class="kind-list-item" style="opacity:.6;pointer-events:none"><span class="kli-name">${x(t('moveToNoTargets'))}</span></div>`;
}
async function moveModuleTo(id, newParentId) {
  closeAllPopups();
  if (!S.nexus) return;
  const siblings = (newParentId == null ? S.moduleTree : findModuleNode(newParentId)?.children || [])
    .map(m => m.id).filter(mid => mid !== id);
  siblings.push(id);
  try {
    await api.module.move(S.nexus.id, id, newParentId, siblings);
  } catch (_) {
    toast(t('moduleParentMustBeFolder'), 'err');
    return;
  }
  await reloadModuleTree();
}
async function duplicateModuleNode(id) {
  await api.module.duplicate(id);
  await reloadModuleTree();
  toast(t('duplicated'), 'ok');
}

function openNavSidebarContextMenu(ev) {
  ev.preventDefault();
  closeAllPopups();
  S.ctxMenuPos = { x: ev.clientX, y: ev.clientY };
  const pop = document.createElement('div');
  pop.className = 'kind-popup context-menu-popup nav-pin-popup';
  pop.innerHTML = buildNavPinListHtml();
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, ctxAnchor(ev).getBoundingClientRect());
}
function buildNavPinListHtml() {
  if (!S.moduleTree.length) return `<div class="kind-list-item" style="opacity:.6;pointer-events:none"><span class="kli-name">${x(t('nestEmpty'))}</span></div>`;
  // Process 6 part 1: every module can be pinned at any depth (see
  // buildModuleContextMenuHtml) — flatten the tree so this picker can list
  // and toggle nested modules too, not just root-level ones.
  return flattenModuleTree(S.moduleTree, 0).map(({ m, depth }) => `
    <div class="kind-list-item" style="padding-left:${10 + depth * 14}px" onclick="toggleNavPinAndRefresh(${m.id})">
      <span class="kicon" style="color:${x(m.icon_color_code || m.color_code || '#6366f1')}">${moduleIconHtml(m)}</span>
      <span class="kli-name">${x(m.name)}</span>
      <span class="ctx-check">${m.pinned ? I.check : ''}</span>
    </div>`).join('');
}
async function toggleNavPinAndRefresh(id) {
  const m = findModuleNode(id);
  if (!m) return;
  await api.module.update(id, { pinned: m.pinned ? 0 : 1 });
  await reloadModuleTree();
  const pop = document.querySelector('.nav-pin-popup');
  if (pop) pop.innerHTML = buildNavPinListHtml();
}

// Plan process4 part2 #1: right-click menu on the rail's Hub quick-menu
// buttons (Kind Browser/Sage Hut/Import Dock) to toggle which of them show
// on the rail — Nexus Nest is the rail's home button and can't be toggled
// off, so it's left out of this list entirely. Scoped to those buttons
// (not the whole #nav-sidebar, which openNavSidebarContextMenu already owns
// for module pinning) via stopPropagation so the two menus never collide.
// v5 Part 7 (§11.9): the Activity Bar's destinations (hub/activity.js);
// Nest is the rail's first button and stays out of the list.
const HUB_QUICK_MENU_ITEMS = [
  ['search', 'leftSearch', 'search'],
  ['labels', 'hashtag', 'hashtag'],
  ['sage', 'sageHut', 'sage'],
  ['tools', 'leftTools', 'fields'],
  ['trash', 'trashTitle', 'delete'],
];
function openHubQuickMenuContextMenu(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  closeAllPopups();
  S.ctxMenuPos = { x: ev.clientX, y: ev.clientY };
  const pop = document.createElement('div');
  pop.className = 'kind-popup context-menu-popup hub-quickmenu-popup';
  pop.innerHTML = buildHubQuickMenuToggleHtml();
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, ctxAnchor(ev).getBoundingClientRect());
}
function buildHubQuickMenuToggleHtml() {
  const hqt = S.settings.hubQuickToggles || {};
  return HUB_QUICK_MENU_ITEMS.map(([key, labelKey, icon]) => `
    <div class="kind-list-item" onclick="toggleHubQuickMenuAndRefresh('${key}')">
      <span class="kicon">${I[icon]}</span>
      <span class="kli-name">${x(t(labelKey))}</span>
      <span class="ctx-check">${hqt[key] !== false ? I.check : ''}</span>
    </div>`).join('');
}
function toggleHubQuickMenuAndRefresh(key) {
  const cur = (S.settings.hubQuickToggles || {})[key] !== false;
  S.settings.hubQuickToggles = Object.assign({}, S.settings.hubQuickToggles, { [key]: !cur });
  saveUiSettings();
  renderModuleRail();
  const pop = document.querySelector('.hub-quickmenu-popup');
  if (pop) pop.innerHTML = buildHubQuickMenuToggleHtml();
}

// Nexus Nest display options popup (Plan part1 #2) — 4 toggles driven by
// S.settings, same .kind-popup + positionPopupNear idiom as every other
// popup in this file.
function openNestOptionsPopup(anchor) {
  closeAllPopups();
  if (!anchor) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup nest-options-popup';
  pop.innerHTML = buildNestOptionsPopupHtml();
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
}
function buildNestOptionsPopupHtml() {
  const s = S.settings;
  const row = (onclick, on, labelKey) =>
    `<div class="togglerow nest-opt-row" onclick="${onclick}"><span class="tg${on ? ' on' : ''}"></span>${t(labelKey)}</div>`;
  // Same .name-mode-seg control the Preferences panel uses (nameModeSegHtml,
  // core/settings.js) — btn-p marks the active option, btn-s the rest.
  const sig = (mode, labelKey) =>
    `<button class="btn ${s.nestSignatureMode === mode ? 'btn-p' : 'btn-s'}" onclick="setNestSignatureMode('${mode}')">${t(labelKey)}</button>`;
  return [
    row("toggleNestOption('nestShowItems')", s.nestShowItems !== false, 'nestOptShowItems'),
    row("toggleNestOption('nestShowMajorIcon')", s.nestShowMajorIcon !== false, 'nestOptShowMajorIcon'),
    row("toggleNestOption('nestShowMinorIcon')", !!s.nestShowMinorIcon, 'nestOptShowMinorIcon'),
    // v5 Part 7 (§11.9): what the Kind Browser section was (app.kindBrowser).
    `<div class="togglerow nest-opt-row" data-cmd="app.kindBrowser" onclick="toggleNestByKind()"><span class="tg${nestByKind() ? ' on' : ''}"></span>${t('nestOptByKind')}</div>`,
    // 3-way, so a segmented row rather than a 4th toggle switch — the other
    // three rows above are genuine booleans and stay as they are.
    `<div class="nest-opt-row nest-sig-row"><div class="nest-sig-label">${t('nestOptSignature')}</div>
      <div class="name-mode-seg">${sig('name', 'nestSigName')}${sig('icon', 'nestSigIcon')}${sig('handle', 'nestSigHandle')}</div></div>`,
  ].join('');
}

// ═══ Kind-picker popup — instant create ════════════════════════════════
function openKindPopup(parentId, anchor) {
  closeAllPopups();
  if (!anchor) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup kind-list-popup';
  pop.innerHTML = buildKindListHtml(parentId, false, true);
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
  // §9.5: 3 headings + 5 sub-headings + 14 rows will scroll in 360px, so
  // the search box matters more, not less — it takes focus on open.
  setTimeout(() => pop.querySelector('.kind-search')?.focus(), 0);
}

// Last three kinds created, most recent first (§7.7) — a per-viewer
// convenience, so localStorage, and harmless when unavailable.
const KIND_RECENT_KEY = 'ddx.recentKinds';
function recentKinds() {
  try { return (JSON.parse(localStorage.getItem(KIND_RECENT_KEY) || '[]') || []).filter(k => MODULE_KINDS.includes(k)).slice(0, 3); }
  catch (_) { return []; }
}
function rememberRecentKind(kind) {
  try { localStorage.setItem(KIND_RECENT_KEY, JSON.stringify([kind, ...recentKinds().filter(k => k !== kind)].slice(0, 3))); }
  catch (_) { /* private window / blocked storage: the list just stays empty */ }
}

// v5 Part 6 (§10.8): a kind with presets (hub/presets.js) opens a flyout of
// them on hover; clicking the row itself still creates an empty module. Only
// in the top-level picker — inside the module menu's "Create" flyout a second
// flyout would replace the first (there is one .ctx-submenu at a time).
function kindListRowHtml(k, parentId, withPresets = false) {
  const pid = parentId ?? 'null';
  const hasPresets = withPresets && (presetsFor(k).length > 0 || templatesFor(k).length > 0);
  const hover = hasPresets
    ? `onmouseenter="openPresetSubmenu(event,'${k}',${pid})" onmouseleave="scheduleCtxSubmenuClose()"`
    : `onmouseenter="scheduleCtxSubmenuClose()"`;
  return `<div class="kind-list-item${hasPresets ? ' kli-submenu-parent' : ''}" data-kind-row data-search="${x(`${kindSearchText(k)} ${t(KIND_DESC_KEY[k])}`.toLowerCase())}"
      onclick="quickCreateModule('${k}',${pid})" ${hover}>
      <span class="kicon" style="color:${x(KIND_COLOR[k])}">${I[KIND_ICON[k]]}</span>
      <span class="kli-text"><span class="kli-name">${x(kindLabelBoth(k))}</span><span class="kli-desc">${t(KIND_DESC_KEY[k])}</span></span>
      ${hasPresets ? `<span class="kli-arrow">${I.chevronRight}</span>` : ''}
    </div>`;
}

// v5 Part 3 (V5.md §7.7) with Part 5's grouping (§9.5): Artisan first as its
// own row, then the 3 most recent kinds, then structure / view / data with
// data's five sub-headings. withSearch adds the filter box (the top-level
// "+" popups); the hover flyout from a module's "Create" row stays compact.
function buildKindListHtml(parentId, excludeCollector = false, withSearch = false) {
  let html = '';
  if (withSearch) {
    html += `<input class="kind-search" placeholder="${x(t('kindSearch'))}" oninput="filterKindList(this)"
      onkeydown="if(event.key==='Enter'){event.preventDefault();this.closest('.kind-popup').querySelector('[data-kind-row]:not([hidden])')?.click()}">`;
  }
  // v5 Part 7 (§11.7): "start from template" is a genre bundle — a whole
  // project in one click (hub/bundles.js). A bundle is a folder, so it can
  // start anywhere a folder can: at the top, or inside another folder.
  if (parentId == null || findModuleNode(parentId)?.kind === 'collector') {
    html += `<div class="kind-list-item kind-artisan-row" data-cmd="app.newProject" onclick="closeAllPopups();runCommand('app.newProject',{parentId:${parentId ?? 'null'}})">
      <span class="kicon" style="color:${x(KIND_COLOR.manager)}">${I.artisan}</span>
      <span class="kli-text"><span class="kli-name">${t('artStartTemplate')}</span><span class="kli-desc">${t('bundleRowD')}</span></span>
    </div>`;
  }
  const allowed = (k) => !(excludeCollector && k === 'collector');
  const recent = recentKinds().filter(allowed);
  if (recent.length) {
    html += `<div class="kind-list-head" data-kind-head>${t('kindRecent')}</div>` + recent.map(k => kindListRowHtml(k, parentId, withSearch)).join('');
  }
  let lastCat = null;
  for (const g of KIND_GROUPS) {
    const kinds = g.kinds.filter(allowed);
    if (!kinds.length) continue;
    if (g.cat !== lastCat) {
      html += `<div class="kind-list-head kind-list-cat" data-kind-head>${t(KIND_CATEGORY_KEY[g.cat])}</div>`;
      lastCat = g.cat;
    }
    if (g.key) html += `<div class="kind-list-head kind-list-sub" data-kind-head>${t(g.key)}</div>`;
    html += kinds.map(k => kindListRowHtml(k, parentId, withSearch)).join('');
  }
  if (withSearch && userPresetCount()) {
    html += `<div class="ctx-sep" data-kind-head></div>
      <div class="kind-list-item" data-kind-head data-cmd="app.managePresets" onclick="closeAllPopups();runCommand('app.managePresets')">
        <span class="kicon">${I.options}</span><span class="kli-name">${x(t('managePresets'))}</span></div>`;
  }
  return html;
}

// Filters rows by kind name (both names), description; headings hide while
// a query is active so the result reads as one flat list.
function filterKindList(inp) {
  const needle = inp.value.trim().toLowerCase();
  const pop = inp.closest('.kind-popup');
  pop.querySelectorAll('[data-kind-row]').forEach(r => { r.hidden = !!needle && !r.dataset.search.includes(needle); });
  pop.querySelectorAll('[data-kind-head], .kind-artisan-row').forEach(h => { h.hidden = !!needle; });
}

// v5 Part 3 (V5.md §7.4, decided): Classifier no longer stops for a cat_type
// popup — every new one is 'object'. Old 'element' / 'character' modules keep
// theirs and still work; the choice lives in the module's edit form.
//
// presetRef (v5 Part 6, hub/presets.js): shape the new module from a preset
// before it opens, so its first render is already the preset's.
// tplId (Procress 14, hub/page-templates.js): its first page — the kind's ★
// when none is picked; a preset's own page, if it has one, wins after.
async function quickCreateModule(kind, parentId, presetRef = null, tplId = null) {
  rememberRecentKind(kind);
  const name = t('newModuleName').replace('{kind}', kindLabel(kind));
  let moduleId;
  try {
    moduleId = await api.module.create({
      nexus_ref: S.nexus.id, parent_id: parentId, name, kind,
      color: null, icon_color: null, icon: null,
      cat_type: kind === 'classifier' ? 'object' : null,
    });
  } catch (_) {
    closeAllPopups();
    toast(t('moduleParentMustBeFolder'), 'err'); // §8.8 — the only way a create is refused
    return;
  }
  closeAllPopups();
  if (kind !== 'collector') await applyStartTemplate(moduleId, kind, tplId, { fields: !presetRef });
  if (presetRef) await applyPresetToModule(moduleId, kind, presetRef);
  if (parentId != null) S.moduleCollapsed.delete(parentId);
  await reloadModuleTree();
  S.renamingModuleId = moduleId;
  const created = findModuleNode(moduleId);
  if (created && created.kind !== 'collector') await openModuleNode(moduleId);
  else renderNexusHome();
  focusRenameInput(moduleId);
}

