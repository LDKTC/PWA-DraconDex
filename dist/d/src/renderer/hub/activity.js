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

const LEFT_DESTS = ['nest', 'recent', 'search', 'insight', 'tools', 'trash'];
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
  // Procress 16 B10: arranging the open page — the component collection
  if (typeof pbcWanted === 'function' && pbcWanted()) return pbcPanelHtml();
  switch (leftDest()) {
    case 'search': return leftSearchHtml();
    case 'recent': return leftPanelHead(t('leftRecent')) + `<div class="left-dest-body" id="left-recent"></div>`;
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
      runLeftSearch(S.leftSearchQ || ''); // empty = the recent searches
      setTimeout(() => inp.focus(), 30);
    }
  } else if (dest === 'recent') {
    fillLeftRecent();
  } else if (dest === 'trash') {
    fillLeftTrash();
  } else if (dest === 'tools' && S.leftTool === 'problems' && typeof loadProblemsPanel === 'function') {
    loadProblemsPanel();
  }
}

// Procress 18 part 1: Recent — the modules and elements opened last in this
// Nexus (core/router.js trackRecentEntity), each with where it lives. The
// same rows are Home's "Continue".
async function recentRowsHtml(limit = 20) {
  const keys = (S.recentEntities || []).slice(0, limit);
  if (!keys.length || !S.nexus) return '';
  const byKey = new Map((await api.wiki.quickIndex(S.nexus.id)).map((e) => [e.key, e]));
  // an element's place is its module (entityPath — what link navigation uses)
  const owner = new Map(await Promise.all(keys.filter((k) => !/^module_\d+$/.test(k))
    .map(async (k) => [k, (await api.wiki.entityPath(k).catch(() => null))?.moduleId])));
  return keys.map((k) => byKey.get(k)).filter(Boolean).map((e) => {
    const mod = /^module_\d+$/.test(e.key) ? findModuleNode(Number(e.key.slice(7))) : null;
    const where = mod ? (mod.parent_id != null ? findModuleNode(mod.parent_id)?.name : '') : findModuleNode(owner.get(e.key))?.name;
    return `<div class="li" onclick="openEntityByKey(${xj(e.key)})">
      <span class="kicon" aria-hidden="true">${mod ? moduleIconHtml(mod) : I.item || ''}</span>
      <span class="name" data-no-i18n>${x(e.name)}<small class="chs-snippet">${x(where || '')}</small></span></div>`;
  }).join('');
}
async function fillLeftRecent() {
  const box = q('#left-recent');
  if (!box) return;
  const opened = (await recentRowsHtml()) || `<div class="empty"><p>${t('recentEmpty')}</p></div>`;
  // Procress 16 part 5: and the Nexus's changes — the vault-wide feed
  const changes = await api.versions.recent(S.nexus.id, 30).catch(() => []);
  const rows = changes.map((c) => `<div class="li"${c.moduleId && findModuleNode(c.moduleId) ? ` onclick="openModuleNode(${c.moduleId})"` : ''}>
    <span class="name" data-no-i18n>${x(c.name || '—')}<small class="chs-snippet">${x(String(c.at).slice(0, 16))}</small></span></div>`).join('');
  box.innerHTML = opened + (rows ? `<div class="props-k left-changed">${t('leftChanged')}</div>${rows}` : '');
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
      oninput="onLeftSearchInput(this.value)" autocomplete="off" aria-describedby="left-search-tip">
    <p id="left-search-tip" class="drafter-hint" data-no-i18n>${x(t('srchFilters'))}</p>
    <div id="left-search-res" class="left-search-res" aria-live="polite"></div>
  </div>`;
}

// Procress 16 part 5: the last ten searches of this Nexus, offered while the box is empty
const SEARCH_HIST_KEY = () => `dracondex-search-hist-${S.nexus?.id}`;
function searchHistory() { try { const v = JSON.parse(localStorage.getItem(SEARCH_HIST_KEY()) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function rememberSearch(qy) { try { localStorage.setItem(SEARCH_HIST_KEY(), JSON.stringify([qy, ...searchHistory().filter((h) => h !== qy)].slice(0, 10))); } catch (_) {} }
function searchHistoryHtml() {
  const h = searchHistory();
  return h.length ? `<div class="props-k">${t('srchRecent')}</div>${h.map((qy) => `<div class="li" role="button" tabindex="0" onclick="useSearch(${xj(qy)})"
    onkeydown="if(event.key==='Enter')useSearch(${xj(qy)})"><span class="name" data-no-i18n>${x(qy)}</span></div>`).join('')}` : '';
}
function useSearch(qy) { const inp = q('#left-search-q'); if (inp) { inp.value = qy; onLeftSearchInput(qy); inp.focus(); } }

// Which modules the k: / l: / in: tokens allow (null = no filter). in: is
// any folder up the chain whose name starts with the word.
async function searchModuleFilter(f) {
  if (!f.k.length && !f.l.length && !f.in.length) return null;
  const tags = f.l.length ? await api.module.tagIndex(S.nexus.id) : [];
  const low = (v) => String(v).toLowerCase();
  const ok = new Set();
  for (const m of flattenModulesByKind(S.moduleTree, [])) {
    if (f.k.length && !f.k.some((k) => low(m.kind).startsWith(low(k)) || low(kindLabel(m.kind)).startsWith(low(k)))) continue;
    if (f.l.length && !f.l.every((l) => tags.some((r) => r.moduleId === m.id && low(r.tag) === low(l)))) continue;
    if (f.in.length) {
      const up = []; for (let p = m.parent_id; p != null; p = findModuleNode(p)?.parent_id) up.push(low(findModuleNode(p)?.name || ''));
      if (!f.in.every((w) => up.some((n) => n.startsWith(low(w))))) continue;
    }
    ok.add(m.id);
  }
  return ok;
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
  if (!qy) { box.innerHTML = searchHistoryHtml(); return; }
  const f = parseNestQuery(qy);
  const text = f.text.join(' ');
  const allow = await searchModuleFilter(f);
  let rows = text ? await api.search.query(S.nexus.id, text) : [];
  if (allow) {
    // a hit belongs to the module it lives in (the viewer index knows every element's)
    const where = new Map((await api.viewer.index(S.nexus.id)).map((it) => [it.key, it.moduleId]));
    const modOf = (k) => (/^module_(\d+)$/.test(k) ? Number(k.slice(7)) : where.get(k));
    rows = text ? rows.filter((r) => allow.has(modOf(r.key)))
      : [...allow].map((id) => findModuleNode(id)).filter(Boolean).map((m) => ({ key: `module_${m.id}`, title: m.name, snippet: kindLabel(m.kind) }));
  }
  if (q('#left-search-q')?.value.trim() !== qy) return; // a newer query won
  rememberSearch(qy);
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
      <span class="kicon" aria-hidden="true">${I[COMMANDS[id].icon] || ''}</span><span class="name">${x(cmdLabel(id, {}))}</span>
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
