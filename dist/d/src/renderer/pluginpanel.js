'use strict';
// ═══ Plugin panels (v4.3.0) ════════════════════════════════════════════════
// An installed plugin may declare `panels` in its manifest; each one becomes a
// button on the page's head and, when opened, shows the plugin's own page in
// the side panel (v5 Part 8, page/side-panel.js) — which page renders never
// touch, so the panel keeps running while the user moves between pages.
// This is the generic contribution point — nothing here knows about any
// particular plugin.
//
// The page runs in a <webview>, i.e. its own webContents with
// preload-plugin.js and no window.api, exactly like a plugin WINDOW. main.js's
// hardenWebviewAttach vets every attach; this file only decides what to render.


// Cached from api.plugin.list(). Refreshed at boot and whenever the plugin
// list changes (install/uninstall/launch/stop) — see pluginRefreshSection()
// in plugin.js, which calls this.
async function loadPluginPanels() {
  try {
    const list = await api.plugin.list();
    S.pluginPanels = list
      // A plugin missing a declared dependency contributes no panel button —
      // same gate as plugin:launch. Opening its page would run a plugin whose
      // requirements aren't met, with no way for the user to see why from the
      // pane head; the Plugins settings page is where that's explained.
      .filter((p) => Array.isArray(p.panels) && p.panels.length && !(p.missingDeps || []).length)
      .map((p) => ({ pluginKey: p.plugin_key, pluginName: p.name, dir: p.dir, contextKinds: p.contextKinds || [], panels: p.panels }));
  } catch (e) {
    // A plugin list that fails to load must not take the whole Nexus down —
    // the panel buttons simply don't appear.
    console.error('plugin panel load error:', e);
    S.pluginPanels = [];
  }
  // Drop an open panel whose plugin just went away (uninstall while open).
  if (S.side?.kind === 'plugin' && !findPluginPanel(S.side.pluginKey, S.side.panelId)) closeSidePanel();
}

function findPluginPanel(pluginKey, panelId) {
  const owner = (S.pluginPanels || []).find((p) => p.pluginKey === pluginKey);
  if (!owner) return null;
  const panel = owner.panels.find((p) => p.id === panelId);
  return panel ? { owner, panel } : null;
}

// ═══ Open / close ═══════════════════════════════════════════════════════════
// No data to fetch first — the plugin loads its own state through pluginApi
// once it boots. It is not scoped to the module it was opened on any more:
// it stays open across pages, and a plugin that shares module context is
// told when the page changes (pushPluginContext).
function openPluginPanel(pluginKey, panelId) {
  if (!findPluginPanel(pluginKey, panelId)) return;
  openSidePanel({ kind: 'plugin', pluginKey, panelId });
}

const closePluginPanel = () => closeSidePanel();

function togglePluginPanel(pluginKey, panelId) {
  if (sidePanelOpen('plugin', { pluginKey, panelId })) closePluginPanel(); else openPluginPanel(pluginKey, panelId);
}

// ═══ Pane-head buttons ═════════════════════════════════════════════════════
// Rendered on the page's head, one per declared panel.
function pluginPanelButtonsHtml() {
  let html = '';
  for (const owner of S.pluginPanels || []) {
    for (const panel of owner.panels) {
      const active = sidePanelOpen('plugin', { pluginKey: owner.pluginKey, panelId: panel.id });
      // title/icon come from a downloaded manifest: escape them, and keep the
      // auto-translator off a name the plugin author chose.
      const label = panel.icon ? x(panel.icon) : I.layer;
      html += `<button class="btn btn-g btn-i bnav plgp-btn ${active ? 'active' : ''}" data-no-i18n
        onclick="togglePluginPanel(${xj(owner.pluginKey)},${xj(panel.id)})"
        title="${t('openPluginPanel')} — ${x(panel.title)}">${label}</button>`;
    }
  }
  return html;
}

// file:// URL for a panel entry. `dir` is the absolute plugin directory the
// main process reported — the renderer never composes the data-dir layout
// itself. Each segment is encoded so a space or '#' in the data path can't
// truncate the URL.
function pluginPanelSrc(dir, entry) {
  const base = String(dir).replace(/\\/g, '/');
  const encoded = base.split('/').map(encodeURIComponent).join('/');
  const lead = encoded.startsWith('/') ? '' : '/';
  return `file://${lead}${encoded}/${entry.split('/').map(encodeURIComponent).join('/')}`;
}

// ═══ The host<->panel channel ═════════════════════════════════════════════
// Wired once, when page/side-panel.js creates the webview. `ipc-message` is
// the webview's own event for ipcRenderer.sendToHost from the guest — it
// never reaches the main process, so nothing here can widen what the plugin
// can touch.
function pluginContextFor(owner) {
  const m = S.activeModuleNode;
  // Only for a plugin whose manifest declared `permissions.context:
  // ["module"]` and had it shown at install. Deliberately minimal: identity
  // and kind, never the module's content.
  return owner.contextKinds.includes('module') && m ? { moduleId: m.id, moduleName: m.name, kind: m.kind } : null;
}

function wirePluginView(view, owner) {
  view.addEventListener('ipc-message', (ev) => {
    if (ev.channel === 'plugin:close') { closePluginPanel(); return; }
    if (ev.channel !== 'plugin:msg') return;
    const msg = ev.args?.[0];
    if (msg?.type === 'getContext') view.send('pluginhost:msg', { type: 'context', context: pluginContextFor(owner) });
  });
}

// The page changed under an open panel: the same 'context' message a
// getContext answers, unasked — only to a plugin that may see it.
function pushPluginContext() {
  const view = q('#side-panel-body .sp-plugin-view');
  const found = S.side?.kind === 'plugin' ? findPluginPanel(S.side.pluginKey, S.side.panelId) : null;
  if (!view || !found || !found.owner.contextKinds.includes('module')) return;
  try { view.send('pluginhost:msg', { type: 'context', context: pluginContextFor(found.owner) }); } catch (_) { /* not attached yet */ }
}
