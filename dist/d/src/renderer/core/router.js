// Entity routing: openEntityByKey() (wikilink + quick-switch target
// resolution), recent-entity tracking and the IDE status bar. Legacy Scribe
// and its selectModule('scribe') went in v5 Part 8 (§12): its notes are
// modules now, and a note_ key resolves to the module it became.

// ═══ ENTITY NAVIGATION ════════════════════════════════════
// Central dispatcher: open any entity from its wiki key ('note_3', 'obj_12',
// 'wchp_9', …). Used by wikilink clicks, backlinks, quick switcher and graph.
async function openEntityByKey(key) {
  if (!key) return;
  const p = await api.wiki.entityPath(key);
  if (!p) { toast(t('unresolvedLink'), 'error'); return; }
  if (p.kind === 'obj' || p.kind === 'proj' || p.kind === 'world' || p.kind === 'game' || p.kind === 'write' || p.kind === 'wchp') {
    // Director/Navigator/Hero/Writer's own views are gone (Process 2 Part 2)
    // — a link into one of these kinds means the underlying legacy data was
    // never converted to a Nexus module. The tables + migrate_v3.js are
    // untouched, so surface the same conversion flow the boot prompt and
    // Settings → Database use, rather than routing into a deleted renderer.
    toast(t('legacyEntityUnconverted'), 'error');
    if (typeof openLegacyMigratePreviewModal === 'function') openLegacyMigratePreviewModal();
  } else if (p.kind === 'module' || p.kind === 'bchp' || p.kind === 'chss' || p.kind === 'cobj'
             || p.kind === 'tlev' || p.kind === 'sdlg' || p.kind === 'exn' || p.kind === 'skpg' || p.kind === 'divt') {
    S.activeModule = null; S.view = 'nexus';
    document.querySelectorAll('.nav-btn[data-panel]').forEach(b => b.classList.remove('active'));
    updateTopNavButton();
    // Author chapter / Scribe session / Classifier object links land on the
    // module with that item selected (the kind's load fn consumes it).
    if (p.kind === 'bchp') S.pendingAuthorChapter = p.chapterId;
    if (p.kind === 'chss') S.pendingChatSession = p.sessionId;
    if (p.kind === 'cobj') S.classifierSelectedObject = S.clsPendingSelect = p.objectId; // the next Classifier instance selects it
    if (p.kind === 'tlev') S.pendingChroniclerEvent = p.eventId;
    if (p.kind === 'sdlg') S.pendingNarratorDialogue = p.dialogueId;
    if (p.kind === 'exn') S.pendingExhibitNode = p.nodeId; // v5 Part 4: a note's [[link]] leads back to it
    if (p.kind === 'skpg') await api.module.setUi(p.moduleId, 'activePage', String(p.pageId)); // v5 Part 7
    if (p.kind === 'divt') await api.module.setUi(p.moduleId, 'activeTable', String(p.tableId));
    await openModuleNode(p.moduleId);
  } else if (p.kind === 'mevt') {
    // A pin has no selected state in the Wanderer to land on — its page is
    // where it is shown (mod/item.js).
    await openItemNode('wanderer', p.moduleId, p.pinId);
  } else if (p.kind === 'file') {
    // v5 Asset Nest — assets open in the file viewer wherever they're filed.
    S.activeModule = null; S.view = 'nexus';
    document.querySelectorAll('.nav-btn[data-panel]').forEach(b => b.classList.remove('active'));
    updateTopNavButton();
    await openImportFile(p.fileId);
  }
  trackRecentEntity(key);
}

// Recently opened entities feed the quick switcher's empty-query list.
function trackRecentEntity(key) {
  S.recentEntities = (S.recentEntities || []).filter(k => k !== key);
  S.recentEntities.unshift(key);
  if (S.recentEntities.length > 20) S.recentEntities.length = 20;
}

// Clicking a rendered [[wikilink]] anywhere in the main area navigates to the
// target; an unresolved one offers to create a note with that name.
function bindWikilinkClicks() {
  q('#main-inner')?.addEventListener('click', async (e) => {
    const a = e.target.closest('.wikilink');
    if (!a) return;
    e.preventDefault();
    const key = a.dataset.key;
    if (key) { await openEntityByKey(key); return; }
    const name = a.dataset.name;
    if (!name || !S.nexus) return;
    if (!await uiConfirm(t('createNoteFromLink') + ` "${name}"?`, { danger: false })) return;
    // A new page (Drafter) at the top level — what a note is now (§12).
    const newId = await api.module.create({ nexus_ref: S.nexus.id, parent_id: null, name, kind: 'drafter' });
    await reloadModuleTree();
    await openModuleNode(newId);
  });
}

// ═══ STATUS BAR ═══════════════════════════════════════════
// IDE-style footer: active vault · open item · word count · save state.
const _statusState = {};
function updateStatusBar(patch = {}) {
  Object.assign(_statusState, patch);
  const el = q('#status-bar');
  if (!el) return;
  const st = S.settings.statusToggles || {};
  const parts = [];
  if (S.nexus && st.vault !== false) parts.push(`<span class="sb-item sb-nexus" onclick="renderNexusHome()"><span class="nexus-vault-dot" style="${S.nexus.color_code ? `background:${x(S.nexus.color_code)}` : ''}"></span>${x(S.nexus.name)}</span>`);
  // Breadcrumb + module-type badge for the focused v3 module (mockups /
  // Section A status-bar spec): `Main › name` + `Major · Kind` (every module,
  // main or nested, is a Major module — see Plan.md's Process 3 terminology).
  const mNode = (!S.activeModule && S.activeModuleNode) ? S.activeModuleNode : null;
  if (mNode && st.breadcrumb !== false) {
    const mainMod = mNode.parent_id != null && typeof moduleRootAncestor === 'function' ? moduleRootAncestor(mNode) : null;
    const crumb = mainMod ? `${x(mainMod.name)} › <b>${x(mNode.name)}</b>` : `<b>${x(mNode.name)}</b>`;
    parts.push(`<span class="sb-item sb-crumb">${crumb}</span>`);
    parts.push(`<span class="sb-badge" data-no-i18n>Major · ${x(kindLabel(mNode.kind))}</span>`);
  }
  if (S.builder && S.builder.layoutTree.type === 'split' && S.view === 'nexus' && !S.activeModule) {
    parts.push(`<span class="sb-badge" data-no-i18n>Split ${collectPaneIndices(S.builder.layoutTree).length}</span>`);
  }
  if (_statusState.item) parts.push(`<span class="sb-item">${x(_statusState.item)}</span>`);
  const right = [];
  if (_statusState.words != null && st.words !== false) right.push(`<span class="sb-item">${_statusState.words} ${t('words')}</span>`);
  if (_statusState.saveState && st.saveState !== false) right.push(`<span class="sb-item sb-save">${x(_statusState.saveState)}</span>`);
  el.innerHTML = `<div class="sb-left">${parts.join('')}</div><div class="sb-right">${right.join('')}</div>`;
}

