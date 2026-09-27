// Nexus (vault) lifecycle: the workspace switcher dropdown, the picker grid,
// open/close/reload, the recent-vault MRU and create/edit/delete. The Welcome
// screen itself lives in core/welcome.js (its own window since v4.6.0).

// ═══ RECENT VAULTS (MRU) ═══════════════════════════════
// Backed by NEXUS_RECENT_KEY (state.js) — see the note there for why recency
// isn't a DB column. Ids only; names/colors are always read back from
// S.nexuses so a renamed or deleted vault can never go stale here.
function loadRecentNexusIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(NEXUS_RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(Number.isInteger) : [];
  } catch (e) { return []; }
}

function pushRecentNexus(id) {
  if (!Number.isInteger(id)) return;
  const next = [id, ...loadRecentNexusIds().filter(v => v !== id)].slice(0, 10);
  localStorage.setItem(NEXUS_RECENT_KEY, JSON.stringify(next));
}

function dropRecentNexus(id) {
  localStorage.setItem(NEXUS_RECENT_KEY, JSON.stringify(loadRecentNexusIds().filter(v => v !== id)));
}

// The N most-recently-opened vaults as real rows from S.nexuses, current one
// excluded. Falls back to S.nexuses' own (alphabetical) order to fill the
// list when the MRU is short — a fresh install has no history at all.
function recentNexuses(limit, excludeId = S.nexus?.id) {
  const byId = new Map(S.nexuses.map(n => [n.id, n]));
  const out = [];
  for (const id of loadRecentNexusIds()) {
    if (id === excludeId || !byId.has(id)) continue;
    out.push(byId.get(id));
    if (out.length >= limit) return out;
  }
  for (const n of S.nexuses) {
    if (n.id === excludeId || out.some(v => v.id === n.id)) continue;
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

// Workspace switcher — dropdown opened above the vault-head name pinned at the
// bottom of the left panel. Shows only the 3 most recent vaults (v4.6.0);
// picking one opens it in a new window rather than switching in-place. The
// last row leads to the Welcome window, which is now the full vault list.
function toggleNexusSwitcher(e) {
  e.stopPropagation();
  if (document.querySelector('.nexus-switcher-popup')) { closeAllPopups(); return; }
  closeAllPopups();
  const anchor = e.currentTarget;
  const pop = document.createElement('div');
  pop.className = 'kind-popup nexus-switcher-popup';
  pop.innerHTML = recentNexuses(3).map(n => `
    <div class="nexus-switcher-item" onclick="openNexusWindow(${n.id})">
      <span class="nexus-vault-dot" style="${n.color_code ? `background:${x(n.color_code)}` : ''}"></span>${x(n.name)}
    </div>`).join('') + `
    <div class="nexus-switcher-item nexus-switcher-more" onclick="openWelcomeWindow()">${t('wmChangeNexus')}</div>`;
  document.body.appendChild(pop);
  pop.addEventListener('click', ev => ev.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

// Every "let me pick a different vault" entry point funnels here: the switcher
// row above, the vault-head ⇄ button (views.js) and the picker fallback below.
function openWelcomeWindow() {
  closeAllPopups();
  api.window.openWelcome();
}

async function openNexusWindow(nexusId) {
  closeAllPopups();
  if (nexusId === S.nexus?.id) return;
  pushRecentNexus(nexusId);
  await api.window.openNexus(nexusId);
}

// Fallback screen for an app window with no vault open. Since v4.6.0 that is
// no longer the normal way in — the Welcome window is — so this is only
// reached after deleting the vault the window had open, or when index.html is
// loaded with no ?nexus= at all (the web-driver harness does exactly that).
// Both "pick a different vault" buttons therefore hand off to the Welcome
// window instead of duplicating its job here.
function renderNexusPicker() {
  leaveBuilderGrid();
  if (!S.nexuses.length) {
    q('#left-panel-inner').innerHTML = `
      <div class="ph"><h4>${t('nexus')}</h4>
        <button class="btn btn-p btn-sm" onclick="openWelcomeWindow()">+ ${t('nexusNew')}</button>
      </div>`;
    q('#main-inner').innerHTML = `<div class="empty" style="margin-top:80px">
      <div class="ei"><img src="../src/assets/brand/DraconDex_WhiteOut.png" class="brand-img" alt="DraconDex" style="height:64px;width:64px;opacity:.35"></div>
      <h3>${t('nexusWelcomeTitle')}</h3>
      <p>${t('nexusEmpty')}</p>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:center;margin-top:18px">
        <button class="btn btn-p" style="min-width:180px" onclick="openWelcomeWindow()">+ ${t('nexusNew')}</button>
        <button class="btn btn-s" style="min-width:180px" onclick="importDatabaseFile()">${t('importDb')}</button>
      </div>
    </div>`;
    return;
  }
  q('#left-panel-inner').innerHTML = `
    <div class="ph"><h4>${t('nexus')}</h4>
      <button class="btn btn-p btn-sm" onclick="openNexusModal()">+ ${t('nexusNew')}</button>
    </div>
    ${S.nexuses.map(n => `
      <div class="module-item nexus-item" onclick="selectNexus(${n.id})">
        <span class="nexus-vault-dot" style="${n.color_code ? `background:${x(n.color_code)}` : ''}"></span>
        <span class="module-name">${x(n.name)}</span>
        <span class="nexus-count">${n.project_count}</span>
        ${nexusRowButtonsHtml(n)}
      </div>`).join('')}`;
  q('#main-inner').innerHTML = `<div class="empty" style="margin-top:80px">
    <div class="ei"><img src="../src/assets/brand/DraconDex_WhiteOut.png" class="brand-img" alt="DraconDex" style="height:64px;width:64px;opacity:.35"></div>
    <h3>${t('nexusWelcomeTitle')}</h3>
    <p>${t('nexusSelect')}</p>
  </div>`;
}

async function reloadNexuses() {
  S.nexuses = await api.nexus.getAll();
  if (S.nexus) S.nexus = S.nexuses.find(n => n.id === S.nexus.id) || null;
}

function clearWorkspaceTabs() {
  S.moduleTree = []; S.activeModuleNode = null; S.moduleTabs = [];
  S.builder = null; S.filePreview = null; S.sageHut = null; S.sageHutCache = null; S.importDockPage = false; S.importFiles = undefined;
  S.wyvernBrowsePath = [];
  S.dragonBrowsePath = []; S.dragonSearch = '';
  if (typeof invalidateDisplayImages === 'function') invalidateDisplayImages();
  q('#main-inner')?.querySelectorAll(':scope > .bpane').forEach(el => el.remove());
  renderProjectTabs();
}

async function selectNexus(id) {
  await reloadNexuses();
  S.nexus = S.nexuses.find(n => n.id === id) || null;
  if (!S.nexus) return;
  localStorage.setItem(NEXUS_ACTIVE_KEY, String(id));
  pushRecentNexus(id);
  clearWorkspaceTabs();
  // Same three-call wave as boot (Plan part2 #2.5): seeding the Nest items
  // here is what stops the first render firing one lazy fetch + one full
  // re-render per content module. Two sequential awaits became one.
  const [moduleTree, nestItems] = await Promise.all([
    api.module.getTree(S.nexus.id),
    api.module.getNestItems(S.nexus.id),
  ]);
  S.moduleTree = moduleTree;
  seedNestItems(nestItems);
  if (typeof reportRelationDedupe === 'function') reportRelationDedupe();
  reportParentNormalize();
  scheduleMirrorSync(3000); // v5 Part 4: bring a located folder up to date, in the background
  renderNexusHome();
  renderModuleRail();
  updateStatusBar({ item: null, words: null, saveState: null });
}

// v5 Part 4 (§8.8): modules an old vault kept under a non-collector were
// wrapped into collectors at open. Told once, like the relation dedupe.
async function reportParentNormalize() {
  try {
    const n = await api.module.normalizeReport();
    if (n) toast(`${t('moduleParentsNormalized')} ${n}`, 'ok');
  } catch (_) { /* informational only */ }
}

// closeNexus() lived here until v4.6.0: it dropped the window to the in-hub
// picker, which was how you changed vault. The vault-head ⇄ button and the
// switcher's last row now open the Welcome window instead and leave this
// window on its vault, so nothing called it any more.

async function openNexusModal(id = null, { showGuideChoice = false } = {}) {
  await reloadNexuses();
  const n = id ? S.nexuses.find(v => v.id === id) : null;
  openModal(n ? `✏️ ${t('nexusEdit')}` : `🗄️ ${t('nexusNew')}`, `
    <div class="fg"><label>${t('name')} *</label><input id="nx-name" value="${x(n?.name || '')}"></div>
    <div class="fg"><label>${t('memo')}</label><textarea id="nx-memo">${x(n?.memo || '')}</textarea></div>
    <div class="fg"><label>${t('color')}</label>${await colorPicker(n?.color)}</div>
    ${n ? nexusFileRowHtml(n) : await nexusSaveLocationHtml()}
    ${n ? nexusLocateRowHtml(n) : ''}
    ${!n && showGuideChoice ? `<div class="fg"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input id="nx-guide" type="checkbox" checked> ${t('nexusTourOption')}</label></div>` : ''}
    <div class="mfoot">
      ${n ? `<button class="btn btn-d" onclick="delNexus(${id})">${t('delete')}</button>`
          : `<button class="btn btn-s" onclick="closeModal();importDatabaseFile()">${t('importDb')}</button>`}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="${n ? `saveNexus(${id})` : 'createNexusSubmit()'}">${n ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => q('#nx-name').focus(), 60);
}

// Where the vault file goes. Shown in every build, dev included, with the
// default already filled in — the dialog only opens if the user clicks Change,
// which is what keeps the run-dracondex driver able to create a Nexus without
// a native dialog blocking it forever.
async function nexusSaveLocationHtml() {
  S._nexusSavePath = null;
  // The FOLDER, not a filename: the filename embeds the vault id, which does
  // not exist until the row is inserted, so showing a full path here would
  // name a file that never appears. Once the user picks explicitly, the field
  // shows exactly what they chose.
  const def = await api.nexus.defaultPath();
  return `
    <div class="fg">
      <label>${t('nexusSaveLocation')}</label>
      <div class="sync-hint">${t('nexusSaveLocationHint')}</div>
      <div class="sync-key-row">
        <input id="nx-path" readonly value="${x(def)}" title="${x(def)}">
        <button class="btn btn-s btn-sm" onclick="pickNexusLocation()">${t('nexusChangeLocation')}</button>
      </div>
    </div>`;
}

// Editing an existing vault shows where its file actually is — and offers
// Locate when that file has gone missing.
function nexusFileRowHtml(n) {
  if (!n.file_path) return '';
  return `
    <div class="fg">
      <label>${t('nexusSaveLocation')}</label>
      <div class="sync-key-row">
        <input readonly value="${x(n.file_path)}" title="${x(n.file_path)}">
        ${n.missing ? `<button class="btn btn-d btn-sm" onclick="relinkNexusLocation(${n.id})">${t('nexusLocate')}</button>` : ''}
      </div>
      ${n.missing ? `<div class="sync-hint">${t('nexusFileMissing')}</div>` : ''}
    </div>`;
}

async function pickNexusLocation() {
  const r = await api.nexus.pickLocation(q('#nx-name')?.value.trim() || '');
  if (!r || r.canceled) return;
  S._nexusSavePath = r.filePath;
  const el = q('#nx-path');
  if (el) { el.value = r.filePath; el.title = r.filePath; }
}

async function relinkNexusLocation(id) {
  const r = await api.nexus.relink(id);
  if (r?.canceled) return;
  if (!r?.ok) return toast(t('nexusRelinkFailed'), 'error');
  closeModal();
  await reloadNexuses();
  toast(t('saved'), 'ok');
  renderNexusHome();
}

async function createNexusSubmit() {
  const name = q('#nx-name').value.trim(); if (!name) return;
  S._guideAfterCreate = Boolean(q('#nx-guide')?.checked);
  try {
    const newId = await api.nexus.create(name, q('#nx-memo').value.trim(), q('#sel-color').value || null, S._nexusSavePath || null);
    closeModal();
    await reloadNexuses();
    toast(t('nexusCreated'), 'ok');
    // Created from the Welcome window: this window is about to close, so hand
    // the new vault to a fresh app window and let the tour start over there
    // (boot.js picks the flag up) instead of running it in a dying renderer.
    if (S.isWelcome) {
      if (S._guideAfterCreate) localStorage.setItem(NEXUS_PENDING_GUIDE_KEY, String(newId));
      S._guideAfterCreate = false;
      await welcomeOpenNexus(newId);
      return;
    }
    await selectNexus(newId);
    // Users who opted in get the coach-marks tour once the vault home is rendered.
    if (S._guideAfterCreate) {
      S._guideAfterCreate = false;
      await createGuideBundle({ quiet: true }); // v5 Part 7 (§11.8): the example folder first
      await loadModule('src/renderer/guide.js');
      if (typeof startNexusGuide === 'function') startNexusGuide();
    }
  } catch (e) { toast(t('nexusNameTaken'), 'error'); }
}

async function saveNexus(id) {
  const name = q('#nx-name').value.trim(); if (!name) return;
  try {
    await api.nexus.update(id, name, q('#nx-memo').value.trim(), q('#sel-color').value || null);
    closeModal();
    await reloadNexuses();
    toast(t('saved'), 'ok');
    renderNexusHome();
  } catch (e) { toast(t('nexusNameTaken'), 'error'); }
}

async function delNexus(id) {
  if (!await uiConfirm(t('nexusDeleteConfirm'))) return;
  const r = await api.nexus.delete(id);
  if (r?.blocked) { toast(t('nexusDeleteBlocked'), 'error'); return; }
  closeModal();
  if (S.nexus?.id === id) { S.nexus = null; localStorage.removeItem(NEXUS_ACTIVE_KEY); clearWorkspaceTabs(); }
  dropRecentNexus(id);
  await reloadNexuses();
  toast(t('deleted'), 'ok');
  renderNexusHome();
}

