'use strict';
// ═══ Activity Bar (v5 Part 7, APP docs/V5.md §11.9) ════════════════════
// The rail is an activity bar, VS Code / Obsidian style: a column of
// destinations, and the left panel shows ONE of them at full height — in
// place of the four-part accordion whose section heights the user had to
// drag (Nest, Kind Browser, Sage Hut, Import Dock). Clicking the open
// destination again folds the panel away.
//
//   nest     the Nest tree + the Import Dock rows; "group by kind" in the
//            Nest options is what the Kind Browser was
//   search   full-panel content search (db/search.js — Ctrl+P stays the shortcut)
//   insight  Sage Hut
//   tools    Problems, CSV import, colours, export Markdown, guide, templates
//   trash    the module trash (§11.4)
// Labels keeps its own view (hashtag.js); its rail button just opens it.
// Every destination is a command on the `rail` surface (core/commands.js),
// so each is also in Ctrl+P. The rail draws the same buttons in the
// vertical and the horizontal navbar (applyNavOrientation, core/boot.js).

const LEFT_DESTS = ['nest', 'search', 'insight', 'tools', 'trash'];
const LEFT_DEST_KEY = 'dracondex-left-dest';

function leftDest() {
  if (!LEFT_DESTS.includes(S.leftDest)) {
    let v = null;
    try { v = localStorage.getItem(LEFT_DEST_KEY); } catch (_) {}
    S.leftDest = LEFT_DESTS.includes(v) ? v : 'nest';
  }
  return S.leftDest;
}

// Open a destination (from the palette or a link): never folds the panel.
function showLeftDest(dest) {
  if (!LEFT_DESTS.includes(dest)) return;
  S.leftDest = dest;
  try { localStorage.setItem(LEFT_DEST_KEY, dest); } catch (_) {}
  if (S.leftPanelCollapsed) setLeftPanelCollapsed(false);
  if (S.view !== 'nexus') { renderNexusHome(); return; }
  renderLeftPanel();
  renderModuleRail();
}

// A rail click: the open destination again folds the panel (VS Code).
function railDest(dest) {
  if (dest === leftDest() && !S.leftPanelCollapsed && S.view === 'nexus') {
    setLeftPanelCollapsed(true);
    renderModuleRail();
    return;
  }
  showLeftDest(dest);
}

const railDestActive = (dest) => S.view === 'nexus' && !S.leftPanelCollapsed && leftDest() === dest;

// Only the left panel — the builder keeps its live DOM.
function renderLeftPanel() {
  const inner = q('#left-panel-inner');
  if (!inner || !S.nexus) return;
  inner.innerHTML = buildLeftPanelHtml();
  mountLeftPanel();
}

function buildLeftPanelHtml() {
  switch (leftDest()) {
    case 'search': return leftSearchHtml();
    case 'insight': return leftPanelHead(t('sageHut'), `<button class="btn btn-g btn-i" onclick="openSageTab('dataSize')" title="${t('sageHut')}">${I.sage}</button>`)
      + `<div class="left-dest-body">${buildSageHutRows()}</div>`;
    case 'tools': return S.leftTool === 'problems' && typeof problemsPanelHtml === 'function' ? problemsPanelHtml() : leftToolsHtml();
    case 'trash': return leftPanelHead(t('trashTitle')) + `<div class="left-dest-body" id="left-trash"><p class="drafter-hint">${t('syncWorking')}</p></div>`;
    default: return buildHubHtml();
  }
}

// After the HTML is in: the parts that need a round trip.
function mountLeftPanel() {
  const dest = leftDest();
  if (dest === 'search') {
    const inp = q('#left-search-q');
    if (inp && !inp.dataset.bound) {
      inp.dataset.bound = '1';
      api.search.rebuild(S.nexus.id); // fresh text, as Ctrl+P does on open
      if (S.leftSearchQ) runLeftSearch(S.leftSearchQ);
      setTimeout(() => inp.focus(), 30);
    }
  } else if (dest === 'trash') {
    fillLeftTrash();
  } else if (dest === 'tools' && S.leftTool === 'problems' && typeof loadProblemsPanel === 'function') {
    loadProblemsPanel();
  }
}

const leftPanelHead = (title, acts = '') =>
  `<div class="ph left-dest-head"><h4>${x(title)}</h4><span class="acts">${acts}</span></div>`;

// ── Nest: grouped by kind (was the Kind Browser section) ────────────────
const NEST_BY_KIND_KEY = 'dracondex-nest-by-kind';
function nestByKind() {
  if (S.nestByKind == null) { try { S.nestByKind = localStorage.getItem(NEST_BY_KIND_KEY) === '1'; } catch (_) { S.nestByKind = false; } }
  return S.nestByKind;
}
function setNestByKind(on) {
  S.nestByKind = !!on;
  try { localStorage.setItem(NEST_BY_KIND_KEY, on ? '1' : '0'); } catch (_) {}
}
function toggleNestByKind() {
  setNestByKind(!nestByKind());
  renderNexusHome();
  const pop = document.querySelector('.nest-options-popup');
  if (pop) pop.innerHTML = buildNestOptionsPopupHtml();
}

// ── search ──────────────────────────────────────────────────────────────
function leftSearchHtml() {
  return leftPanelHead(t('leftSearch')) + `<div class="left-dest-body">
    <input id="left-search-q" class="left-search-input" placeholder="${x(t('leftSearchHint'))}" value="${x(S.leftSearchQ || '')}"
      oninput="onLeftSearchInput(this.value)" autocomplete="off">
    <div id="left-search-res" class="left-search-res"></div>
  </div>`;
}

let _leftSearchTimer = null;
function onLeftSearchInput(v) {
  S.leftSearchQ = v;
  clearTimeout(_leftSearchTimer);
  _leftSearchTimer = setTimeout(() => runLeftSearch(v), 180);
}

async function runLeftSearch(v) {
  const box = q('#left-search-res');
  if (!box || !S.nexus) return;
  const qy = String(v || '').trim();
  if (!qy) { box.innerHTML = ''; return; }
  const rows = await api.search.query(S.nexus.id, qy);
  if (q('#left-search-q')?.value.trim() !== qy) return; // a newer query won
  // The snippet marks the hit with [ ]; escape first, then bold the marks.
  const snip = (s) => x(s || '').replace(/\[([^\]]*)\]/g, '<b>$1</b>');
  box.innerHTML = rows.length ? rows.map(r => `
    <div class="li left-search-row" onclick="openEntityByKey(${xj(r.key)})">
      <span class="name">${x(r.title || r.key)}<small class="chs-snippet" data-no-i18n>${snip(r.snippet)}</small></span>
    </div>`).join('') : `<p class="drafter-hint">${t('leftSearchNone')}</p>`;
}

// ── tools ───────────────────────────────────────────────────────────────
const LEFT_TOOLS = ['tools.problems', 'tools.csvImport', 'app.colors', 'app.exportMarkdown', 'app.exportHtml', 'app.createGuide', 'app.newProject'];

function leftToolsHtml() {
  return leftPanelHead(t('leftTools')) + `<div class="left-dest-body">${LEFT_TOOLS.filter(id => COMMANDS[id] && cmdVisible(COMMANDS[id], {})).map(id => `
    <div class="li" data-cmd="${id}" onclick="runCommand(${xj(id)},{},this)">
      <span class="kicon">${I[COMMANDS[id].icon] || ''}</span><span class="name">${x(cmdLabel(id, {}))}</span>
    </div>`).join('')}</div>`;
}

// ── trash ───────────────────────────────────────────────────────────────
async function fillLeftTrash() {
  const box = q('#left-trash');
  if (!box || !S.nexus) return;
  const rows = await api.trash.list(S.nexus.id);
  box.innerHTML = `<p class="sync-hint">${t('trashHint')}</p>${trashRowsHtml(rows)}
    ${rows.length ? `<button class="btn btn-d btn-sm" onclick="emptyTrashNow()">${t('trashEmptyAll')}</button>` : ''}`;
}
