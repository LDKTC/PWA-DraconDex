'use strict';
// ═══ Graph "Designer" (progress.md Phase 16) ═══════════════════════════
// Free-form diagram builder (mockup docs/mockups/31-designer.png): shape
// palette (box/circle/diamond/text), drag-to-arrange with persisted
// positions, labeled arrow edges via a click-to-connect tool,
// double-click text edit, and module-link nodes (linker_key) that click
// through to their entity. Views: Canvas · Outline · Matrix. Board
// interaction chrome mirrors the Narrator/Connector boards.

const DESIGNER_VIEWS = ['canvas', 'outline', 'matrix'];
const DESIGNER_VIEW_LABEL = { canvas: 'Canvas', outline: 'Outline', matrix: 'Matrix' };
// v5 Part 8 (§12.3): a scoped page component — data per module, view per
// instance, S.designerData = the current instance (page/kind-state.js).
const DSG = kindState({ prop: 'designerData', kind: 'designer', component: 'designer.view', views: DESIGNER_VIEWS });
registerComponent('designer.view', {
  kind: 'designer', label: () => kindLabel('designer'), borrow: true, canvas: true,
  presets: () => DESIGNER_VIEWS, presetLabel: (p) => DESIGNER_VIEW_LABEL[p],
  load: (m) => loadDesignerData(m),
  render: (c) => buildDesignerMainHtml(c.source, c),
  mount: () => mountDesignerBoard(),
});
const DG_W = 2000, DG_H = 1400;
const DG_COLORS = ['#2dd4bf', '#38bdf8', '#facc15', '#f87171', '#a78bfa', '#f8fafc'];
// Process 8 part 2: the shape vocabulary. This list IS the allowlist now —
// design_node.shape used to carry a SQL CHECK naming the first four, which
// made every new shape a table rebuild for every existing vault (see
// migrateDesignNodeShapes in db/schema/migrations.js).
const DG_SHAPES = ['box', 'rounded', 'circle', 'ellipse', 'pill', 'diamond',
  'hexagon', 'parallelogram', 'triangle', 'star', 'cross', 'note', 'text',
  'panel', 'balloon']; // v5 Part 7 (§11.6): comic pages — mod/designer-comic.js
// The four the toolbar keeps as buttons; the rest live behind its "more"
// button, so the palette doesn't grow into a wall of glyphs.
const DG_TOOLBAR_SHAPES = ['box', 'circle', 'diamond', 'text'];
const DG_SHAPE_GLYPH = {
  box: '▭', rounded: '▢', circle: '○', ellipse: '⬭', pill: '⬬', diamond: '◇',
  hexagon: '⬡', parallelogram: '▰', triangle: '△', star: '☆', cross: '✚',
  note: '▤', text: 'T', panel: '▣', balloon: '💬',
};
// Shapes a border cannot draw: rendered as a clipped colour plate with an
// inset surface-coloured copy punched out of it, the generalisation of what
// .dg-diamond already does with a rotated inner box.
const DG_POLY_SHAPES = ['hexagon', 'parallelogram', 'triangle', 'star', 'cross', 'note'];
// Round enough that edge trimming should use the ellipse formula rather than
// the bounding-box ray.
const dgIsRound = (shape) => shape === 'circle' || shape === 'ellipse';

const dgState = { zoom: {}, edgeFrom: null }; // render-only
const DESIGNER_LINK_TYPES = ['note', 'object', 'character', 'chapter', 'project', 'module', 'chat'];

async function loadDesignerData(m) {
  const [nodes, edges, ui] = await Promise.all([
    api.designer.getNodes(m.id),
    api.designer.getEdges(m.id),
    api.module.getUi(m.id),
  ]);
  const pinKeys = nodes.filter(n => n.linker_key).map(n => n.linker_key);
  const ents = pinKeys.length ? await api.wiki.resolveKeys(pinKeys) : [];
  const byKey = new Map(ents.map(e2 => [e2.key, e2]));
  for (const n of nodes) n.entity = n.linker_key ? (byKey.get(n.linker_key) || null) : null;
  DSG.setModule(m.id, { moduleId: m.id, ui, nodes, edges, showOrder: ui.showReadOrder === '1' });
}

async function setDesignerView(view) {
  dgState.edgeFrom = null;
  await DSG.setView(view); // the instance's preset (page/kind-state.js)
}

const dgNodeName = (n) => n.entity ? n.entity.name : (n.node_text || '—');

function buildDesignerMainHtml(m, c) {
  const d = DSG.instance(c);
  if (!d) return `<div class="empty" style="margin-top:40px"><div class="ei">${moduleIconHtml(m)}</div><h3>${x(m.name)}</h3></div>`;
  const viewBar = viewBarHtml(DESIGNER_VIEWS, d.view, v => `setDesignerView('${v}')`, v => DESIGNER_VIEW_LABEL[v], { noI18n: true });
  const toolbar = `<div class="classifier-toolbar">${viewBar}</div>`;
  if (d.view === 'outline') return toolbar + buildDesignerOutlineHtml(d);
  if (d.view === 'matrix') return toolbar + buildDesignerMatrixHtml(d);
  return `${toolbar}
    <div class="cn-wrap">
      ${d.nodes.length ? '' : `<div class="cn-empty">${kindEmptyStateHtml(m)}</div>`}
      <div id="dg-board" class="nar-board sk-board">
        <div id="dg-stage" style="width:${DG_W}px;height:${DG_H}px;position:relative;transform-origin:0 0">
          <svg id="dg-edges" width="${DG_W}" height="${DG_H}" viewBox="0 0 ${DG_W} ${DG_H}"></svg>
        </div>
      </div>
      <div class="sk-tools" data-no-i18n>
        ${DG_TOOLBAR_SHAPES.map(s => `<button class="btn btn-g btn-i" onclick="addDesignNode('${s}')" title="${s}">${DG_SHAPE_GLYPH[s]}</button>`).join('')}
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();openDesignShapePopup(this)" title="${t('moreShapes')}">${I.options}</button>
        <span class="zsep"></span>
        <button class="btn btn-g btn-i${dgState.edgeFrom !== null ? ' act' : ''}" onclick="startDesignEdge()" title="${t('edgeTool')}">↦</button>
        <button class="btn btn-g btn-i" onclick="openDesignPinModal()" title="${t('pinModuleLink')}">🔗</button>
        <button class="btn btn-g btn-i" onclick="openDesignerLinkFilterModal(${m.id})" title="${t('narratorLinkFilter')}">${I.edit}</button>
        <span class="zsep"></span>
        ${cmdBtn('designer.readOrder', { moduleId: m.id }, { iconOnly: true, cls: `btn-g btn-i${d.showOrder ? ' act' : ''}` })}
        ${cmdBtn('designer.renumber', { moduleId: m.id }, { iconOnly: true })}
      </div>
      <div class="chint" data-no-i18n>${t('designerHint')}</div>
      <div class="czoom" data-no-i18n>
        <button class="btn btn-g btn-i" onclick="designerZoomBy(-0.15)">−</button>
        <span id="dg-zoom-label">100%</span>
        <button class="btn btn-g btn-i" onclick="designerZoomBy(0.15)">＋</button>
        <span class="cn-count">${d.nodes.length} nodes · ${d.edges.length} edges</span>
      </div>
    </div>`;
}

// ── Canvas mounting ─────────────────────────────────────────────────────
function mountDesignerBoard() {
  const d = S.designerData;
  if (!d || d.view !== 'canvas') return;
  const board = pbQOr('#dg-board'), stage = pbQOr('#dg-stage'), svg = pbQOr('#dg-edges');
  if (!board || !stage || !svg) return;

  const zoomOf = () => dgState.zoom[d.moduleId] || 1;
  stage.style.transform = `scale(${zoomOf()})`;
  const lbl = pbQOr('#dg-zoom-label');
  if (lbl) lbl.textContent = `${Math.round(zoomOf() * 100)}%`;

  const byId = new Map(d.nodes.map(n => [n.id, n]));
  // Real node-edge trim (Plan part5 Designer #3): find where the line from
  // a's center toward b actually exits a's rendered box/ellipse, instead of
  // a hardcoded guess radius that doesn't track real (text-driven) node
  // size. `el` is looked up by the data-node id set on each node div below.
  const dgBoundaryPoint = (cx, cy, dxv, dyv, el, isCircle) => {
    const hw = (el?.offsetWidth || 110) / 2, hh = (el?.offsetHeight || 40) / 2;
    if (isCircle) {
      const denom = Math.sqrt((dxv * dxv) / (hw * hw) + (dyv * dyv) / (hh * hh)) || 1;
      return { x: cx + dxv / denom, y: cy + dyv / denom };
    }
    // ponytail: rectangle-ray intersection on the real bounding box — for
    // diamond this trims to its bbox, not its true rotated-square outline,
    // so diagonal corners slightly overshoot; acceptable since diamond
    // labels are short/fixed-size, not the long-label overflow this item
    // is actually about.
    const sx = dxv !== 0 ? hw / Math.abs(dxv) : Infinity;
    const sy = dyv !== 0 ? hh / Math.abs(dyv) : Infinity;
    const s = Math.min(sx, sy, 1e6);
    return { x: cx + dxv * s, y: cy + dyv * s };
  };
  const drawEdges = () => {
    let html = `<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t3)"></path></marker></defs>`;
    for (const e2 of d.edges) {
      const a = byId.get(e2.from_ref), b = byId.get(e2.to_ref);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const elA = stage.querySelector(`[data-node="${a.id}"]`);
      const elB = stage.querySelector(`[data-node="${b.id}"]`);
      const pA = dgBoundaryPoint(a.x, a.y, dx, dy, elA, dgIsRound(a.shape));
      const pB = dgBoundaryPoint(b.x, b.y, -dx, -dy, elB, dgIsRound(b.shape));
      const ax = pA.x, ay = pA.y, bx2 = pB.x, by2 = pB.y;
      html += `<line x1="${ax}" y1="${ay}" x2="${bx2}" y2="${by2}" stroke="var(--t3)"
        stroke-width="1.6" marker-end="url(#dg-arrow)" opacity="0.9"></line>`;
      if (e2.label) {
        const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
        html += `<foreignObject x="${mx - 60}" y="${my - 11}" width="120" height="22">
          <div class="cn-edge-label dg-edge-label" xmlns="http://www.w3.org/1999/xhtml" data-edge="${e2.id}">${x(e2.label || '')}</div></foreignObject>`;
      }
    }
    svg.innerHTML = html;
  };
  // edge label double-click -> edit
  svg.addEventListener('dblclick', (ev) => {
    const el = ev.target.closest('.dg-edge-label');
    if (el) openDesignEdgeModal(Number(el.dataset.edge));
  });

  stage.querySelectorAll('.dg-node').forEach(el => el.remove());
  for (const n of d.nodes) {
    const el = document.createElement('div');
    el.className = `dg-node dg-${n.shape}${DG_POLY_SHAPES.includes(n.shape) ? ' dg-poly' : ''}${n.linker_key ? ' dg-pin' : ''}${dgState.edgeFrom === n.id ? ' edge-from' : ''}`;
    el.dataset.node = n.id;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    const col = n.color || DG_COLORS[1];
    const comic = dgComicNodeHtml(n, col);
    if (comic != null) el.innerHTML = comic;
    else if (n.shape === 'diamond') {
      el.innerHTML = `<span class="dg-diamond-box" style="border-color:${x(col)}"></span><span class="dg-label" style="color:${x(col)}" data-no-i18n>${x(dgNodeName(n))}</span>`;
    } else if (DG_POLY_SHAPES.includes(n.shape)) {
      // --dg-col drives the plate; the ::after inset repaints the middle in
      // var(--surface), which is what leaves a 2px outline in the node colour.
      el.innerHTML = `<span class="dg-poly-box" style="--dg-col:${x(col)}"></span><span class="dg-label" style="color:${x(col)}" data-no-i18n>${x(dgNodeName(n))}</span>`;
    } else if (n.linker_key) {
      el.style.borderColor = col;
      el.innerHTML = `<span data-no-i18n>[[${x(dgNodeName(n))}]]</span><small data-no-i18n>${x(n.entity ? n.entity.type : '?')}</small>`;
    } else {
      el.style.borderColor = n.shape === 'text' ? 'transparent' : col;
      el.innerHTML = `<span class="dg-label" style="color:${x(col)}" data-no-i18n>${x(n.node_text || '')}</span>`;
    }
    el.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      openDesignNodeModal(n.id);
    });
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      // edge tool: first click picks the source, second the target
      if (dgState.edgeFrom !== null && dgState.edgeFrom !== n.id) {
        const from = dgState.edgeFrom;
        dgState.edgeFrom = null;
        openDesignEdgeModal(null, from, n.id);
        return;
      }
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      const sx = ev.clientX, sy = ev.clientY, ox = n.x, oy = n.y;
      let moved = false;
      const mv = (e3) => {
        const dx = (e3.clientX - sx) / zoomOf(), dy = (e3.clientY - sy) / zoomOf();
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        n.x = ox + dx; n.y = oy + dy;
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
        drawEdges();
      };
      const up = async () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        if (moved) await api.designer.moveNode(n.id, n.x, n.y);
        else if (dgState.edgeFrom === n.id) { /* stays armed */ }
        else if (n.linker_key && !dgIsComic(n.shape)) openEntityByKey(n.linker_key);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
    stage.appendChild(el);
    if (dgIsComic(n.shape)) dgComicDecorate(el, n, zoomOf, drawEdges);
  }
  drawEdges(); // after node creation — trim math reads real node DOM sizes

  // center viewport on nodes
  if (!board.dataset.scrolled) {
    board.dataset.scrolled = '1';
    if (d.nodes.length) {
      const mx = d.nodes.reduce((a, n) => a + n.x, 0) / d.nodes.length;
      const my = d.nodes.reduce((a, n) => a + n.y, 0) / d.nodes.length;
      board.scrollLeft = Math.max(0, mx * zoomOf() - board.clientWidth / 2);
      board.scrollTop = Math.max(0, my * zoomOf() - board.clientHeight / 2);
    } else {
      board.scrollLeft = DG_W / 2 - board.clientWidth / 2;
      board.scrollTop = DG_H / 2 - board.clientHeight / 2;
    }
  }

  bindCanvasCtx(board, 'designer.canvas');
  board.addEventListener('pointerdown', (e2) => {
    if (e2.button !== 2) return;
    board.classList.add('is-panning');
    const sx = e2.clientX + board.scrollLeft, sy = e2.clientY + board.scrollTop;
    const mv = (e3) => { board.scrollLeft = sx - e3.clientX; board.scrollTop = sy - e3.clientY; };
    const up = () => {
      board.classList.remove('is-panning');
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
  board.addEventListener('wheel', (e2) => {
    e2.preventDefault();
    designerZoomBy(e2.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });
}

function designerZoomBy(dz) {
  const d = S.designerData;
  if (!d) return;
  const z = Math.min(2.5, Math.max(0.3, (dgState.zoom[d.moduleId] || 1) + dz));
  dgState.zoom[d.moduleId] = z;
  const stage = pbQOr('#dg-stage');
  if (stage) stage.style.transform = `scale(${z})`;
  const lbl = pbQOr('#dg-zoom-label');
  if (lbl) lbl.textContent = `${Math.round(z * 100)}%`;
}

// ── Palette actions ─────────────────────────────────────────────────────
function designViewportCenter() {
  const d = S.designerData;
  const board = pbQOr('#dg-board');
  const zoom = dgState.zoom[d.moduleId] || 1;
  return {
    x: board ? (board.scrollLeft + board.clientWidth / 2) / zoom : DG_W / 2,
    y: board ? (board.scrollTop + board.clientHeight / 2) / zoom : DG_H / 2,
  };
}

async function addDesignNode(shape) {
  const d = S.designerData;
  const c = designViewportCenter();
  const jitter = () => (Math.random() - 0.5) * 60;
  const color = DG_COLORS[(d.nodes.length) % (DG_COLORS.length - 1)];
  const id = await api.designer.createNode(d.moduleId, shape, c.x + jitter(), c.y + jitter(), '', color, null);
  await reloadSource(d.moduleId);
  invalidateNestItems(d.moduleId, 1);
  openDesignNodeModal(id);
}

function startDesignEdge() {
  const d = S.designerData;
  dgState.edgeFrom = dgState.edgeFrom === null ? -1 : null; // -1 = armed, no source yet
  if (dgState.edgeFrom === -1 && d.nodes.length) {
    toast(t('narratorPickTarget'));
    // arm on the next node click: first click = source
    dgState.edgeFrom = null;
    dgArmEdgePick();
  } else {
    renderNexusHome();
  }
}

// First node clicked becomes the edge source (the node pointerdown handler
// completes the pair on the second click).
function dgArmEdgePick() {
  const stage = pbQOr('#dg-stage');
  if (!stage) return;
  const once = (ev) => {
    const el = ev.target.closest('.dg-node');
    if (!el) { stage.removeEventListener('pointerdown', once, true); return; }
    const d = S.designerData;
    const n = d.nodes.find(nn => nn.id === Number(el.dataset.node));
    if (n) {
      dgState.edgeFrom = n.id;
      el.classList.add('edge-from');
    }
    stage.removeEventListener('pointerdown', once, true);
  };
  stage.addEventListener('pointerdown', once, true);
}

// ── Node / edge / pin modals ────────────────────────────────────────────
// Extracted (Plan part4) so the node's own dedicated item page
// (src/renderer/mod/item.js) can reuse the exact same fields, scoped by its
// own id prefix instead of the shared '#modal' selector the original inline
// markup used — a container-scoped selector works correctly whether this
// renders inside the modal or the item page (only one of either is ever
// mounted at a time either way).
// The full shape palette, behind the toolbar's "more" button — the same
// popup plumbing chronicler-graph.js's options menu uses, hosting the
// icon-picker's grid markup (iconpicker.js) rather than a bespoke one.
function openDesignShapePopup(anchor) {
  closeAllPopups();
  if (!anchor) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup dg-shape-popup';
  pop.innerHTML = `<div class="insp-label">${t('moreShapes')}</div>
    <div class="ipk-grid">${DG_SHAPES.map(sh =>
      `<div class="ipk-cell" title="${x(sh)}" onclick="pickDesignShape('${sh}')" data-no-i18n>${DG_SHAPE_GLYPH[sh]}</div>`).join('')}</div>`;
  document.body.appendChild(pop);
  pop.addEventListener('click', (ev) => ev.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

function pickDesignShape(shape) {
  closeAllPopups();
  addDesignNode(shape);
}

function buildDesignNodeFieldsHtml(n, opts = {}) {
  const prefix = opts.prefix || 'dn';
  return `
    <div class="fg"><label>${t('content')}</label><input id="${prefix}-text" value="${x(n.node_text || '')}" ${n.linker_key ? 'disabled' : ''}></div>
    <div class="fg"><label>${t('shape')}</label>
      <select id="${prefix}-shape" data-no-i18n ${n.linker_key ? 'disabled' : ''}>${DG_SHAPES.map(s =>
        `<option value="${s}" ${n.shape === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="fg"><label data-no-i18n>Color</label>
      <div class="vw-kindchecks" id="${prefix}-colors">${DG_COLORS.map(c =>
        `<span class="sk-swatch${(n.color || '') === c ? ' act' : ''}" style="background:${c}" onclick="document.querySelectorAll('#${prefix}-colors .sk-swatch').forEach(e=>e.classList.remove('act'));this.classList.add('act')" data-color="${c}"></span>`).join('')}
      </div></div>`;
}

async function openDesignNodeModal(id) {
  const d = S.designerData;
  const n = d.nodes.find(nn => nn.id === id);
  if (!n) return;
  const comic = await dgComicFieldsHtml(n);
  openModal(t('moduleEdit'), `
    ${buildDesignNodeFieldsHtml(n, { prefix: 'dn' })}
    ${comic}
    <div class="mfoot">
      <button class="btn btn-d" onclick="deleteDesignNodeRow(${n.id})">${t('delete')}</button>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitDesignNode(${n.id})">${t('save')}</button>
    </div>`);
  setTimeout(() => pbQOr('#dn-text')?.focus(), 60);
}

async function submitDesignNode(id) {
  const d = S.designerData;
  const n = d.nodes.find(nn => nn.id === id);
  if (!n) return;
  const text = pbQOr('#dn-text')?.value ?? n.node_text;
  const shape = pbQOr('#dn-shape')?.value || n.shape;
  const colorEl = document.querySelector('#dn-colors .sk-swatch.act');
  const color = colorEl ? colorEl.dataset.color : n.color;
  await api.designer.updateNode(id, shape, text, color);
  if (dgIsComic(shape)) await dgComicSubmit(id);
  closeModal();
  await reloadSource(d.moduleId);
  invalidateNestItems(d.moduleId);
  toast(t('saved'), 'ok');
}

async function deleteDesignNodeRow(id) {
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  const moduleId = S.designerData.moduleId;
  await api.designer.deleteNode(id);
  closeModal();
  await reloadSource(moduleId);
  invalidateNestItems(moduleId, -1);
  toast(t('deleted'), 'ok');
}

function openDesignEdgeModal(edgeId, fromId = null, toId = null) {
  const d = S.designerData;
  const e2 = edgeId ? d.edges.find(ee => ee.id === edgeId) : null;
  openModal(e2 ? t('moduleEdit') : t('edgeTool'), `
    <div class="fg"><label>${t('edgeLabel')}</label><input id="de-label" value="${x(e2?.label || '')}"></div>
    <div class="mfoot">
      ${e2 ? `<button class="btn btn-d" onclick="deleteDesignEdgeRow(${e2.id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitDesignEdge(${edgeId ?? 'null'},${fromId ?? 'null'},${toId ?? 'null'})">${e2 ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => pbQOr('#de-label').focus(), 60);
}

async function submitDesignEdge(edgeId, fromId, toId) {
  const d = S.designerData;
  const label = pbQOr('#de-label').value.trim();
  if (edgeId) await api.designer.updateEdge(edgeId, label);
  else if (fromId && toId) await api.designer.createEdge(d.moduleId, fromId, toId, label);
  closeModal();
  await reloadSource(d.moduleId);
  toast(edgeId ? t('saved') : t('created'), 'ok');
}

async function deleteDesignEdgeRow(id) {
  await api.designer.deleteEdge(id);
  closeModal();
  await reloadSource(S.designerData.moduleId);
  toast(t('deleted'), 'ok');
}

// Plan part5 Designer #1: type-allowlist filter over the quickIndex picker,
// same module_ui JSON-blob convention as Narrator's narratorLinkFilter.
async function designerLinkFilterTypes(moduleId) {
  const ui = await api.module.getUi(moduleId);
  try {
    const arr = ui.designerLinkFilter ? JSON.parse(ui.designerLinkFilter) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch (_) { return null; }
}

async function openDesignPinModal() {
  const d = S.designerData;
  const [ix, allow] = await Promise.all([api.wiki.quickIndex(S.nexus.id), designerLinkFilterTypes(d.moduleId)]);
  const filtered = allow ? ix.filter(e2 => allow.includes(e2.type)) : ix;
  openModal(t('pinModuleLink'), `
    <div class="fg"><label>${t('moduleLink')}</label>
      <select id="dgp-key">${filtered.map(e2 =>
        `<option value="${x(e2.key)}">${x(e2.name)} (${x(e2.type)})</option>`).join('')}
      </select></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitDesignPin()">${t('create')}</button>
    </div>`);
}

async function openDesignerLinkFilterModal(moduleId) {
  const allow = (await designerLinkFilterTypes(moduleId)) || [];
  const rows = DESIGNER_LINK_TYPES.map(ty => `
    <div class="togglerow" onclick="toggleDesignerLinkFilterType(this)" data-type="${ty}">
      <span class="tg${allow.includes(ty) ? ' on' : ''}"></span><span data-no-i18n>${ty}</span>
    </div>`).join('');
  openModal(t('narratorLinkFilter'), `
    <div id="dg-link-filter-rows">${rows}</div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="saveDesignerLinkFilter(${moduleId})">${t('save')}</button>
    </div>`);
}

function toggleDesignerLinkFilterType(el) {
  el.querySelector('.tg').classList.toggle('on');
}

async function saveDesignerLinkFilter(moduleId) {
  const allow = [...document.querySelectorAll('#dg-link-filter-rows .togglerow')]
    .filter(row => row.querySelector('.tg').classList.contains('on'))
    .map(row => row.dataset.type);
  await api.module.setUi(moduleId, 'designerLinkFilter', JSON.stringify(allow));
  closeModal();
  toast(t('saved'), 'ok');
}

async function submitDesignPin() {
  const d = S.designerData;
  const key = pbQOr('#dgp-key').value;
  if (!key) return;
  const c = designViewportCenter();
  await api.designer.createNode(d.moduleId, 'box', c.x, c.y + 80, '', DG_COLORS[1], key);
  closeModal();
  await reloadSource(d.moduleId);
  toast(t('created'), 'ok');
}

// ── Outline view ────────────────────────────────────────────────────────
function buildDesignerOutlineHtml(d) {
  const byId = new Map(d.nodes.map(n => [n.id, n]));
  const rows = d.nodes.map(n => {
    const out = d.edges.filter(e2 => e2.from_ref === n.id);
    return `<div class="au-outline-sec">
      <div class="au-outline-ch" onclick="setDesignerView('canvas')" data-no-i18n>${DG_SHAPE_GLYPH[n.shape]} ${x(dgNodeName(n))}</div>
      ${out.map(e2 => `<div class="au-outline-h" style="padding-left:18px" data-no-i18n>→ ${x(e2.label || '·')} → ${x(dgNodeName(byId.get(e2.to_ref) || {}))}</div>`).join('')
        || `<div class="au-outline-h ghost" data-no-i18n>—</div>`}
    </div>`;
  }).join('');
  return `<div class="au-outline">${rows || `<div class="empty"><p>${t('nestEmpty')}</p></div>`}</div>`;
}

// ── Matrix view ─────────────────────────────────────────────────────────
function buildDesignerMatrixHtml(d) {
  if (!d.nodes.length) return `<div class="empty" style="margin-top:30px"><p>${t('nestEmpty')}</p></div>`;
  const label = new Map();
  for (const e2 of d.edges) label.set(`${e2.from_ref}-${e2.to_ref}`, e2.label || '·');
  const head = `<tr><th></th>${d.nodes.map(n => `<th data-no-i18n>${x(dgNodeName(n))}</th>`).join('')}</tr>`;
  const rows = d.nodes.map(a => `<tr><th data-no-i18n>${x(dgNodeName(a))}</th>
    ${d.nodes.map(b => {
      const l = a.id === b.id ? '' : label.get(`${a.id}-${b.id}`);
      return `<td data-no-i18n class="${l ? 'dg-mx-hit' : ''}">${x(l || '')}</td>`;
    }).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto"><table class="vw-table dg-matrix">${head}${rows}</table></div>`;
}
