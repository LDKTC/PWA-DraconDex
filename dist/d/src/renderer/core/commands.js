'use strict';
// ═══ COMMANDS — every command the app can run by name (v5 Part 6, §10.1–10.2)
// One entry per command. The context menus, the kind toolbars, the rail and
// Ctrl+P all read the SAME entry, so a command's label, icon and behaviour
// are written once and a button can only be hidden while the command stays
// reachable some other way — the "findable two ways" rule (§10.1). The
// module-style checker (check 2d) enforces it: every entry names at least
// one surface besides the palette, every named surface really references
// it, and a CTX_PROVIDERS menu may only be built from cmdItem().
//
//   label     i18n key, or (ctx) => key — REUSED keys, so a command rarely
//             costs a new translation
//   prefix    i18n key shown before the label in the palette only
//   icon      key into I
//   scope     'app' · 'module' (the right-clicked module, or the open one) ·
//             'kind:<k>' (only while a module of that kind is open) ·
//             'asset' (the right-clicked file, or the one in the viewer) ·
//             'text' (a [[link]] field — the one focused before Ctrl+P)
//   when      (ctx) => bool — hides a command that cannot run here
//   run       (ctx, el) => … — el is the clicked button, or a palette anchor
//   sub       (ctx) => [items] — a submenu instead of an action
//   subHtml   (ctx) => html — a hand-built submenu (the grouped kind list)
//   palette   (ctx) => … — what the palette does for a sub/subHtml command
//   hint      keyboard hint shown beside the label
//   surfaces  where else it lives — see SURFACE_FILES in check.mjs
//
// Out of scope on purpose: view chips and tool-mode strips (pen / colour /
// width, Locator's move/create/delete). Those are modes, not commands.

const activeKind = () => S.activeModuleNode?.kind || null;
const onKind = (k) => (c) => activeKind() === k && c.moduleId === S.activeModuleNode?.id;
const cmdModule = (c) => (c.moduleId != null ? findModuleNode(c.moduleId) : null);
const isFolderCtx = (c) => cmdModule(c)?.kind === 'collector';
const cmdAsset = (c) => (c.fileId != null ? (S.importFiles || []).find(v => v.id === c.fileId) || (S.filePreview?.id === c.fileId ? S.filePreview : null) : null);

// Where a palette-run command anchors a popup it opens: upper middle of the
// window, where the palette itself was.
function paletteAnchor() {
  const x0 = Math.round(window.innerWidth / 2), y0 = Math.round(window.innerHeight * 0.22);
  return { getBoundingClientRect: () => ({ left: x0, top: y0, bottom: y0, right: x0 }) };
}

// A hand-built submenu opened on its own (the palette has no row to hang it
// on) — same .kind-popup the menus use, so Escape / arrows / closeAllPopups
// all apply.
function openHtmlPopup(html, anchor) {
  closeAllPopups();
  const pop = document.createElement('div');
  pop.className = 'kind-popup kind-list-popup';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, (anchor || paletteAnchor()).getBoundingClientRect());
  setTimeout(() => pop.querySelector('.kind-search, .kind-list-item')?.focus(), 0);
  return pop;
}

// Current board's zoom, by kind — the palette's zoom in/out and the canvas
// menus' share it.
function canvasZoom(dir) {
  const k = activeKind();
  const d = dir > 0;
  if (k === 'designer') return designerZoomBy(d ? 0.15 : -0.15);
  if (k === 'sketcher') return sketchZoomBy(d ? 0.15 : -0.15);
  if (k === 'narrator') return zoomNarrator(d ? 1 : -1);
  if (k === 'manager') return managerZoomBy(d ? 0.15 : -0.15);
  if (k === 'locator') { const iid = locatorIidOf(S.activeModuleNode?.id); return iid && zoomMap(iid, d ? 1 : -1); }
  if (k === 'exhibitor') return S.exhibitorData?.view === 'scene' ? zoomExhibitorScene(d ? 1.1 : 0.9) : exhibitorGraphZoomBy(d ? 0.1 : -0.1);
}
const ZOOM_KINDS = ['designer', 'sketcher', 'narrator', 'manager', 'locator', 'exhibitor'];

const settingCmd = (group, page) => ({
  prefix: 'settingWindowTitle', label: SETTING_PAGE_LABEL_KEY[page], icon: 'settings', scope: 'app',
  when: () => settingGroupPages(group).includes(page),
  run: () => openSettingWindow(group, page),
  surfaces: ['setting.nav'],
});

const COMMANDS = {
  // ── App ──────────────────────────────────────────────────────────────
  // v5 Part 7 (§11.9): Activity Bar destinations (hub/activity.js). From the
  // rail ({rail:true}) the open one folds the panel; from Ctrl+P it opens.
  'app.nest': { label: 'nexusNest', icon: 'home', scope: 'app', run: (c) => (c?.rail ? railDest('nest') : (showLeftDest('nest'), goToNexusNestHub())), surfaces: ['rail'] },
  'app.searchPanel': { label: 'leftSearch', icon: 'search', scope: 'app', when: () => !!S.nexus, run: (c) => (c?.rail ? railDest('search') : showLeftDest('search')), surfaces: ['rail'] },
  'app.labels': { label: 'hashtag', icon: 'hashtag', scope: 'app', run: () => { S.view = 'hashtag'; updateTopNavButton(); switchView('hashtag'); renderModuleRail(); }, surfaces: ['rail'] },
  'app.sageHut': { label: 'sageHut', icon: 'sage', scope: 'app', run: (c) => (c?.rail ? railDest('insight') : openSageTab('dataSize')), surfaces: ['rail'] },
  'app.tools': { label: 'leftTools', icon: 'fields', scope: 'app', when: () => !!S.nexus, run: (c) => { S.leftTool = null; return c?.rail ? railDest('tools') : showLeftDest('tools'); }, surfaces: ['rail'] },
  'tools.problems': { label: 'probTitle', icon: 'info', scope: 'app', when: () => !!S.nexus, run: () => openProblemsPanel(), surfaces: ['left.panel'] },
  'tools.csvImport': { label: 'csvImport', icon: 'import', scope: 'app', when: () => !!S.nexus, run: () => openCsvImport(), surfaces: ['left.panel'] },
  'app.kindBrowser': { label: 'kindBrowser', icon: 'layer', scope: 'app', run: () => goToKindBrowserHub(), surfaces: ['nest.ctx'] },
  'app.importDock': { label: 'importDock', icon: 'import', scope: 'app', run: () => goToImportDockPage(), surfaces: ['nest.head'] },
  'app.colors': { label: 'colorPanel', icon: 'colors', scope: 'app', run: () => { S.view = 'colors'; updateTopNavButton(); switchView('colors'); renderModuleRail(); }, surfaces: ['left.panel'] },
  // Moved off the rail (§11.9): the Setting "Data" page and Ctrl+P.
  'db.import': { label: 'importDb', icon: 'import', scope: 'app', run: () => importDatabaseFile(), surfaces: ['setting.data'] },
  'db.export': { label: 'exportDb', icon: 'export', scope: 'app', run: () => exportDatabaseFile(), surfaces: ['setting.data'] },
  'app.exportHtml': { label: 'htmlExport', icon: 'export', scope: 'app', when: (c) => !!(c?.nexusId || S.nexus), run: (c) => openHtmlExportModal(c?.nexusId || S.nexus.id), surfaces: ['nexus.options', 'left.panel'] },
  'app.exportMarkdown': { label: 'exportMarkdown', icon: 'export', scope: 'app', when: (c) => !!(c?.nexusId || S.nexus), run: (c) => nexusExportMarkdown(c?.nexusId || S.nexus.id), surfaces: ['nexus.options', 'left.panel'] },
  'app.createGuide': { label: 'guideCreate', icon: 'info', scope: 'app', when: () => !!S.nexus, run: () => createGuideBundle(), surfaces: ['bundle.picker', 'left.panel'] },
  'app.newProject': { label: 'bundleTitle', icon: 'artisan', scope: 'app', when: () => !!S.nexus, run: (c) => openBundlePicker(c?.parentId ?? null), surfaces: ['kind.picker', 'left.panel'] },
  'app.trash': { label: 'trashTitle', icon: 'delete', scope: 'app', when: () => !!S.nexus, run: (c) => (c?.rail ? railDest('trash') : showLeftDest('trash')), surfaces: ['rail'] },
  'app.newModule': { label: 'createMajorModule', icon: 'plus', scope: 'app', run: (c, el) => openKindPopup(null, el || paletteAnchor()), surfaces: ['nest.head'] },
  'app.settings': { label: 'settingOpenWindow', icon: 'settings', scope: 'app', run: () => openSettingWindow(), surfaces: ['settings.menu'] },
  'dock.importFolder': { label: 'importFolder', icon: 'import', scope: 'app', run: () => importDockPickFolder(null), surfaces: ['dock'] },
  'dock.addLink': { label: 'addAssetLink', icon: 'plus', scope: 'app', run: () => openAddAssetUrlModal(null), surfaces: ['dock'] },
  'dock.relinkFolder': { label: 'assetRelinkFolder', icon: 'folder', scope: 'app', when: () => (S.importFiles || []).some(f => f.missing), run: () => relinkMissingFromFolder(), surfaces: ['dock'] },
  // v5 Part 8 (§12.5/§12.8): the page's own buttons.
  'page.arrange': { label: 'pbArrange', icon: 'move', scope: 'app', when: () => !!(S.activeModuleNode || S.activeItemNode?.itemKey), run: () => togglePageArrange(), surfaces: ['page.head'] },
  'page.split': { label: 'pbSplitPage', icon: 'copy', scope: 'app', when: () => pageOf(S.activeItemNode?.moduleId, S.activeItemNode?.itemKey)?.from === 'shared', run: () => splitItemPageNow(), surfaces: ['page.layout'] },
  'page.revert': { label: 'pbRevertPage', icon: 'return', scope: 'app', when: () => pageOf(S.activeItemNode?.moduleId, S.activeItemNode?.itemKey)?.from === 'own', run: () => revertItemPageNow(), surfaces: ['page.layout'] },
  'page.history': { label: 'versionHistory', icon: 'timeline', scope: 'app', when: () => !!S.activeModuleNode && !S.activeItemNode, run: () => toggleVersionPanel(S.activeModuleNode.id), surfaces: ['page.head'] },
  'app.focusMode': { label: 'focusMode', icon: 'eye', scope: 'app', hint: 'Ctrl+Shift+F', run: () => toggleFocusMode(), surfaces: ['shortcut'] },
  // Procress 13 part 4 (REDESIGN.md C6): the title's own layout, per page.
  'page.useTemplate': { label: 'tplUse', icon: 'layer', scope: 'app', when: () => !!S.activeModuleNode && !S.activeItemNode?.itemKey, run: () => openTemplateGallery(S.activeModuleNode.id), surfaces: ['page.head'] },
  'page.saveTemplate': { label: 'tplSave', icon: 'star', scope: 'app', when: () => !!S.activeModuleNode && !S.activeItemNode?.itemKey, run: () => openSavePresetModal(S.activeModuleNode.id), surfaces: ['page.head'] },
  'page.export': { label: 'exportTitle', icon: 'export', scope: 'app', when: () => !!(S.activeModuleNode || S.activeItemNode?.itemKey), run: () => openExportModal(S.activeItemNode?.itemKey ? S.activeItemNode.moduleId : S.activeModuleNode.id, S.activeItemNode?.itemKey || null), surfaces: ['page.head'] },
  'page.layout': { label: 'pageLayout', icon: 'fields', scope: 'app', when: () => !!(S.activeModuleNode || S.activeItemNode?.itemKey), run: (c, el) => openPageLayoutPopup(el), surfaces: ['page.head'] },
  'page.readable': { label: 'pageReadable', icon: 'document', scope: 'app', when: () => !!(S.activeModuleNode || S.activeItemNode?.itemKey), run: () => togglePageReadable(), surfaces: ['page.head'] },
  'history.undo': { label: 'scUndo', icon: 'return', scope: 'app', hint: 'Ctrl+Z', run: () => handleHistoryShortcut('undo'), surfaces: ['shortcut'] },
  'history.redo': { label: 'scRedo', icon: 'return', scope: 'app', hint: 'Ctrl+Shift+Z', run: () => handleHistoryShortcut('redo'), surfaces: ['shortcut'] },

  // ── Setting pages (§10.3: 13 after the merge) ────────────────────────
  'setting.theme': settingCmd('workspace', 'theme'),
  'setting.tooltoggle': settingCmd('workspace', 'tooltoggle'),
  'setting.style': settingCmd('workspace', 'style'),
  'setting.startup': settingCmd('workspace', 'startup'),
  'setting.account': settingCmd('user', 'account'),
  'setting.tokensync': settingCmd('appdata', 'tokensync'),
  'setting.transfer': settingCmd('appdata', 'transfer'),
  'setting.database': settingCmd('appdata', 'database'),
  'setting.cloudstorage': settingCmd('appdata', 'cloudstorage'),
  'setting.versions': settingCmd('appdata', 'versions'),
  'setting.extension': settingCmd('plugin', 'extension'),
  'setting.plugin': settingCmd('plugin', 'plugin'),
  'setting.packages': settingCmd('plugin', 'packages'),

  // ── A module (the Nest / Wyvern / Dragon right-click) ────────────────
  'module.create': {
    label: 'create', icon: 'plus', scope: 'module', when: isFolderCtx,
    subHtml: (c) => createSubmenuHtml(c.moduleId),
    palette: (c) => openKindPopup(c.moduleId, paletteAnchor()),
    surfaces: ['nest.ctx'],
  },
  'module.importModule': { label: 'settingDbImportModule', icon: 'import', scope: 'module', when: isFolderCtx, run: (c) => ctxImportModule(c.moduleId), surfaces: ['nest.ctx'] },
  'module.exportAs': { label: 'exportTitle', icon: 'export', scope: 'module', run: (c) => openExportModal(c.moduleId), surfaces: ['nest.ctx'] },
  'module.export': { label: 'settingDbExportModule', icon: 'export', scope: 'module', run: (c) => ctxExportModule(c.moduleId), surfaces: ['nest.ctx'] },
  'module.importFolder': { label: 'importFolderHere', icon: 'folder', scope: 'module', when: isFolderCtx, run: (c) => importDockPickFolder(c.moduleId), surfaces: ['nest.ctx', 'assets.strip'] },
  'module.addLink': { label: 'addAssetLink', icon: 'plus', scope: 'module', run: (c) => openAddAssetUrlModal(c.moduleId), surfaces: ['nest.ctx', 'assets.strip'] },
  'module.openTab': { label: 'openInNewTab', icon: 'plus', scope: 'module', when: (c) => cmdModule(c) && !isFolderCtx(c), run: (c) => openModuleInNewTab(c.moduleId), surfaces: ['nest.ctx'] },
  'module.openWindow': { label: 'openInNewWindow', icon: 'export', scope: 'module', when: (c) => cmdModule(c) && !isFolderCtx(c), run: (c) => openModuleInNewWindow(c.moduleId), surfaces: ['nest.ctx'] },
  'module.openPane': {
    label: 'openInNewPane', icon: 'panelRight', scope: 'module',
    when: (c) => cmdModule(c) && !isFolderCtx(c) && S.settings.workspaceStyle === 'drake',
    sub: (c) => [['left', 'paneDirLeft'], ['right', 'paneDirRight'], ['top', 'paneDirTop'], ['bottom', 'paneDirBottom']]
      .map(([dir, key]) => ({ label: t(key), onClick: () => openModuleInNewPane(c.moduleId, dir) })),
    surfaces: ['nest.ctx'],
  },
  'module.rename': { label: 'rename', icon: 'edit', scope: 'module', run: (c) => startRenameModule(c.moduleId), surfaces: ['nest.ctx'] },
  'module.handle': { label: 'moduleHandle', icon: 'hashtag', scope: 'module', run: (c) => startEditModuleHandle(c.moduleId), surfaces: ['nest.ctx'] },
  'module.icon': { label: 'clsColorIcon', icon: 'colors', scope: 'module', run: (c, el) => openModuleIconPopup(c.moduleId, el || ctxAnchor()), surfaces: ['nest.ctx', 'classifier.ctx'] },
  'module.duplicate': { label: 'duplicate', icon: 'copy', scope: 'module', run: (c) => duplicateModuleNode(c.moduleId), surfaces: ['nest.ctx'] },
  'module.moveTo': {
    label: 'moveTo', icon: 'move', scope: 'module',
    subHtml: (c) => buildMoveToListHtml(c.moduleId),
    palette: (c) => openHtmlPopup(buildMoveToListHtml(c.moduleId)),
    surfaces: ['nest.ctx'],
  },
  'module.saveBundle': { label: 'bundleSaveMine', icon: 'star', scope: 'module', when: (c) => isFolderCtx(c), run: (c) => openSaveBundleModal(c.moduleId), surfaces: ['nest.ctx'] },
  'module.savePreset': { label: 'savePreset', icon: 'star', scope: 'module', when: (c) => cmdModule(c) && !isFolderCtx(c), run: (c) => openSavePresetModal(c.moduleId), surfaces: ['nest.ctx'] },
  'app.managePresets': { label: 'managePresets', icon: 'options', scope: 'app', when: () => !!S.nexus, run: () => openManagePresetsModal(), surfaces: ['kind.picker'] },
  'module.delete': { label: 'delete', icon: 'delete', danger: true, scope: 'module', run: (c) => deleteModuleNode(c.moduleId), surfaces: ['nest.ctx', 'classifier.ctx'] },
  'module.pin': {
    label: (c) => (cmdModule(c)?.pinned ? 'unpin' : 'pin'), icon: 'pin', scope: 'module',
    run: (c) => toggleModulePin(c.moduleId), surfaces: ['nest.ctx'],
  },

  // ── An asset (Dock row, Nest leaf; the palette targets the open file) ─
  'asset.moveTo': { label: 'assetMoveToModule', icon: 'move', scope: 'asset', when: (c) => assetMoveTargets(c.fileId).length > 0, sub: (c) => assetMoveTargets(c.fileId), surfaces: ['asset.ctx'] },
  'asset.toTray': { label: 'assetMoveToTray', icon: 'import', scope: 'asset', when: (c) => cmdAsset(c)?.module_ref != null, run: (c) => moveAssetToModule(c.fileId, null), surfaces: ['asset.ctx'] },
  'asset.relink': { label: 'assetRelink', icon: 'relation', scope: 'asset', when: (c) => !!cmdAsset(c)?.missing, run: (c) => relinkImportFile(c.fileId), surfaces: ['asset.ctx', 'asset.viewer'] },
  'asset.delete': { label: 'delete', icon: 'delete', danger: true, scope: 'asset', run: (c) => deleteImportFileRow(c.fileId), surfaces: ['asset.ctx'] },

  // ── A builder pane (Drake only — Wyvern/Dragon never split) ──────────
  'pane.split': {
    label: 'separatePane', icon: 'panelRight', scope: 'app', when: () => S.settings.workspaceStyle === 'drake' && !!S.nexus,
    sub: (c) => [['h', '◫'], ['v', '⬓']].map(([dir, glyph]) => ({ label: `${glyph} ${t('splitPane')}`, onClick: () => builderSplitPane(c.paneIdx ?? builderState().focused, dir) })),
    surfaces: ['pane.ctx'],
  },
  'pane.close': { label: 'closePane', icon: 'close', scope: 'app', when: () => S.settings.workspaceStyle === 'drake' && !!S.nexus && builderState().layoutTree.type === 'split', run: (c) => builderClosePane(c.paneIdx ?? builderState().focused), surfaces: ['pane.ctx'] },

  // ── A text field that takes [[links]] (core/wiki-field.js) ───────────
  // The field's own menu shows it greyed out without a selection; the
  // palette offers it only when there is one to wrap.
  'text.wikiLink': {
    label: 'wikiConnectLink', icon: 'relation', scope: 'text', hint: '[[ ]]',
    when: (c) => !!c.el && (c.always || wikiFieldHasSelection(c.el)),
    disabled: (c) => !wikiFieldHasSelection(c.el),
    run: (c) => wrapWikiSelection(c.el), surfaces: ['text.ctx'],
  },

  // ── Any board ────────────────────────────────────────────────────────
  'canvas.zoomIn': { label: 'ctxZoomIn', icon: 'plus', scope: 'app', when: () => ZOOM_KINDS.includes(activeKind()), run: () => canvasZoom(1), surfaces: ['canvas.ctx', 'exhibitor.ctx'] },
  'canvas.zoomOut': { label: 'ctxZoomOut', icon: 'minus', scope: 'app', when: () => ZOOM_KINDS.includes(activeKind()), run: () => canvasZoom(-1), surfaces: ['canvas.ctx', 'exhibitor.ctx'] },

  // ── Classifier ───────────────────────────────────────────────────────
  'classifier.quickStart': { label: 'clsQuickStart', icon: 'plus', scope: 'kind:classifier', when: (c) => !clsData(c?.moduleId).objects.length || c.always, run: (c) => classifierQuickStart(c.moduleId), surfaces: ['empty.state'] },
  'classifier.addObject': { label: 'addObject', icon: 'plus', scope: 'kind:classifier', run: (c) => openClassifierObjectModal(c.moduleId), surfaces: ['classifier.toolbar', 'classifier.ctx'] },
  'classifier.fields': { label: 'clsFieldsOfCategory', icon: 'edit', scope: 'kind:classifier', run: (c) => openClassifierFieldsModal(c.moduleId), surfaces: ['classifier.toolbar', 'classifier.ctx'] },
  'classifier.openObject': { label: 'open', icon: 'eye', scope: 'kind:classifier', when: (c) => c.objectId != null, run: (c) => openItemNode('classifier', c.moduleId, c.objectId), surfaces: ['classifier.ctx'] },
  'classifier.renameObject': { label: 'rename', icon: 'edit', scope: 'kind:classifier', when: (c) => c.objectId != null, run: (c) => openClassifierObjectModal(c.moduleId, c.objectId), surfaces: ['classifier.ctx'] },
  'classifier.objectIcon': { label: 'clsColorIcon', icon: 'colors', scope: 'kind:classifier', when: (c) => c.objectId != null, run: (c) => openClassifierObjectModal(c.moduleId, c.objectId), surfaces: ['classifier.ctx'] },
  'classifier.duplicateObject': { label: 'duplicate', icon: 'copy', scope: 'kind:classifier', when: (c) => c.objectId != null, run: (c) => duplicateClassifierObject(c.objectId), surfaces: ['classifier.ctx'] },
  'classifier.objectExhibitor': { label: 'openInExhibitor', icon: 'relation', scope: 'kind:classifier', when: (c) => c.objectId != null, run: (c) => openExhibitorFor(c.moduleId, `cobj_${c.objectId}`), surfaces: ['classifier.ctx'] },
  'classifier.moveObject': {
    label: 'moveTo', icon: 'move', scope: 'kind:classifier', when: (c) => c.objectId != null,
    sub: (c) => flattenModuleTree(S.moduleTree, 0).filter(({ m }) => m.kind === 'classifier' && m.id !== c.moduleId)
      .map(({ m, depth }) => ({ label: `${'  '.repeat(depth)}${m.name}`, onClick: () => moveClassifierObject(c.objectId, m.id) })),
    surfaces: ['classifier.ctx'],
  },
  'classifier.deleteObject': { label: 'delete', icon: 'delete', danger: true, scope: 'kind:classifier', when: (c) => c.objectId != null, run: (c) => deleteClassifierObjectRow(c.objectId), surfaces: ['classifier.ctx'] },
  // A level row has no palette target (nothing "selects" a level) — these
  // are reachable from the row's menu and the row's own +/× controls.
  'classifier.levelAbove': { label: 'clsInsertAbove', scope: 'kind:classifier', when: (c) => c.levelId != null, run: (c) => insertClassifierLevel(c.objectId, c.templateId, c.levelId, 'before'), surfaces: ['classifier.ctx'] },
  'classifier.levelBelow': { label: 'clsInsertBelow', scope: 'kind:classifier', when: (c) => c.levelId != null, run: (c) => insertClassifierLevel(c.objectId, c.templateId, c.levelId, 'after'), surfaces: ['classifier.ctx'] },
  'classifier.levelDuplicate': { label: 'duplicate', icon: 'copy', scope: 'kind:classifier', when: (c) => c.levelId != null, run: (c) => insertClassifierLevel(c.objectId, c.templateId, c.levelId, 'after', c.levelId), surfaces: ['classifier.ctx'] },
  'classifier.levelDelete': { label: 'delete', icon: 'delete', danger: true, scope: 'kind:classifier', when: (c) => c.levelId != null, run: (c) => deleteClassifierLevelRow(c.levelId), surfaces: ['classifier.ctx'] },

  // ── Manager ──────────────────────────────────────────────────────────
  'manager.editFilter': { label: 'editFilter', icon: 'edit', scope: 'kind:manager', run: (c, el) => openSavedFilterPopup(el || paletteAnchor(), c.moduleId, S.managerData?.def), surfaces: ['manager.toolbar'] },
  'manager.unpick': { label: 'managerUnpick', scope: 'module', when: (c) => c.managerId != null && !!S.managerData?.picks.has(c.moduleId), run: (c) => setManagerPick(c.managerId, c.moduleId, false), surfaces: ['nest.ctx'] },
  'manager.pick': { label: 'managerPick', icon: 'plus', scope: 'kind:manager', run: (c) => openManagerPickModal(c.moduleId), surfaces: ['manager.toolbar'] },

  // ── Locator / Wanderer ───────────────────────────────────────────────
  'locator.addArea': { label: 'locatorAddArea', icon: 'plus', scope: 'kind:locator', when: (c) => !!LOC[c?.moduleId]?.map, run: (c) => locatorAddArea(c.moduleId, c.iid), surfaces: ['locator.page'] },
  'wanderer.place': { label: 'addMapEvent', icon: 'pin', scope: 'kind:wanderer', when: () => !!(S.wandererData?.map && S.wandererData?.timeline), run: () => toggleWandererPlacing(), surfaces: ['wanderer.toolbar'] },

  // ── Chronicler (§10.6 measures the floating strip on it) ─────────────
  'chronicler.addEvent': { label: 'addEvent', icon: 'plus', scope: 'kind:chronicler', when: () => !!S.chroniclerData?.activeId, run: () => openChroniclerEventModal(S.chroniclerData.activeId), surfaces: ['chronicler.toolbar', 'canvas.ctx'] },
  'chronicler.addLine': { label: 'addTimelineLine', icon: 'plus', scope: 'kind:chronicler', when: () => !!S.chroniclerData && !S.chroniclerData.timelines.length, run: (c) => openChroniclerTimelineModal(c.moduleId), surfaces: ['empty.state'] },
  'chronicler.editLine': { label: 'chrEditLine', icon: 'edit', scope: 'kind:chronicler', when: () => !!S.chroniclerData?.activeId, run: (c) => openChroniclerTimelineModal(c.moduleId, S.chroniclerData.activeId), surfaces: ['chronicler.toolbar', 'canvas.ctx'] },
  'chronicler.switchLine': {
    label: 'chrSwitchLine', icon: 'timeline', scope: 'kind:chronicler', when: () => (S.chroniclerData?.timelines.length || 0) > 1,
    sub: (c) => S.chroniclerData.timelines.map(tl => ({ label: tl.line_name || '—', checked: tl.id === S.chroniclerData.activeId, onClick: () => selectChroniclerTimeline(c.moduleId, tl.id) })),
    surfaces: ['chronicler.toolbar', 'canvas.ctx'],
  },
  'chronicler.graphOptions': { label: 'chrGraphOptions', icon: 'options', scope: 'kind:chronicler', when: () => ['oneline', 'downline'].includes(S.chroniclerData?.view), run: (c, el) => openChroniclerGraphOptions(el || paletteAnchor()), surfaces: ['chronicler.toolbar', 'canvas.ctx'] },
  'chronicler.resetView': { label: 'chrResetView', icon: 'return', scope: 'kind:chronicler', when: () => S.chroniclerData?.view === 'downline', run: () => resetChroniclerDownlineView(), surfaces: ['chronicler.toolbar', 'canvas.ctx'] },

  // ── Narrator / Author / Scribe ───────────────────────────────────────
  'narrator.addDialogue': { label: 'addDialogue', icon: 'plus', scope: 'kind:narrator', run: (c) => openNarratorDialogueModal(c.moduleId), surfaces: ['narrator.toolbar', 'canvas.ctx'] },
  'author.newChapter': { label: 'writeChapterNew', icon: 'plus', scope: 'kind:author', run: (c) => openAuthorChapterModal(c.moduleId), surfaces: ['author.toolbar'] },
  // v5 Part 7 (§11.5) — Diviner.
  'diviner.newTable': { label: 'divNewTable', icon: 'plus', scope: 'kind:diviner', run: (c) => openDivinerTableModal(c.moduleId), surfaces: ['diviner.toolbar', 'empty.state'] },
  'diviner.roll': { label: 'divRoll', icon: 'dice', scope: 'kind:diviner', when: () => !!divTable(), run: () => rollDiviner(), surfaces: ['diviner.toolbar'] },
  'diviner.newEntry': { label: 'divNewEntry', icon: 'plus', scope: 'kind:diviner', when: () => !!divTable(), run: () => addDivinerEntry(), surfaces: ['diviner.toolbar'] },
  'diviner.editTable': { label: 'divEditTable', icon: 'edit', scope: 'kind:diviner', when: () => !!divTable(), run: (c) => openDivinerTableModal(c.moduleId, S.divinerData.selectedId), surfaces: ['diviner.toolbar'] },
  'diviner.rollDice': { label: 'divRollDice', icon: 'dice', scope: 'kind:diviner', run: () => rollDivinerDiceOnly(), surfaces: ['diviner.toolbar'] },
  'scribe.newSession': { label: 'chatNewSession', icon: 'plus', scope: 'kind:scribe', run: (c) => openChatSessionModal(c.moduleId), surfaces: ['scribe.toolbar'] },

  // ── Sketcher / Designer ──────────────────────────────────────────────
  'sketcher.newPage': { label: 'newPage', icon: 'plus', scope: 'kind:sketcher', run: (c) => openSketchPageModal(c.moduleId), surfaces: ['sketcher.toolbar', 'canvas.ctx'] },
  'sketcher.exportPng': { label: 'exportPng', icon: 'export', scope: 'kind:sketcher', when: () => !!S.sketcherData?.pageId, run: () => exportSketchPng(), surfaces: ['sketcher.board', 'canvas.ctx'] },
  'sketcher.pen': { label: 'penTool', scope: 'kind:sketcher', checked: () => skTool.mode === 'pen', run: () => setSketchTool('pen'), surfaces: ['sketcher.board', 'canvas.ctx'] },
  'sketcher.eraser': { label: 'eraserTool', scope: 'kind:sketcher', checked: () => skTool.mode === 'eraser', run: () => setSketchTool('eraser'), surfaces: ['sketcher.board', 'canvas.ctx'] },
  'sketcher.pinLink': { label: 'pinModuleLink', icon: 'relation', scope: 'kind:sketcher', when: () => !!S.sketcherData?.pageId, run: () => openSketchPinModal(), surfaces: ['sketcher.board', 'canvas.ctx'] },
  // v5 Part 7 (§11.6): comic pages' reading order.
  'designer.readOrder': { label: 'dgShowReadOrder', icon: 'list', scope: 'kind:designer', checked: () => !!S.designerData?.showOrder, run: () => toggleDesignerReadOrder(), surfaces: ['designer.toolbar', 'canvas.ctx'] },
  'designer.renumber': { label: 'dgRenumber', icon: 'return', scope: 'kind:designer', run: () => renumberDesignerReadOrder(), surfaces: ['designer.toolbar', 'canvas.ctx'] },
  'designer.addShape': {
    label: 'ctxAddShape', icon: 'plus', scope: 'kind:designer',
    sub: () => DG_SHAPES.map(sh => ({ label: `${DG_SHAPE_GLYPH[sh] || ''}  ${sh}`, onClick: () => addDesignNode(sh) })),
    surfaces: ['canvas.ctx'],
  },
  'designer.pinLink': { label: 'pinModuleLink', icon: 'relation', scope: 'kind:designer', run: () => openDesignPinModal(), surfaces: ['canvas.ctx'] },
  'designer.edgeTool': { label: 'edgeTool', icon: 'move', scope: 'kind:designer', run: () => startDesignEdge(), surfaces: ['canvas.ctx'] },
  'designer.linkFilter': { label: 'narratorLinkFilter', icon: 'options', scope: 'kind:designer', run: (c) => openDesignerLinkFilterModal(c.moduleId), surfaces: ['canvas.ctx'] },

  // ── Exhibitor ────────────────────────────────────────────────────────
  'exhibitor.addRelation': { label: 'addRelation', icon: 'plus', scope: 'kind:exhibitor', run: () => openExhibitorRelationModal(), surfaces: ['exhibitor.toolbar', 'canvas.ctx'] },
  'exhibitor.editFilter': { label: 'editFilter', icon: 'edit', scope: 'kind:exhibitor', run: (c, el) => openSavedFilterPopup(el || paletteAnchor(), c.moduleId, S.exhibitorData?.def), surfaces: ['exhibitor.toolbar'] },
  'exhibitor.treeLayout': { label: 'exhTreeLayout', icon: 'projects', scope: 'kind:exhibitor', when: () => S.exhibitorData?.view !== 'scene' && !!S.exhibitorData?.relations?.length, run: () => openExhibitorTreeModal(), surfaces: ['exhibitor.toolbar', 'canvas.ctx'] },
  'exhibitor.openScene': { label: 'exhibitorOpenScene', icon: 'relation', scope: 'kind:exhibitor', when: () => S.exhibitorData?.view !== 'scene', run: () => setExhibitorView('scene'), surfaces: ['canvas.ctx'] },
  'exhibitor.addNote': { label: 'exhibitorAddNote', icon: 'plus', scope: 'kind:exhibitor', when: () => S.exhibitorData?.view === 'scene', run: () => addExhibitorFreeNode('note'), surfaces: ['exhibitor.ctx'] },
  'exhibitor.addGroup': { label: 'exhibitorAddGroup', icon: 'plus', scope: 'kind:exhibitor', when: () => S.exhibitorData?.view === 'scene', run: () => addExhibitorFreeNode('group'), surfaces: ['exhibitor.ctx'] },
  'exhibitor.fit': { label: 'exhibitorFit', scope: 'kind:exhibitor', when: () => S.exhibitorData?.view === 'scene', run: () => fitExhibitorScene(), surfaces: ['exhibitor.ctx'] },
  // A scene node has no palette target (the scene keeps no selection) —
  // these live on the node's menu and on the node itself.
  'exhibitor.openNode': { label: 'open', icon: 'eye', scope: 'kind:exhibitor', when: (c) => !!c.node?.linker_key, run: (c) => openExhibitorNodeTarget(c.node.id), surfaces: ['exhibitor.ctx'] },
  'exhibitor.columns': { label: 'exhCustomizeColumns', icon: 'edit', scope: 'kind:exhibitor', when: (c) => !!c.node && exhIsTable(c.node), run: (c) => openExhibitorFieldsModal(c.node.id), surfaces: ['exhibitor.ctx'] },
  'exhibitor.fields': { label: 'exhCustomizeFields', icon: 'edit', scope: 'kind:exhibitor', when: (c) => !!c.node && exhIsCobjKey(c.node.linker_key) && !exhInTable(c.node), run: (c) => openExhibitorFieldsModal(c.node.id), surfaces: ['exhibitor.ctx'] },
  'exhibitor.showCard': { label: 'exhShowAsCard', scope: 'kind:exhibitor', when: (c) => !!c.node && exhIsCobjKey(c.node.linker_key) && !exhInTable(c.node), checked: (c) => exhIsCard(c.node), run: (c) => toggleExhibitorCard(c.node.id), surfaces: ['exhibitor.ctx'] },
  'exhibitor.ungroup': { label: 'exhRemoveFromTable', scope: 'kind:exhibitor', when: (c) => !!c.node && exhInTable(c.node), run: (c) => exhUngroupRow(c.node.id), surfaces: ['exhibitor.ctx'] },
  'exhibitor.linkTo': { label: 'exhibitorLinkTo', icon: 'relation', scope: 'kind:exhibitor', when: (c) => !!c.node?.linker_key, run: (c) => startExhibitorLink(c.node.id), surfaces: ['exhibitor.ctx'] },
  'exhibitor.removeNode': { label: 'exhibitorRemoveNode', icon: 'delete', danger: true, scope: 'kind:exhibitor', when: (c) => !!c.node, run: (c) => removeExhibitorNode(c.node.id), surfaces: ['exhibitor.ctx'] },
};

// ── Resolving a command ─────────────────────────────────────────────────
const cmdLabelKey = (def, c) => (typeof def.label === 'function' ? def.label(c || {}) : def.label);
function cmdLabel(id, c) {
  const def = COMMANDS[id];
  return def ? t(cmdLabelKey(def, c)) : id;
}
// A kind-scoped command is gated on the open module only in the palette —
// a menu or a toolbar was drawn by that kind's page, so it already knows.
function cmdVisible(def, c, palette = false) {
  if (palette && def.scope?.startsWith('kind:') && !onKind(def.scope.slice(5))(c)) return false;
  if (def.scope === 'module' && !cmdModule(c)) return false;
  if (def.scope === 'asset' && !cmdAsset(c)) return false;
  try { return def.when ? !!def.when(c) : true; } catch (_) { return false; }
}

// G6 (APP docs/REDESIGN.md A6): the palette lists the commands you ran last
// first. Per-viewer convenience, so browser storage; a blocked or cleared
// store just means no recent list.
const RECENT_CMDS_KEY = 'ddx.recentCommands';
function recentCommandIds() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_CMDS_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => COMMANDS[x]) : []; }
  catch (_) { return []; }
}
function noteRecentCommand(id) {
  try { localStorage.setItem(RECENT_CMDS_KEY, JSON.stringify([id, ...recentCommandIds().filter((x) => x !== id)].slice(0, 8))); }
  catch (_) {}
}

async function runCommand(id, c = {}, el = null) {
  const def = COMMANDS[id];
  if (!def) return;
  noteRecentCommand(id);
  if (def.sub || def.subHtml) {
    if (def.palette) return def.palette(c, el);
    return ctxMenu(null, def.sub(c), { anchor: el || paletteAnchor() });
  }
  return def.run?.(c, el);
}

// A ctxMenu item (hub/ctxmenu.js) for a command, or null when it cannot run
// in this context — ctxItemsHtml drops nulls.
function cmdItem(id, c = {}) {
  const def = COMMANDS[id];
  if (!def || !cmdVisible(def, c)) return null;
  const it = { label: cmdLabel(id, c), icon: def.icon, danger: def.danger, hint: def.hint };
  if (def.checked) it.checked = !!def.checked(c);
  if (def.disabled) it.disabled = !!def.disabled(c);
  if (def.sub) it.sub = () => def.sub(c);
  else if (def.subHtml) it.subHtml = () => def.subHtml(c);
  else it.onClick = () => def.run(c);
  return it;
}

// A toolbar button for a command — label and icon from the entry.
//   opts.cls     button classes after `btn` (default btn-s)
//   opts.iconOnly  icon with the label as a tooltip
//   opts.extra   HTML after the label (a count)
//   opts.id      an element id the page looks the button up by
function cmdBtn(id, c = {}, opts = {}) {
  const def = COMMANDS[id];
  if (!def || !cmdVisible(def, c)) return '';
  const label = x(cmdLabel(id, c));
  const icon = def.icon && I[def.icon] ? I[def.icon] : '';
  const cls = opts.cls || (opts.iconOnly ? 'btn-g btn-i' : 'btn-s');
  return `<button${opts.id ? ` id="${x(opts.id)}"` : ''} class="btn ${cls}" data-cmd="${x(id)}" onclick="event.stopPropagation();runCommand(${xj(id)},${x(JSON.stringify(c))},this)"${opts.iconOnly ? ` title="${label}"` : ''}>${icon}${opts.iconOnly ? '' : ` ${label}`}${opts.extra || ''}</button>`;
}

// Every command that can run right now, with the context the palette runs
// it in: the open module for module / kind scope; for a Classifier, the
// selected object too.
function paletteCommands(focusEl = null) {
  const m = S.activeModuleNode;
  const base = { moduleId: m?.id ?? null };
  if (m?.kind === 'classifier' && S.classifierSelectedObject != null) base.objectId = S.classifierSelectedObject;
  const out = [];
  for (const [id, def] of Object.entries(COMMANDS)) {
    const c = def.scope === 'app' ? {}
      : def.scope === 'asset' ? { fileId: S.filePreview?.id ?? null }
      : def.scope === 'text' ? { el: focusEl && document.contains(focusEl) ? focusEl : null }
      : base;
    if (!cmdVisible(def, c, true)) continue;
    const key = cmdLabelKey(def, c);
    out.push({
      id, ctx: c, icon: def.icon,
      name: `${def.prefix ? `${t(def.prefix)}: ` : ''}${t(key)}`,
      alt: `${def.prefix ? `${L.en[def.prefix] || ''}: ` : ''}${L.en[key] || ''}`,
      hint: def.hint || '',
      crumb: def.scope === 'app' || def.scope === 'text' ? '' : def.scope === 'asset' ? (S.filePreview?.file_name || '') : (m?.name || ''),
    });
  }
  return out;
}
