'use strict';
// ═══ Dropping files on a page (Procress 14, APP docs/MEDIA-EMBED.md M7) ═
// Files dragged from the OS onto a page are imported the usual way (filed
// under the page's module, hashed and proxied by the next sweep) and each
// becomes the block that shows it, where it was dropped: a picture → an
// image block, a video, a sound, a PDF, a 3D model → theirs. preload.js
// turns each File into its path (webUtils), so the page never names one.
// A block being dragged (arrange.js) carries no Files and is left alone.

const PB_DROP_BLOCK = {
  image: (id) => ({ type: 'image', sourceKey: `file_${id}` }),
  video: (id) => ({ type: 'component', component: 'core.video', config: { opts: { file: `file_${id}` } } }),
  audio: (id) => ({ type: 'component', component: 'core.audio', config: { opts: { files: [`file_${id}`] } } }),
  pdf: (id) => ({ type: 'component', component: 'core.pdf', config: { opts: { file: `file_${id}` } } }),
  model: (id) => ({ type: 'component', component: 'core.model3d', config: { opts: { file: `file_${id}` } } }),
};
const pbHasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

document.addEventListener('dragover', (e) => {
  const zone = e.target.closest?.('#main-inner .page-blocks');
  if (!zone || !pbHasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  zone.classList.add('pb-file-over');
});
document.addEventListener('dragleave', (e) => {
  const zone = e.target.closest?.('#main-inner .page-blocks');
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('pb-file-over');
});
document.addEventListener('drop', async (e) => {
  const zone = e.target.closest?.('#main-inner .page-blocks');
  if (!zone || !pbHasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  zone.classList.remove('pb-file-over');
  const [moduleId, itemKeyRaw] = String(zone.dataset.page || '').split('|');
  const mid = Number(moduleId);
  const itemKey = itemKeyRaw || null;
  if (!mid || !S.nexus) return;
  const r = await api.importdock.dropFiles(S.nexus.id, e.dataTransfer.files, mid);
  const ids = r?.ids || [];
  if (!ids.length) { toast(t('pbDropNothing'), 'warn'); return; }
  // where: before the block under the pointer, at the top level
  const page = pageOf(mid, itemKey);
  const over = e.target.closest('.pblock[data-block]');
  const target = over && page?.blocks.find((b) => b.id === Number(over.dataset.block) && b.parent_id == null);
  let at = Number.isInteger(target?.block_order) ? target.block_order : null;
  let made = 0;
  for (const id of ids) {
    const f = await api.importdock.get(id);
    const cls = f?.file_type === 'pdf' ? 'pdf' : pbFileClass(f?.file_type);
    const spec = PB_DROP_BLOCK[cls]?.(id);
    if (!spec) continue;
    await api.block.add(mid, pbLayoutKey(mid, itemKey), { ...spec, ...(at != null ? { at: at++ } : {}) });
    made++;
  }
  if (typeof reloadNestAssets === 'function') reloadNestAssets();
  await reloadModulePage(mid, itemKey);
  toast(`${t('pbDropped')} · ${made}`, 'ok');
});
