// The Nexus Nest tree itself — module rows, content-item leaf rows, the lazy
// item loading + coalesced re-render (scheduleNestRender), and drag-reorder /
// reparent at any depth.
function buildAccSection(key, label, bodyHtml, actHtml = '', heightPx = null) {
  const open = !!S.hubOpen[key];
  const bodyStyle = open ? (heightPx ? `flex:0 0 ${heightPx}px` : '') : 'display:none';
  return `
    <div class="acc-head${open ? '' : ' acc-collapsed'}" onclick="toggleHubSection('${key}')">
      <svg class="icon chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="${open ? '6 9 12 15 18 9' : '9 18 15 12 9 6'}"/></svg>
      ${x(label)}<span class="act">${actHtml}</span>
    </div>
    <div class="acc-body" data-key="${key}" style="${bodyStyle}">${bodyHtml}</div>`;
}

// A brand-new vault used to show a text-only "no modules yet" with nothing to
// click — the only way forward was the "+" tucked into the rail/accordion header.
function nestEmptyHtml() {
  return `<div class="empty" style="padding:24px 10px">
    <p>${t('nestEmpty')}</p>
    <button class="btn btn-p" style="margin-top:12px" onclick="event.stopPropagation();openMainModuleModal(this)">${I.plus} ${t('createMajorModule')}</button>
  </div>`;
}

function buildNestTreeHtml() {
  if (!S.moduleTree.length) return nestEmptyHtml();
  ensureImportDock(); // asset leaves (v5) come from the same cached list
  return S.moduleTree.map(m => buildNestRow(m, 0, null)).join('');
}

function buildNestRow(m, depth, parentId) {
  const sel = S.activeModuleNode?.id === m.id ? ' sel' : '';
  const col = m.icon_color_code || m.color_code || 'var(--accent)';
  const hasChildren = m.children?.length > 0;
  const collapsed = S.moduleCollapsed.has(m.id);
  // Plan part4: content-item "minor module" leaves. Fetched lazily, once,
  // opportunistically at render time (same idiom as buildImportDockRows's
  // own ensureImportDock() call — idempotent, fires the async fetch once
  // and re-renders when it resolves) rather than only on an explicit
  // expand-click, since a module starts EXPANDED by default (not in
  // S.moduleCollapsed) — a click-only trigger would never fire for a
  // freshly-opened Nexus's modules.
  const isContentKind = !!ITEM_KIND[m.kind];
  if (isContentKind && !collapsed) ensureNestItemsLoaded(m.id);
  const itemRows = S.nestItems.get(m.id);
  const itemCount = Array.isArray(itemRows) ? itemRows.length : 0;
  // Plan part1 #2/#4: the "show minor modules" toggle hides content-item
  // leaves tree-wide — when off, a content-kind module with only items and
  // no nested module children shows no chevron at all (nothing to expand).
  const nestShowItems = S.settings.nestShowItems !== false;
  // v5 Asset Nest: assets filed into this node are leaves too, shown
  // regardless of the minor-module toggle — they are what makes a collector
  // an asset folder (mod/importdock.js).
  const assetRows = nestAssetsOf(m.id);
  const showChev = hasChildren || assetRows.length > 0 || (nestShowItems && isContentKind && itemCount > 0);
  // Plan part1 #4: a node with ONLY content-item children (no nested module
  // children) gets a '+'/'-' glyph pair instead of the caret, same wrapper
  // attrs/sizing as the caret, just a different inner shape.
  const onlyLeafChildren = !hasChildren
    && ((nestShowItems && isContentKind && itemCount > 0) || assetRows.length > 0);
  const chev = showChev
    ? (onlyLeafChildren
        ? `<svg class="icon tree-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" onclick="event.stopPropagation();toggleMajorExpand(${m.id})">${collapsed ? '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' : '<line x1="5" y1="12" x2="19" y2="12"/>'}</svg>`
        : `<svg class="icon tree-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" onclick="event.stopPropagation();toggleMajorExpand(${m.id})"><polyline points="${collapsed ? '9 18 15 12 9 6' : '6 9 12 15 18 9'}"/></svg>`)
    // Plan part1 #5: reserve the same box a real chevron would occupy even
    // when this row has none, so .kicon lines up in a column with sibling
    // rows at the same depth that DO show a chevron.
    : '<span class="tree-chev-spacer"></span>';
  const openable = m.kind !== 'collector';
  const renaming = S.renamingModuleId === m.id;
  // IDE-style depth indentation (Plan part1 #4/#4-2) — capped visually past
  // a few levels so very deep nesting doesn't run the row text off-panel;
  // the tree itself still nests as deep as the drop rules allow.
  const indentCls = depth ? ` indent${Math.min(depth, 5)}` : '';
  const childrenHtml = (hasChildren && !collapsed) ? m.children.map(c => buildNestRow(c, depth + 1, m.id)).join('') : '';
  // Module sub-structure first, then this module's own content-item leaves
  // — a brand-new render function, deliberately NOT a buildNestRow
  // recursion, so these rows structurally cannot inherit drag/drop wiring
  // (no draggable/ondragstart/ondragover/ondrop, no chevron, no context
  // menu) — a content item can never be dragged out of its owning module.
  const itemsHtml = (nestShowItems && isContentKind && !collapsed && Array.isArray(itemRows))
    ? itemRows.map(it => buildNestItemRow(it, m.kind, m.id, depth + 1)).join('') : '';
  // Process 7 part 1: wraps the module's own children/items together so
  // toggleMajorExpand (hub/sections.js) has a live element to animate the
  // CLOSE transition against — childrenHtml/itemsHtml are both already ''
  // when collapsed, so this wrapper only exists in the DOM while expanded,
  // exactly the state a close animation needs to run FROM.
  const assetsHtml = collapsed ? '' : assetRows.map(f => buildNestAssetRow(f, depth + 1)).join('');
  const childrenWrap = collapsed ? '' : `<div class="nest-children" data-parent-id="${m.id}">${childrenHtml}${itemsHtml}${assetsHtml}</div>`;
  const showMajorIcon = S.settings.nestShowMajorIcon !== false;
  // Process 8 part 1: the signature slot after the name is 3-way now. 'handle'
  // falls back to the kind label when this module has none, so switching the
  // mode never leaves a row with a blank slot — a handle is optional and most
  // modules will not have one.
  const sigMode = S.settings.nestSignatureMode;
  const kindBadge = sigMode === 'icon'
    ? `<span class="kind kind-icon" data-no-i18n>${I[KIND_ICON[m.kind]] || I.layer}</span>`
    : sigMode === 'handle' && m.handle
      ? `<span class="kind kind-handle" data-no-i18n>@${x(m.handle)}</span>`
      : `<span class="kind">${x(kindLabel(m.kind))}</span>`;
  // draggable is on the whole row, not just a dedicated grip icon (Plan
  // part1 #3 removed the old decorative grip span) — a real drag started
  // anywhere on the row (name, icon, background — what a user would
  // actually grab) works. Off while renaming so dragging can't fight the
  // rename `<input>` for the mousedown (a draggable ancestor around a text
  // input makes placing the caret unreliable).
  return `<div class="li${indentCls}${sel}"
      draggable="${renaming ? 'false' : 'true'}" ondragstart="onNestDragStart(event,${m.id},${parentId ?? 'null'})"
      ondragover="onNestDragOver(event,this,${m.id})" ondragleave="onNestDragLeave(event,this)" ondrop="onNestDrop(event,${m.id},${parentId ?? 'null'},this)"
      onclick="${renaming ? '' : `scheduleRowOpen(${m.id})`}" oncontextmenu="openModuleContextMenu(event,${m.id})">
    ${chev}
    ${showMajorIcon ? `<span class="kicon" style="color:${x(col)}" onclick="event.stopPropagation();openModuleIconPopup(${m.id},this)">${moduleIconHtml(m)}</span>` : ''}
    ${renaming
      ? `<input id="rename-nest-${m.id}" class="rename-input" value="${x(m.name)}" onclick="event.stopPropagation()" onblur="saveModuleRename(${m.id},this.value)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value=${x(JSON.stringify(m.name))};this.blur();}">`
      : `<span class="name" ondblclick="event.stopPropagation();cancelRowOpen();startRenameModule(${m.id})">${x(m.name)}</span>`}
    ${kindBadge}
  </div>${childrenWrap}`;
}

// Leaf row for one content item (Plan part4) — see buildNestRow's own
// comment above for why this is deliberately not a buildNestRow recursion.
function buildNestItemRow(item, itemKind, moduleId, depth) {
  const reg = ITEM_KIND[itemKind];
  const active = S.activeItemNode?.itemKind === itemKind && S.activeItemNode?.moduleId === moduleId && S.activeItemNode?.id === item.id;
  const indentCls = ` indent${Math.min(depth, 5)}`;
  const showIcon = !!S.settings.nestShowMinorIcon;
  return `<div class="li${indentCls}${active ? ' sel' : ''} nest-item-row" onclick="openItemNode('${itemKind}',${moduleId},${item.id})">
    <span class="tree-chev-spacer"></span>
    ${showIcon ? `<span class="kicon" style="color:var(--t3-aa,var(--t2))">${reg.icon()}</span>` : ''}
    <span class="name">${x(reg.nameOf(item))}</span>
  </div>`;
}

// Plan part2 #2.5: replaces the old per-module lazy fetch. module:getNestItems
// hands back {moduleId: [items]} for the whole nexus, so the map is rebuilt
// wholesale here — every content-kind module gets an entry (an empty array
// when it has no items), which is what makes ensureNestItemsLoaded below a
// no-op instead of a re-fetch trigger. Rebuilding also drops entries for
// modules no longer in the tree, which reloadModuleTree used to prune by hand.
function seedNestItems(itemsByModule) {
  S.nestItems = new Map();
  const walk = (nodes) => {
    for (const m of nodes) {
      if (ITEM_KIND[m.kind]) seedNestItemsFor(m, itemsByModule[m.id] || []);
      if (m.children?.length) walk(m.children);
    }
  };
  walk(S.moduleTree || []);
}

// Fallback lazy fetch, kept for the one case seedNestItems can't cover: a
// module whose items were invalidated by a CRUD action (invalidateNestItems
// deletes its entry) without a full tree reload. On a freshly loaded tree
// every content module already has an entry, so this returns immediately.
function ensureNestItemsLoaded(moduleId) {
  if (S.nestItems.has(moduleId)) return;
  const m = findModuleNode(moduleId);
  if (!m || !ITEM_KIND[m.kind]) return;
  S.nestItems.set(moduleId, null);
  ITEM_KIND[m.kind].list(moduleId).then(items => {
    seedNestItemsFor(m, items);
    scheduleNestRender();
  });
}

// Coalesces the async re-render points (Plan part2 #2.5). Each of them used
// to call renderNexusHome() directly, so one user action could repaint the
// whole left panel AND the builder panes three or four times. renderNexusHome
// itself stays synchronous — callers that read the DOM straight after it
// must keep working; only these deferred paths route through here.
let _nestRenderQueued = false;
function scheduleNestRender() {
  if (_nestRenderQueued) return;
  _nestRenderQueued = true;
  queueMicrotask(() => { _nestRenderQueued = false; renderNexusHome(); });
}

// Called from every content-item create/rename/delete path (both a
// module's own inline view and the item's own page) so the Nest tree's
// item cache never drifts stale. `delta` < 0 additionally sweeps Builder
// tabs for items that no longer exist.
function invalidateNestItems(moduleId, delta = 0) {
  const wasLoaded = S.nestItems.has(moduleId);
  S.nestItems.delete(moduleId);
  S.sageHutCache = null; // content changed — analytics payloads are stale
  const m = findModuleNode(moduleId);
  const reg = m && ITEM_KIND[m.kind];
  if (delta < 0 && reg) {
    // A deleted item may still have its own Builder tab open in the
    // background (unfocused, so openItemNode's own "stale tab" re-check
    // never fires for it) — close those proactively instead of leaving a
    // dead tab. Fetch the list ONCE here and hand it to both consumers:
    // before Plan part2 #2.5 this path fetched the same list twice (once in
    // closeStaleItemTabs, once more when the re-render hit
    // ensureNestItemsLoaded on the entry just deleted above).
    S.nestItems.set(moduleId, null); // loading marker, blocks the lazy path
    reg.list(moduleId).then(items => {
      seedNestItemsFor(m, items);
      closeStaleItemTabs(moduleId, wasLoaded, items);
    });
  }
  scheduleNestRender();
}

// One module's slice of what seedNestItems does for the whole tree.
function seedNestItemsFor(m, items) {
  const reg = ITEM_KIND[m.kind];
  S.nestItems.set(m.id, items);
  for (const it of items) {
    S.itemNodeCache.set(`item:${m.kind}:${m.id}:${it.id}`,
      { name: reg.nameOf(it), color: m.color_code, badge: t(reg.badgeKey), icon: reg.icon() });
  }
}

// `items` is passed in by invalidateNestItems, which has just fetched the
// list; omitted (direct callers), it fetches its own.
async function closeStaleItemTabs(moduleId, reload, items) {
  const m = findModuleNode(moduleId);
  if (!m || !ITEM_KIND[m.kind]) return;
  if (!items) items = await ITEM_KIND[m.kind].list(moduleId);
  if (reload) S.nestItems.set(moduleId, items);
  const liveIds = new Set(items.map(it => it.id));
  const prefix = `item:${m.kind}:${moduleId}:`;
  const b = builderState();
  let closedAny = false;
  for (const [idx, pane] of b.panes.entries()) {
    for (const key of [...pane.tabs]) {
      if (key.startsWith(prefix) && !liveIds.has(Number(key.slice(prefix.length)))) {
        await builderCloseTab(idx, key);
        closedAny = true;
      }
    }
  }
  if (closedAny) toast(t('itemNotFound'), 'error');
  scheduleNestRender();
}

// ═══ Drag-reorder / reparent — any depth, any module (Plan part1 #1) ═══
// Dropping on the top/bottom quarter of a row reorders the dragged module
// as that row's sibling there (adopting that row's parent, which may be a
// different parent than the one it came from — an implicit "move to"); the
// middle half nests it as that row's child instead. Any module can be
// dragged out of its current parent to top-level, into a different parent,
// or reordered among new siblings — the only hard rule is the self/
// descendant guard below (can't drop a module into its own subtree).
function onNestDragStart(ev, id, parentId) {
  S.dragNest = { id, parentId };
  ev.dataTransfer.effectAllowed = 'move';
  ev.stopPropagation();
}
// Plan part1 #8: a row visually sitting directly below an already-EXPANDED
// parent already reads as "inside" that parent's children, not as its
// sibling — so the bottom-quarter zone becomes a child-drop ('in') instead
// of a sibling reorder ('after') for that specific case. A collapsed
// parent, or one with no children at all, keeps the original behavior.
function nestDropZone(ev, row, id) {
  const r = row.getBoundingClientRect();
  const frac = (ev.clientY - r.top) / r.height;
  // v5 Part 4 (§8.8): only a collector takes a module inside it; any other
  // row splits at the middle into before/after, so a drop never offers "in".
  const target = id != null ? findModuleNode(id) : null;
  if (S.dragNest && target && target.kind !== 'collector') return frac < 0.5 ? 'before' : 'after';
  if (frac < 0.25) return 'before';
  if (frac > 0.75) {
    const node = id != null ? findModuleNode(id) : null;
    const hasChildren = node?.children?.length > 0;
    const expanded = hasChildren && !S.moduleCollapsed.has(id);
    return expanded ? 'in' : 'after';
  }
  return 'in';
}
function onNestDragOver(ev, row, id) {
  // v5 Asset Nest: an asset row dropped on a module files it there — always
  // "into", never a reorder, since assets have no sibling order.
  if (S.dragAsset) {
    ev.preventDefault();
    ev.stopPropagation();
    row.classList.remove('drop-before', 'drop-after');
    row.classList.add('drop-in');
    return;
  }
  if (!S.dragNest) return;
  ev.preventDefault();
  ev.stopPropagation();
  row.classList.remove('drop-before', 'drop-after', 'drop-in');
  row.classList.add(`drop-${nestDropZone(ev, row, id)}`);
}
function onNestDragLeave(ev, row) {
  row.classList.remove('drop-before', 'drop-after', 'drop-in');
}
async function onNestDrop(ev, targetId, targetParentId, row) {
  ev.preventDefault();
  ev.stopPropagation();
  row.classList.remove('drop-before', 'drop-after', 'drop-in');
  if (S.dragAsset) {
    const assetId = S.dragAsset;
    S.dragAsset = null;
    S.moduleCollapsed.delete(targetId);
    await moveAssetToModule(assetId, targetId);
    return;
  }
  const drag = S.dragNest;
  S.dragNest = null;
  if (!drag || drag.id === targetId) return;
  const dragNode = findModuleNode(drag.id);
  if (!dragNode || isSelfOrDescendant(dragNode, targetId)) return;
  const zone = nestDropZone(ev, row, targetId);
  const newParentId = zone === 'in' ? targetId : targetParentId;
  if (zone === 'in') S.moduleCollapsed.delete(targetId);
  const siblings = (newParentId == null ? S.moduleTree : findModuleNode(newParentId)?.children || [])
    .map(m => m.id).filter(id => id !== drag.id);
  if (zone === 'before') siblings.splice(siblings.indexOf(targetId), 0, drag.id);
  else if (zone === 'after') siblings.splice(siblings.indexOf(targetId) + 1, 0, drag.id);
  else siblings.push(drag.id);
  try {
    await api.module.move(S.nexus.id, drag.id, newParentId, siblings);
  } catch (_) {
    toast(t('moduleParentMustBeFolder'), 'err');
    return;
  }
  await reloadModuleTree();
}

