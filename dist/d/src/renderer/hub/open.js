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
  S.nestContextId = id; // where [+ New] creates next (hub/sections.js nestNewContext)
  if (m.kind !== 'collector') trackRecentEntity(`module_${id}`);
  if (m.kind === 'collector') { if (S.settings.nestTwoColumn) openFolderPage(id); else toggleMajorExpand(id); return; }
  S.activeModuleNode = m;
  S.activeItemNode = null;
  S.folderPage = null; S.categoryPage = null;

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
    ? `<input id="rename-head-${m.id}" class="rename-input" style="font-size:1.15em" value="${x(m.name)}" onclick="event.stopPropagation()" onblur="saveModuleRename(${m.id},this.value)" onkeydown="renameInputKey(event,this,${m.id})">`
    : `<span ondblclick="startRenameModule(${m.id})">${x(m.name)}</span>`;
  // Procress 16 B12 / 17 U1: handle, kind and assets live in the Properties
  // panel now — the page opens on its data, not on ~300 px of metadata.
  const tabbed = STRUCTURE_KINDS.has(m.kind);
  const tab = tabbed ? pageTabOf(m.id) : 'overview';
  return `<div class="module-page${pageReadableOn(m.id) ? ' page-readable' : ''}" data-module="${m.id}">
    ${pageHeadHtml({
      color: col, icon: moduleIconHtml(m), iconOnclick: `openModuleIconPopup(${m.id},this)`,
      title: nameHtml, titleText: m.name, addr: { moduleId: m.id },
      acts: pageHeadActsHtml(m.id, null),
      layout: pageHeadLayout(m.id, null),
    })}
    ${teachTipHtml(m)}
    ${tabbed ? pageTabsHtml(m.id, tab) : ''}
    ${tab === 'structure' ? pageStructureHtml(m) : pageBlocksHtml(m.id)}
    ${pageFootCategoriesHtml(m.id)}
  </div>`;
}

// Procress 16 part 5: a page's categories at its foot, unless a block of
// its own already shows them
function pageFootCategoriesHtml(moduleId) {
  const page = pageOf(moduleId, null);
  if (!page || page.blocks.some((b) => b.component === 'core.categories')) return '';
  const bar = pageCategoriesHtml(page);
  return bar ? `<div class="page-foot-cats">${bar}</div>` : '';
}

// Procress 18 part 3 (decision 4): a Manager or a Classifier is two things —
// what it holds (Overview: the page as arranged) and what shape it has
// (Structure: description, properties and, for a Classifier, its fields).
// The tab is remembered per module for the session.
const STRUCTURE_KINDS = new Set(['manager', 'classifier']);
const PAGE_TAB = {};
const pageTabOf = (moduleId) => PAGE_TAB[moduleId] || 'overview';
function setPageTab(moduleId, tab) { PAGE_TAB[moduleId] = tab; renderNexusHome(); }
function pageTabsHtml(moduleId, tab) {
  const one = (id, key) => `<button class="btn btn-g page-tab${tab === id ? ' active' : ''}" role="tab" aria-selected="${tab === id}" onclick="setPageTab(${moduleId},'${id}')">${t(key)}</button>`;
  return `<div class="page-tabs" role="tablist">${one('overview', 'gameOverview')}${one('structure', 'kindCatStructure')}</div>`;
}
function pageStructureHtml(m) {
  const fields = m.kind === 'classifier' ? clsData(m.id).templates.map((tpl) => `
      <div class="prop insp-attr">
        <span class="pk" data-no-i18n>${x(tpl.description)}</span>
        <span class="pv ghost">${t(CLASSIFIER_DISPTYPE_KEY[tpl.attribute_type] || 'dispTypeText')}</span>
        <span class="acts">
          <button class="btn btn-g btn-i" onclick="openClassifierFieldsModal(${m.id},${tpl.id})" title="${t('edit')}" aria-label="${t('edit')}">${I.edit}</button>
          <button class="btn btn-g btn-i" onclick="deleteClassifierFieldUndoable(${tpl.id})" title="${t('delete')}" aria-label="${t('delete')}">${I.delete}</button>
        </span>
      </div>`).join('') || `<p class="drafter-hint">${t('clsFieldsEmpty')}</p>` : null;
  return `<div class="page-structure">
    ${fields == null ? '' : `<section class="page-structure-sec"><h3>${t('clsFieldsOfCategory')}</h3>${fields}</section>`}
    <section class="page-structure-sec"><h3>${t('pbProperties')}</h3>${pbPropsEditorHtml(m.id, null, `full${_pbPane}`)}</section>
  </div>`;
}
// The identity row's primary for these kinds: a Classifier's attribute is a
// field of the category; a Manager's is a property of its page.
async function pageAddAttribute(moduleId) {
  const m = findModuleNode(moduleId);
  if (m?.kind === 'classifier') { openClassifierFieldsModal(moduleId); return; }
  setPageTab(moduleId, 'structure');
  const iid = q(`.page-structure .pbc-core-properties[data-iid]`)?.dataset.iid;
  if (iid) await pbPropAdd(iid);
}

// The page's own buttons (APP docs/UX-LAYOUT.md §6.3): ONE primary action —
// "Edit page", which is Arrange, and reads "Done" while arranging — and a ⋯
// that holds everything else in four groups (view · template · share ·
// more). It used to be seven buttons plus one per plugin panel in a row,
// which is the wall Hick's law warns about and left the page with no
// primary action at all. Every row is still a command, so Ctrl+P and the
// shortcuts reach them exactly as before.
function pageHeadActsHtml(moduleId, itemKey) {
  const arranging = S.arranging?.has(pageKey(moduleId, itemKey));
  const structured = itemKey == null && STRUCTURE_KINDS.has(findModuleNode(moduleId)?.kind);
  const arrange = cmdBtn('page.arrange', {}, { cls: `${structured ? 'btn-s' : 'btn-p'} btn-sm${arranging ? ' active' : ''}` });
  const primary = structured
    ? `<button class="btn btn-p btn-sm" onclick="pageAddAttribute(${moduleId})">${I.plus} ${t('addAttribute')}</button>${arrange}`
    : arrange;
  return `${arranging ? pbFrameSwitchHtml() : ''}${primary}${propsToggleHtml()}<button class="btn btn-g btn-i bnav" aria-haspopup="menu" title="${x(t('pageMenu'))}" onclick="event.stopPropagation();openPageMenu(this)">${I.options}</button>`;
}

// The ⋯ of the page head: the menu engine's own items (hub/ctxmenu.js), with
// a header per group. Plugin panels come last, under "more", as rows.
CTX_PROVIDERS['page.menu'] = () => {
  const head = (key) => ({ head: t(key) });
  const plugins = [];
  for (const owner of S.pluginPanels || []) {
    for (const panel of owner.panels) {
      plugins.push({
        label: `${t('openPluginPanel')} — ${panel.title}`, icon: 'layer',
        checked: sidePanelOpen('plugin', { pluginKey: owner.pluginKey, panelId: panel.id }),
        onClick: () => togglePluginPanel(owner.pluginKey, panel.id),
      });
    }
  }
  const groups = [
    [head('pageMenuView'), cmdItem('page.properties'), cmdItem('page.readable'), cmdItem('page.layout')],
    [head('pageMenuTemplate'), cmdItem('page.useTemplate'), cmdItem('page.saveTemplate')],
    [head('pageMenuShare'), cmdItem('page.export'), cmdItem('page.css')],
    [head('pageMenuMore'), cmdItem('page.history'), ...plugins],
  ].filter((g) => g.slice(1).some(Boolean));
  return groups.flatMap((g, i) => (i ? [{ sep: true }, ...g] : g));
};
function openPageMenu(btn) {
  const items = CTX_PROVIDERS['page.menu']();
  if (items.length) ctxMenu(null, items, { anchor: btn });
}
