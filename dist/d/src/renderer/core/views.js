// View plumbing: bindNav(), database import/export, loadModule() lazy script
// loading, switchView() (routes the few remaining shared legacy-view panels
// still reachable outside the v3 module tree — Scribe's legacy note view),
// and the Nexus home page including the builder-pane page mirror it renders
// through.
// ═══ NAV & VIEW ════════════════════════════════════════
function bindNav() {
  q('#nav-logo-btn')?.addEventListener('click', () => {
    // process2 part1 #3: while the hub is collapsed, the logo slot is the
    // "expand hub" control (see nav.js's updateTopNavButton) — wins over
    // every other branch below regardless of module/project/world state.
    if(S.leftPanelCollapsed){ setLeftPanelCollapsed(false); return; }
    if(S.activeModule) returnToNexus();
  });
  document.querySelectorAll('.nav-btn[data-panel]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.nav-btn[data-panel]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      S.view = btn.dataset.panel;
      updateTopNavButton();
      switchView(S.view);
    });
  });
  q('#modal-close').addEventListener('click', closeModal);
  q('#modal-overlay').addEventListener('click', e=>{ if(e.target===q('#modal-overlay')) closeModal(); });
  bindModalEscape();
  q('#nav-sidebar')?.addEventListener('contextmenu', openNavSidebarContextMenu);
}

async function exportDatabaseFile(){
  try{
    const res = await api.db.exportFile();
    if(res?.canceled) return;
    toast('Export DB สำเร็จ','ok');
  }catch(e){
    toast(`${tr('Export ไม่สำเร็จ')}: ${e.message}`,'err');
  }
}

// Shared by every step of the import-target-choice flow below — factored out
// so the existing hardcoded-Thai error-toast literal stays a single
// occurrence even though the error path now has three call sites instead of
// the one exportDatabaseFile() above still inlines its own copy of.
function toastImportError(e){
  toast(`${tr('Import ไม่สำเร็จ')}: ${e.message}`,'err');
}
// v5 Part 7 (APP docs/V5.md §11.1): every import / pull / transfer that
// goes through the snapshot importer reports what it could NOT bring across
// — a relation, a sketch pin or a Designer link whose other end is not in
// the snapshot (an asset, which never travels, or a row the sender no
// longer had). It used to show the success toast regardless. The last count
// is kept for the Problems panel (§11.10).
function toastSnapshotResult(r, okKey){
  const s = r?.summary || {};
  const dropped = (s.droppedRelations || 0) + (s.droppedPins || 0);
  S.lastImportDrops = { relations: s.droppedRelations || 0, pins: s.droppedPins || 0, at: new Date().toISOString() };
  if (dropped > 0) toast(`${t(okKey)} — ${t('importDroppedLinks').replace('{n}', dropped)}`, 'warn');
  else toast(t(okKey), 'ok');
}
async function importDatabaseFile(){
  try{
    // Pick first, then choose a target, then merge/import. db:pickImportFile
    // only opens the dialog; nothing is written until the user's choice below
    // resolves into importMergeFile/importModuleFileAt.
    const picked = await api.db.pickImportFile();
    if(picked?.canceled) return;
    const ext = (picked.filePath.split('.').pop() || '').toLowerCase();
    openImportTargetChoiceModal(picked.filePath, ext === 'mddx' || ext === 'mdx' ? 'module' : 'nexus');
  }catch(e){
    toastImportError(e);
  }
}

// Plan process5 part2: importing a .ddx (nexus/vault) or .mdx (module) file
// asks where it goes — into the currently open Nexus, or a brand new one —
// instead of always silently merging into whatever's open (the only
// behavior before this). Both branches funnel back through the exact same
// db.importDatabaseMerge/db.importModuleFile underneath (see main.js's
// db:importMergeFile/db:importModuleFileAt); "create new" just creates an
// empty nexus first and targets that id explicitly instead of the window's
// ambient current one — see import-merge.js's own comment on why that's safe.
function openImportTargetChoiceModal(filePath, kind){
  const fileName = filePath.split(/[\\/]/).pop();
  openModal(t('importChooseTargetTitle'), `
    <p class="modal-hint" data-no-i18n style="word-break:break-all">${x(fileName)}</p>
    <p class="modal-hint">${t(kind === 'module' ? 'importChooseTargetHintModule' : 'importChooseTargetHintNexus')}</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
      <button class="btn btn-p" ${S.nexus ? '' : 'disabled'} onclick="closeModal();importIntoCurrentNexus(${xj(filePath)},${xj(kind)})">${t('importIntoThisNexus')}${S.nexus ? ` — ${x(S.nexus.name)}` : ''}</button>
      <button class="btn btn-s" onclick="closeModal();importAsNewNexus(${xj(filePath)},${xj(kind)})">${t('importAsNewNexus')}</button>
    </div>`);
}
async function importIntoCurrentNexus(filePath, kind){
  if (!S.nexus) return toast(t('nexusSelectFirst'), 'error');
  try{
    if (kind === 'module') {
      const r = await api.db.importModuleFileAt(S.nexus.id, null, filePath);
      if (!r?.ok) return toast(t('driveErrServer'), 'error');
      await reloadModuleTree();
      toastSnapshotResult(r, 'settingDbImportOk');
    } else {
      await finishVaultMergeImport(filePath, null);
    }
  }catch(e){
    toastImportError(e);
  }
}
async function importAsNewNexus(filePath, kind){
  const fileBase = filePath.split(/[\\/]/).pop().replace(/\.(ddx|mddx|mdx|db)$/i, '') || 'Imported Nexus';
  try{
    const newId = await api.nexus.create(fileBase, '', null, null);
    await reloadNexuses();
    if (kind === 'module') {
      const r = await api.db.importModuleFileAt(newId, null, filePath);
      if (!r?.ok) { toast(t('driveErrServer'), 'error'); return; }
      toastSnapshotResult(r, 'settingDbImportOk');
      if (S.isWelcome) await welcomeOpenNexus(newId); else await selectNexus(newId);
    } else {
      await finishVaultMergeImport(filePath, newId);
    }
  }catch(e){
    toast(t('nexusNameTaken'), 'error');
  }
}
// Shared tail for both the "into current nexus" and "into a freshly created
// one" vault-merge branches — identical to what importDatabaseFile() used to
// do inline before the target choice existed.
async function finishVaultMergeImport(filePath, targetNexusId){
  const res = await api.db.importMergeFile(filePath, targetNexusId);
  if(res?.canceled) return;
  // Refresh the Nexus list so vaults brought in by the merge are visible.
  // The Welcome window has no sidebar and no view to switch — its whole job
  // is that vault list, so it just re-renders itself with the new entries.
  await reloadNexuses();
  S.colors = await api.color.getAll();
  S.recentColors = await api.color.getRecent();
  if (targetNexusId != null) { if (S.isWelcome) await welcomeOpenNexus(targetNexusId); else await selectNexus(targetNexusId); }
  else if(S.isWelcome) renderWelcomeWindow();
  else renderNexusHome();
  toast(t('importDbDone'),'ok');
  // Plan part2 §2: a merged file may carry un-migrated legacy-shaped data
  // (a v1/v2 file, or notes for a nexus that predates v3) — offer the
  // conversion preview instead of silently leaving it in its legacy
  // tables with no way to act on it. That preview acts on an OPEN vault,
  // which the Welcome window doesn't have; there the user opens the
  // imported vault first and gets the same prompt on the next import.
  if (S.isWelcome) return;
  const sm = res.summary || {};
  const hasLegacy = (sm.projects||0) + (sm.world_projects||0) + (sm.game_projects||0)
    + (sm.write_projects||0) + (sm.notes||0) > 0;
  if (hasLegacy && typeof openLegacyMigratePreviewModal === 'function') openLegacyMigratePreviewModal();
}

const _loadedModules = new Set();
function loadModule(src) {
  if (_loadedModules.has(src)) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { _loadedModules.add(src); res(); };
    s.onerror = () => rej(new Error(`Failed to load module: ${src}`));
    document.head.appendChild(s);
  });
}

// Konva (canvas) loader. Eager and global because map.js and
// mod/{locator,wanderer}.js all need it, and it used to be copied verbatim
// into more than one caller, so whichever loaded last silently won.
// Vendored copy only — no CDN fallback: this renderer holds the whole
// window.api IPC surface, so a remote <script> (unpkg, no SRI) would hand
// that surface to a third party. vendor/ ships via package.json build.files.
function ensureKonva(){
  if(window.Konva) return Promise.resolve();
  if(window.__konvaLoading) return new Promise(resolve=>{ const iv=setInterval(()=>{ if(window.Konva){ clearInterval(iv); resolve(); } },50); });
  window.__konvaLoading = true;
  const load = (src) => new Promise((resolve,reject)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = ()=>resolve();
    s.onerror = ()=>{ s.remove(); reject(new Error('Failed to load '+src)); };
    document.body.appendChild(s);
  });
  return load('vendor/konva.min.js')
    .finally(()=>{ window.__konvaLoading = false; });
}

// Unsplit modules fall through to their single file — every lazy call site
// can use the same helper regardless of whether that module is one file or
// several (no module left uses more than one file now that Navigator/Hero's
// folders are gone).
function loadGroup(name) {
  return Promise.all([`src/renderer/${name}.js`].map(loadModule));
}

async function switchView(v) {
  if (v !== 'nexus') { leaveBuilderGrid(); const foot = q('#left-panel-foot'); if (foot) foot.innerHTML = ''; }
  updateTopNavButton();
  if      (v==='nexus')           renderNexusHome();
  else if (v==='hashtag')         { await loadModule('src/renderer/hashtag.js'); renderHashtagView(); }
  else if (v==='colors')          { await loadModule('src/renderer/hashtag.js'); q('#left-panel-inner').innerHTML=`<div class="ph"><h4>${t('colorPanel')}</h4></div>`; renderColorSettings(); }
}

// ═══ NEXUS HUB ═════════════════════════════════════════
// Two-level home: no vault open → vault picker; vault open → module cards.
function renderNexusHome() {
  // Plan part2 #New Workspace: every caller of renderNexusHome() already
  // goes through this one chokepoint, so the workspace-style swap lives
  // here instead of at every call site. Drake (default/unset) falls
  // straight through, unchanged.
  // Same chokepoint reasoning for the Welcome window (v4.6.0): saveNexus,
  // delNexus and importDatabaseFile all end in a renderNexusHome(), and in
  // that window "home" is the Welcome screen, never the hub or the picker.
  if (S.isWelcome) return renderWelcomeWindow();
  if (S.settings.workspaceStyle === 'wyvern' && typeof renderWyvernHome === 'function') return renderWyvernHome();
  if (S.settings.workspaceStyle === 'dragon' && typeof renderDragonHome === 'function') return renderDragonHome();
  S.view = 'nexus';
  S.activeModule = null;
  // Rename-mode focus lock (Plan part1 #5) — while a module name is being
  // edited, suppress hover highlighting across the whole app so nothing
  // else visually competes with the active rename box.
  document.body.classList.toggle('renaming-lock', S.renamingModuleId != null);
  document.querySelectorAll('.nav-btn[data-panel]').forEach(b => b.classList.remove('active'));
  updateTopNavButton();
  q('#main-inner')?.classList.remove('relation-main');
  if (!S.nexus) { const foot = q('#left-panel-foot'); if (foot) foot.innerHTML = ''; renderNexusPicker(); return; }

  // Plan process1 part5 #1: buildHubHtml() rebuilds every accordion section
  // (nest/sage/dock) from scratch on each call, which would otherwise reset
  // each section's own scroll position — e.g. opening an imported file
  // re-renders the whole hub and used to snap the Import Dock list back to
  // its top. Carry each section's scrollTop across the rebuild by data-key.
  const hubScroll = {};
  q('#left-panel-inner')?.querySelectorAll('.acc-body[data-key]').forEach(el => { hubScroll[el.dataset.key] = el.scrollTop; });
  // v5 Part 7 (§11.9): one Activity Bar destination at a time (hub/activity.js).
  q('#left-panel-inner').innerHTML = buildLeftPanelHtml();
  q('#left-panel-inner')?.querySelectorAll('.acc-body[data-key]').forEach(el => {
    if (hubScroll[el.dataset.key] != null) el.scrollTop = hubScroll[el.dataset.key];
  });
  mountLeftPanel();
  // Plan process1 part3 #2: the separate "switch nexus" ⇄ button was
  // removed — clicking the nexus name itself already opens the same
  // switcher (toggleNexusSwitcher, core/nexus.js), whose "more…" row
  // reaches the same openWelcomeWindow() this button used to jump to
  // directly, so the button was a pure duplicate.
  q('#left-panel-foot').innerHTML = `
    <div class="ph nexus-vault-head">
      <h4 class="nexus-vault-name" onclick="toggleNexusSwitcher(event)" title="${t('nexusSwitch')}"><span class="nexus-vault-dot" style="${S.nexus.color_code ? `background:${x(S.nexus.color_code)}` : ''}"></span>${x(S.nexus.name)}</h4>
      ${cloudSyncAvailable() ? `<button class="btn btn-s btn-sm" onclick="openSyncModal()" title="${t('syncTitle')}">☁</button>` : ''}
    </div>`;
  // The whole main area is the builder pane grid (Phase 19) — the focused
  // pane shows the current page (built from the S.* page mirrors below),
  // unfocused panes keep their previous live DOM.
  renderBuilderPanes(buildBuilderPageHtml, runBuilderMounts);
}

// The focused pane's page, from the global page mirrors — precedence:
// item page > module > file preview > sage hut > vault welcome.
// Plan process2 part1 #2: Kind Browser no longer has a page here — it moved
// into the Hub panel as its own accordion section (hub/sections.js).
function buildBuilderPageHtml() {
  return (S.activeItemNode && typeof buildItemPageHtml === 'function') ? buildItemPageHtml(S.activeItemNode)
    : S.activeModuleNode ? buildModuleDetailHtml(S.activeModuleNode)
    : (S.filePreview && typeof buildFileViewerHtml === 'function') ? buildFileViewerHtml()
    : (S.sageHut && typeof buildSageHutHtml === 'function') ? buildSageHutHtml()
    : (S.importDockPage && typeof buildImportDockPageHtml === 'function') ? buildImportDockPageHtml()
    : builderEmptyPaneHtml();
}

// Post-DOM hooks for the focused pane's page.
function runBuilderMounts() {
  // An element page of blocks mounts its editor as the item.body block.
  if (S.activeItemNode && !S.activeItemNode.itemKey && typeof ITEM_KIND !== 'undefined') ITEM_KIND[S.activeItemNode.itemKind]?.mount?.(S.activeItemNode);
  if (!S.activeModuleNode && !S.filePreview && S.sageHut && typeof mountSageHutGraph === 'function') mountSageHutGraph();
  // v5 Part 8: a module page's blocks mount themselves — the kind's own
  // view is one of them (page/registry.js), Properties another.
  if (S.activeModuleNode || S.activeItemNode) mountPageBlocks(builderState().focused);
  if (typeof hydrateDisplayImages === 'function') hydrateDisplayImages();
  syncSidePanel();
}

