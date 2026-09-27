// The v3 module-kind registry (icons, labels, colors, description keys) plus
// module-tree lookup helpers, reloadModuleTree() and the dynamic nav-rail strip.
// FIRST script of the hub/ family: MODULE_KINDS / KIND_* are top-level consts
// the other files read, and cross-script const is in a TDZ until this runs.
'use strict';
// ═══ v3 MODULE SYSTEM — Nexus nest hub (progress.md Phases 1-3) ═══════
// New, additive Major/Minor module tree living alongside the legacy
// Director/Navigator/Hero/Writer/Scribe/Sage/Artisan modules. See
// progress.md Section C for why this pass keeps the legacy modules
// reachable unchanged (their existing nav-rail buttons still work) instead
// of literally deleting them — full removal is Phase 23's job, once they
// migrate into Artisan templates.

const MODULE_KINDS = ['collector','manager','inspector','classifier','locator','chronicler',
  'wanderer','narrator','author','scribe','drafter','exhibitor','sketcher','designer','diviner'];
const KIND_ICON = {
  collector:'folder', manager:'manager', inspector:'document', classifier:'layer',
  locator:'map', chronicler:'timeline', wanderer:'wanderer', narrator:'narrator',
  author:'book', scribe:'story', drafter:'scribe', exhibitor:'relation',
  sketcher:'sketcher', designer:'relation', diviner:'dice',
};
// Unique names (progress.md Section A.3 #7) are locale-invariant by design —
// the Classic <-> Unique name toggle is Phase 22, not needed yet.
const KIND_LABEL = {
  collector:'Collector', manager:'Manager', inspector:'Inspector', classifier:'Classifier',
  locator:'Locator', chronicler:'Chronicler', wanderer:'Wanderer', narrator:'Narrator',
  author:'Author', scribe:'Scribe', drafter:'Drafter', exhibitor:'Exhibitor',
  sketcher:'Sketcher', designer:'Designer', diviner:'Diviner',
};
// Distinct accent per kind for the create-modal picker cards (buildKindPicker
// below) — drawn from the app's own seeded color palette (src/db/core.js),
// not a new hardcoded set, so cards stay theme-safe.
const KIND_COLOR = {
  collector:'#64748b', manager:'#6366f1', inspector:'#3b82f6', classifier:'#8b5cf6',
  locator:'#22c55e', chronicler:'#f97316', wanderer:'#06b6d4', narrator:'#ec4899',
  author:'#eab308', scribe:'#38bdf8', drafter:'#a78bfa', exhibitor:'#f43f5e',
  sketcher:'#fb923c', designer:'#a3e635', diviner:'#14b8a6',
};
// v5 (APP docs/V5.md §9.2 / §9.4): what a kind IS, by where its content
// comes from — the 5th metadata map beside the four above, the grouping §7.7
// found missing. structure = holds modules, not content; view = shows other
// modules' content (deleting one loses only a layout); data = owns content.
const KIND_CATEGORY = {
  collector: 'structure',
  manager: 'view', exhibitor: 'view',
  inspector: 'data', drafter: 'data', classifier: 'data', locator: 'data', chronicler: 'data',
  wanderer: 'data', narrator: 'data', author: 'data', scribe: 'data', sketcher: 'data', designer: 'data',
  diviner: 'data', // v5 Part 7 (§11.5): deleting it deletes its tables
};
// §9.5: the five function groups of §7.7 survive as sub-headings under data
// only (the sixth, "organise", straddled all three categories).
const KIND_GROUPS = [
  { cat: 'structure', kinds: ['collector'] },
  { cat: 'view', kinds: ['manager', 'exhibitor'] },
  { cat: 'data', key: 'kindGroupNotes', kinds: ['inspector', 'drafter'] },
  { cat: 'data', key: 'kindGroupData', kinds: ['classifier', 'diviner'] },
  { cat: 'data', key: 'kindGroupMapTime', kinds: ['locator', 'chronicler', 'wanderer'] },
  { cat: 'data', key: 'kindGroupStory', kinds: ['narrator', 'author', 'scribe'] },
  { cat: 'data', key: 'kindGroupDraw', kinds: ['sketcher', 'designer'] },
];
const KIND_CATEGORY_KEY = { structure: 'kindCatStructure', view: 'kindCatView', data: 'kindCatData' };

// v5 Part 6 — kind names in both modes (kindLabel() itself is in core/state.js).
const kindUniqueLabel = (kind) => (typeof KIND_LABEL !== 'undefined' && KIND_LABEL[kind]) || kind;
const kindClassicLabel = (kind) => (KIND_CLASSIC_KEY[kind] && L.en[KIND_CLASSIC_KEY[kind]] ? t(KIND_CLASSIC_KEY[kind]) : kindUniqueLabel(kind));
// §10.5: the name in the current mode, then the other one as the secondary —
// "Category · Classifier" in a Classic locale — so neither a new user nor an old one loses theirs.
function kindLabelBoth(kind) {
  const a = kindLabel(kind);
  const b = S.settings?.nameMode === 'classic' ? kindUniqueLabel(kind) : kindClassicLabel(kind);
  return a === b ? a : `${a} · ${b}`;
}
// Every name a kind answers to, for search: unique, classic in this locale,
// and classic in English — so a search works in either mode (§10.5 / dragon).
function kindSearchText(kind) {
  const k = KIND_CLASSIC_KEY[kind];
  return [kindUniqueLabel(kind), kindClassicLabel(kind), k ? L.en[k] : ''].filter(Boolean).join(' ');
}

// i18n key per kind's one-line description on the same cards.
const KIND_DESC_KEY = {
  collector:'kindDescCollector', manager:'kindDescManager', inspector:'kindDescInspector',
  classifier:'kindDescClassifier', locator:'kindDescLocator', chronicler:'kindDescChronicler',
  wanderer:'kindDescWanderer', narrator:'kindDescNarrator', author:'kindDescAuthor',
  scribe:'kindDescScribe', drafter:'kindDescDrafter',
  exhibitor:'kindDescExhibitor', sketcher:'kindDescSketcher', designer:'kindDescDesigner',
  diviner:'kindDescDiviner',
};

// The 4 legacy fixed modules, now only for the Hub's Legacy Import section
// (ensureLegacyImport, MIGRATE_TARGETS below). New projects start from a
// genre bundle instead (hub/bundles.js, v5 Part 7 §11.7) — this list is kept
// under its old name because the migrate path is built from it.
const ARTISAN_TARGETS = [
  { id: 'director',  icon: 'director',  labelKey: 'director' },
  { id: 'navigator', icon: 'navigator', labelKey: 'navigator' },
  { id: 'hero',      icon: 'hero',      labelKey: 'hero' },
  { id: 'writer',    icon: 'writer',    labelKey: 'writer' },
];

// The sources Legacy Import can migrate. Scribe notes used to be a fifth;
// since v5 Part 8 they are converted silently whenever a tree is read
// (db/migrate_v3.js autoMigrateNotes), so there is nothing left to offer.
const MIGRATE_TARGETS = [...ARTISAN_TARGETS];

// Selection made in the Icon Collection picker (Phase 5): `svg:<I-key>` or
// `sym:<glyph>`, stored verbatim in module.icon. Falls back to the kind's
// default icon when unset.
function moduleIconHtml(m) {
  return iconRefHtml(m.icon, I[KIND_ICON[m.kind]] || I.layer);
}

function findModuleNode(id, nodes = S.moduleTree) {
  for (const m of nodes) {
    if (m.id === id) return m;
    if (m.children?.length) {
      const found = findModuleNode(id, m.children);
      if (found) return found;
    }
  }
  return null;
}

// Walks parent_id up to the true root ancestor (Plan part3 status-bar fix —
// nesting depth is arbitrary since Plan part1 #4, so a single parent_id hop
// is not necessarily the root). Returns null if `m` is already the root.
function moduleRootAncestor(m) {
  let cur = m;
  while (cur.parent_id != null) {
    const p = findModuleNode(cur.parent_id);
    if (!p) break;
    cur = p;
  }
  return cur.id === m.id ? null : cur;
}

// True if `targetId` is `node` itself or nested anywhere under it — used to
// block a drag-drop that would nest a module inside its own subtree.
function isSelfOrDescendant(node, targetId) {
  if (node.id === targetId) return true;
  return (node.children || []).some(c => isSelfOrDescendant(c, targetId));
}

// Plan part2 #2.5: the second call used to be module:getItemCounts, which
// only gated the expand chevron and left the actual item rows to be fetched
// lazily, one IPC (and one full re-render) per expanded content module.
// module:getNestItems returns them all at once, so the count is just
// .length and the tree paints in a single render.
// opts.skipMirror: the caller IS a mirror sync (core/nexus-locate.js) that
// brought folders in — do not schedule another one off the back of it.
async function reloadModuleTree(opts = {}) {
  const [tree, nestItems] = S.nexus
    ? await Promise.all([api.module.getTree(S.nexus.id), api.module.getNestItems(S.nexus.id)])
    : [[], {}];
  S.moduleTree = tree;
  seedNestItems(nestItems);
  refreshPresetCache(); // hub/presets.js — the kind picker reads it synchronously
  // Vault content changed under it, so the memoised analytics payloads
  // (Plan part2 #2.3) can't be reused.
  S.sageHutCache = null;
  S.activeModuleNode = S.activeModuleNode ? findModuleNode(S.activeModuleNode.id) : null;
  // prune builder tabs pointing at deleted modules
  for (const pane of (S.builder?.panes || [])) {
    pane.tabs = pane.tabs.filter(k => !k.startsWith('module:') || !!findModuleNode(Number(k.slice(7))));
    if (pane.active && !pane.tabs.includes(pane.active)) pane.active = pane.tabs[0] || null;
  }
  renderModuleRail();
  renderProjectTabs();
  if (S.view === 'nexus' && !S.activeModule) renderNexusHome();
  // v5 Part 4 (§8.5): a located Nexus re-mirrors after any tree change.
  if (!opts?.skipMirror && typeof scheduleMirrorSync === 'function') scheduleMirrorSync();
}

// ═══ NAV RAIL — dynamic Major-module icon strip (any depth, Phase 1) ══
function renderModuleRail() {
  const rail = q('#nav-sidebar');
  if (!rail) return;
  rail.querySelectorAll('.module-rail-item, .module-rail-tool').forEach(el => el.remove());
  if (!S.nexus) return;
  const anchor = q('#nav-logo-btn');
  if (!anchor) return;
  // Process 6 part 1: pinning is unconditional at any depth since Process 3
  // part 2 (buildModuleContextMenuHtml has no depth gate), but this used to
  // read S.moduleTree directly — a shallow array of root nodes only — so a
  // pinned nested module never made it onto the rail. flattenModuleTree
  // (hub/menus.js) walks the whole tree instead.
  const pinned = flattenModuleTree(S.moduleTree, 0).map(({ m }) => m).filter(m => m.pinned);
  // Plan process2 part1 #2/#3: Kind Browser is a Hub accordion section now
  // (hub/sections.js), not a competing top-level page state, so only
  // whether the Hub is showing at all — not which button was last clicked —
  // decides this highlight. The "List Modules" button below no longer
  // carries its own active class: it's a plain shortcut into the Hub, same
  // as the pinned-module buttons' onclick, and clicking it never moves the
  // highlight by itself (only actually opening a module does, below).
  const atHubHome = !S.activeModuleNode && !S.filePreview && !S.sageHut && !S.importDockPage;
  // Plan process1 part4 #2: the nav rail's own "+ create module" tool was
  // dropped — the Nexus Nest hub section already offers the same
  // openMainModuleModal() both in its header (hub/sections.js) and its
  // empty state (nestEmptyHtml(), hub/tree.js), so this was a duplicate.
  // Plan process4 part2 #1: Sage Hut/Import Dock join Kind Browser as rail
  // shortcuts (previously only reachable via the Hub accordion's own header
  // icons), each individually hideable from the rail's right-click quick-menu
  // toggle (hub/menus.js openHubQuickMenuContextMenu) — Nexus Nest is the
  // rail's home button and stays out of that toggle list.
  const hqt = S.settings.hubQuickToggles || {};
  const hqtHidden = (key) => hqt[key] === false ? ' tool-toggle-hidden' : '';
  // v5 Part 7 (§11.9): the Activity Bar — each button is a destination of
  // the left panel (hub/activity.js); the open one again folds the panel.
  // Labels keeps its own view. Every one is a `rail` command, so Ctrl+P too.
  const dest = (id, key, icon, labelKey, on) => `<button class="nav-btn module-rail-tool${on ? ' active' : ''}${key ? hqtHidden(key) : ''}"
      title="${t(labelKey)}" data-cmd="${id}"${key ? ` data-dest="${key}"` : ''} onclick="runCommand(${x(xj(id))},{rail:true})"${key ? ' oncontextmenu="openHubQuickMenuContextMenu(event)"' : ''}>${I[icon]}<span class="nav-label">${t(labelKey)}</span></button>`;
  let html = dest('app.nest', null, 'home', 'nexusNest', railDestActive('nest') && atHubHome)
    + dest('app.searchPanel', 'search', 'search', 'leftSearch', railDestActive('search'))
    + dest('app.labels', 'labels', 'hashtag', 'hashtag', S.view === 'hashtag')
    + dest('app.sageHut', 'sage', 'sage', 'sageHut', railDestActive('insight'))
    + dest('app.tools', 'tools', 'fields', 'leftTools', railDestActive('tools'))
    + dest('app.trash', 'trash', 'delete', 'trashTitle', railDestActive('trash'));
  if (pinned.length) html += `<div class="rail-sep module-rail-tool"></div>`;
  for (const m of pinned) {
    const active = S.activeModuleNode?.id === m.id ? ' active' : '';
    const col = m.icon_color_code || m.color_code || '#6366f1';
    html += `<button class="nav-btn module-rail-item${active}" style="color:${x(col)}" title="${x(m.name)}" onclick="openPinnedRailModule(${m.id})">
      <span class="mdot-anchor">${moduleIconHtml(m)}<span class="mdot" style="background:${x(m.color_code || '#6366f1')}"></span></span><span class="nav-label">${x(m.name)}</span>
    </button>`;
  }
  anchor.insertAdjacentHTML('afterend', html);
}

// Nav-sidebar "home" button — jumps back to the Nexus Nest hub's welcome
// page from anywhere inside a v3 module's detail view (the existing
// #nav-logo-btn "return" affordance only fires for legacy full-page
// modules — S.activeModule — not for a focused module node inside the
// Builder grid, so there was previously no one-click way back for that).
function goToNexusNestHub() {
  S.activeModuleNode = null;
  S.filePreview = null;
  S.sageHut = null;
  S.activeItemNode = null;
  S.importDockPage = false;
  // Wyvern (Plan part2 #New Workspace): jumping to Nexus Nest from the
  // View-set menu returns to the browse root rather than wherever the user
  // last drilled — matches Drake's own "home" button (clears state, doesn't
  // remember position). Dragon gets the same treatment.
  S.wyvernBrowsePath = [];
  S.dragonBrowsePath = []; S.dragonSearch = '';
  renderNexusHome();
}

