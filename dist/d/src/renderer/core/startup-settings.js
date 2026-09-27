'use strict';
// Workspace → Start up page (Plan.md process 2 part 2) — where to land on
// launch: Welcome's vault picker (default) or straight into the most-
// recently-opened vault. DB-backed (app_setting key 'startupMode'), not
// S.settings/localStorage: main.js's app.whenReady() reads it before any
// renderer/window exists, so it can't live in the per-machine UI-chrome tier
// theme/nameMode use. Lazily cached on first render, same pattern
// S.versionLimitCache uses (settings.js setVersionLimit / chrome.js).
function settingStartupPageHtml(){
  if (S.startupModeCache === undefined) {
    S.startupModeCache = null; // loading placeholder; avoids re-firing the fetch on every render
    api.setting.get('startupMode').then(v => {
      S.startupModeCache = (v === 'latest') ? 'latest' : 'welcome';
      renderSettingWindow();
    }).catch(() => { S.startupModeCache = 'welcome'; });
    return `<div class="settings-label">${t('settingPageStartup')}</div><div class="empty"><p>${t('syncWorking')}</p></div>`;
  }
  const mode = S.startupModeCache;
  return `<div class="settings-label">${t('settingPageStartup')}</div>
    <div class="name-mode-seg">
      <button class="btn ${mode !== 'latest' ? 'btn-p' : 'btn-s'}" onclick="setStartupMode('welcome')">${t('settingStartupWelcome')}</button>
      <button class="btn ${mode === 'latest' ? 'btn-p' : 'btn-s'}" onclick="setStartupMode('latest')">${t('settingStartupLatest')}</button>
    </div>
    <div class="settings-hint">${t('settingStartupHint')}</div>`;
}
async function setStartupMode(mode){
  const v = mode === 'latest' ? 'latest' : 'welcome';
  S.startupModeCache = v;
  await api.setting.set('startupMode', v);
  renderSettingWindow();
  toast(t('applied'), 'ok');
}
registerSettingPage('workspace', 'startup', settingStartupPageHtml);
