'use strict';
// ═══ Side panel (v5 Part 8, APP docs/V5.md §12.8) ═══════════════════════
// Version history and plugin panels used to REPLACE the Module Inspector
// dock, which lived inside the page — so every page re-render rebuilt them,
// and a plugin panel's <webview> reloaded each time (PLUGINS.md §1.5 said so
// as a limitation). The dock is gone; these two open here instead, in
// #side-panel, a sibling of #main-area in index.html that no page render
// ever touches. A plugin's webview is created once when its panel opens and
// removed when it closes: page changes in between leave it running.
//
// S.side (one panel at a time):
//   { kind: 'versions', moduleId, rows, limit }
//   { kind: 'plugin', pluginKey, panelId }
// Opened only from the page's own buttons (the address row, §12.6) and the
// palette — never on its own.

const SIDE_PANEL_WIDTH_KEY = 'dracondex-side-panel-width';

function sidePanelWidth() {
  if (!S.sidePanelWidth) {
    let w = null;
    // The dock's width carries over: it was the same panel's job.
    try { w = Number(localStorage.getItem(SIDE_PANEL_WIDTH_KEY) || localStorage.getItem(INSPECTOR_WIDTH_KEY)); } catch (_) {}
    S.sidePanelWidth = w >= 220 && w <= 640 ? w : 300;
  }
  return S.sidePanelWidth;
}

function openSidePanel(side) {
  if (S.side?.kind === 'plugin' && !(side.kind === 'plugin' && side.pluginKey === S.side.pluginKey && side.panelId === S.side.panelId)) {
    dropSidePluginView();
  }
  S.side = side;
  renderSidePanel();
  renderNexusHome(); // the page's toggle buttons show the panel as open
}

function closeSidePanel() {
  if (!S.side) return;
  if (S.side.kind === 'plugin') dropSidePluginView();
  S.side = null;
  renderSidePanel();
  renderNexusHome();
}

const sidePanelOpen = (kind, extra = {}) => S.side?.kind === kind
  && Object.entries(extra).every(([k, v]) => S.side[k] === v);

function renderSidePanel() {
  const el = q('#side-panel');
  const grip = q('#side-panel-resize');
  if (!el) return;
  const side = S.side;
  el.classList.toggle('hidden', !side);
  grip?.classList.toggle('hidden', !side);
  if (!side) return;
  el.style.width = `${sidePanelWidth()}px`;
  const head = q('#side-panel-head');
  const body = q('#side-panel-body');
  if (side.kind === 'versions') {
    const m = findModuleNode(side.moduleId);
    head.innerHTML = `${I.timeline}<span class="sp-title">${t('versionHistory')}${m ? ` — <span data-no-i18n>${x(m.name)}</span>` : ''}</span>
      <span class="vh-count" data-no-i18n>${side.rows.length} / ${side.limit}</span>
      <button class="btn btn-g btn-i" onclick="closeSidePanel()" title="${t('cancel')}">&times;</button>`;
    body.querySelector('.sp-plugin-view')?.classList.add('hidden');
    let list = body.querySelector('.sp-versions');
    if (!list) { list = document.createElement('div'); list.className = 'sp-versions'; body.appendChild(list); }
    list.classList.remove('hidden');
    list.innerHTML = buildVersionListHtml(side);
    return;
  }
  if (side.kind === 'plugin') {
    const found = typeof findPluginPanel === 'function' ? findPluginPanel(side.pluginKey, side.panelId) : null;
    if (!found) { S.side = null; renderSidePanel(); return; }
    const { owner, panel } = found;
    head.innerHTML = `${panel.icon ? `<span data-no-i18n>${x(panel.icon)}</span>` : I.layer}
      <span class="sp-title" data-no-i18n>${x(panel.title)}</span>
      <button class="btn btn-g btn-i" onclick="closeSidePanel()" title="${t('closePluginPanel')}">&times;</button>`;
    body.querySelector('.sp-versions')?.classList.add('hidden');
    let view = body.querySelector('.sp-plugin-view');
    if (!view) {
      // Built with createElement, never innerHTML, and only when absent: a
      // re-render of the page or of this head never recreates it.
      view = document.createElement('webview');
      view.className = 'sp-plugin-view plgp-view';
      view.setAttribute('partition', `persist:plugin-${owner.pluginKey}`);
      view.setAttribute('src', pluginPanelSrc(owner.dir, panel.entry));
      body.appendChild(view);
      wirePluginView(view, owner);
    }
    view.classList.remove('hidden');
  }
}

function dropSidePluginView() {
  q('#side-panel-body .sp-plugin-view')?.remove();
}

// After every page render: the version list follows the page that is open;
// a plugin that asked for its context hears about the new one.
let _sideModuleId = null;
function syncSidePanel() {
  const mid = S.activeModuleNode?.id ?? null;
  if (mid === _sideModuleId) return;
  _sideModuleId = mid;
  if (S.side?.kind === 'versions' && mid && S.side.moduleId !== mid) openVersionPanel(mid);
  if (S.side?.kind === 'plugin') pushPluginContext();
}

// ── resize (the left edge; the right edge is the window's) ───────────────
let _sideResize = null;
function startSidePanelResize(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  _sideResize = { x: ev.clientX, w: q('#side-panel').getBoundingClientRect().width };
  q('#side-panel-resize')?.classList.add('is-resizing');
  // A webview swallows mouse events: without this the drag stops the
  // moment the pointer crosses into the plugin page.
  q('#side-panel')?.classList.add('is-resizing');
}
document.addEventListener('mousemove', (ev) => {
  if (!_sideResize) return;
  S.sidePanelWidth = Math.max(220, Math.min(640, _sideResize.w - (ev.clientX - _sideResize.x)));
  const el = q('#side-panel');
  if (el) el.style.width = `${S.sidePanelWidth}px`;
});
document.addEventListener('mouseup', () => {
  if (!_sideResize) return;
  _sideResize = null;
  q('#side-panel-resize')?.classList.remove('is-resizing');
  q('#side-panel')?.classList.remove('is-resizing');
  try { localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(S.sidePanelWidth)); } catch (_) {}
});
