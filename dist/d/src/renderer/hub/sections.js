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

// ── Nest head: the ▾ of the create split button ────────────────────────
// A plain function, not a CTX_PROVIDERS entry: this file loads before
// hub/ctxmenu.js defines CTX_PROVIDERS, so registering one here threw at
// load and left the ▾ without a menu.
function nestCreateMenuItems() {
  return [
    cmdItem('app.newCollector'),
    { sep: true },
    cmdItem('app.importFolder'),
    cmdItem('dock.addLink'),
  ];
}
function openNestCreateMenu(btn) {
  ctxMenu(null, nestCreateMenuItems(), { anchor: btn });
}

// ── Nest tree filter (UX-LAYOUT §6.2, E2) ──────────────────────────────
// Filters THIS tree by name, in place of the old #search-bar that sat above
// every destination and did nothing of its own. A match lists flat, with its
// path, because a hit three folders deep is what the user is looking for —
// vault-wide content search stays the Search destination and Ctrl+P.
function nestFilterHtml() {
  if (!S.moduleTree?.length || nestByKind()) return '';
  const v = S.nestFilter || '';
  // Procress 18 part 1: always there, with a clear button, Esc to clear, and
  // its shortcut shown (/ focuses it — the listener below).
  return `<label class="nest-filter" onclick="event.stopPropagation()">
    <span class="nest-filter-label">${x(t('nestFilter'))}</span>
    <span class="nest-filter-box">
      <input id="nest-filter-q" type="search" value="${x(v)}" autocomplete="off" spellcheck="false" aria-label="${x(t('nestFilter'))}"
        oninput="setNestFilter(this.value)" onkeydown="if(event.key==='Escape'){this.value='';setNestFilter('');this.blur()}">
      ${v ? `<button class="btn btn-g btn-i nest-filter-clear" onclick="event.preventDefault();setNestFilter('');renderNexusHome()" title="${t('pbClear')}" aria-label="${t('pbClear')}">${I.close}</button>`
        : '<kbd class="nest-filter-kbd" data-no-i18n>/</kbd>'}
    </span>
  </label>`;
}
// "/" focuses the Nest filter, like a site's search box — never while typing.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable) return;
  const f = q('#nest-filter-q');
  if (!f || !f.offsetParent) return;
  e.preventDefault();
  f.focus();
});
function nestTreeBodyHtml() {
  if (nestByKind()) return buildKindBrowserHtml();
  const q0 = String(S.nestFilter || '').trim().toLowerCase();
  if (!q0) return buildNestTreeHtml() + nestUnsortedHtml();
  const qy = parseNestQuery(q0);
  if (qy.l.length && !S.nestTagIndex) { loadNestTagIndex(); return `<p class="drafter-hint" style="padding:12px 10px">${t('syncWorking')}</p>`; }
  const words = (s) => qy.text.every((w) => String(s || '').toLowerCase().includes(w));
  const anyOf = (list, test) => !list.length || list.some(test);
  const hits = [];
  const walk = (list, path) => {
    for (const m of list || []) {
      const tags = S.nestTagIndex?.get(m.id);
      if (!qy.t.length && words(m.name)
          && anyOf(qy.k, (k) => m.kind === k || kindLabel(m.kind).toLowerCase().includes(k))
          && anyOf(qy.l, (l) => !!tags && [...tags].some((tg) => tg.includes(l)))) hits.push({ m, path });
      walk(m.children, path.concat(m.name));
    }
  };
  walk(S.moduleTree, []);
  // files too — they have a type, no kind or label
  const files = qy.k.length || qy.l.length || (!qy.t.length && !qy.text.length) ? [] : (S.importFiles || [])
    .filter((f) => words(f.file_name) && anyOf(qy.t, (tp) => assetClass(f) === tp || String(f.file_type || '').toLowerCase() === tp));
  if (!hits.length && !files.length) return `<div class="empty" style="padding:16px 10px">${x(t('nestFilterNone'))}</div>`;
  return hits.map(({ m, path }) => `<div class="li nest-filter-hit" onclick="openModuleNode(${m.id})" oncontextmenu="openModuleContextMenu(event,${m.id})">
      <span class="kicon" aria-hidden="true">${I[KIND_ICON[m.kind]] || I.layer}</span>
      <span class="name">${x(m.name)}</span>
      <span class="nest-filter-path" data-no-i18n>${x(path.join(' › '))}</span>
    </div>`).join('') + files.map((f) => `<div class="li nest-filter-hit" onclick="openImportFile(${f.id})" oncontextmenu="openImportFileContextMenu(event,${f.id})">
      <span class="kicon dock-ficon" aria-hidden="true" data-no-i18n>${assetGlyph(f)}</span>
      <span class="name" data-no-i18n>${x(f.file_name)}</span>
      <span class="nest-filter-path" data-no-i18n>${x(f.module_ref != null ? findModuleNode(f.module_ref)?.name || '' : t('nestUnsorted'))}</span>
    </div>`).join('');
}

// Procress 16 part 2 — Unity's Project-window search: k:kind (k:classifier,
// or a word of its label), l:label, t:file type (t:image t:audio t:pdf…).
// The same token twice = either; different tokens = both; the other words
// are matched against the name.
function parseNestQuery(q) {
  const out = { k: [], l: [], t: [], in: [], text: [] }; // in: = under a folder (the Search panel, 16 part 5)
  for (const w of q.split(/\s+/).filter(Boolean)) {
    const m = /^(k|l|t|in):(.+)$/.exec(w);
    if (m) out[m[1]].push(m[2]); else out.text.push(w);
  }
  return out;
}
async function loadNestTagIndex() {
  if (!S.nexus || S.nestTagLoading) return;
  S.nestTagLoading = true;
  try {
    const map = new Map();
    for (const r of await api.module.tagIndex(S.nexus.id)) (map.get(r.moduleId) || map.set(r.moduleId, new Set()).get(r.moduleId)).add(String(r.tag).toLowerCase());
    S.nestTagIndex = map;
  } finally { S.nestTagLoading = false; }
  setNestFilter(S.nestFilter);
}
let _nestFilterSay = null;
function setNestFilter(v) {
  S.nestFilter = String(v || '');
  const body = q('#nest-tree-body');
  if (body) body.innerHTML = nestTreeBodyHtml();
  // Procress 18 part 5: a screen reader hears how many matched, once typing pauses
  clearTimeout(_nestFilterSay);
  if (!S.nestFilter.trim() || !body) return;
  _nestFilterSay = setTimeout(() => {
    const n = body.querySelectorAll('.nest-filter-hit').length;
    announce(n ? `${n} ${t('qsResults')}` : t('noFilterResults'));
  }, 500);
}

// Procress 18 part 1 + 16 B8: the Nest sidebar, top to bottom — ① the Nexus
// switcher (the vault's name used to be a second bar at the bottom) ② [+ New ▾]
// ③ the filter, always there ④ the tree, ending in "Unsorted (N)". One
// destination now, so no accordion head; .acc-body keeps the scroll memory.
function buildHubHtml() {
  const nx = S.nexus;
  return `<div id="hub-body">
    <div class="nest-head">
      <button class="btn btn-g nexus-switch" onclick="toggleNexusSwitcher(event)" title="${t('nexusSwitch')}" aria-haspopup="menu">
        <span class="nexus-vault-dot"${nx.color_code ? ` style="background:${x(nx.color_code)}"` : ''}></span><span class="name" data-no-i18n>${x(nx.name)}</span>${I.chevronDown}
      </button>
      ${cloudSyncAvailable() ? `<button class="btn btn-g btn-i" onclick="openSyncModal()" title="${t('syncTitle')}" aria-label="${t('syncTitle')}">☁</button>` : ''}
      <button class="btn btn-g btn-i" onclick="event.stopPropagation();openNestOptionsPopup(this)" title="${t('nestOptionsTitle')}" aria-label="${t('nestOptionsTitle')}">${I.options}</button>
    </div>
    <div class="nest-create"><span class="split-btn">
      <button class="btn btn-p btn-sm split-main" data-cmd="app.newModule" onclick="event.stopPropagation();nestNewHere(this)" title="${x(nestNewHereLabel())}">${I.plus} ${t('nestNew')}</button><button class="btn btn-p btn-sm split-more" aria-haspopup="menu" title="${t('nestNewMore')}" aria-label="${t('nestNewMore')}" onclick="event.stopPropagation();openNestCreateMenu(this)">${I.chevronDown}</button>
    </span></div>
    ${nestFilterHtml()}
    <div class="acc-body" data-key="nest"><div id="nest-tree-body" role="tree" aria-label="${x(S.nexus.name)}">${nestTreeBodyHtml()}</div></div>
  </div>`;
}

// Procress 18 part 1: [+ New] does what fits where you are — in the folder you
// picked last, a module; on a content module's page, a new element of it;
// with nothing picked, a folder at the root.
const NEW_ITEM_CMD = { classifier: 'classifier.addObject', chronicler: 'chronicler.addEvent', author: 'author.newChapter',
  scribe: 'scribe.newSession', narrator: 'narrator.addDialogue', diviner: 'diviner.newTable', sketcher: 'sketcher.newPage',
  designer: 'designer.addShape', wanderer: 'wanderer.place' };
function nestNewContext() {
  const picked = S.nestContextId != null ? findModuleNode(S.nestContextId) : null;
  if (picked?.kind === 'collector') return { folder: picked };
  const m = S.activeModuleNode;
  if (m && NEW_ITEM_CMD[m.kind]) return { module: m, cmd: NEW_ITEM_CMD[m.kind] };
  if (m) return { folder: m.parent_id != null ? findModuleNode(m.parent_id) : null, sibling: true };
  return {};
}
function nestNewHere(btn) {
  const c = nestNewContext();
  if (c.cmd) return runCommand(c.cmd, { moduleId: c.module.id }, btn);
  if (c.folder || c.sibling) return openKindPopup(c.folder?.id ?? null, btn);
  return quickCreateModule('collector', null);
}
function nestNewHereLabel() {
  const c = nestNewContext();
  if (c.cmd) return t(COMMANDS[c.cmd]?.label || 'nestNew');
  if (c.folder) return `${t('createMajorModule')} → ${c.folder.name}`;
  return c.sibling ? t('createMajorModule') : t('createFolder');
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
      <span class="kicon" aria-hidden="true">${icon}</span><span class="name">${x(label)}</span>
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
        <span class="kicon" aria-hidden="true" style="color:${x(KIND_COLOR[k])}">${I[KIND_ICON[k]]}</span>
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

// Plan process2 part2 #1.2: the old two-card "import choice" modal
// (convert to Nexus Nest vs open the read-only legacy Import DB view) is
// gone now that the legacy view has no entry point left to offer — a
// database merge that brings in legacy-shaped data goes straight to the
// comparison-list preview (hub/legacy-migrate.js's
// openLegacyMigratePreviewModal), same as the boot-detected legacy-data
// prompt flow. See importDatabaseFile() (core/views.js) for the call site.

