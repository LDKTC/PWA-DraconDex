'use strict';
// ═══ Exhibitor — Graph view (v5 Part 2) ═════════════════════════════════
// The pre-v5 Connector's graph, kept as a view: every filtered item on an
// automatic circle layout, relations solid (arrowed when directed), wiki
// links dashed and read-only (§3.7). Positions here stay per-session on
// purpose — the Scene (mod/exhibitor-scene.js) is where a layout is saved.

const exhibitorGraphZoom = {};
const EXG_NODE = 52; // node circle diameter

function buildExhibitorGraphHtml(d) {
  const edgeCount = exhibitorEdgesAmong(new Set(d.items.map(n => n.key))).length;
  // The pan/zoom pills sit on a non-scrolling wrapper so the board's
  // scroll position (centered on the node circle) can't carry them away.
  return `<div class="cn-wrap">
      <div id="cn-board" class="nar-board cn-board">
        <div id="cn-graph"><svg id="cn-edges"></svg></div>
      </div>
      <div class="chint" data-no-i18n>${t('connectorPanHint')}</div>
      <div class="czoom" data-no-i18n>
        <button class="btn btn-g btn-i" onclick="exhibitorGraphZoomBy(-0.15)">−</button>
        <span id="cn-zoom-label">100%</span>
        <button class="btn btn-g btn-i" onclick="exhibitorGraphZoomBy(0.15)">＋</button>
        <span class="cn-count">${d.items.length} · ${edgeCount}</span>
      </div>
    </div>`;
}

function mountExhibitorGraph() {
  const d = S.exhibitorData;
  if (!d || d.view !== 'graph') return;
  const board = pbQOr('#cn-board'), graphEl = pbQOr('#cn-graph'), svg = pbQOr('#cn-edges');
  if (!board || !graphEl || !svg) return;
  const nodes = d.items;
  const edges = exhibitorEdgesAmong(new Set(nodes.map(n => n.key)));

  const W = 1600, H = 1100;
  graphEl.style.width = `${W}px`;
  graphEl.style.height = `${H}px`;
  // Session-sticky positions per module so re-renders don't reshuffle.
  S.exhibitorGraphPos = S.exhibitorGraphPos || {};
  const posStore = (S.exhibitorGraphPos[d.moduleId] = S.exhibitorGraphPos[d.moduleId] || {});
  const cx = W / 2, cy = H / 2;
  const R = Math.min(240, 90 + nodes.length * 18); // keep the seed circle inside the viewport
  nodes.forEach((n, i) => {
    if (!posStore[n.key]) {
      const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      posStore[n.key] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    }
  });

  const NW = EXG_NODE;
  const drawEdges = () => {
    let html = '';
    for (const e2 of edges) {
      const a = posStore[e2.from], b = posStore[e2.to];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // A directed edge stops at the target circle's rim so the arrow shows.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ex = b.x - ((b.x - a.x) / len) * (NW / 2 + 2), ey = b.y - ((b.y - a.y) / len) * (NW / 2 + 2);
      html += `<line x1="${a.x}" y1="${a.y}" x2="${e2.directed ? ex : b.x}" y2="${e2.directed ? ey : b.y}"
        stroke="${e2.wiki ? 'var(--t3)' : x(e2.color || 'var(--accent)')}" stroke-width="1.5"
        ${e2.wiki ? 'stroke-dasharray="5 4"' : ''} ${e2.directed ? 'marker-end="url(#exg-arrow)"' : ''} opacity="0.8"></line>`;
      const text = [e2.label, e2.relType && `(${e2.relType})`].filter(Boolean).join(' ');
      if (text) html += `<foreignObject x="${mx - 70}" y="${my - 11}" width="140" height="22">
        <div class="cn-edge-label" xmlns="http://www.w3.org/1999/xhtml">${x(text)}</div></foreignObject>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.innerHTML = `<defs><marker id="exg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"></path></marker></defs>${html}`;
  };
  drawEdges();

  graphEl.querySelectorAll('.cn-node').forEach(el => el.remove());
  for (const n of nodes) {
    const p = posStore[n.key];
    const el = document.createElement('div');
    el.className = 'cn-node';
    el.style.left = `${p.x - NW / 2}px`;
    el.style.top = `${p.y - NW / 2}px`;
    el.innerHTML = `<span class="cn-circle" style="border-color:${x(n.color || 'var(--accent)')}">${(n.kind === 'file' ? I.import : I.manager) || ''}</span>
      <span class="cn-name" data-no-i18n>${x(n.name)}</span>`;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      const zoom = exhibitorGraphZoom[d.moduleId] || 1;
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
        if (!moved) openViewerItem(n.key, n.moduleId);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
    graphEl.appendChild(el);
  }

  // Right-drag pan + wheel zoom (same chrome as the narrator board).
  const applyZoom = () => {
    const z = exhibitorGraphZoom[d.moduleId] || 1;
    graphEl.style.transform = `scale(${z})`;
    graphEl.style.transformOrigin = '0 0';
    const lbl = pbQOr('#cn-zoom-label');
    if (lbl) lbl.textContent = `${Math.round(z * 100)}%`;
  };
  applyZoom();
  bindCanvasCtx(board, 'exhibitor.graph');
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
    exhibitorGraphZoomBy(e2.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });
  // Center the initial scroll on the circle.
  board.scrollLeft = cx - board.clientWidth / 2;
  board.scrollTop = cy - board.clientHeight / 2;
}

function exhibitorGraphZoomBy(dz) {
  const d = S.exhibitorData;
  if (!d) return;
  const z = Math.min(2.5, Math.max(0.3, (exhibitorGraphZoom[d.moduleId] || 1) + dz));
  exhibitorGraphZoom[d.moduleId] = z;
  const graphEl = pbQOr('#cn-graph');
  if (graphEl) {
    graphEl.style.transform = `scale(${z})`;
    graphEl.style.transformOrigin = '0 0';
  }
  const lbl = pbQOr('#cn-zoom-label');
  if (lbl) lbl.textContent = `${Math.round(z * 100)}%`;
}
