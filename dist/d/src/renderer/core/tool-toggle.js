'use strict';
// Workspace → Tool toggle page (Plan.md part1 #Setting "Tool toggle") — lets
// the user choose which optional items show in 3 different UI surfaces:
// the Quick Setting popup (extras beyond its trimmed default 4), the nav
// sidebar's Activity Bar destinations (v5 Part 7), and the status
// bar's segments. All three are booleans in S.settings, same localStorage
// tier as theme/nameMode (per-machine UI chrome, not vault data) — see
// loadUiSettings() in state.js for defaults. Toggle rows reuse the existing
// .togglerow/.tg switch idiom from the Nest-options popup (hub/menus.js).

// Plan part2 #4 "tools switch" preview — the Setting window is a modeless
// .floating-panel (components.css), so the live nav rail/status bar already
// sit visible behind it and update instantly; this just makes that change
// impossible to miss with a brief highlight on the element that just changed.
function flashEl(sel){
  const el = q(sel);
  if (!el) return;
  el.classList.remove('tool-toggle-flash');
  void el.offsetWidth; // restart the animation if the same element flashes twice in a row
  el.classList.add('tool-toggle-flash');
  setTimeout(() => el.classList.remove('tool-toggle-flash'), 700);
}
// v5 Part 7 (§11.9): the nav rail's four quick buttons (import / export /
// labels / colours) are gone — the rail is the Activity Bar now, and these
// rows show or hide its destinations (the same hubQuickToggles its own
// right-click menu flips, hub/menus.js).
function toggleRailSetting(key){
  toggleHubQuickMenuAndRefresh(key);
  renderSettingWindow();
  flashEl(`.module-rail-tool[data-dest="${key}"]`);
}
function toggleStatusSetting(key){
  const cur = (S.settings.statusToggles || {})[key] !== false;
  S.settings.statusToggles = Object.assign({}, S.settings.statusToggles, { [key]: !cur });
  saveUiSettings();
  updateStatusBar({});
  renderSettingWindow();
  flashEl('#status-bar');
}
function toggleQuickExtra(key){
  const cur = !!(S.settings.quickExtras || {})[key];
  S.settings.quickExtras = Object.assign({}, S.settings.quickExtras, { [key]: !cur });
  saveUiSettings();
  renderSettingsMenu();
  renderSettingWindow();
}

function toolToggleRowHtml(label, on, onclick){
  return `<div class="togglerow nest-opt-row" onclick="${onclick}"><span class="tg${on ? ' on' : ''}"></span>${label}</div>`;
}
function settingToolTogglePageHtml(){
  const extras = S.settings.quickExtras || {};
  const rail = S.settings.hubQuickToggles || {};
  const st = S.settings.statusToggles || {};
  return `<div class="settings-label">${t('settingToolQuickGroup')}</div>
    <div class="settings-group">
      ${toolToggleRowHtml(t('theme'), !!extras.theme, "toggleQuickExtra('theme')")}
      ${toolToggleRowHtml(t('settingExtraAccount'), !!extras.account, "toggleQuickExtra('account')")}
      ${toolToggleRowHtml(t('settingPageProfile'), !!extras.profile, "toggleQuickExtra('profile')")}
    </div>
    <div class="settings-label">${t('settingToolNavGroup')}</div>
    <div class="settings-group">
      ${HUB_QUICK_MENU_ITEMS.map(([key, labelKey]) => toolToggleRowHtml(t(labelKey), rail[key] !== false, `toggleRailSetting('${key}')`)).join('')}
    </div>
    <div class="settings-label">${t('settingToolStatusGroup')}</div>
    <div class="settings-group">
      ${toolToggleRowHtml(t('settingStatusVault'), st.vault !== false, "toggleStatusSetting('vault')")}
      ${toolToggleRowHtml(t('settingStatusBreadcrumb'), st.breadcrumb !== false, "toggleStatusSetting('breadcrumb')")}
      ${toolToggleRowHtml(t('words'), st.words !== false, "toggleStatusSetting('words')")}
      ${toolToggleRowHtml(t('settingStatusSave'), st.saveState !== false, "toggleStatusSetting('saveState')")}
    </div>`;
}
registerSettingPage('workspace', 'tooltoggle', settingToolTogglePageHtml);
