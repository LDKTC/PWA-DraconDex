'use strict';
// DDX Transfer — Setting window → App data → Transfer.
//
// Hands a whole Nexus to another device through the service in
// ZYDRAXYL/DraconDex-TRX. Next to the other two ways of moving a vault, this
// is the one with no file to carry (src/db/db-transfer.js) and no account to
// set up (src/renderer/sync.js).
//
// Every byte of crypto and network lives in the main process
// (src/db/transfer.js). This file renders, dispatches, and draws a QR — it
// never sees the transfer key. What it gets back from `transfer:send` is a
// link string with the key already in the fragment, which is exactly enough
// to paint a QR and nothing else.

function transferErrToast(r) {
  const map = {
    network: 'trxErrNetwork',
    bad_code: 'trxErrBadCode',
    locked: 'trxErrLocked',
    expired: 'trxErrExpired',
    gone: 'trxErrGone',
    not_ready: 'trxErrNotReady',
    too_large: 'trxErrTooLarge',
    bad_token: 'trxErrBadToken',
    bad_key: 'trxErrBadKey',
    qr_only: 'trxErrQrOnly',
    bad_payload: 'trxErrBadPayload',
    invalid_url: 'trxErrInvalidUrl',
    not_found: 'trxErrNotFound',
  };
  toast(t(map[r?.code] || 'trxErrServer'), 'error');
}

// ---------------------------------------------------------------------------
// The Setting page
// ---------------------------------------------------------------------------

function settingTransferPageHtml(){
  settingTransferRefresh();
  return `<div class="settings-label">${t('settingPageTransfer')}</div>
    <div class="modal-hint">${I.info}<span>${t('trxIntro')}</span></div>
    <div id="setting-transfer-body">${t('loading')}</div>`;
}

async function settingTransferRefresh(){
  const cfg = await api.transfer.getConfig();
  const el = q('#setting-transfer-body');
  if (!el) return; // the page was switched away while this was in flight
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <button class="btn btn-p" ${S.nexus ? '' : 'disabled'} onclick="openTransferSendModal()">${t('trxSend')}${S.nexus ? ` — ${x(S.nexus.name)}` : ''}</button>
      <button class="btn btn-s" onclick="openTransferReceiveModal()">${t('trxReceive')}</button>
    </div>
    ${S.nexus ? '' : `<div class="modal-hint">${I.info}<span>${t('trxPickNexus')}</span></div>`}
    <div class="settings-label">${t('trxService')}</div>
    <div class="fg"><input id="trx-url" placeholder="${x(cfg.default)}" value="${x(cfg.custom ? cfg.url : '')}"></div>
    <div class="modal-hint">${I.info}<span>${t('trxServiceHint')}</span></div>
    <button class="btn btn-s btn-sm" onclick="transferSaveConfig()">${t('save')}</button>`;
}
registerSettingPage('appdata', 'transfer', settingTransferPageHtml);

async function transferSaveConfig(){
  const r = await api.transfer.setConfig(q('#trx-url')?.value || '');
  if (!r.ok) return transferErrToast(r);
  toast(t('saved'), 'ok');
  settingTransferRefresh();
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

// The handle for the transfer this window is currently sending, and the timer
// polling it. Only ever one at a time — the modal is the only way in.
let _trxSend = null;
let _trxPoll = null;

function openTransferSendModal(){
  if (!S.nexus) return toast(t('nexusSelectFirst'), 'error');
  openModal(t('trxSend'), `
    <div class="sync-status-row"><span>${t('nexus')}</span><b data-no-i18n>${x(S.nexus.name)}</b></div>
    <label class="fg" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px">
      <input type="checkbox" id="trx-typed" checked style="margin-top:4px">
      <span>
        <b style="display:block">${t('trxAllowTyped')}</b>
        <span class="modal-hint" style="display:block">${t('trxAllowTypedHint')}</span>
      </span>
    </label>
    <div id="trx-send-body" style="margin-top:14px"></div>
    <div class="modal-actions">
      <button class="btn btn-p" id="trx-send-go" onclick="transferSendGo()">${t('trxGenerate')}</button>
    </div>`);
  transferWatchModalClose();
}

// openModal() has no onClose hook — it is two lines that show an overlay, and
// giving it one would ripple through every modal in the app for the sake of
// this one. Watching the overlay's own class covers every way it can close
// (the ✕, Escape, closeModal() from a button) without touching core/ui.js.
//
// Cancelling on close is the point, not tidiness: a code left alive after the
// user has walked away is their vault sitting on the service for the rest of
// its thirty minutes with nobody watching it.
let _trxModalWatch = null;
function transferWatchModalClose(){
  _trxModalWatch?.disconnect();
  const overlay = q('#modal-overlay');
  if (!overlay) return;
  _trxModalWatch = new MutationObserver(() => {
    if (!overlay.classList.contains('hidden')) return;
    transferSendCleanup();
  });
  _trxModalWatch.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

function transferSendCleanup(){
  _trxModalWatch?.disconnect();
  _trxModalWatch = null;
  clearInterval(_trxPoll);
  _trxPoll = null;
  // `done` means the receiver already took it and the service purged it —
  // cancelling then would be a pointless 'gone' round trip.
  if (_trxSend && !_trxSend.done) api.transfer.cancel(_trxSend.transferId);
  _trxSend = null;
}

async function transferSendGo(){
  const btn = q('#trx-send-go');
  if (btn) { btn.disabled = true; btn.textContent = t('syncWorking'); }
  const allowTypedCode = !!q('#trx-typed')?.checked;

  const r = await api.transfer.send(S.nexus.id, { allowTypedCode });
  if (!r.ok) {
    if (btn) { btn.disabled = false; btn.textContent = t('trxGenerate'); }
    return transferErrToast(r);
  }
  _trxSend = { transferId: r.transferId, done: false };

  const body = q('#trx-send-body');
  if (!body) return; // modal closed mid-flight; transferSendCleanup cancelled it
  body.innerHTML = `
    <div class="trx-codebox">
      <div class="trx-label">${t('trxCode')}</div>
      <div class="trx-value" data-no-i18n>${x(r.codeDisplay)}</div>
      ${r.allowTypedCode ? `<div class="trx-label">${t('trxPin')}</div>
        <div class="trx-value trx-pin" data-no-i18n>${x(r.pinDisplay)}</div>` : ''}
      <div class="trx-qr" id="trx-qr"></div>
    </div>
    <div class="modal-hint">${I.info}<span>${t(r.allowTypedCode ? 'trxModeTyped' : 'trxModeQr')}</span></div>
    <div class="modal-hint">${I.info}<span>${t('trxExpiry')}</span></div>
    <div class="modal-hint" id="trx-send-status">${I.info}<span>${t('trxWaiting')}</span></div>`;

  transferRenderQr(q('#trx-qr'), r.link);

  const actions = q('.modal-actions');
  if (actions) {
    actions.innerHTML = `<button class="btn btn-s" onclick="transferCopyLink(${xj(r.link)})">${t('trxCopyLink')}</button>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>`;
  }

  _trxPoll = setInterval(async () => {
    if (!_trxSend) return;
    const st = await api.transfer.status(_trxSend.transferId);
    const line = q('#trx-send-status span');
    if (!line) return;
    if (!st.ok || st.status === 'gone') {
      // Gone means received: /api/complete purges the transfer, so the
      // sender's own status call stops finding it.
      _trxSend.done = true;
      clearInterval(_trxPoll);
      _trxPoll = null;
      line.textContent = t('trxDone');
    } else if (st.status === 'expired') {
      _trxSend.done = true;
      clearInterval(_trxPoll);
      _trxPoll = null;
      line.textContent = t('trxExpiredNotice');
    } else if (st.claimed) {
      line.textContent = t('trxClaimed');
    }
  }, 4000);
}

async function transferCopyLink(link){
  await navigator.clipboard.writeText(link);
  toast(t('copied'), 'ok');
}

// Lazy, like ensureKonva() in core/views.js and for the same two reasons:
// 56 KB has no business in every cold start for a screen most sessions never
// open, and a vendored copy with no CDN fallback is the only acceptable shape
// when this renderer holds the whole window.api IPC surface.
function ensureQrcode(){
  if (window.qrcode) return Promise.resolve();
  if (window.__qrcodeLoading) return window.__qrcodeLoading;
  window.__qrcodeLoading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'vendor/qrcode.js';
    el.onload = () => resolve();
    el.onerror = () => { el.remove(); reject(new Error('Failed to load vendor/qrcode.js')); };
    document.body.appendChild(el);
  });
  return window.__qrcodeLoading;
}

/**
 * Draws the link as an inline-SVG QR using the vendored encoder
 * (electron/vendor/qrcode.js). The four-module quiet zone is part of the
 * spec, not padding — without it a lot of scanners simply will not read the
 * code, and a white QR on a dark card is the usual way to find that out.
 */
async function transferRenderQr(host, text){
  if (!host) return;
  try { await ensureQrcode(); } catch (_) { return; } // the codes still work typed
  if (!host.isConnected || typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  host.innerHTML = `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${t('trxQrAlt')}">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// ---------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------

let _trxRecv = null;

function openTransferReceiveModal(){
  _trxRecv = null;
  openModal(t('trxReceive'), `
    <div class="fg"><label>${t('trxCode')}</label>
      <input id="trx-code" class="trx-code-input" placeholder="ABCD-EFGH" autocomplete="off" spellcheck="false"
             oninput="transferShapeCode(this)"></div>
    <div class="fg"><label>${t('trxPin')}</label>
      <input id="trx-pin" class="trx-code-input" placeholder="482-719" autocomplete="off" spellcheck="false"
             oninput="transferShapePin(this)"></div>
    <div class="modal-hint">${I.info}<span>${t('trxReceiveHint')}</span></div>
    <div class="modal-actions">
      <button class="btn btn-p" id="trx-verify" onclick="transferVerifyGo()">${t('trxVerify')}</button>
    </div>`);
}

// ABCD-EFGH and 482-719 as they type, and paste-tolerant: anything that is not
// part of the code is dropped rather than rejected.
function transferShapeCode(el){
  const raw = el.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  el.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}
function transferShapePin(el){
  const raw = el.value.replace(/[^0-9]/g, '').slice(0, 6);
  el.value = raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
}

/**
 * Step one of the two-step. Shows WHAT is being received before anything is
 * downloaded and before anything touches a vault — which is the difference
 * between this and an import that simply happens to you.
 */
async function transferVerifyGo(){
  const btn = q('#trx-verify');
  if (btn) btn.disabled = true;
  const r = await api.transfer.verify(q('#trx-code')?.value || '', q('#trx-pin')?.value || '', null);
  if (btn) btn.disabled = false;
  if (!r.ok) return transferErrToast(r);

  _trxRecv = r;
  openModal(t('trxFound'), `
    <div class="sync-status-row"><span>${t('trxProject')}</span><b data-no-i18n>${x(r.name)}</b></div>
    <div class="sync-status-row"><span>${t('trxSize')}</span><b data-no-i18n>${x(transferFormatBytes(r.sizeBytes))}</b></div>
    <div class="sync-status-row"><span>${t('trxCreated')}</span><b data-no-i18n>${x(new Date(r.createdAt).toLocaleString())}</b></div>
    <div class="sync-status-row"><span>${t('trxSource')}</span><b data-no-i18n>${x(r.source || '—')}</b></div>
    <div class="modal-hint">${I.info}<span>${t('trxReceiveAsNew')}</span></div>
    <div class="modal-actions">
      <button class="btn btn-p" id="trx-receive" onclick="transferReceiveGo()">${t('trxReceiveGo')}</button>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
    </div>`);
}

/**
 * Step two. Always into a NEW Nexus — applySnapshot is wipe-and-rebuild, so
 * pointing it at an existing vault destroys that vault's contents, and a
 * transfer that arrives from someone else is never a thing to aim at a vault
 * the user is in the middle of. Same shape as importAsNewNexus() in
 * core/views.js.
 */
async function transferReceiveGo(){
  if (!_trxRecv) return;
  const btn = q('#trx-receive');
  if (btn) { btn.disabled = true; btn.textContent = t('syncWorking'); }

  // A name collision is a hard error on `nexus` (name is UNIQUE), so make
  // room rather than failing the user at the last step of a transfer.
  let name = _trxRecv.name || 'Nexus';
  const taken = new Set((S.nexuses || []).map((n) => n.name));
  if (taken.has(name)) {
    let i = 2;
    while (taken.has(`${name} (${i})`)) i++;
    name = `${name} (${i})`;
  }

  let newId;
  try {
    newId = await api.nexus.create(name, '', null, null);
  } catch (_) {
    if (btn) { btn.disabled = false; btn.textContent = t('trxReceiveGo'); }
    return toast(t('nexusNameTaken'), 'error');
  }

  const r = await api.transfer.receive(_trxRecv.transferId, newId);
  if (!r.ok) {
    if (btn) { btn.disabled = false; btn.textContent = t('trxReceiveGo'); }
    return transferErrToast(r);
  }

  _trxRecv = null;
  closeModal();
  await reloadNexuses();
  toastSnapshotResult(r, 'trxReceived');
  if (S.isWelcome) await welcomeOpenNexus(newId); else await selectNexus(newId);
}

function transferFormatBytes(n){
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
