'use strict';
// ═══ Focus (v5 Part 8, APP docs/V5.md §12.14) ════════════════════════════
// Three ways to give the page more of the window:
//   focus mode       Ctrl+Shift+F / the palette (app.focusMode): the rail,
//                    the left panel, the side panel and the status bar go.
//                    Per session — it is a moment, not a preference.
//   readable width   per module (module_ui 'readable'), from the page's own
//                    buttons (page.readable): the page's blocks keep a
//                    46rem measure, centred, for reading long text. The
//                    module's element pages follow it.
//   auto-collapse    opening a page folds the left panel away (Setting →
//                    Workspace, autoCollapseLeft, default on) — except when
//                    the page was opened FROM the left panel, which would
//                    take the Nest away from under the pointer mid-browse.

function toggleFocusMode(on = !document.body.classList.contains('focus-mode')) {
  document.body.classList.toggle('focus-mode', on);
  if (on) toast(t('focusModeHint'), 'ok');
}

const pageReadableOn = (moduleId) => pageOf(moduleId, null)?.props?.ui?.readable === '1'
  || (S.inspectorData?.moduleId === moduleId && S.inspectorData.ui?.readable === '1');

async function togglePageReadable(moduleId = S.activeItemNode?.moduleId ?? S.activeModuleNode?.id) {
  if (moduleId == null) return;
  const next = pageReadableOn(moduleId) ? '' : '1';
  await api.module.setUi(moduleId, 'readable', next);
  for (const p of Object.values(S.pages || {})) if (p.moduleId === moduleId && p.props?.ui) p.props.ui.readable = next;
  if (S.inspectorData?.moduleId === moduleId && S.inspectorData.ui) S.inspectorData.ui.readable = next;
  renderNexusHome();
}

// Called at the start of openModuleNode / openItemNode for a page other than
// the open one, while the click that opened it is still window.event — no
// event means no user action (a restore at boot, a reload after an await).
function pageAutoCollapseLeft() {
  if (!window.event || S.settings.autoCollapseLeft === false || S.leftPanelCollapsed) return;
  if (S.settings.workspaceStyle && S.settings.workspaceStyle !== 'drake') return;
  if (window.event?.target?.closest?.('#left-panel')) return;
  setLeftPanelCollapsed(true);
}

function toggleAutoCollapseLeft() {
  S.settings.autoCollapseLeft = S.settings.autoCollapseLeft === false;
  saveUiSettings();
  renderSettingWindow();
}
