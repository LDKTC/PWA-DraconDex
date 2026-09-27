'use strict';
// ═══ Arrange page (v5 Part 8, APP docs/V5.md §12.5) ═════════════════════
// Data is always editable in place; LAYOUT is not. Adding, dragging and
// removing blocks needs "Arrange page" on the page's head first, so a click
// meant for a field never drags a component somewhere else. Arranging is
// per page and per session (a Set of page keys), not stored.

const pbArranging = (page) => !!page && S.arranging.has(pageKey(page.moduleId, page.itemKey));

function togglePageArrange(moduleId = S.activeItemNode?.moduleId ?? S.activeModuleNode?.id, itemKey = pbItemKeyOf(S.activeItemNode)) {
  if (!moduleId) return;
  const k = pageKey(moduleId, itemKey);
  if (S.arranging.has(k)) { S.arranging.delete(k); closePbStyle(); } else S.arranging.add(k);
  renderNexusHome();
}

// The bar on each block while arranging: grip, ⚙ (page/style-pop.js),
// name, preset, remove.
function pbArrangeBarHtml(c) {
  const b = c.block;
  const comp = componentOf(b);
  const name = pbBlockName(b);
  const src = b.source_key && c.source && c.source.id !== c.page.moduleId ? ` <span class="pb-src" data-no-i18n>· ${x(c.source.name)}</span>` : '';
  const presets = comp?.presets ? comp.presets() : [];
  const preset = presets.length > 1 ? `<select class="pb-preset" onchange="pbSetPreset(${xj(c.iid)},this.value)">
      ${presets.map((p) => `<option value="${x(p)}"${(c.config.preset || presets[0]) === p ? ' selected' : ''}>${x(comp.presetLabel ? comp.presetLabel(p) : p)}</option>`).join('')}
    </select>` : '';
  const cols = b.block_type === 'columns' ? `<select class="pb-preset" onchange="pbSetConfig(${xj(c.iid)},{n:Number(this.value)})" data-no-i18n>
      ${[2, 3].map((n) => `<option value="${n}"${(Number(c.config.n) || 2) === n ? ' selected' : ''}>${n} ▥</option>`).join('')}</select>` : '';
  return `<div class="pb-bar" draggable="false">
    <span class="pb-grip" title="${t('pbDrag')}">⠿</span>
    <button class="btn btn-g btn-i pb-gear${_pbPop?.iid === c.iid ? ' active' : ''}" onclick="openPbStyle(${xj(c.iid)})" title="${t('pbBlockSettings')}" aria-label="${t('pbBlockSettings')}">${I.settings}</button>
    <span class="pb-name">${x(name)}${src}</span>
    ${preset}${cols}
    <button class="btn btn-g btn-i" onclick="pbRemoveBlock(${xj(c.iid)})" title="${t('delete')}">${I.delete}</button>
  </div>`;
}
const PB_TYPE_KEY = { text: 'pbText', heading: 'pbHeading', divider: 'pbDivider', image: 'pbImage', columns: 'pbColumns', property: 'pbProperty' };

function pbAddBarHtml(page, where) {
  const arg = where ? `{parentId:${where.parentId},col:${where.col}}` : 'null';
  return `<button class="btn btn-s btn-sm pb-add" onclick="openPbPicker(${page.moduleId},${xv(page.itemKey)},${arg})">${I.plus} ${t('pbAddBlock')}</button>`;
}

// ── add ─────────────────────────────────────────────────────────────────
// The picker: the plain blocks, this page's own components, then another
// module's view (a borrowed component, §12.12).
function openPbPicker(moduleId, itemKey, where) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  const page = pageOf(moduleId, itemKey);
  const have = new Set((page?.blocks || []).map((b) => b.component).filter(Boolean));
  const basic = ['text', 'heading', 'divider', 'image', ...(where ? [] : ['columns'])].map((tp) =>
    `<button class="btn btn-s pb-pick" onclick="pbAddBlock(${moduleId},${xv(itemKey)},${xv({ type: tp, ...(tp === 'columns' ? { config: { n: 2 } } : {}) })},${xv(where)})">${t(PB_TYPE_KEY[tp])}</button>`).join('');
  const own = Object.values(COMPONENTS)
    .filter((c) => (c.kind === 'core' || c.kind === m.kind || (itemKey && c.kind === 'item')) && !(c.once && have.has(c.id)) && !(where && c.container))
    .map((c) => `<button class="btn btn-s pb-pick" onclick="pbAddBlock(${moduleId},${xv(itemKey)},${xv({ type: 'component', component: c.id })},${xv(where)})">${x(componentLabel(c))}</button>`).join('');
  const borrowable = flattenModuleTree(S.moduleTree, 0).map((r) => r.m).filter((o) => o.id !== moduleId && COMPONENTS[`${o.kind}.view`]?.borrow);
  const borrow = borrowable.length ? `<div class="fg"><label>${t('pbBorrow')}</label>
    <select id="pb-borrow"><option value="">—</option>${borrowable.map((o) => `<option value="${o.id}">${x(o.name)} — ${x(kindLabel(o.kind))}</option>`).join('')}</select>
    <button class="btn btn-s btn-sm" onclick="pbAddBorrowed(${moduleId},${xv(itemKey)},${xv(where)})">${t('pbAddBlock')}</button></div>` : '';
  openModal(t('pbAddBlock'), `<div class="pb-picks">${basic}</div><div class="pb-picks">${own}</div>${borrow}`);
}

async function pbAddBlock(moduleId, itemKey, b, where) {
  const spec = { ...b };
  if (where) { spec.parentId = where.parentId; spec.config = { ...(spec.config || {}), col: where.col }; }
  await api.block.add(moduleId, pbLayoutKey(moduleId, itemKey), spec); // page/item-page.js
  closeModal();
  await reloadModulePage(moduleId, itemKey);
}

async function pbAddBorrowed(moduleId, itemKey, where) {
  const src = findModuleNode(Number(q('#pb-borrow')?.value));
  if (!src) return;
  await pbAddBlock(moduleId, itemKey, { type: 'component', component: `${src.kind}.view`, sourceKey: `module_${src.id}` }, where);
}

// ── change ──────────────────────────────────────────────────────────────
async function pbSetConfig(iid, patch) {
  const i = pbInst(iid);
  const b = i && pageOf(i.moduleId, i.itemKey)?.blocks.find((bb) => bb.id === i.blockId);
  if (!b) return;
  b.config = { ...(b.config || {}), ...patch };
  await api.block.update(b.id, { config: b.config });
  renderNexusHome();
}
const pbSetPreset = (iid, preset) => pbSetConfig(iid, { preset });

async function pbRemoveBlock(iid) {
  const i = pbInst(iid);
  if (!i) return;
  const r = await api.block.remove(i.blockId);
  await reloadModulePage(i.moduleId, i.itemKey);
  if (r?.rows) toastAction(t('deleted'), t('scUndo'), async () => { await api.block.restore(r.rows); await reloadModulePage(i.moduleId, i.itemKey); });
}

// ── drag to reorder ─────────────────────────────────────────────────────
// Within the page's order; dropping into another column also moves the
// block there (parent + column).
let _pbDrag = null;
function pbDragStart(ev, blockId) {
  if (!ev.target.closest?.('.pb-bar') && ev.target !== ev.currentTarget) return;
  ev.stopPropagation();
  _pbDrag = blockId;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', `pb:${blockId}`); } catch (_) {}
}
function pbDragOver(ev, el) {
  if (_pbDrag == null) return;
  ev.preventDefault(); ev.stopPropagation();
  const r = el.getBoundingClientRect();
  const after = ev.clientY > r.top + r.height / 2;
  el.classList.toggle('drop-after', after);
  el.classList.toggle('drop-before', !after);
}
async function pbDrop(ev, targetId) {
  if (_pbDrag == null) return;
  ev.preventDefault(); ev.stopPropagation();
  const el = ev.currentTarget;
  const after = el.classList.contains('drop-after');
  el.classList.remove('drop-before', 'drop-after');
  const moving = _pbDrag;
  _pbDrag = null;
  if (moving === targetId) return;
  const i = pbInst(el.dataset.iid);
  const page = i && pageOf(i.moduleId, i.itemKey);
  if (!page) return;
  // never into itself: a container dropped beside one of its own children,
  // or any container into another (one level of nesting, as columns had)
  const byId = new Map(page.blocks.map((bb) => [bb.id, bb]));
  for (let p = byId.get(targetId)?.parent_id; p != null; p = byId.get(p)?.parent_id) if (p === moving) return;
  if (pbIsContainer(byId.get(moving)) && byId.get(targetId)?.parent_id != null) { toast(t('pbNoNesting'), 'warn'); return; }
  const order = page.blocks.map((b) => b.id).filter((id) => id !== moving);
  const target = page.blocks.find((b) => b.id === targetId);
  const mover = page.blocks.find((b) => b.id === moving);
  let to = order.indexOf(targetId) + (after ? 1 : 0);
  if (mover && target && (mover.parent_id ?? null) !== (target.parent_id ?? null)) {
    await api.block.update(moving, { parentId: target.parent_id ?? null, config: { ...(mover.config || {}), col: target.config?.col ?? 0 } });
  } else if (mover && target && target.parent_id != null && (mover.config?.col ?? 0) !== (target.config?.col ?? 0)) {
    await api.block.update(moving, { config: { ...(mover.config || {}), col: target.config?.col ?? 0 } });
  }
  if (to < 0) to = order.length;
  await api.block.move(moving, to);
  await reloadModulePage(page.moduleId, page.itemKey);
}
document.addEventListener('dragend', () => { _pbDrag = null; });
