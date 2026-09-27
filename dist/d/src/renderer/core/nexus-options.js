'use strict';
// ═══ The Nexus ⋯ menu (v4.9.0) ═════════════════════════════════════════════
// Per-vault actions on the Welcome window's list (and the in-app fallback
// picker): Duplicate, Export, Share, Open in Explorer, Delete.
//
// These only became possible in this release. Before it, every vault lived
// inside one shared database, so "duplicate" and "export" meant serialising a
// subset of tables and "open in explorer" meant nothing at all. A Nexus is now
// a file, so all of them are ordinary file operations — and that is why this
// menu is worth having rather than a second Edit dialog.
//
// The popup plumbing is hub/popups.js's, unchanged: closeAllPopups() sweeps
// `.kind-popup`, positionPopupNear() flips above and clamps horizontally.
// Rows follow hub/menus.js's shape so this menu behaves like every other
// context menu in the app.

function openNexusOptionsPopup(anchor, nexusId) {
  closeAllPopups();
  if (!anchor) return;
  const n = (S.nexuses || []).find((v) => v.id === nexusId);
  if (!n) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup nexus-options-popup';
  const row = (fn, label, cls = '') =>
    `<div class="kind-list-item ${cls}" onclick="closeAllPopups();${fn}"><span class="kli-name">${label}</span></div>`;
  pop.innerHTML = `
    ${row(`openNexusModal(${n.id})`, t('edit'))}
    ${row(`nexusDuplicate(${n.id})`, t('nexusDuplicate'))}
    ${row(`nexusExportFile(${n.id})`, t('nexusExport'))}
    ${row(`runCommand('app.exportMarkdown',{nexusId:${n.id}})`, t('exportMarkdown'))}
    ${row(`runCommand('app.exportHtml',{nexusId:${n.id}})`, t('htmlExport'))}
    ${row(`nexusShare(${n.id})`, t('nexusShare'))}
    ${row(`nexusRevealFile(${n.id})`, t('nexusRevealFile'))}
    <div class="ctx-sep"></div>
    ${row(`delNexus(${n.id})`, t('delete'), 'kli-danger')}`;
  document.body.appendChild(pop);
  pop.addEventListener('click', (e) => e.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

// The ⋯ button itself, shared by welcome.js and nexus.js's fallback picker so
// the two lists cannot drift apart.
function nexusRowButtonsHtml(n) {
  return `
    <button class="btn-icon" onclick="event.stopPropagation();openNexusModal(${n.id})" title="${t('edit')}">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
    </button>
    <button class="btn-icon" onclick="event.stopPropagation();openNexusOptionsPopup(this,${n.id})" title="${t('nexusOptionsTitle')}">${I.options}</button>`;
}

async function nexusDuplicate(id) {
  const r = await api.nexus.duplicate(id);
  if (!r?.ok) return toast(t(r?.code === 'file_missing' ? 'nexusFileMissing' : 'driveErrServer'), 'error');
  await reloadNexuses();
  toast(t('nexusDuplicated'), 'ok');
  renderNexusHome();
}

async function nexusExportFile(id) {
  const r = await api.nexus.exportFile(id);
  if (r?.canceled) return;
  if (!r?.ok) return toast(t(r?.code === 'file_missing' ? 'nexusFileMissing' : r?.code === 'too_large' ? 'nexusZipTooLarge' : 'driveErrServer'), 'error');
  // A .zip reports how many media files it carried, and how many it could
  // not (missing on disk — those still need a relink at the other end).
  if (r.media != null) toast(`${t('nexusExported')} · ${t('nexusZipMedia')} ${r.media}${r.skipped ? ` · ${t('assetMissing')} ${r.skipped}` : ''}`, 'ok');
  else toast(t('nexusExported'), 'ok');
}

// v5 Part 7 (§11.4): every entity as a .md file, for any other program.
async function nexusExportMarkdown(id) {
  const r = await api.nexus.exportMarkdown(id);
  if (r?.canceled) return;
  if (!r?.ok) return toast(t(r?.code === 'empty' ? 'exportMarkdownEmpty' : r?.code === 'too_large' ? 'nexusZipTooLarge' : 'driveErrServer'), 'error');
  toast(`${t('nexusExported')} · ${r.files} .md`, 'ok');
}

async function nexusRevealFile(id) {
  const r = await api.nexus.revealFile(id);
  if (!r?.ok) toast(t('nexusFileMissing'), 'error');
}

// Share = hand the file to a person. No OS gives Electron a way to attach a
// file to the user's mail client, and the build targets are Windows-only, so
// the honest version is: write the copy, then offer the three things that
// actually work. macOS gets the real native share sheet in main.js instead and
// returns native:true, in which case there is nothing left to show here.
async function nexusShare(id) {
  const r = await api.nexus.shareFile(id);
  if (r?.canceled) return;
  if (!r?.ok) return toast(t(r?.code === 'file_missing' ? 'nexusFileMissing' : 'driveErrServer'), 'error');
  if (r.native) return;
  const n = (S.nexuses || []).find((v) => v.id === id);
  S._sharePath = r.filePath;
  openModal(t('nexusShare'), `
    <div class="modal-hint">${I.info}<span>${t('nexusShareHint')}</span></div>
    <div class="fg">
      <label>${t('nexusSaveLocation')}</label>
      <div class="sync-key-row"><input readonly value="${x(r.filePath)}" title="${x(r.filePath)}"></div>
    </div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="nexusShareReveal()">${t('nexusRevealFile')}</button>
      <button class="btn btn-s" onclick="nexusShareCopyPath()">${t('nexusShareCopyPath')}</button>
      <button class="btn btn-p" onclick="nexusShareEmail(${xj(n?.name || '')})">${t('nexusShareEmail')}</button>
    </div>`);
}

async function nexusShareReveal() {
  const r = await api.shell.revealPath(S._sharePath);
  if (!r?.ok) toast(t('nexusFileMissing'), 'error');
}

async function nexusShareCopyPath() {
  try { await navigator.clipboard.writeText(S._sharePath || ''); toast(t('copied'), 'ok'); }
  catch (_) { toast(t('driveErrServer'), 'error'); }
}

// A pre-filled draft naming the vault and its file. The user attaches the file
// themselves — the folder is one click away in the same modal.
async function nexusShareEmail(vaultName) {
  await api.shell.composeMail(
    `${vaultName} — DraconDex Nexus`,
    `${t('nexusShareEmailBody')}\n\n${S._sharePath || ''}\n`,
  );
}
