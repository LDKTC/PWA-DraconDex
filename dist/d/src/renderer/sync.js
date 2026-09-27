'use strict';
// Cloud Sync modal (Token Sync — Supabase). One surface for everything:
// server config (Supabase URL + anon key), Google login, the account's
// upload slots (push/pull/delete, quota by tier), and pulling a DIFFERENT
// account's upload via its 16-digit token (+ password if the uploader set
// one). All network work happens in the main process via api.sync.* — this
// file only renders and dispatches.

function syncErrToast(r) {
  const map = {
    no_config: 'syncErrNoConfig',
    not_authenticated: 'syncErrNotAuthenticated',
    bad_token: 'syncErrBadToken',
    bad_password: 'syncErrBadPassword',
    locked: 'syncErrLocked',
    token_collision: 'syncErrServer',
    no_upload: 'syncErrNoUpload',
    too_large: 'syncErrTooLarge',
    quota_exceeded: 'syncErrQuotaExceeded',
    not_owner: 'syncErrNotOwner',
    network: 'syncErrNetwork',
    auth: 'syncErrAuth',
    login_timeout: 'syncErrLoginTimeout',
    bad_snapshot: 'syncErrServer',
  };
  toast(t(map[r?.code] || 'syncErrServer'), 'error');
}

function syncFmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch (_) { return iso; }
}

function syncFmtSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

async function openSyncModal() {
  if (!S.nexus) return;
  const st = await api.sync.status(S.nexus.id);
  if (!st.dev && !st.configured) return syncRenderConfig();
  if (!st.loggedIn) return syncRenderLoggedOut(st);
  return syncRenderMain(st);
}

// Setting window → Appdata → TokenSync (Plan.md part1 #Setting). Token Sync
// is per-open-Nexus (push/pull operate on S.nexus.id — see openSyncModal
// above), while the Setting window itself isn't Nexus-scoped, so rather
// than re-plumb the whole modal flow into a page-render function, this page
// just launches the existing, already-working modal for whichever Nexus is
// currently open.
function settingTokenSyncPageHtml(){
  if (!S.nexus) {
    return `<div class="settings-label">${t('settingPageTokenSync')}</div>
      <div class="modal-hint">${I.info}<span>${t('settingTokenSyncPickNexus')}</span></div>`;
  }
  return `<div class="settings-label">${t('settingPageTokenSync')}</div>
    <div class="sync-status-row"><span>${t('syncTitle')}</span><b data-no-i18n>${x(S.nexus.name)}</b></div>
    <button class="btn btn-p" onclick="openSyncModal()">☁ ${t('syncTitle')}</button>`;
}
registerSettingPage('appdata', 'tokensync', settingTokenSyncPageHtml);

// Dev runs are pinned to the local prototype server — no Supabase config.
function syncDevHintHtml(st) {
  return st.dev ? `<div class="modal-hint">${I.info}<span>${t('syncDevServer')}</span></div>` : '';
}

// --- state: server not configured (also reachable from the other states)
async function syncRenderConfig() {
  const cfg = await api.sync.getConfig();
  openModal(`☁ ${t('syncTitle')} — ${t('syncServerSettings')}`, `
    <div class="modal-hint">${I.info}<span>${t('syncConfigHint')}</span></div>
    <div class="fg"><label>${t('syncUrl')}</label><input id="sync-url" placeholder="https://xxxx.supabase.co" value="${x(cfg.url || '')}"></div>
    <div class="fg"><label>${t('syncAnonKey')}</label><input id="sync-anon-key" type="password" value="${x(cfg.anonKey || '')}"></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="syncSaveConfig()">${t('save')}</button>
    </div>`);
  setTimeout(() => q('#sync-url')?.focus(), 60);
}

async function syncSaveConfig() {
  const url = q('#sync-url').value.trim();
  const key = q('#sync-anon-key').value.trim();
  if (!url || !key) return;
  // setConfig rejects anything that isn't https (or loopback for dev), since
  // this URL is where tokens and the whole vault snapshot get sent.
  const res = await api.sync.setConfig(url, key);
  if (res && res.ok === false) { toast(t('syncErrBadUrl'), 'err'); return; }
  toast(t('syncConfigSaved'), 'ok');
  openSyncModal();
}

// --- state: configured, not logged in
function syncRenderLoggedOut(st = {}) {
  openModal(`☁ ${t('syncTitle')}`, `
    ${syncDevHintHtml(st)}
    <div class="modal-hint">${I.info}<span>${t('syncLoggedOutHint')}</span></div>
    <div class="mfoot">
      ${st.dev ? '' : `<button class="btn btn-s" onclick="syncRenderConfig()">${t('syncServerSettings')}</button>`}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" id="sync-login-btn" onclick="syncLoginNow()">☁ ${t('syncLoginGoogle')}</button>
    </div>`);
}

async function syncLoginNow() {
  syncBtnBusy('#sync-login-btn', true);
  const r = await api.sync.googleLogin();
  syncBtnBusy('#sync-login-btn', false);
  if (!r.ok) return syncErrToast(r);
  toast(t('syncLoggedIn'), 'ok');
  openSyncModal();
}

async function syncLogoutNow() {
  await api.sync.googleLogout();
  toast(t('syncLoggedOut'), 'ok');
  openSyncModal();
}

// --- state: logged in — upload slots + push + enter-token
function syncUploadRowHtml(u, st) {
  const isThis = u.vaultId === st.mappedVaultId;
  return `
    <div class="sync-upload-row${isThis ? ' sync-upload-row-mine' : ''}">
      <div>
        <b>${x(u.name)}</b>${isThis ? `<span class="sync-tag-chip">${t('syncThisNexus')}</span>` : ''}${u.hasPassword ? ' 🔒' : ''}
        <div class="sync-hint">${syncFmtSize(u.sizeBytes)} · ${t('syncExpires')} ${syncFmtTime(u.expiresAt)}</div>
      </div>
      <div class="sync-upload-actions">
        <button class="btn btn-s btn-sm" onclick="syncPullOwnNow(${xj(u.vaultId)})">${t('syncPullIn')}</button>
        <button class="btn btn-d btn-sm" onclick="syncDeleteUploadNow(${xj(u.vaultId)})">${t('delete')}</button>
      </div>
    </div>`;
}

function syncTokenPanelHtml(rawToken) {
  const display = rawToken.replace(/(.{4})(?=.)/g, '$1-');
  return `
    <div class="fg"><label>${t('syncNewToken')}</label>
      <div class="sync-key-row">
        <code class="sync-key-code" id="sync-shown-token">${x(display)}</code>
        <button class="btn btn-s btn-sm" onclick="syncCopyToken()">${t('syncCopy')}</button>
      </div>
    </div>
    <div class="modal-hint">${I.info}<span>${t('syncTokenShownOnce')}</span></div>`;
}

function syncRenderMain(st) {
  const rows = st.uploads.length
    ? st.uploads.map((u) => syncUploadRowHtml(u, st)).join('')
    : `<div class="modal-hint">${I.info}<span>${t('syncNoUploads')}</span></div>`;
  const tierLabel = st.tier === 'pro' ? t('syncTierPro') : t('syncTierFree');

  openModal(`☁ ${t('syncTitle')} — ${x(st.email || '')}`, `
    ${syncDevHintHtml(st)}
    <div class="sync-status-row"><span>${t('syncSlots')}</span><b>${st.uploads.length}/${st.maxSlots} (${tierLabel})</b></div>
    ${rows}
    <div id="sync-newtoken-area"></div>
    <div class="fg"><label>${t('syncPush')}</label>
      <div class="sync-hint">${t('syncPushHint')}</div>
      <input id="sync-push-password" type="password" placeholder="${t('syncPasswordOptional')}">
      <button class="btn btn-p" id="sync-push-btn" onclick="syncPushNow()">☁ ${t('syncPush')}</button>
    </div>
    <div class="fg"><label>${t('syncEnterToken')}</label>
      <div class="sync-key-row">
        <input id="sync-token-input" placeholder="1234-5678-9012-3456" spellcheck="false" oninput="syncFormatTokenInput(this)">
      </div>
      <div id="sync-token-password-area"></div>
      <button class="btn btn-s" id="sync-token-btn" onclick="syncPullByTokenSubmit()">${t('syncPullBtn')}</button>
    </div>
    <div class="mfoot">
      ${st.dev ? '' : `<button class="btn btn-s" onclick="syncRenderConfig()">${t('syncServerSettings')}</button>`}
      <button class="btn btn-s" onclick="syncLogoutNow()">${t('syncLogout')}</button>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
    </div>`);
}

function syncBtnBusy(id, busy) {
  const b = q(id);
  if (!b) return;
  b.disabled = busy;
  if (busy) { b.dataset.label = b.textContent; b.textContent = t('syncWorking'); }
  else if (b.dataset.label) b.textContent = b.dataset.label;
}

function syncFormatTokenInput(el) {
  const digits = el.value.replace(/[^0-9]/g, '').slice(0, 16);
  el.value = digits.replace(/(.{4})(?=.)/g, '$1-').replace(/-$/, '');
}

async function syncPushNow() {
  const password = q('#sync-push-password')?.value || '';
  syncBtnBusy('#sync-push-btn', true);
  const r = await api.sync.push(S.nexus.id, password || null);
  syncBtnBusy('#sync-push-btn', false);
  if (!r.ok) return syncErrToast(r);
  toast(t('syncPushed'), 'ok');
  await openSyncModal();
  const area = q('#sync-newtoken-area');
  if (area) area.innerHTML = syncTokenPanelHtml(r.token);
}

async function syncPullOwnNow(vaultId) {
  if (!(await uiConfirm(t('syncPullConfirm')))) return;
  const r = await api.sync.pull(S.nexus.id, vaultId);
  if (!r.ok) return syncErrToast(r);
  closeModal();
  toastSnapshotResult(r, 'syncPulled');
  renderNexusHome();
}

async function syncDeleteUploadNow(vaultId) {
  if (!(await uiConfirm(t('syncDeleteConfirm')))) return;
  const r = await api.sync.deleteUpload(vaultId);
  if (!r.ok) return syncErrToast(r);
  toast(t('syncDeleted'), 'ok');
  openSyncModal();
}

async function syncPullByTokenSubmit() {
  const token = (q('#sync-token-input')?.value || '').replace(/[^0-9]/g, '');
  if (token.length !== 16) return toast(t('syncErrBadToken'), 'error');
  const passwordInput = q('#sync-token-password-input');
  const password = passwordInput ? passwordInput.value : '';
  if (!(await uiConfirm(t('syncPullConfirm')))) return;
  syncBtnBusy('#sync-token-btn', true);
  const r = await api.sync.pullByToken(S.nexus.id, token, password || null);
  syncBtnBusy('#sync-token-btn', false);
  if (!r.ok) {
    if (r.code === 'bad_password') {
      const area = q('#sync-token-password-area');
      if (area && !passwordInput) {
        area.innerHTML = `<input id="sync-token-password-input" type="password" placeholder="${t('syncPasswordPrompt')}">`;
      }
    }
    return syncErrToast(r);
  }
  closeModal();
  toastSnapshotResult(r, 'syncPulled');
  renderNexusHome();
}
