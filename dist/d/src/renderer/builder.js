'use strict';
// ═══ BUILDER SHELL (progress.md Phase 19) ══════════════════════════════
// VS Code-style editor groups for the v3 builder (mockups 16/17): a
// recursive split tree (Plan part4 #2) of panes, each split either
// side-by-side or stacked, arbitrarily nestable via per-pane split/close
// buttons or the title-bar preset menu. Each pane carries its own tab row
// and a browser-style ◀/▶ history stack. Only the FOCUSED pane is
// re-rendered + mounted by renderNexusHome — unfocused panes keep their
// live DOM (listeners stay attached), with their element ids neutralized
// so the focused pane's `q('#…')` mounts never bind across panes.
// Clicking an unfocused pane focuses it first (its content re-renders
// fresh), exactly like clicking an inactive editor group.
//
// A "page" is one of: {kind:'module',id} · {kind:'file',id} ·
// {kind:'sagehut',tab}. A top-row pane's tab strip is lifted onto the
// title bar (core/titlebar-tabs.js, v5 Part 8); the split-layout preset
// picker is its own title-bar button
// (#layout-menu-wrap, also core.js) driven by builderResetToPreset below.

// S.builder.panes stays a flat, index-based array — every tab-management
// function (drag/reorder, close, switch, pop-out) is keyed on that index
// and untouched by the layout rework below. S.builder.layoutTree is a
// SEPARATE recursive tree describing only the geometric arrangement: a
// leaf {type:'leaf', paneIndex} points into the flat array; a split
// {type:'split', dir:'h'|'v', ratio, id, a, b} nests two child nodes
// ('h' = side-by-side/columns, 'v' = stacked/rows). Keeping these two
// identity schemes independent means splitting/closing a pane never has
// to touch the tab-management code built in earlier passes.
function builderState() {
  if (!S.builder) S.builder = {
    focused: 0,
    panes: [builderNewPane()],
    layoutTree: { type: 'leaf', paneIndex: 0 },
  };
  return S.builder;
}
let builderNodeIdCounter = 0;
function builderNextNodeId() { return ++builderNodeIdCounter; }
const builderNewPane = () => ({ tabs: [], active: null, history: [], hIdx: -1 });

const builderPageKey = (ref) => !ref ? '' :
  ref.kind === 'module' ? `module:${ref.id}` :
  ref.kind === 'file' ? `file:${ref.id}` :
  ref.kind === 'item' ? `item:${ref.itemKind}:${ref.moduleId}:${ref.id}` : `sagehut:${ref.tab}`;

function builderParseKey(key) {
  const str = String(key);
  if (str.startsWith('item:')) {
    const [, itemKind, moduleId, id] = str.split(':');
    return { kind: 'item', itemKind, moduleId: Number(moduleId), id: Number(id) };
  }
  const [kind, v] = str.split(':');
  if (kind === 'module' || kind === 'file') return { kind, id: Number(v) };
  if (kind === 'sagehut') return { kind, tab: v };
  return null;
}

// ── Navigation bookkeeping (called from openModuleNode / openImportFile /
// openSageTab after they set the global page mirrors) ────────────────────
function builderNavigate(ref) {
  const b = builderState();
  const pane = b.panes[b.focused];
  const key = builderPageKey(ref);
  if (S.settings.workspaceStyle !== 'drake') {
    // Wyvern/Dragon (Plan part2 #New Workspace): no visible tab strip at
    // all, for ANY ref kind (module/file/item/sagehut alike) — both
    // single-view styles want this, generalized from a Wyvern-only check
    // rather than a second copy-pasted 'dragon' one.
    // builderPaneHeadHtml never has tab chips to render for these styles,
    // so pane.tabs simply stays empty. pane.active/history below still
    // track the current page and keep back/forward navigation working;
    // only the visible chip strip is suppressed. Deliberately deferred: no
    // affordance yet for a user who explicitly wants to keep more than one
    // page reachable — not asked for in the spec's MVP.
    pane.tabs = [];
  } else if (ref.kind === 'sagehut') {
    // Sub-view switches (Size/Objects/Links/Graph) reuse one tab in place
    // instead of multiplying — every other ref kind keeps its own tab.
    const sageIdx = pane.tabs.findIndex(k => k.startsWith('sagehut:'));
    if (sageIdx === -1) pane.tabs.push(key);
    else pane.tabs[sageIdx] = key;
  } else if (!pane.tabs.includes(key)) {
    // Plan procress1 part2 #1: normal open CHANGES the current tab instead
    // of accumulating a new one — mirrors the Sage Hut branch's own
    // replace-in-place trick above. openModuleInNewTab (hub/menus.js)
    // bypasses this by pushing the key into pane.tabs itself before
    // routing through here, so it lands in the "already includes" branch.
    const activeIdx = pane.tabs.indexOf(pane.active);
    if (activeIdx >= 0) pane.tabs[activeIdx] = key;
    else pane.tabs.push(key); // no active tab yet (fresh/empty pane) — first tab
  }
  pane.active = key;
  if (!S._builderNav && builderPageKey(pane.history[pane.hIdx]) !== key) {
    pane.history.splice(pane.hIdx + 1);
    pane.history.push(ref);
    pane.hIdx = pane.history.length - 1;
  }
}

async function builderOpenPage(ref) {
  if (!ref) {
    S.activeModuleNode = null; S.filePreview = null; S.sageHut = null; S.activeItemNode = null; S.importDockPage = false;
    renderNexusHome();
    return;
  }
  if (ref.kind === 'module') await openModuleNode(ref.id);
  else if (ref.kind === 'file') await openImportFile(ref.id);
  else if (ref.kind === 'item') await openItemNode(ref.itemKind, ref.moduleId, ref.id);
  else if (ref.kind === 'sagehut') await openSageTab(ref.tab);
}

async function builderBack() {
  const pane = builderState().panes[builderState().focused];
  if (pane.hIdx <= 0) return;
  pane.hIdx--;
  S._builderNav = true;
  try { await builderOpenPage(pane.history[pane.hIdx]); } finally { S._builderNav = false; }
}

async function builderForward() {
  const pane = builderState().panes[builderState().focused];
  if (pane.hIdx >= pane.history.length - 1) return;
  pane.hIdx++;
  S._builderNav = true;
  try { await builderOpenPage(pane.history[pane.hIdx]); } finally { S._builderNav = false; }
}

// ── Layout tree helpers (Plan part4 #2) ─────────────────────────────────
function builderFindLeaf(node, paneIndex) {
  if (node.type === 'leaf') return node.paneIndex === paneIndex ? node : null;
  return builderFindLeaf(node.a, paneIndex) || builderFindLeaf(node.b, paneIndex);
}
function builderFindLeafWithParent(node, paneIndex, parent, key) {
  if (node.type === 'leaf') return node.paneIndex === paneIndex ? { node, parent, key } : null;
  return builderFindLeafWithParent(node.a, paneIndex, node, 'a') || builderFindLeafWithParent(node.b, paneIndex, node, 'b');
}
function builderFirstLeafIndex(node) { return node.type === 'leaf' ? node.paneIndex : builderFirstLeafIndex(node.a); }
function builderRenumberAfterRemoval(node, removedIndex) {
  if (node.type === 'leaf') { if (node.paneIndex > removedIndex) node.paneIndex--; return; }
  builderRenumberAfterRemoval(node.a, removedIndex); builderRenumberAfterRemoval(node.b, removedIndex);
}
function collectPaneIndices(node, acc = []) {
  if (node.type === 'leaf') { acc.push(node.paneIndex); return acc; }
  collectPaneIndices(node.a, acc); collectPaneIndices(node.b, acc); return acc;
}
function collectLiveIds(node, ids = new Set(), paneIdx = new Set()) {
  if (node.type === 'leaf') { paneIdx.add(node.paneIndex); return { ids, paneIdx }; }
  ids.add(node.id); collectLiveIds(node.a, ids, paneIdx); collectLiveIds(node.b, ids, paneIdx);
  return { ids, paneIdx };
}

// Object.assign alone would leave stale fields behind when a node's own
// `type` changes (e.g. a promoted leaf keeping its old split's `a`/`b`/
// `ratio`) — harmless today since every reader branches on `type` first,
// but a landmine for later code that doesn't. Clear the node's own keys
// before reassigning so its shape always matches its new `type` exactly.
function mutateNode(node, fields) {
  for (const k of Object.keys(node)) delete node[k];
  Object.assign(node, fields);
}

// Split a pane: mutate the found leaf IN PLACE into a split node whose two
// children are the old leaf and a brand-new pane — no parent/key
// bookkeeping needed since the leaf object's identity (and its parent's
// reference to it) never changes, only its own fields do.
function builderSplitPane(paneIndex, dir, newFirst = false) {
  const b = builderState();
  const leaf = builderFindLeaf(b.layoutTree, paneIndex);
  if (!leaf) return;
  const newIdx = b.panes.length;
  b.panes.push(builderNewPane());
  const orig = { type: 'leaf', paneIndex: leaf.paneIndex };
  const fresh = { type: 'leaf', paneIndex: newIdx };
  mutateNode(leaf, { type: 'split', dir, ratio: 0.5, id: builderNextNodeId(),
    a: newFirst ? fresh : orig, b: newFirst ? orig : fresh });
  b.focused = newIdx;
  renderProjectTabs();
  renderNexusHome();
  updateStatusBar({});
  return newIdx;
}

// Close/merge a pane: fold its tabs into the first leaf under its sibling
// (same "fold into survivor" convention the old builderSetLayout used),
// then promote the sibling by assigning its fields onto the PARENT node
// object in place — the grandparent's reference to `parent` stays valid,
// same in-place-mutation trick as the split above.
function builderClosePane(paneIndex) {
  const b = builderState();
  const found = builderFindLeafWithParent(b.layoutTree, paneIndex, null, null);
  if (!found || !found.parent) return; // can't close the only remaining pane
  const { parent, key } = found;
  const sibling = parent[key === 'a' ? 'b' : 'a'];
  const targetIdx = builderFirstLeafIndex(sibling);
  const closing = b.panes[paneIndex], target = b.panes[targetIdx];
  for (const tb of closing.tabs) if (!target.tabs.includes(tb)) target.tabs.push(tb);
  if (!target.active) target.active = closing.tabs[0] || null;
  mutateNode(parent, sibling);
  b.panes.splice(paneIndex, 1);
  builderRenumberAfterRemoval(b.layoutTree, paneIndex);
  b.focused = b.focused === paneIndex ? (targetIdx > paneIndex ? targetIdx - 1 : targetIdx) : (b.focused > paneIndex ? b.focused - 1 : b.focused);
  renderProjectTabs();
  renderNexusHome();
  updateStatusBar({});
}

// Named presets — folds all existing tabs into pane 0 (same convention as
// above), then rebuilds a fresh tree for the chosen shape. "3" defaults to
// long pane left, two short panes stacked right; mirrored/rotated variants
// are trivial to add later if wanted, not built speculatively now.
function builderResetToPreset(name) {
  const b = builderState();
  const survivor = b.panes[0] || builderNewPane();
  for (const p of b.panes.slice(1)) for (const tb of p.tabs) if (!survivor.tabs.includes(tb)) survivor.tabs.push(tb);
  if (name === '1') {
    b.panes = [survivor];
    b.layoutTree = { type: 'leaf', paneIndex: 0 };
  } else if (name === '2h' || name === '2v') {
    b.panes = [survivor, builderNewPane()];
    b.layoutTree = { type: 'split', dir: name === '2h' ? 'h' : 'v', ratio: 0.5, id: builderNextNodeId(),
      a: { type: 'leaf', paneIndex: 0 }, b: { type: 'leaf', paneIndex: 1 } };
  } else if (name === '3') {
    b.panes = [survivor, builderNewPane(), builderNewPane()];
    b.layoutTree = { type: 'split', dir: 'h', ratio: 0.5, id: builderNextNodeId(),
      a: { type: 'leaf', paneIndex: 0 },
      b: { type: 'split', dir: 'v', ratio: 0.5, id: builderNextNodeId(),
        a: { type: 'leaf', paneIndex: 1 }, b: { type: 'leaf', paneIndex: 2 } } };
  }
  b.focused = 0;
  renderProjectTabs();
  renderNexusHome();
  updateStatusBar({});
}

async function builderFocusPane(i, refToOpen = null) {
  const b = builderState();
  if (b.focused === i && !refToOpen) return;
  b.focused = i;
  const pane = b.panes[i];
  const ref = refToOpen || (pane.active ? builderParseKey(pane.active) : null);
  S._builderNav = !refToOpen; // plain focus restores without a history push
  try { await builderOpenPage(ref); } finally { S._builderNav = false; }
}

async function builderSwitchTab(paneIdx, key) {
  const b = builderState();
  b.focused = paneIdx;
  await builderOpenPage(builderParseKey(key));
}

async function builderCloseTab(paneIdx, key) {
  const b = builderState();
  const pane = b.panes[paneIdx];
  const idx = pane.tabs.indexOf(key);
  if (idx < 0) return;
  pane.tabs.splice(idx, 1);

  if (pane.tabs.length === 0) {
    // Plan procress1 part2 #3: builderOpenPage(null) clears S.activeModuleNode/
    // filePreview/sageHut/activeItemNode before rendering — a plain
    // renderNexusHome() here left those globals stale, so the pane body kept
    // showing the just-closed page even with an empty tab strip.
    if (!builderCloseIfEmpty(paneIdx)) { pane.active = null; await builderOpenPage(null); }
    // Plan part1 #1: a popup window (S.isPopup) always starts as a single
    // leaf pane with no parent split node, so builderCloseIfEmpty above is
    // always a no-op for it — closing its last tab must close the window
    // itself instead of leaving an empty popup behind.
    if (S.isPopup && builderState().panes.every(p => p.tabs.length === 0)) await api.window.close();
    return;
  }

  if (pane.active === key) {
    const next = pane.tabs[idx] ?? pane.tabs[idx - 1] ?? null;
    pane.active = next;
    if (b.focused === paneIdx) {
      await builderOpenPage(next ? builderParseKey(next) : null);
      return;
    }
  }
  renderNexusHome();
}

// Auto-close a pane once its tabs array is empty (Plan part1 #1). No-op if
// paneIdx is the sole remaining pane (builderClosePane's own guard handles
// that — the pane is left in place with tabs=[]). Returns true iff the pane
// was actually removed, so a caller holding another pane's numeric index can
// correct for the renumbering builderClosePane performs.
function builderCloseIfEmpty(paneIdx) {
  const b = builderState();
  const pane = b.panes[paneIdx];
  if (!pane || pane.tabs.length > 0) return false;
  builderClosePane(paneIdx);
  return b.panes[paneIdx] !== pane;
}

// ── Tab labels ──────────────────────────────────────────────────────────
// The Builder tab's trailing chip follows the Hub's Nest signature setting
// (S.settings.nestSignatureMode) so both surfaces label a module the same way.
// Only module tabs carry a handle/icon; file, item and Sage tabs supply just
// `badge`, so both special modes fall through to it.
function builderTabBadge(meta) {
  const mode = S.settings.nestSignatureMode;
  if (mode === 'icon' && meta.badgeIcon) return meta.badgeIcon;
  if (mode === 'handle' && meta.badgeHandle) return `@${x(meta.badgeHandle)}`;
  return x(meta.badge);
}

function builderTabMeta(key) {
  const ref = builderParseKey(key);
  if (!ref) return null;
  if (ref.kind === 'module') {
    const m = findModuleNode(ref.id);
    if (!m) return null;
    return {
      name: m.name, badge: kindLabel(m.kind), badgeIcon: I[KIND_ICON[m.kind]] || '',
      badgeHandle: m.handle || '',
      color: m.color_code || 'var(--accent)', icon: moduleIconHtml(m),
    };
  }
  if (ref.kind === 'file') {
    const f = (S.importFiles || []).find(v => v.id === ref.id) || (S.filePreview?.id === ref.id ? S.filePreview : null);
    return { name: f ? f.file_name : `#${ref.id}`, badge: 'File', color: 'var(--accent)', icon: I.document };
  }
  if (ref.kind === 'item') {
    const key = builderPageKey(ref);
    const cached = S.itemNodeCache?.get(key);
    if (cached) return cached;
    const m = findModuleNode(ref.moduleId);
    return { name: `#${ref.id}`, badge: kindLabel(ref.itemKind), color: m?.color_code || 'var(--accent)', icon: ITEM_KIND[ref.itemKind]?.icon() || I.document };
  }
  const lbl = typeof SAGEHUT_VIEW_LABEL !== 'undefined' ? SAGEHUT_VIEW_LABEL[ref.tab] : ref.tab;
  return { name: `Sage Hut · ${lbl}`, badge: 'Sage', color: 'var(--accent)', icon: I.sage };
}

// ═══ Rendering — recursive layout tree (Plan part4 #2) ═════════════════
// Hard rule carried over from the old fixed-grid renderer: NEVER
// innerHTML-wipe #main-inner — unfocused panes keep their live DOM
// (mounted editors, listeners) between renders. With arbitrary nesting, a
// pane can move to a different parent .bsplit across renders (a split or
// merge changes nesting depth) — appendChild(existingNode) MOVES an
// already-attached DOM node rather than destroying it, so reparenting a
// pane never tears down its live content.
function ensureNodeElement(node) {
  if (node.type === 'leaf') {
    let el = q(`#main-inner [data-pane="${node.paneIndex}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'bpane';
      el.dataset.pane = node.paneIndex;
      el.innerHTML = `<div class="bpane-head"></div><div class="bpane-body"></div>`;
      el.addEventListener('pointerdown', (ev) => {
        const idx = Number(el.dataset.pane);
        if (builderState().focused !== idx) { ev.stopPropagation(); builderFocusPane(idx); }
      }, true);
      // Plan part1 #3: .bpane-head's own DOM node survives every re-render
      // (only its innerHTML is replaced, see renderBuilderPanes), so a
      // ResizeObserver attached here once keeps working across renders as
      // long as it looks up the current .bpane-tabs at callback time rather
      // than holding a reference to the one that existed at observe() time.
      const head = el.querySelector('.bpane-head');
      new ResizeObserver(() => syncTabBarCompact(head.querySelector('.bpane-tabs'))).observe(head);
      observeTitlebarTabs(el); // core/titlebar-tabs.js — a top-row pane's tabs sit on the title bar
      // Plan procress1 part2 #2: split/close-pane actions live here now
      // instead of as inline buttons — bound once, like the ResizeObserver
      // above, since .bpane-head's own element survives every re-render.
      head.oncontextmenu = (ev) => openBuilderPaneContextMenu(ev, Number(el.dataset.pane));
      const body = el.querySelector('.bpane-body');
      body.ondragover = (ev) => onBodyDragOver(ev, body);
      body.ondragleave = (ev) => onBodyDragLeave(ev, body);
      body.ondrop = (ev) => onBodyDrop(ev, Number(el.dataset.pane), body);
    }
    return el;
  }
  let el = q(`#main-inner [data-node-id="${node.id}"]`);
  if (!el) { el = document.createElement('div'); el.className = 'bsplit'; el.dataset.nodeId = node.id; }
  return el;
}

function applySplitGridTemplate(el, node) {
  el.style.gridTemplateColumns = node.dir === 'h' ? `${node.ratio}fr 5px ${1 - node.ratio}fr` : '1fr';
  el.style.gridTemplateRows = node.dir === 'v' ? `${node.ratio}fr 5px ${1 - node.ratio}fr` : '1fr';
}

function ensureSplitHandle(splitEl, node) {
  let h = splitEl.querySelector(':scope > .builder-resize-handle');
  if (!h) {
    h = document.createElement('div');
    h.className = `builder-resize-handle ${node.dir === 'h' ? 'col' : 'row'}`;
    h.title = t('resizePanel');
    splitEl.appendChild(h);
  }
  h.onmousedown = (ev) => startBuilderSplitResize(ev, node, splitEl); // reassigned each render — cheap, avoids listener buildup
  h.style.gridColumn = node.dir === 'h' ? '2' : '1';
  h.style.gridRow = node.dir === 'v' ? '2' : '1';
}

function renderLayoutNode(node, parentEl, dir, slot) {
  const el = ensureNodeElement(node);
  if (dir === 'h') { el.style.gridColumn = slot; el.style.gridRow = '1'; }
  else if (dir === 'v') { el.style.gridColumn = '1'; el.style.gridRow = slot; }
  else { el.style.gridColumn = '1'; el.style.gridRow = '1'; }
  parentEl.appendChild(el);
  if (node.type === 'split') {
    applySplitGridTemplate(el, node);
    ensureSplitHandle(el, node);
    renderLayoutNode(node.a, el, node.dir, '1');
    renderLayoutNode(node.b, el, node.dir, '3');
  }
}

function pruneStaleLayoutElements(tree) {
  const { ids, paneIdx } = collectLiveIds(tree);
  const main = q('#main-inner');
  if (!main) return;
  main.querySelectorAll('.bsplit[data-node-id]').forEach(el => { if (!ids.has(Number(el.dataset.nodeId))) el.remove(); });
  main.querySelectorAll('.bpane[data-pane]').forEach(el => { if (!paneIdx.has(Number(el.dataset.pane))) el.remove(); });
  // Legacy views (Scribe, Director, the Nexus picker, ...) wholesale-replace
  // #main-inner's innerHTML directly (never touching .bpane/.bsplit), so
  // returning to the Nexus Nest home only ever appends fresh grid nodes on
  // top via ensureNodeElement's appendChild — any such leftover content
  // would otherwise sit stuck below the Builder pane with no way to close
  // it. Sweep it here, once, before the grid (re)renders.
  Array.from(main.children).forEach(el => { if (!el.classList.contains('bpane') && !el.classList.contains('bsplit')) el.remove(); });
}

let builderSplitResizeState = null;
function startBuilderSplitResize(ev, node, splitEl) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  builderSplitResizeState = { node, rect: splitEl.getBoundingClientRect() };
  ev.currentTarget.classList.add('is-resizing');
}
document.addEventListener('mousemove', (ev) => {
  if (!builderSplitResizeState) return;
  const { node, rect } = builderSplitResizeState;
  node.ratio = node.dir === 'h'
    ? Math.max(0.15, Math.min(0.85, (ev.clientX - rect.left) / rect.width))
    : Math.max(0.15, Math.min(0.85, (ev.clientY - rect.top) / rect.height));
  applySplitGridTemplate(q(`#main-inner [data-node-id="${node.id}"]`), node);
  // Plan part1 #3: dragging a split handle changes pane width without going
  // through renderBuilderPanes — resync compact state live for every pane,
  // not just the two under this split (cheap: a handful of DOM nodes).
  document.querySelectorAll('#main-inner .bpane-tabs').forEach(syncTabBarCompact);
});
document.addEventListener('mouseup', () => {
  if (!builderSplitResizeState) return;
  builderSplitResizeState = null;
  document.querySelectorAll('.builder-resize-handle.is-resizing').forEach(el => el.classList.remove('is-resizing'));
});

// ── Rendering ───────────────────────────────────────────────────────────
// renderNexusHome delegates the whole main area here. contentHtml/mounts
// describe the focused pane's page (built from the S.* page mirrors).
function renderBuilderPanes(contentHtml, runMounts) {
  const b = builderState();
  const main = q('#main-inner');
  if (!main) return;
  main.classList.add('builder-grid');
  main.classList.toggle('builder-split', b.layoutTree.type === 'split');

  pruneStaleLayoutElements(b.layoutTree);
  renderLayoutNode(b.layoutTree, main, null, null);

  for (const idx of collectPaneIndices(b.layoutTree)) {
    const paneEl = q(`#main-inner [data-pane="${idx}"]`);
    const pane = b.panes[idx];
    const focused = idx === b.focused;
    paneEl.classList.toggle('focused', focused && b.layoutTree.type === 'split');
    paneEl.querySelector('.bpane-head').innerHTML = builderPaneHeadHtml(idx, pane, focused);
    syncTabBarCompact(paneEl.querySelector('.bpane-tabs'));
    if (focused) {
      paneEl.querySelector('.bpane-body').innerHTML = withRenderPane(idx, contentHtml);
    } else {
      // Was this pane's DOM lost (fresh grid after a legacy view)? Give it
      // a static render of its page so a split never shows a hole.
      const body = paneEl.querySelector('.bpane-body');
      if (!body.innerHTML.trim() && pane.active) {
        body.innerHTML = withRenderPane(idx, () => builderStaticPageHtml(builderParseKey(pane.active)));
      }
    }
  }
  observeTitlebarTabs(main);
  syncTitlebarTabs();
  if (runMounts) runMounts();
}

function builderPaneHeadHtml(i, pane, focused) {
  const tabs = pane.tabs.map(key => {
    const meta = builderTabMeta(key);
    if (!meta) return '';
    const active = key === pane.active;
    // Draggable target is a plain div, not a native form control — matches
    // the Nest tree row's own element choice for its draggable rows.
    return `<div class="project-tab module-tab ${active && focused ? 'active' : active ? 'pane-active' : ''}"
      draggable="true" data-tab-key="${x(key)}" ondragstart="onTabDragStart(event,${i},${xj(key)})"
      ondragover="onTabDragOver(event,this)" ondragleave="onTabDragLeave(event,this)" ondrop="onTabDrop(event,${i},${xj(key)},this)"
      ondragend="onTabDragEnd(event,${i},${xj(key)})"
      onclick="builderSwitchTab(${i},${xj(key)})" title="${x(meta.name)}">
      <span class="tab-kicon" style="color:${x(meta.color)}">${meta.icon || ''}</span>
      <span class="tab-name">${x(meta.name)}</span>
      <span class="ek" data-no-i18n>${builderTabBadge(meta)}</span>
      ${S.isPopup ? `<span class="tab-close" onclick="event.stopPropagation();builderMoveTabToMain(${i},${xj(key)})" title="${t('moveToMainWindow')}">${I.return}</span>` : ''}
      <span class="tab-close" onclick="event.stopPropagation();builderCloseTab(${i},${xj(key)})" title="${t('closeTab')}">&times;</span>
    </div>`;
  }).join('');
  // Plan procress1 part2 #2: split/close-pane buttons removed from here —
  // right-click the pane head instead (openBuilderPaneContextMenu, wired
  // once in ensureNodeElement). Wyvern/Dragon (Plan part2 #New Workspace)
  // never split, so that handler no-ops there — matching builderNavigate's
  // single-tab guard above and onBodyDrop's disarmed drag-to-split below.
  // The page's own buttons (plugin panels, history) are on the page's head
  // since v5 Part 8 (§12.6); the Inspector toggle went with the dock.
  // Back / forward moved onto the page's address row (page/address.js).
  return `<div class="bpane-tabs" ondragover="onTabStripDragOver(event,${i})" ondrop="onTabStripDrop(event,${i})">${tabs}</div>`;
}

// ═══ Pane right-click context menu (Plan procress1 part2 #2) ══════════
// The pane's right-click, built from COMMANDS (core/commands.js) like the
// Nest's module menu — so split / close are palette commands too. The
// provider sits in hub/menus.js: this file loads before hub/ctxmenu.js.
function openBuilderPaneContextMenu(ev, paneIdx) {
  if (S.settings.workspaceStyle !== 'drake') return; // Wyvern/Dragon never split — no menu to offer
  openCtx('builder.pane', ev, { paneIdx });
}

// ═══ Tab drag-reorder / cross-pane move (Plan part3 #1, reworked part1 #3)
// A tab is "locked" to its own tab bar: dragging it within that bar live-
// reflows the neighboring tabs out of the way (Chrome-tab-style, 3a below)
// and always reorders instantly on drop, no threshold. Only once the drag
// crosses DRAG_DETACH_PX outside that bar and stays there DRAG_DETACH_MS
// (S.dragTab.armed, set by trackDragArm above) does it "detach" and become
// eligible for cross-pane move, edge-split, or pop-out-to-window — matching
// Chrome's own tab-strip feel instead of the old swap-on-drop model.
function onTabDragStart(ev, paneIdx, key) {
  const bar = ev.currentTarget.closest('.bpane-tabs');
  const tabs = [...bar.querySelectorAll('.project-tab')];
  S.dragTab = {
    key, paneIdx, armed: false, armTimer: null,
    barEl: bar,
    rects: tabs.map(el => el.getBoundingClientRect()),
    fromIndex: tabs.findIndex(el => el.dataset.tabKey === key),
    curIndex: -1,
  };
  bar.classList.add('reordering');
  ev.dataTransfer.effectAllowed = 'move';
  ev.stopPropagation();
}
function tabDropZone(ev, tabEl) {
  const r = tabEl.getBoundingClientRect();
  const frac = (ev.clientX - r.left) / r.width;
  return frac < 0.5 ? 'before' : 'after';
}
function onTabDragOver(ev, tabEl) {
  const d = S.dragTab;
  if (!d) return;
  ev.preventDefault();
  ev.stopPropagation();
  const bar = tabEl.closest('.bpane-tabs');
  if (bar !== d.barEl) {
    // Cross-pane hover: no local reflow to do (different bar's own tabs
    // aren't cached), keep the static before/after indicator — but only
    // once armed, so a still-locked drag doesn't advertise a drop it would
    // actually bounce back (Plan part1 #3).
    tabEl.classList.remove('tab-drop-before', 'tab-drop-after');
    if (d.armed) tabEl.classList.add(`tab-drop-${tabDropZone(ev, tabEl)}`);
    return;
  }
  const targetIdx = d.rects.findIndex(r => ev.clientX < (r.left + r.right) / 2);
  const newIndex = targetIdx < 0 ? d.rects.length - 1 : targetIdx;
  if (newIndex === d.curIndex) return;
  d.curIndex = newIndex;
  const draggedWidth = d.rects[d.fromIndex].width + 4; // +4px gap, .bpane-tabs{gap:4px}
  d.barEl.querySelectorAll('.project-tab').forEach((el, i) => {
    if (el.dataset.tabKey === d.key) { el.style.opacity = '0'; return; }
    let shift = 0;
    if (d.fromIndex < newIndex && i > d.fromIndex && i <= newIndex) shift = -draggedWidth;
    if (d.fromIndex > newIndex && i < d.fromIndex && i >= newIndex) shift = draggedWidth;
    el.style.transform = shift ? `translateX(${shift}px)` : '';
  });
}
function onTabDragLeave(ev, tabEl) {
  tabEl.classList.remove('tab-drop-before', 'tab-drop-after');
}
function clearDragReflow() {
  const d = S.dragTab;
  if (!d?.barEl) return;
  d.barEl.classList.remove('reordering');
  d.barEl.querySelectorAll('.project-tab').forEach(el => { el.style.transform = ''; el.style.opacity = ''; });
}

// Plan part1 #3: tabs shrink to fit their pane instead of overflowing into a
// horizontal-scroll strip. Below this many px/tab, ellipsis-truncated text
// stops being legible, so collapse to icon-only (.tabs-compact) instead.
const TAB_COMPACT_THRESHOLD = 90;
function syncTabBarCompact(barEl) {
  if (!barEl) return;
  const tabs = barEl.children.length;
  if (!tabs) return;
  const perTab = barEl.clientWidth / tabs;
  barEl.classList.toggle('tabs-compact', perTab < TAB_COMPACT_THRESHOLD);
}
async function onTabDrop(ev, paneIdx, key, tabEl) {
  ev.preventDefault();
  ev.stopPropagation();
  tabEl.classList.remove('tab-drop-before', 'tab-drop-after');
  const drag = S.dragTab;
  const crossPane = drag && drag.paneIdx !== paneIdx;
  if (crossPane && !drag.armed) { clearDragReflow(); S.dragTab = null; return; } // still locked — bounce back, no move
  clearDragReflow();
  S.dragTab = null;
  if (!drag || (drag.paneIdx === paneIdx && drag.key === key)) return; // dropped on itself
  // Plan part1 #2: a same-pane reorder uses the exact slot the drag-over
  // reflow animation was already driving (d.curIndex, computed once from
  // the frozen pre-drag rects) instead of re-deriving a target key +
  // before/after zone from tabEl's LIVE bounding rect at drop time — that
  // rect can be transform-shifted by the reflow itself and disagree with
  // what the animation visually showed, landing the tab in the wrong slot.
  if (!crossPane && drag.curIndex >= 0) { builderMoveTabToIndex(drag, paneIdx, drag.curIndex); return; }
  await builderMoveTabTo(drag, paneIdx, key, tabDropZone(ev, tabEl));
}

// Fallback drop target: the `.bpane-tabs` strip itself, for dropping into
// an empty pane (nothing to drop "onto") or past the last tab. Per-tab
// handlers stopPropagation(), so this only fires on the strip's background.
function onTabStripDragOver(ev, paneIdx) {
  if (!S.dragTab) return;
  ev.preventDefault();
}
async function onTabStripDrop(ev, paneIdx) {
  ev.preventDefault();
  const drag = S.dragTab;
  const crossPane = drag && drag.paneIdx !== paneIdx;
  if (crossPane && !drag.armed) { clearDragReflow(); S.dragTab = null; return; } // still locked — bounce back, no move
  clearDragReflow();
  S.dragTab = null;
  if (!drag) return;
  await builderMoveTabTo(drag, paneIdx, null, null); // no target key -> append to end
}

// Shared move: remove drag.key from its source pane, insert into dstPane
// at the position implied by targetKey/zone (append if targetKey is null).
// indexOf(targetKey) is looked up AFTER the source splice so same-pane
// reorders (srcPane === dstPane) get the correct post-removal index.
async function builderMoveTabTo(drag, paneIdx, targetKey, zone) {
  const b = builderState();
  const srcPane = b.panes[drag.paneIdx];
  const dstPane = b.panes[paneIdx];
  const srcIdx = srcPane.tabs.indexOf(drag.key);
  if (srcIdx < 0) return; // stale — dragged tab was closed mid-drag
  const crossPane = drag.paneIdx !== paneIdx;

  srcPane.tabs.splice(srcIdx, 1);
  let insAt = targetKey ? dstPane.tabs.indexOf(targetKey) : -1;
  if (insAt < 0) insAt = dstPane.tabs.length;
  else if (zone === 'after') insAt++;
  dstPane.tabs.splice(insAt, 0, drag.key);

  if (!crossPane) { renderNexusHome(); return; }

  // Cross-pane, Process 6 part 2: falls back to whatever this pane's own
  // visit history says was open most recently before the moved tab, not
  // just the tab that now happens to sit at the same array index —
  // builderCloseTab's own fallback stays position-based (untouched, see
  // pickBackwardActiveTab's own comment below for why the two diverge).
  if (srcPane.active === drag.key) srcPane.active = pickBackwardActiveTab(srcPane, drag.key);
  dstPane.active = drag.key;

  // Process 6 part 2: a tab MOVING to another pane no longer auto-closes
  // the now-possibly-empty source pane the way builderCloseTab's own
  // builderCloseIfEmpty call still does for an actual tab close — it's left
  // open showing the same "waiting for a tab" placeholder a brand-new pane
  // shows, so the user can drag/create a new tab into it. Only closing
  // every tab in a pane (builderCloseTab) removes the pane itself.
  if (srcPane.tabs.length === 0) {
    const srcBody = q(`#main-inner [data-pane="${drag.paneIdx}"] .bpane-body`);
    if (srcBody) srcBody.innerHTML = builderEmptyPaneHtml();
  }
  await builderFocusPane(paneIdx, builderParseKey(drag.key));
}

// Process 6 part 2: picks the tab a pane should fall back to once
// `excludeKey` leaves it — walks the pane's own history (Phase back/forward
// log, chronological visit order) backwards so the most recently-open
// still-present tab resurfaces, rather than builderCloseTab's simpler
// position-based `tabs[idx] ?? tabs[idx-1]` (left as-is there — Plan.md only
// asks for this on the move-to-another-pane path). Falls back to the last
// tab in strip order if history has no usable entry (e.g. a pane that never
// recorded a visit), and to null once the pane has no tabs left at all.
function pickBackwardActiveTab(pane, excludeKey) {
  // pane.history holds parsed refs (builderNavigate), not the string keys
  // pane.tabs/pane.active use — re-derive the key to compare like-for-like.
  for (let i = pane.history.length - 1; i >= 0; i--) {
    const k = builderPageKey(pane.history[i]);
    if (k !== excludeKey && pane.tabs.includes(k)) return k;
  }
  return pane.tabs[pane.tabs.length - 1] ?? null;
}

// Same-pane reorder only (Plan part1 #2) — inserts at the exact index the
// drag-over reflow was driving. `index` is into the pre-drag tab order (the
// same order d.rects/d.curIndex were computed against); splicing the
// dragged key out first then clamping the insertion index to the now-
// shorter array reproduces that visually-indicated final position exactly.
function builderMoveTabToIndex(drag, paneIdx, index) {
  const pane = builderState().panes[paneIdx];
  const srcIdx = pane.tabs.indexOf(drag.key);
  if (srcIdx < 0) return; // stale — dragged tab was closed mid-drag
  pane.tabs.splice(srcIdx, 1);
  pane.tabs.splice(Math.min(index, pane.tabs.length), 0, drag.key);
  renderNexusHome();
}

// ═══ Auto-split on drag-to-edge (Plan part4 #3) ════════════════════════
// Same clientX/clientY-vs-bounding-rect fraction technique tabDropZone and
// the split resize handles already use, extended to 2D: outer 25% bands on
// each side are "split here," the inner 50% is "drop into this pane"
// (today's tab-strip-drop behavior, now also reachable from the body).
const BODY_EDGE_FRAC = 0.25;
function bodyDropZone(ev, bodyEl) {
  const r = bodyEl.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
  if (x < BODY_EDGE_FRAC) return 'left';
  if (x > 1 - BODY_EDGE_FRAC) return 'right';
  if (y < BODY_EDGE_FRAC) return 'top';
  if (y > 1 - BODY_EDGE_FRAC) return 'bottom';
  return 'center';
}
function onBodyDragOver(ev, bodyEl) {
  if (!S.dragTab || !S.dragTab.armed) return; // still locked to its origin tab bar (Plan part1 #3)
  ev.preventDefault();
  ev.stopPropagation();
  bodyEl.classList.remove('drop-left', 'drop-right', 'drop-top', 'drop-bottom', 'drop-center');
  bodyEl.classList.add(`drop-${bodyDropZone(ev, bodyEl)}`);
}
function onBodyDragLeave(ev, bodyEl) {
  bodyEl.classList.remove('drop-left', 'drop-right', 'drop-top', 'drop-bottom', 'drop-center');
}
async function onBodyDrop(ev, targetPaneIdx, bodyEl) {
  const drag = S.dragTab;
  if (!drag || !drag.armed) return; // nothing being dragged, or still locked to its origin tab bar — let the grid-level fallback handle it
  ev.preventDefault();
  ev.stopPropagation();
  bodyEl.classList.remove('drop-left', 'drop-right', 'drop-top', 'drop-bottom', 'drop-center');
  clearDragReflow();
  S.dragTab = null;
  // Wyvern/Dragon (Plan part2 #New Workspace) never split — disarm the
  // whole drag-to-edge auto-split gesture rather than letting it silently
  // create a pane their chrome has no controls to close/navigate.
  if (S.settings.workspaceStyle !== 'drake') return;
  const zone = bodyDropZone(ev, bodyEl);
  if (zone === 'center') { await builderMoveTabTo(drag, targetPaneIdx, null, null); return; }
  const dir = (zone === 'left' || zone === 'right') ? 'h' : 'v';
  const newIdx = builderSplitPane(targetPaneIdx, dir, zone === 'left' || zone === 'top');
  await builderMoveTabTo(drag, newIdx, null, null);
}

// ═══ Pop-out to a free window (Plan part3 #2 / part1 #1.1) ════════════
// Every successful drop (onTabDrop / onTabStripDrop) clears S.dragTab. If
// dragend fires and it's still set, nothing accepted the drop — either the
// user released outside #main-inner entirely (nav-sidebar, title bar,
// outside the OS window), the whole drag was cancelled some other way
// (Escape mid-drag also lands here — a known, accepted ambiguity in the
// HTML5 DnD API, not distinguishable from a genuine miss), OR — the actual
// bug behind Plan part1 #1.1 — a DOM reflow (e.g. right after closing a
// pane, which collapses the layout and shifts tabs under the cursor) turns
// a fast follow-up click into a near-zero-movement accidental micro-drag.
// Gate the pop-out behind an actual "the user dragged this meaningfully far
// outside its own tab bar and held it there" signal (`S.dragTab.armed`,
// set by trackDragArm below) instead of firing on ANY unaccepted drop.
const DRAG_DETACH_PX = 48;   // distance outside the origin tab bar before a drag "wants" to leave it
const DRAG_DETACH_MS = 160;  // how long it must stay past that distance before counting as a real detach, not a jiggle

function dragOutsideTabBar(ev, barRect) {
  return ev.clientX < barRect.left - DRAG_DETACH_PX || ev.clientX > barRect.right + DRAG_DETACH_PX ||
         ev.clientY < barRect.top - DRAG_DETACH_PX || ev.clientY > barRect.bottom + DRAG_DETACH_PX;
}

// Bound once at document level (dragover bubbles there even over
// nav-sidebar/title-bar, which a plain #main-inner listener would miss) —
// see bindBuilderGridDrop, called once from core.js's init().
function trackDragArm(ev) {
  const d = S.dragTab;
  if (!d || d.armed) return;
  const bar = document.querySelector(`#main-inner [data-pane="${d.paneIdx}"] .bpane-tabs`);
  if (!bar) return;
  if (dragOutsideTabBar(ev, bar.getBoundingClientRect())) {
    if (!d.armTimer) d.armTimer = setTimeout(() => { d.armed = true; }, DRAG_DETACH_MS);
  } else if (d.armTimer) { clearTimeout(d.armTimer); d.armTimer = null; }
}

async function onTabDragEnd(ev, paneIdx, key) {
  if (!S.dragTab) return; // a real drop already handled + cleared it
  clearDragReflow();
  const armed = S.dragTab.armed;
  if (S.dragTab.armTimer) clearTimeout(S.dragTab.armTimer);
  S.dragTab = null;
  if (!armed) return; // never crossed the distance+hold threshold — a reflow jiggle or an early cancel, not an intentional detach
  await builderPopOutTab(paneIdx, key);
}

// ═══ Move a popup's tab back to the main window (Plan part1 #2/#2.1) ═══
// Real cross-window HTML5 drag doesn't work between separate Electron
// BrowserWindows (each is an isolated renderer process, confirmed via the
// spike this feature was built around) — so this ships as a click action:
// close the tab locally first (builderCloseTab already auto-closes the
// pane if it empties, Plan part1 #1), tell the main window to open it, then
// close this whole popup once every pane in it is empty.
async function builderMoveTabToMain(paneIdx, key) {
  // Move the tab to the main window FIRST, then close it locally —
  // builderCloseTab now closes this (popup) window itself once every pane
  // is empty (Plan part1 #1), so doing the move first avoids the popup
  // starting to close before the main window has actually adopted the tab.
  await api.window.moveTabToMain(S.nexus.id, key);
  await builderCloseTab(paneIdx, key);
}

async function builderPopOutTab(paneIdx, key) {
  await api.window.openBuilderTab(S.nexus.id, key);
  await builderCloseTab(paneIdx, key);
}

// Fallback for the builder grid itself: swallows a drop that missed every
// tab/tab-strip target but still landed somewhere inside #main-inner (e.g.
// a pane's content body) — treated as a no-op, NOT a pop-out. Only a drop
// that misses the whole grid reaches onTabDragEnd with S.dragTab still set.
// Bound once (see bindBuilderGridDrop, called from core.js's init()) since
// #main-inner is a persistent DOM node, never re-created by renderBuilderPanes.
function bindBuilderGridDrop() {
  const grid = q('#main-inner');
  if (!grid) return;
  grid.addEventListener('dragover', (ev) => { if (S.dragTab) ev.preventDefault(); });
  grid.addEventListener('drop', (ev) => {
    if (!S.dragTab) return;
    ev.preventDefault();
    clearDragReflow();
    S.dragTab = null;
  });
  // Document-level, not grid-scoped, so drags toward nav-sidebar/title-bar
  // (outside #main-inner) still arm correctly (Plan part1 #1.1). Capture
  // phase is required: onTabDragOver calls ev.stopPropagation() for every
  // tab it's dragged over (including tabs in a DIFFERENT, destination
  // pane), which would otherwise stop this listener from ever seeing those
  // events during the bubble phase — silently preventing a drag from ever
  // arming whenever it ends up hovering an existing tab in another pane.
  document.addEventListener('dragover', trackDragArm, true);
}

// Best-effort static content for a pane whose DOM was wiped (e.g. after a
// legacy view rewrote #main-inner). Interactions return when it's focused.
// Process 6 part 2: the "waiting for a tab" placeholder — shared by
// buildBuilderPageHtml's own default branch (core/views.js, a fresh/empty
// nexus) and builderMoveTabTo below (a pane emptied by a tab moving OUT to
// another pane, which no longer auto-closes the pane the way closing a tab
// still does).
function builderEmptyPaneHtml() {
  return `<div class="empty" style="margin-top:80px">
    <div class="ei"><img src="../src/assets/brand/DraconDex_WhiteOut.png" class="brand-img" alt="DraconDex" style="height:64px;width:64px;opacity:.35"></div>
    <h3>${x(S.nexus.name)}</h3>
    <p>${S.nexus.memo ? x(S.nexus.memo) : t('nexusWelcomeText')}</p>
  </div>`;
}

function builderStaticPageHtml(ref) {
  try {
    if (ref?.kind === 'module') {
      const m = findModuleNode(ref.id);
      if (m) return buildModuleDetailHtml(m);
    }
    if (ref?.kind === 'file' && S.filePreview?.id === ref.id) return buildFileViewerHtml();
    if (ref?.kind === 'item' && S.activeItemNode && builderPageKey(ref) === builderPageKey({ kind: 'item', ...S.activeItemNode })) return buildItemPageHtml(S.activeItemNode);
    if (ref?.kind === 'sagehut' && S.sageHut) return buildSageHutHtml();
  } catch (_) {}
  return '';
}

// The focused pane's copy of a page element. Two panes may show the same
// page, so a page's ids repeat across the grid (v5 Part 8 dropped the pass
// that stripped them from unfocused panes); a page that is not made of
// scoped components (a file, the Sage Hut) looks its parts up here.
function fq(sel) {
  const b = builderState();
  return q(`#main-inner [data-pane="${b.focused}"] .bpane-body`)?.querySelector(sel) || q(sel);
}

// ── Focused-pane shortcuts (Ctrl+W close tab · Ctrl+Tab cycle) ──────────
async function builderCloseActiveTab() {
  const b = builderState();
  const pane = b.panes[b.focused];
  if (pane.active) await builderCloseTab(b.focused, pane.active);
}

async function builderCycleTab(dir) {
  const b = builderState();
  const pane = b.panes[b.focused];
  if (pane.tabs.length < 2) return;
  const cur = pane.tabs.indexOf(pane.active);
  const next = pane.tabs[(cur + dir + pane.tabs.length) % pane.tabs.length];
  await builderSwitchTab(b.focused, next);
}
