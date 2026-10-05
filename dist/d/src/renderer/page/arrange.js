'use strict';
// ═══ Arrange page (v5 Part 8, APP docs/V5.md §12.5) ═════════════════════
// Data is always editable in place; LAYOUT is not. Adding, dragging and
// removing blocks needs "Arrange page" on the page's head first, so a click
// meant for a field never drags a component somewhere else. Arranging is
// per page and per session (a Set of page keys), not stored.

// Procress 16 part 3b: the size the page is arranged at — PC · Tablet ·
// Phone, or a width of the user's own. Per session, every page. The three
// breakpoints are css/page.css's container queries, which the exported
// site carries too (hub/html-export.js copies the app's rules).
const PB_FRAMES = { pc: 1280, tablet: 768, phone: 390 };
const PB_FRAME_KEY = { pc: 'pbFramePc', tablet: 'pbFrameTablet', phone: 'pbFramePhone' };
const pbFramePx = () => (typeof S.pageFrame === 'number' ? S.pageFrame : PB_FRAMES[S.pageFrame] || PB_FRAMES.pc);
const pbFrameKey = () => { const px = pbFramePx(); return px <= 560 ? 'phone' : px <= 1023 ? 'tablet' : 'pc'; };
function setPageFrame(f) {
  S.pageFrame = typeof f === 'number' ? Math.min(2560, Math.max(320, f)) : (PB_FRAMES[f] ? f : 'pc');
  closePbStyle();
  renderNexusHome();
}
function pbFrameSwitchHtml() {
  const cur = typeof S.pageFrame === 'number' ? null : (S.pageFrame || 'pc');
  const one = (f) => `<button class="btn${cur === f ? ' on' : ''}" aria-pressed="${cur === f}" onclick="setPageFrame('${f}')" title="${PB_FRAMES[f]} px">${t(PB_FRAME_KEY[f])}</button>`;
  return `<span class="pb-seg pb-frames" role="group" aria-label="${x(t('pbPageSize'))}">${Object.keys(PB_FRAMES).map(one).join('')}
    <input type="number" class="pb-frame-px" min="320" max="2560" step="10" value="${cur ? '' : S.pageFrame}" placeholder="px"
      title="${x(t('pbFrameCustom'))}" aria-label="${x(t('pbFrameCustom'))}" onchange="setPageFrame(Number(this.value) || 'pc')"></span>`;
}

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
  let cols = '';
  if (b.block_type === 'columns') {
    const opts = pbColPresetsFor(c.config);
    const cur = pbColCurrent(c.config);
    cols = `<select class="pb-preset" onchange="pbColsSet(${xj(c.iid)},'widths',this.value)" title="${x(t(PB_FRAME_KEY[pbFrameKey()]))}">
      ${opts.some((o) => o.v === cur) ? '' : `<option selected data-no-i18n>${pbColLabel(cur.split(',').map(Number))}</option>`}
      ${opts.map((o) => `<option value="${o.v}"${o.v === cur ? ' selected' : ''}>${x(o.label)}</option>`).join('')}</select>`;
  }
  return `<div class="pb-bar" draggable="false">
    <span class="pb-grip" title="${t('pbDrag')}">⠿</span>
    <button class="btn btn-g btn-i pb-gear${_pbPop?.iid === c.iid ? ' active' : ''}" onclick="openPbStyle(${xj(c.iid)})" title="${t('pbBlockSettings')}" aria-label="${t('pbBlockSettings')}">${I.settings}</button>
    <span class="pb-name">${x(name)}${src}</span>
    ${preset}${cols}
    <button class="btn btn-g btn-i" onclick="pbRemoveBlock(${xj(c.iid)})" title="${t('delete')}">${I.delete}</button>
  </div>`;
}
const PB_TYPE_KEY = { text: 'pbText', heading: 'pbHeading', divider: 'pbDivider', image: 'pbImage', columns: 'pbColumns', property: 'pbProperty' };

// "Add block": the component collection as a popup (page/collection.js) —
// into this column's slot, or at the end of the page. A card dragged out of
// the left panel drops here too.
function pbAddBarHtml(page, where) {
  const arg = where ? `{parentId:${where.parentId},col:${where.col}}` : '{}';
  return `<button class="btn btn-s btn-sm pb-add" onclick="openPbcPopup(${arg})"
    ondragover="if(_pbNew){event.preventDefault();this.classList.add('drop-in')}" ondragleave="this.classList.remove('drop-in')"
    ondrop="if(_pbNew){event.preventDefault();event.stopPropagation();const k=_pbNew;_pbNew=null;pbcInsert(k,${arg})}">${I.plus} ${t('pbAddBlock')}</button>`;
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

// Procress 16 part 3b: drag the border between column i and i+1. The pair
// trades width and the rest stay put; it snaps to the 12 slots, or with Alt
// held moves freely (tenths of a slot). Drawn live, saved on release.
function pbColGrip(ev, iid, i) {
  ev.preventDefault();
  const grid = ev.target.closest('.pb-cols');
  const b = pbBlockOf(iid);
  if (!grid || !b || !grid.isConnected) return;
  const fk = pbFrameKey();
  const w = (pbColWidths(b.config, fk, true) || []).slice();
  if (w.length < 2) return;
  const pair = w[i] + w[i + 1];
  const left = w.slice(0, i).reduce((a, v) => a + v, 0);
  const box = grid.getBoundingClientRect();
  const draw = () => grid.style.setProperty(`--w-${fk}`, pbColTpl(w));
  const move = (e) => {
    let at = ((e.clientX - box.left) / box.width) * 12 - left;
    if (!Number.isFinite(at)) return;
    at = e.altKey ? Math.round(at * 10) / 10 : Math.round(at);
    const min = e.altKey ? 0.5 : 1;
    w[i] = Math.min(pair - min, Math.max(min, at));
    w[i + 1] = Math.round((pair - w[i]) * 10) / 10;
    draw();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    pbColsSet(iid, 'widths', w.join(','));
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

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
  if (_pbDrag == null && !_pbNew) return;
  ev.preventDefault(); ev.stopPropagation();
  const r = el.getBoundingClientRect();
  // Procress 16 part 3b: the outer fifth of either side = "beside" (a new row)
  const edge = Math.min(80, r.width / 5);
  const side = ev.clientX < r.left + edge ? 'left' : ev.clientX > r.right - edge ? 'right' : null;
  const after = !side && ev.clientY > r.top + r.height / 2;
  el.classList.toggle('drop-left', side === 'left');
  el.classList.toggle('drop-right', side === 'right');
  el.classList.toggle('drop-after', after);
  el.classList.toggle('drop-before', !side && !after);
}
async function pbDrop(ev, targetId) {
  if (_pbDrag == null && !_pbNew) return;
  ev.preventDefault(); ev.stopPropagation();
  const el = ev.currentTarget;
  const after = el.classList.contains('drop-after');
  const side = el.classList.contains('drop-left') ? 'left' : el.classList.contains('drop-right') ? 'right' : null;
  el.classList.remove('drop-before', 'drop-after', 'drop-left', 'drop-right');
  if (_pbNew) { // a card from the component collection (page/collection.js)
    const key = _pbNew;
    _pbNew = null;
    await pbcInsert(key, { targetId, pos: side || (after ? 'after' : 'before') });
    return;
  }
  const moving = _pbDrag;
  _pbDrag = null;
  if (moving === targetId) return;
  const i = pbInst(el.dataset.iid);
  const page = i && pageOf(i.moduleId, i.itemKey);
  if (!page) return;
  // never into itself (a container dropped beside one of its own children),
  // and never deeper than PB_MAX_DEPTH levels with everything it holds
  const byId = new Map(page.blocks.map((bb) => [bb.id, bb]));
  for (let p = byId.get(targetId)?.parent_id; p != null; p = byId.get(p)?.parent_id) if (p === moving) return;
  if (side) {
    // the new row is one level more, holding the taller of the two
    const tall = Math.max(pbHeightOf(page, moving), pbHeightOf(page, targetId));
    if (pbDepthOf(page, byId.get(targetId)?.parent_id) + 1 + tall > PB_MAX_DEPTH) { toast(t('pbTooDeep'), 'warn'); return; }
    await api.block.moveBeside(targetId, moving, side);
    await reloadModulePage(page.moduleId, page.itemKey);
    return;
  }
  if (pbDepthOf(page, byId.get(targetId)?.parent_id) + pbHeightOf(page, moving) > PB_MAX_DEPTH) { toast(t('pbTooDeep'), 'warn'); return; }
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

// Procress 16 part 3a: a component whose module is gone — bind it to another
// module of the same kind (the block keeps its place, size and settings).
function pbPickSource(blockId, component) {
  const kind = String(component).split('.')[0];
  const list = flattenModuleTree(S.moduleTree, 0).map((r) => r.m).filter((o) => o.kind === kind);
  openModal(t('pbPickSource'), list.length
    ? `<div class="fg"><select id="pb-src">${list.map((o) => `<option value="${o.id}">${x(o.name)}</option>`).join('')}</select></div>
       <div class="mfoot"><button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
       <button class="btn btn-p" onclick="pbSetSource(${blockId})">${t('pbPickSource')}</button></div>`
    : `<p class="drafter-hint">${t('pbNoMatch')}</p>`);
}
async function pbSetSource(blockId) {
  const id = Number(q('#pb-src')?.value);
  if (!id) return;
  await api.block.update(blockId, { sourceKey: `module_${id}` });
  closeModal();
  const a = S.activeItemNode;
  await reloadModulePage(a ? a.moduleId : S.activeModuleNode?.id, a?.itemKey ?? null);
}
