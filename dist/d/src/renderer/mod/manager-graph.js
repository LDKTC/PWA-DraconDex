'use strict';
// ═══ Manager — the Graph view ═════════════════════════════════════════
// Process 8 part 2 replaced Manager's Recent view (the List view re-sorted
// by update_at) with this one. Nodes are the modules the Manager selects
// (v5 Part 4 — a selection, not a subtree, §8.9); edges are entity_relation
// rows joining two `module_<id>` keys — the links a user draws in the
// Exhibitor. The old parent → child "nest" lines are gone with children.
//
// Built on the pre-v5 Connector's board idiom (now mod/exhibitor-graph.js) (absolutely-positioned nodes over
// one SVG edge layer, right-drag pan, wheel zoom) rather than sage.js's
// force graph: buildSageGraph's animation loop is hard-coded to
// `#sage-graph-wrap`, an element that no longer exists anywhere, so its
// layout silently never runs outside the page that once owned it.

const managerZoom = {}; // moduleId -> scale, session-sticky like connectorZoom

const MGR_W = 1600, MGR_H = 1100;

// The Manager's selection as nodes (v5 Part 4 — no subtree any more, §8.9),
// laid out in rows of MGR_ROW so the seeded layout reads as a grid before
// anything is dragged; edges are the relations whose BOTH ends are selected
// (a line to a module not on this board would be a line to nowhere).
const MGR_ROW = 6;
function managerGraphModel(d = S.managerData) {
  const rows = d?.rows || [];
  const nodes = rows.map((r, i) => ({ id: r.id, name: r.name, kind: r.ownKind, color: r.color, depth: Math.floor(i / MGR_ROW) }));
  const ids = new Set(nodes.map(n => n.id));
  const edges = [];
  for (const r of (d?.relations || [])) {
    const from = String(r.from_key || ''), to = String(r.to_key || '');
    if (!from.startsWith('module_') || !to.startsWith('module_')) continue;
    const a = Number(from.slice(7)), b = Number(to.slice(7));
    if (!ids.has(a) || !ids.has(b)) continue;
    edges.push({ from: a, to: b, nest: false, label: r.label || '' });
  }
  return { nodes, edges };
}

function renderManagerGraphHtml(d) {
  const model = managerGraphModel(d);
  const rel = model.edges.filter(e => !e.nest).length;
  return `<div class="cn-wrap">
    <div data-r="mgr-board" class="nar-board cn-board">
      <div data-r="mgr-graph"><svg data-r="mgr-edges"></svg></div>
    </div>
    <div class="chint" data-no-i18n>${t('connectorPanHint')}</div>
    <div class="czoom" data-no-i18n>
      <button class="btn btn-g btn-i" onclick="managerZoomBy(-0.15)">−</button>
      <span data-r="mgr-zoom-label">100%</span>
      <button class="btn btn-g btn-i" onclick="managerZoomBy(0.15)">＋</button>
      <span class="cn-count">${model.nodes.length} ${t('majorModules')} · ${rel} ${t('moduleLink')}</span>
    </div>
  </div>`;
}

function mountManagerGraph() {
  const d = S.managerData;
  if (!d || d.view !== 'graph') return;
  const board = pbQ('[data-r=mgr-board]'), graphEl = pbQ('[data-r=mgr-graph]'), svg = pbQ('[data-r=mgr-edges]');
  if (!board || !graphEl || !svg) return;

  const { nodes, edges } = managerGraphModel(d);
  graphEl.style.width = `${MGR_W}px`;
  graphEl.style.height = `${MGR_H}px`;
  const cx = MGR_W / 2, cy = MGR_H / 2;
  // Positions persist on S.managerData so a re-render (expanding a row,
  // switching away and back) doesn't reshuffle a layout the user arranged.
  const pos = (d.nodePos = d.nodePos || {});
  // Layered, not concentric: depth is a row and siblings spread along it, so
  // the nest reads as the tree it is. Concentric rings put depth 2 some 500px
  // off centre — outside the board's viewport before the user has panned.
  const ROW_H = 150, COL_W = 200;
  const byDepth = new Map();
  for (const n of nodes) byDepth.set(n.depth, (byDepth.get(n.depth) || 0) + 1);
  const maxDepth = Math.max(0, ...nodes.map(n => n.depth));
  const seen = new Map();
  nodes.forEach((n) => {
    if (pos[n.id]) return;
    const i = seen.get(n.depth) || 0;
    seen.set(n.depth, i + 1);
    const count = byDepth.get(n.depth) || 1;
    pos[n.id] = {
      x: cx + (i - (count - 1) / 2) * COL_W,
      y: cy + (n.depth - maxDepth / 2) * ROW_H,
    };
  });

  const NW = 52;
  const drawEdges = () => {
    let html = '';
    for (const e of edges) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
        stroke="${e.nest ? 'var(--t3)' : 'var(--accent)'}" stroke-width="${e.nest ? 1.2 : 1.8}"
        ${e.nest ? 'stroke-dasharray="5 4"' : ''} opacity="0.8"></line>`;
      if (e.label) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        html += `<foreignObject x="${mx - 70}" y="${my - 11}" width="140" height="22">
          <div class="cn-edge-label" xmlns="http://www.w3.org/1999/xhtml">${x(e.label)}</div></foreignObject>`;
      }
    }
    svg.setAttribute('viewBox', `0 0 ${MGR_W} ${MGR_H}`);
    svg.setAttribute('width', MGR_W);
    svg.setAttribute('height', MGR_H);
    svg.innerHTML = html;
  };
  drawEdges();

  graphEl.querySelectorAll('.cn-node').forEach(el => el.remove());
  for (const n of nodes) {
    const p = pos[n.id];
    const el = document.createElement('div');
    el.className = 'cn-node';
    el.style.left = `${p.x - NW / 2}px`;
    el.style.top = `${p.y - NW / 2}px`;
    el.innerHTML = `<span class="cn-circle" style="border-color:${x(n.color || 'var(--accent)')}">${I[KIND_ICON[n.kind]] || I.layer}</span>
      <span class="cn-name" data-no-i18n>${x(n.name)}</span>`;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      const zoom = managerZoom[d.moduleId] || 1;
      const sx = ev.clientX, sy = ev.clientY, ox = p.x, oy = p.y;
      let moved = false;
      const mv = (e2) => {
        const dx = (e2.clientX - sx) / zoom, dy = (e2.clientY - sy) / zoom;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        p.x = ox + dx; p.y = oy + dy;
        el.style.left = `${p.x - NW / 2}px`;
        el.style.top = `${p.y - NW / 2}px`;
        drawEdges();
      };
      const up = () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        // A drag must not also open the module — same 3px slop Connector uses.
        if (!moved) openModuleNode(n.id);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
    graphEl.appendChild(el);
  }

  applyManagerZoom();
  canvasEngage(board);
  bindCanvasCtx(board, 'manager.graph');
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
    if (!canvasWheelTakes(board, e2)) return; // the page scrolls past it (§12.3)
    e2.preventDefault();
    managerZoomBy(e2.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });
  board.scrollLeft = cx - board.clientWidth / 2;
  board.scrollTop = cy - board.clientHeight / 2;
}

function applyManagerZoom() {
  const d = S.managerData;
  if (!d) return;
  const z = managerZoom[d.moduleId] || 1;
  const graphEl = pbQ('[data-r=mgr-graph]');
  if (graphEl) {
    graphEl.style.transform = `scale(${z})`;
    graphEl.style.transformOrigin = '0 0';
  }
  const lbl = pbQ('[data-r=mgr-zoom-label]');
  if (lbl) lbl.textContent = `${Math.round(z * 100)}%`;
}

function managerZoomBy(dz) {
  const d = S.managerData;
  if (!d) return;
  managerZoom[d.moduleId] = Math.min(2.5, Math.max(0.3, (managerZoom[d.moduleId] || 1) + dz));
  applyManagerZoom();
}
