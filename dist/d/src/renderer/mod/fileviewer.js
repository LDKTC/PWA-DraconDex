'use strict';
// ═══ File viewer page (progress.md Phase 18, v5 Part 1) ═════════════════
// Clicking an asset (Dock row, Nest leaf, [[wikilink]], quick-switch hit)
// opens a read-only viewer page in the builder: image with zoom pills ·
// markdown via mdRender · plain text · <audio>/<video> streamed from
// ddx-file:// with Range support · PDF and URL assets open outside the app
// (CSP forbids embedding either). The Dock tray, the Nest leaves and every
// action that re-files an asset live in mod/importdock.js. Image files linked to an entity
// can be flagged "use as display image" — Manager cards and Classifier
// grids pick those up through the batched displayImages lookup. Editing
// an imported doc (docx -> Drafter conversion) is deferred to Phase 19's
// builder tabs; the viewer says so in its hint line.

// ── Builder file viewer ─────────────────────────────────────────────────
async function openImportFile(id) {
  // Reached from outside the Dock too (router.js openEntityByKey on a
  // file_<id> key), so the list may not be cached yet.
  if (!S.importFiles) await loadImportFiles();
  const f = (S.importFiles || []).find(v => v.id === id);
  if (!f) return;
  const content = await api.importdock.readFile(id);
  S.filePreview = { ...f, content, zoom: 1 };
  S.sageHut = null;
  S.activeModuleNode = null;
  S.activeItemNode = null;
  S.importDockPage = false;
  if (typeof builderNavigate === 'function') builderNavigate({ kind: 'file', id });
  renderNexusHome();
}

const fvBytes = (b) => typeof fmtBytes === 'function' ? fmtBytes(b) : `${b} B`;

function buildFileViewerHtml() {
  const f = S.filePreview;
  const c = f.content || {};
  const src = displayImageUrl(f.id);
  let body;
  if (c.kind === 'image') {
    body = `<div class="fv-imgwrap"><img id="fv-img" src="${src}" onerror="queueDisplayImageFallback(this,${f.id})" style="transform:scale(${f.zoom})" alt=""></div>
      <div class="czoom" data-no-i18n>
        <button class="btn btn-g btn-i" onclick="fileViewerZoom(-0.2)">−</button>
        <span id="fv-zoom-label">${Math.round(f.zoom * 100)}%</span>
        <button class="btn btn-g btn-i" onclick="fileViewerZoom(0.2)">＋</button>
      </div>`;
  } else if (c.kind === 'audio') {
    // preload=metadata + Range (main.js ddx-file://) — seeking never pulls the
    // whole file.
    body = `<div class="fv-media"><audio controls preload="metadata" src="${src}"></audio></div>`;
  } else if (c.kind === 'video') {
    body = `<div class="fv-media"><video controls preload="metadata" src="${src}"></video></div>`;
  } else if (c.kind === 'pdf' || c.kind === 'binary') {
    body = `<div class="empty" style="margin-top:30px"><p>${t('assetNoPreview')}</p>
      <button class="btn btn-p" style="margin-top:10px" onclick="api.importdock.openPath(${f.id})">${t('assetOpenExternal')}</button>
      ${f.file_type === 'docx' ? `<p style="margin-top:14px">${t('importDocxLater')}</p>
      <button class="btn btn-s" style="margin-top:10px" onclick="createDrafterFromFile(${f.id})">${I.plus} ${t('createAsDrafter')}</button>` : ''}</div>`;
  } else if (c.kind === 'url') {
    body = `<div class="empty" style="margin-top:30px"><p class="fv-url" data-no-i18n>${x(c.url || f.file_path)}</p>
      <button class="btn btn-p" style="margin-top:10px" onclick="api.importdock.openUrl(${f.id})">${t('assetOpenLink')}</button></div>`;
  } else if (c.kind === 'missing') {
    // §2.5: the original moved or is gone. The cover proxy (if the sweep made
    // one) still shows, with Relink right there.
    body = `<div class="empty" style="margin-top:30px">
      ${c.hasProxy ? `<div class="fv-imgwrap"><img src="${src}?proxy=1" alt=""></div>` : ''}
      <p>${t('assetMissing')}</p>
      <button class="btn btn-p" style="margin-top:10px" data-cmd="asset.relink" onclick="runCommand('asset.relink',{fileId:${f.id}})">${t('assetRelink')}</button></div>`;
  } else if (c.kind === 'md') {
    body = `<div class="md-preview au-reading">${mdRender(c.text || '', { resolveLink: typeof resolveWikiNameCached === 'function' ? resolveWikiNameCached : null })}</div>`;
  } else if (c.kind === 'txt') {
    body = `<pre class="fv-pre" data-no-i18n>${x(c.text || '')}</pre>`;
  } else {
    body = `<div class="empty" style="margin-top:30px"><p data-no-i18n>${x(c.message || '')}</p></div>`;
  }
  const isImage = c.kind === 'image';
  const linkerChip = f.entity
    ? `<span class="htag lk" data-no-i18n onclick="openEntityByKey(${xj(f.linker_key)})">[[${x(f.entity.name)}]]</span>`
    : `<span class="pv ghost">${t('notLinked')}</span>`;
  return wrapPageView(`${pageHeadHtml({
      title: `<span data-no-i18n>${x(f.file_name)}</span>`, titleText: f.file_name,
      after: '<span class="kind-chip" data-no-i18n>File</span>',
      sub: `<span data-no-i18n>${f.source_kind === 'url' ? x(f.file_path) : fvBytes(f.file_size)}</span>`,
    })}
    <div class="cn-wrap fv-wrap">${body}</div>
    <div class="fv-foot">
      <span class="pk">${t('linkedTo')}</span> ${linkerChip}
      ${isImage && f.linker_key ? `<label class="fv-useimg"><input type="checkbox" ${f.use_as_image ? 'checked' : ''}
        onchange="toggleImportUseAsImage(${f.id}, this.checked)"> ${t('useAsImage')}</label>` : ''}
      <span style="flex:1"></span>
      <button class="btn btn-s" onclick="openImportLinkerModal(${f.id})">${t('changeLinker')}</button>
      <button class="btn btn-d" onclick="deleteImportFileRow(${f.id})">${t('delete')}</button>
    </div>`);
}

function fileViewerZoom(dz) {
  const f = S.filePreview;
  if (!f) return;
  f.zoom = Math.min(4, Math.max(0.2, f.zoom + dz));
  const img = fq('#fv-img');
  if (img) img.style.transform = `scale(${f.zoom})`;
  const lbl = fq('#fv-zoom-label');
  if (lbl) lbl.textContent = `${Math.round(f.zoom * 100)}%`;
}

async function openImportLinkerModal(id) {
  const f = (S.importFiles || []).find(v => v.id === id);
  const ix = await api.wiki.quickIndex(S.nexus.id);
  openModal(t('changeLinker'), `
    <div class="fg"><label>${t('moduleLink')}</label>
      <select id="il-key">
        <option value="">${t('notLinked')}</option>
        ${ix.map(e2 => `<option value="${x(e2.key)}" ${f?.linker_key === e2.key ? 'selected' : ''}>${x(e2.name)} (${x(e2.type)})</option>`).join('')}
      </select></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitImportLinker(${id})">${t('save')}</button>
    </div>`);
}

async function submitImportLinker(id) {
  const key = q('#il-key').value || null;
  await api.importdock.setLinker(id, key);
  closeModal();
  invalidateDisplayImages();
  await reopenImportFile(id);
  toast(t('saved'), 'ok');
}

async function toggleImportUseAsImage(id, on) {
  await api.importdock.setUseAsImage(id, on);
  invalidateDisplayImages();
  await reopenImportFile(id);
  toast(t('saved'), 'ok');
}

async function reopenImportFile(id) {
  await loadImportFiles();
  await openImportFile(id);
}

// docx → Drafter: creates an empty Drafter module named after the file and
// links the file to it (content stays in the source file — no docx parsing).
async function createDrafterFromFile(id) {
  const f = (S.importFiles || []).find(v => v.id === id);
  if (!f) return;
  const name = f.file_name.replace(/\.[^.]+$/, '');
  const moduleId = await api.module.create({ nexus_ref: S.nexus.id, parent_id: null, name, kind: 'drafter' });
  await api.importdock.setLinker(id, `module_${moduleId}`);
  S.importFiles = undefined;
  await reloadModuleTree();
  await openModuleNode(moduleId);
  toast(t('created'), 'ok');
}

// ── Display-image lookup for cards/grids ────────────────────────────────
// One batched fetch per session (invalidated on linker/image changes);
// returns linker_key -> import_file id. Callers then hydrate <img> tags
// through hydrateDisplayImages().
// Drops both the key->file map and the fallback data-URL cache. The
// protocol path needs no invalidation (the handler's ETag covers it), but
// the fallback Map would otherwise go stale exactly like the old one did.
function invalidateDisplayImages() {
  S.displayImageCache = null;
  S.displayImageData = null;
}

async function getDisplayImageMap() {
  if (S.displayImageCache) return S.displayImageCache;
  if (!S.nexus) return new Map();
  const rows = await api.importdock.displayImages(S.nexus.id);
  S.displayImageCache = new Map(rows.map(r => [r.linker_key, r.id]));
  return S.displayImageCache;
}

// Fills every <img data-display-key="..."> in the current DOM with its
// entity's display image (if one is flagged).
//
// Plan part2 #2.2: this used to await one importdock:readFile per image,
// sequentially, and stash the base64 data URL in an S.displayImageData Map
// that was never invalidated (so a file replaced on disk stayed stale for
// the whole session and the blobs accumulated). Now each <img> just points
// at ddx-file://<fileId> — no IPC at all, the bytes never cross the bridge,
// and Chromium caches/revalidates them via the handler's ETag.
//
// The onerror hook is the fallback for renderers where that protocol isn't
// registered — notably the Playwright web-driver harness, which loads
// index.html over plain file:// with no Electron main process behind it.
// There it degrades to ONE batched importdock:readFiles for the whole page.
async function hydrateDisplayImages() {
  const imgs = [...document.querySelectorAll('img[data-display-key]')];
  if (!imgs.length) return;
  const map = await getDisplayImageMap();
  for (const img of imgs) {
    const fileId = map.get(img.dataset.displayKey);
    if (!fileId) { img.closest('.card-thumb, .disp-thumb')?.classList.add('disp-empty'); continue; }
    img.onerror = () => queueDisplayImageFallback(img, fileId);
    img.src = displayImageUrl(fileId);
    img.closest('.disp-thumb')?.classList.remove('disp-empty');
  }
}

// The vault id is part of the URL because the protocol handler in main.js is
// not an IPC handler — it receives a bare Request with no calling window, so
// it cannot infer which vault's import_file to look the id up in (v4.9.0, one
// .ddx per Nexus). See registerDisplayImageProtocol.
const displayImageUrl = (fileId) => `ddx-file://${S.nexus?.id ?? 0}-${fileId}`;

// Collects every <img> that failed to load in this tick and resolves them
// with a single readFiles round-trip. S.displayImageData only ever holds
// fallback-path data URLs, and is dropped whenever the key->file map is.
let _dispFallbackQueue = null;
function queueDisplayImageFallback(img, fileId) {
  img.onerror = null; // a failed data URL must not re-queue forever
  S.displayImageData = S.displayImageData || new Map();
  const cached = S.displayImageData.get(fileId);
  if (cached !== undefined) {
    if (cached) img.src = cached; else img.closest('.card-thumb, .disp-thumb')?.classList.add('disp-empty');
    return;
  }
  if (!_dispFallbackQueue) {
    _dispFallbackQueue = [];
    queueMicrotask(flushDisplayImageFallback);
  }
  _dispFallbackQueue.push([img, fileId]);
}

async function flushDisplayImageFallback() {
  const pending = _dispFallbackQueue || [];
  _dispFallbackQueue = null;
  if (!pending.length) return;
  const ids = [...new Set(pending.map(([, id]) => id))];
  const urls = await api.importdock.readFiles(ids);
  for (const id of ids) S.displayImageData.set(id, urls[id] || null);
  for (const [img, id] of pending) {
    const url = urls[id];
    if (url) { img.src = url; img.closest('.disp-thumb')?.classList.remove('disp-empty'); }
    else img.closest('.card-thumb, .disp-thumb')?.classList.add('disp-empty');
  }
}
