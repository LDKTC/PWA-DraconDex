'use strict';
// Extensions (Procress 10 part 1) — Setting window -> Extension -> Extensions
// page. Discovery-only: lists GitHub repos generated from the
// DraconDex-EXT-Template template (src/db/extension.js does the actual
// GitHub calls, main-process side, same reason plugin.js's fetches live in
// main: index.html's CSP sets connect-src 'none', so the renderer itself can
// never reach the network). Unlike plugin.js there is no install/preview
// flow here — clicking a row just opens it on GitHub.
function settingExtensionPageHtml() {
  extensionRefreshSection();
  return `<div class="settings-label">${t('settingPageExtension')}</div><div id="extension-body">${t('syncWorking')}</div>`;
}
registerSettingPage('plugin', 'extension', settingExtensionPageHtml);

async function extensionRefreshSection() {
  const r = await api.extension.listRepos();
  const el = q('#extension-body');
  if (!el) return; // panel closed or switched section before this resolved
  el.innerHTML = extensionBodyHtml(r);
}

function extensionRowHtml(repo) {
  return `
    <div class="sync-upload-row">
      <div>
        <b data-no-i18n>${x(repo.name)}</b>
        <div class="sync-hint" data-no-i18n>${x(repo.description)}</div>
      </div>
      <div class="sync-upload-actions">
        <button class="btn btn-s btn-sm" onclick="extensionOpenRepo(${xj(repo.name)})">${t('extensionOpenBtn')}</button>
      </div>
    </div>`;
}

function extensionBodyHtml(r) {
  if (!r?.ok || !r.repos.length) {
    return `<div class="modal-hint">${I.info}<span>${t('extensionNone')}</span></div>`;
  }
  return `
    <div class="fg">
      <label>${t('extensionListLabel')}</label>
      ${r.repos.map(extensionRowHtml).join('')}
    </div>`;
}

function extensionOpenRepo(name) {
  api.extension.openRepo(name);
}
