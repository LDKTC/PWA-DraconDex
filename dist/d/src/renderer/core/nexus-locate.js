'use strict';
// ═══ Locate Nexus — the folder mirror, renderer side (v5 Part 4, §8.5–§8.6)
// The Nexus modal's "Local folder" row, and the syncs that keep the mirror
// current. Main does the work (main.js syncLocate → db/mirror.js); this file
// only decides when to ask. EXE only: in the PWA build the preload has no
// locate calls, so the row simply does not render.
//
// When the mirror syncs:
//   - when the folder is picked, and from the row's Sync button
//   - once in the background after a Nexus opens
//   - after the module tree changes (create / rename / move / delete),
//     debounced — reloadModuleTree() is the one place all of those end
// Content edits inside a module do not trigger it on their own; the next
// open or tree change carries them. The .ddx is the truth either way (§8.1).

const hasLocate = () => typeof api.nexus?.locatePick === 'function';
const nexusRow = (id) => S.nexuses?.find(v => v.id === id) || null;

function nexusLocateRowHtml(n) {
  if (!hasLocate()) return '';
  const dir = n.locate_dir;
  return `
    <div class="fg${n.locate_missing ? ' nx-locate-missing' : ''}">
      <label>${t('nexusLocalFolder')}</label>
      <div class="sync-hint">${t('nexusLocalFolderHint')}</div>
      <div class="sync-key-row">
        <input readonly value="${x(dir || '')}" title="${x(dir || '')}" placeholder="${x(t('nexusLocalFolderNone'))}" data-no-i18n>
        <button class="btn btn-s btn-sm" onclick="pickNexusLocate(${n.id})">${dir ? t('nexusLocate') : t('nexusLocalFolderPick')}</button>
        ${dir && !n.locate_missing ? `
          <button class="btn btn-g btn-sm" onclick="syncNexusLocate(${n.id})">${t('nexusLocalFolderSync')}</button>
          <button class="btn btn-g btn-sm" onclick="api.nexus.locateOpen(${n.id})">${t('nexusLocalFolderOpen')}</button>` : ''}
        ${dir ? `<button class="btn btn-g btn-sm" onclick="forgetNexusLocate(${n.id})">${t('nexusLocalFolderForget')}</button>` : ''}
      </div>
      ${n.locate_missing ? `<div class="sync-hint">${t('nexusLocalFolderMissing')}</div>` : ''}
    </div>`;
}

function reportLocateSync(r, quiet) {
  if (!r || r.canceled) return;
  if (!r.ok) {
    if (!quiet) toast(t(r.code === 'missing' ? 'nexusLocalFolderMissing' : 'nexusLocalFolderNone'), 'err');
    return;
  }
  if (quiet && !r.imported?.collectors && !r.imported?.added) return;
  toast(`${t('nexusLocalFolderSynced')} ${r.files} · ${r.dirs}`, 'ok');
}

async function pickNexusLocate(id) {
  const r = await api.nexus.locatePick(id);
  if (!r || r.canceled) return;
  reportLocateSync(r, false);
  await afterLocateChange(id, r);
}

async function syncNexusLocate(id, quiet = false) {
  const r = await api.nexus.locateSync(id);
  reportLocateSync(r, quiet);
  // The folder side may have brought collectors / assets in.
  if (r?.imported && (r.imported.collectors || r.imported.added)) await reloadModuleTree({ skipMirror: true });
  return r;
}

async function forgetNexusLocate(id) {
  if (!await uiConfirm(t('nexusLocalFolderForgetConfirm'))) return;
  await api.nexus.locateForget(id);
  await afterLocateChange(id, null);
}

async function afterLocateChange(id, r) {
  await reloadNexuses();
  if (S.nexus?.id === id) S.nexus = nexusRow(id) || S.nexus;
  if (r?.imported && (r.imported.collectors || r.imported.added)) await reloadModuleTree({ skipMirror: true });
  openNexusModal(id); // every caller is a button in this modal — redraw it
}

let _mirrorTimer = null;
function scheduleMirrorSync(delay = 2000) {
  if (!hasLocate() || !S.nexus?.locate_dir || S.nexus.locate_missing) return;
  clearTimeout(_mirrorTimer);
  const id = S.nexus.id;
  _mirrorTimer = setTimeout(() => { if (S.nexus?.id === id) syncNexusLocate(id, true); }, delay);
}
