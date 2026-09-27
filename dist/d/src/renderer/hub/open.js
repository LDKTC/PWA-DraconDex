// Opening a module node and the page shell that hosts its blocks (v5 Part 8,
// page/page.js) — the kind's own view is one of them (KIND_PAGE,
// hub/kind-page.js, through page/registry.js).

// ═══ Open a module ═════════════════════════════════════════════════════
async function openModuleNode(id) {
  const m = findModuleNode(id);
  if (!m) return;
  // page/focus.js — before the first await, while the click is window.event
  if (m.kind !== 'collector' && S.activeModuleNode?.id !== id) pageAutoCollapseLeft();
  // Process 6 part 1: used to only toggle-expand a top-level collector —
  // a nested one (parent_id != null) silently no-opped on row click (the
  // chevron's own toggleMajorExpand still worked, but the row body didn't),
  // which also made a pinned nested collector's rail button do nothing.
  if (m.kind === 'collector') { toggleMajorExpand(id); return; }
  S.activeModuleNode = m;
  S.activeItemNode = null;
  S.importDockPage = false;
  upsertModuleTab(id);
  updateStatusBar({ item: null, words: null, saveState: null });
  renderModuleRail();
  renderNexusHome();
  // renderNexusHome() above has already painted the shell, so the pane sits
  // there empty until the page loads — on a large module that reads as a
  // click that did nothing.
  setBusy('#main-inner', true);
  try { await loadModulePage(m); }
  finally { setBusy('#main-inner', false); }
  if (S.activeModuleNode?.id === id) renderNexusHome();
}

// Process 6 part 1: the nav rail's pinned-module buttons used to share
// openModuleNode's raw click, which for a collector just toggles it closed
// again on a second click — a pinned rail button should always focus/open
// its module, never act as an on/off toggle for the hub. It should also
// show only ONE module's branch expanded in the Nest tree at a time (every
// other top-level branch collapses) and make sure the Nest accordion
// section itself is the one showing, instead of leaving Sage Hut/Kind
// Browser/Import Dock open with nothing indicating where the module lives.
function focusModuleInNest(id) {
  const m = findModuleNode(id);
  if (!m) return;
  const root = moduleRootAncestor(m) || m;
  for (const top of S.moduleTree) {
    if (top.id === root.id) S.moduleCollapsed.delete(top.id);
    else S.moduleCollapsed.add(top.id);
  }
  // Walk id's own ancestor chain open so the row is actually reachable —
  // collapsing "every other top-level branch" above only guarantees the
  // right ROOT is expanded, not every level in between for a deep node.
  let cur = m;
  while (cur.parent_id != null) {
    S.moduleCollapsed.delete(cur.parent_id);
    cur = findModuleNode(cur.parent_id);
    if (!cur) break;
  }
  S.moduleCollapsed.delete(m.id);
}

async function openPinnedRailModule(id) {
  const m = findModuleNode(id);
  if (!m) return;
  S.hubOpen.nest = true;
  localStorage.setItem(HUB_OPEN_KEY, JSON.stringify(S.hubOpen));
  focusModuleInNest(id);
  // A collector (module-collection) has no builder of its own — this is
  // just the focus/expand above, not a toggle (openModuleNode's own
  // collector branch DOES toggle, which would immediately re-collapse the
  // branch focusModuleInNest just opened).
  if (m.kind === 'collector') { renderNexusHome(); renderModuleRail(); return; }
  await openModuleNode(id);
}

// The page: its head (name, handle, kind, the page's own buttons), the
// teach tip and assets strip, then the blocks (page/page.js). Tags, the
// link count and the description moved into the Properties component
// (§12.8) — they were in the head AND in the dock before.
function buildModuleDetailHtml(m) {
  const col = m.icon_color_code || m.color_code || 'var(--accent)';
  const renamingHead = S.renamingModuleId === m.id;
  const nameHtml = renamingHead
    ? `<input id="rename-head-${m.id}" class="rename-input" style="font-size:1.15em" value="${x(m.name)}" onclick="event.stopPropagation()" onblur="saveModuleRename(${m.id},this.value)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value=${x(JSON.stringify(m.name))};this.blur();}">`
    : `<span ondblclick="startRenameModule(${m.id})">${x(m.name)}</span>`;
  return `<div class="module-page${pageReadableOn(m.id) ? ' page-readable' : ''}" data-module="${m.id}">
    ${pageHeadHtml({
      color: col, icon: moduleIconHtml(m), iconOnclick: `openModuleIconPopup(${m.id},this)`,
      title: nameHtml, titleText: m.name, addr: { moduleId: m.id },
      after: `${moduleHandleHtml(m)}<span class="kind-chip" data-no-i18n>${x(kindLabelBoth(m.kind))}</span>`,
      acts: pageHeadActsHtml(m.id, null),
      layout: pageHeadLayout(m.id, null),
    })}
    ${teachTipHtml(m)}
    ${buildModuleAssetsStripHtml(m)}
    ${pageBlocksHtml(m.id)}
  </div>`;
}

// The page's own buttons (§12.6): arrange, version history, plugin panels.
function pageHeadActsHtml(moduleId, itemKey) {
  const arranging = S.arranging?.has(pageKey(moduleId, itemKey));
  const hist = itemKey == null ? cmdBtn('page.history', {}, { iconOnly: true, cls: `btn-g btn-i bnav${sidePanelOpen('versions') ? ' active' : ''}` }) : '';
  const readable = cmdBtn('page.readable', {}, { iconOnly: true, cls: `btn-g btn-i bnav${pageReadableOn(moduleId) ? ' active' : ''}` });
  const layout = cmdBtn('page.layout', {}, { iconOnly: true, cls: 'btn-g btn-i bnav' });
  const exp = cmdBtn('page.export', {}, { iconOnly: true, cls: 'btn-g btn-i bnav' });
  const tpl = cmdBtn('page.useTemplate', {}, { iconOnly: true, cls: 'btn-g btn-i bnav' }) + cmdBtn('page.saveTemplate', {}, { iconOnly: true, cls: 'btn-g btn-i bnav' });
  return `${cmdBtn('page.arrange', {}, { cls: `btn-g btn-sm${arranging ? ' active' : ''}` })}${layout}${tpl}${exp}${readable}${hist}${typeof pluginPanelButtonsHtml === 'function' ? pluginPanelButtonsHtml() : ''}`;
}
