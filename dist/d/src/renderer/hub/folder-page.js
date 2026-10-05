'use strict';
// ═══ Folder page — the Nest's two-column mode (Procress 16 part 2) ════════
// Unity's Project window: the folder tree on the left (the Nest), and what is
// IN the picked folder as a grid on the right, with a slider for the tile
// size. On only with the Nest option "Folders open as a grid"
// (S.settings.nestTwoColumn); otherwise a folder row just folds and unfolds,
// as it always has. A folder has no page of its own in the data — this is a
// view of the tree, built from S.moduleTree and the asset list.
//   S.folderPage   the open folder's id (builder ref { kind: 'folder', id })

const FOLDER_TILE = { min: 72, max: 200, def: 112 };

function openFolderPage(id) {
  const m = findModuleNode(id);
  if (!m || m.kind !== 'collector') return;
  S.folderPage = id; S.categoryPage = null;
  S.activeModuleNode = null; S.activeItemNode = null; S.filePreview = null; S.sageHut = null;
  S.moduleCollapsed.delete(id); // the tree shows where you are
  if (typeof builderNavigate === 'function') builderNavigate({ kind: 'folder', id });
  ensureImportDock(); // its files
  renderNexusHome();
}

function folderTileHtml(inner, onclick, ctx, title) {
  return `<div class="folder-tile" onclick="${onclick}"${ctx ? ` oncontextmenu="${ctx}"` : ''} title="${x(title)}">${inner}</div>`;
}

function buildFolderPageHtml() {
  const m = findModuleNode(S.folderPage);
  if (!m) { S.folderPage = null; return builderEmptyPaneHtml(); }
  const size = Number(S.settings.folderTileSize) || FOLDER_TILE.def;
  const kids = (m.children || []).map((c) => folderTileHtml(
    `<span class="folder-tile-icon" style="color:${x(c.icon_color_code || c.color_code || KIND_COLOR[c.kind] || 'var(--accent)')}">${moduleIconHtml(c)}</span>
     <span class="folder-tile-name" data-no-i18n>${x(c.name)}</span><span class="folder-tile-kind">${x(kindLabel(c.kind))}</span>`,
    c.kind === 'collector' ? `openFolderPage(${c.id})` : `openModuleNode(${c.id})`,
    `openModuleContextMenu(event,${c.id})`, c.name));
  const files = nestAssetsOf(m.id).map((f) => folderTileHtml(
    `<span class="folder-tile-icon">${assetClass(f) === 'image' && !f.missing
      ? `<img src="${displayImageUrl(f.id)}" alt="" loading="lazy">` : assetGlyph(f)}</span>
     <span class="folder-tile-name" data-no-i18n>${x(f.file_name)}</span>`,
    `openImportFile(${f.id})`, `openImportFileContextMenu(event,${f.id})`, f.file_name));
  const body = kids.length || files.length
    ? `<div class="folder-grid" style="--tile:${size}px">${kids.join('')}${files.join('')}</div>`
    : `<div class="empty"><p>${t('folderEmpty')}</p></div>`;
  const acts = `<label class="folder-size" title="${x(t('folderTileSize'))}">${I.layer || ''}
      <input type="range" min="${FOLDER_TILE.min}" max="${FOLDER_TILE.max}" value="${size}" aria-label="${x(t('folderTileSize'))}" oninput="setFolderTileSize(this.value)"></label>
    ${hasLocate() && S.nexus?.locate_dir ? `<button class="btn btn-g btn-i" onclick="revealInExplorer({moduleId:${m.id}})" title="${t('revealInExplorer')}" aria-label="${t('revealInExplorer')}">${I.folder || ''}</button>` : ''}`;
  return wrapPageView(`${pageHeadHtml({
      addr: { moduleId: m.id }, title: x(m.name), titleText: m.name, icon: moduleIconHtml(m),
      color: m.icon_color_code || m.color_code || KIND_COLOR.collector,
      after: `<span class="kind-chip">${x(kindLabel('collector'))}</span>`, acts,
    })}${body}`);
}

// The slider moves the tiles live (a CSS variable) and remembers the size.
function setFolderTileSize(v) {
  S.settings.folderTileSize = Math.max(FOLDER_TILE.min, Math.min(FOLDER_TILE.max, Number(v) || FOLDER_TILE.def));
  document.querySelectorAll('.folder-grid').forEach((g) => g.style.setProperty('--tile', `${S.settings.folderTileSize}px`));
  clearTimeout(setFolderTileSize._t);
  setFolderTileSize._t = setTimeout(saveUiSettings, 300);
}

// "Show in Explorer" (Procress 16 part 2): a file where it is on disk, or a
// folder's own directory inside the Locate folder.
async function revealInExplorer(target) {
  const r = await api.importdock.reveal(S.nexus.id, target);
  if (!r?.ok) toast(t('assetMissing'), 'warn');
}
