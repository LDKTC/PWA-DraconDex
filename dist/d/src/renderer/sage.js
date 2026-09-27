// sage.js — buildSageGraph, a dependency-free vanilla-SVG force graph
// renderer (Plan part2 #2: the legacy nav-rail Sage page that used to live
// in this file was removed — its analytics reused the Hub's own Sage Hut
// section, and this file's own page never had any nexus/vault scoping at
// all). Kept alive for Classifier's relation graph (mod/classifier.js),
// which lazy-loads this file for this one function.

// opts (all optional):
//   container   — the wrap element, or its selector ('#sage-graph-wrap')
//   colors      — module → fill color map (caller must always pass this now
//                 that the old default module→color map was removed with
//                 the legacy Sage page — every caller does)
//   onNodeClick — fn(node) fired on a click that wasn't a drag
//   onNodeContext — fn(node, event) on right-click (v5 Part 3 context menus)
// Edges flagged {wiki:true} render dashed in the accent color. A node may
// set its own {fill} to override its module's group color (Classifier's
// relation view does this for per-object coloring).
function buildSageGraph(data, hiddenModules, opts = {}) {
  const moduleColors = opts.colors || {};
  // An element (a page block's own slot, v5 Part 8) or a selector.
  const wrap = opts.container instanceof Element ? opts.container : q(opts.container || '#sage-graph-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const W = wrap.clientWidth || 800, H = wrap.clientHeight || 500;

  // Degree (connection count) drives node radius, Obsidian-style.
  const degree = new Map();
  data.edges.forEach(e => {
    degree.set(e.source, (degree.get(e.source)||0)+1);
    degree.set(e.target, (degree.get(e.target)||0)+1);
  });
  const neighbors = new Map(); // nodeId -> Set(nodeId) via edge
  data.edges.forEach(e => {
    (neighbors.get(e.source) || neighbors.set(e.source, new Set()).get(e.source)).add(e.target);
    (neighbors.get(e.target) || neighbors.set(e.target, new Set()).get(e.target)).add(e.source);
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%');
  svg.setAttribute('height','100%');
  svg.style.cssText = 'position:absolute;inset:0;background:var(--bg);cursor:grab';
  wrap.appendChild(svg);

  const viewport = document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(viewport);
  const gLinks = document.createElementNS('http://www.w3.org/2000/svg','g');
  const gNodes = document.createElementNS('http://www.w3.org/2000/svg','g');
  viewport.appendChild(gLinks); viewport.appendChild(gNodes);

  const nodes = data.nodes.map(n => ({
    ...n,
    r: Math.min(28, 8 + Math.sqrt(degree.get(n.id)||0)*4),
    x: W/2 + (Math.random()-.5)*300, y: H/2 + (Math.random()-.5)*300,
  }));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  const lines = data.edges.map(e => {
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('stroke', e.wiki ? 'var(--accent)' : 'var(--border)');
    line.setAttribute('stroke-width','1.25');
    if (e.wiki) { line.setAttribute('stroke-dasharray','4 3'); line.setAttribute('stroke-opacity','.8'); }
    gLinks.appendChild(line);
    return { el:line, source:e.source, target:e.target, wiki:e.wiki };
  });

  // ── pan & zoom ──────────────────────────────────────────
  let view = { scale: 1, tx: 0, ty: 0 };
  function applyView() {
    viewport.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.scale})`);
  }
  let panning = false, panStartX=0, panStartY=0, panOrigTx=0, panOrigTy=0;
  svg.addEventListener('mousedown', ev => {
    if (ev.target !== svg) return; // node drags handle their own mousedown
    panning = true; panStartX = ev.clientX; panStartY = ev.clientY;
    panOrigTx = view.tx; panOrigTy = view.ty;
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', ev => {
    if (!panning) return;
    view.tx = panOrigTx + (ev.clientX - panStartX);
    view.ty = panOrigTy + (ev.clientY - panStartY);
    applyView();
  });
  window.addEventListener('mouseup', () => { panning = false; svg.style.cursor = 'grab'; });
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.12 : 1/1.12;
    const newScale = Math.max(0.2, Math.min(4, view.scale * factor));
    view.tx = mx - (mx - view.tx) * (newScale/view.scale);
    view.ty = my - (my - view.ty) * (newScale/view.scale);
    view.scale = newScale;
    applyView();
  }, { passive:false });

  // ── nodes ───────────────────────────────────────────────
  const circles = nodes.map(n => {
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.style.cursor = 'grab';
    g.dataset.id = n.id;
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('r', n.r);
    c.setAttribute('fill', n.fill || moduleColors[n.module]||'var(--raised)');
    c.setAttribute('stroke','var(--bg)'); c.setAttribute('stroke-width','2');
    const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('text-anchor','middle'); txt.setAttribute('y', n.r + 12);
    txt.setAttribute('fill','var(--t2)'); txt.setAttribute('font-size','10'); txt.setAttribute('pointer-events','none');
    // Labels are hidden by default and only revealed for the hovered node and
    // its neighbors (see highlightNode) — with every label always drawn they
    // overlapped and collided into an unreadable mess.
    txt.style.opacity = '0';
    txt.style.transition = 'opacity .12s';
    txt.textContent = n.label.length > 14 ? n.label.slice(0,13)+'…' : n.label;
    g.appendChild(c); g.appendChild(txt);
    gNodes.appendChild(g);

    let dragging = false, dx=0, dy=0, moved=false;
    g.addEventListener('mousedown', ev => {
      dragging = true; moved = false;
      dx = (ev.clientX - svg.getBoundingClientRect().left - view.tx)/view.scale - n.x;
      dy = (ev.clientY - svg.getBoundingClientRect().top - view.ty)/view.scale - n.y;
      g.style.cursor = 'grabbing'; ev.stopPropagation(); ev.preventDefault();
    });
    window.addEventListener('mousemove', ev => {
      if (!dragging) return;
      moved = true;
      n.x = (ev.clientX - svg.getBoundingClientRect().left - view.tx)/view.scale - dx;
      n.y = (ev.clientY - svg.getBoundingClientRect().top - view.ty)/view.scale - dy;
      updatePositions();
    });
    window.addEventListener('mouseup', () => { dragging = false; g.style.cursor = 'grab'; });
    g.addEventListener('mouseenter', () => highlightNode(n.id));
    g.addEventListener('mouseleave', () => highlightNode(null));
    if (opts.onNodeClick) g.addEventListener('click', () => { if (!moved) opts.onNodeClick(n); });
    if (opts.onNodeContext) g.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); opts.onNodeContext(n, e); });
    return { el:g, circle:c, text:txt, node:n };
  });

  function highlightNode(id) {
    if (id == null) {
      circles.forEach(({el, text}) => { el.style.opacity = ''; text.style.opacity = '0'; });
      lines.forEach(({el, wiki}) => { el.style.opacity = ''; el.setAttribute('stroke-width','1.25'); el.setAttribute('stroke', wiki ? 'var(--accent)' : 'var(--border)'); });
      return;
    }
    const neigh = neighbors.get(id) || new Set();
    circles.forEach(({el, text, node}) => {
      const on = node.id === id || neigh.has(node.id);
      el.style.opacity = on ? '1' : '0.15';
      text.style.opacity = on ? '1' : '0';
    });
    lines.forEach(({el, source, target, wiki}) => {
      const active = source === id || target === id;
      el.style.opacity = active ? '1' : '0.08';
      el.setAttribute('stroke-width', active ? '2' : '1.25');
      if (active) el.setAttribute('stroke', moduleColors[nodeById.get(id).module] || 'var(--t3)');
      else el.setAttribute('stroke', wiki ? 'var(--accent)' : 'var(--border)');
    });
  }

  function applyModuleFilter() {
    circles.forEach(({el, node}) => { el.style.display = hiddenModules.has(node.module) ? 'none' : ''; });
    lines.forEach(({el, source, target}) => {
      const s = nodeById.get(source), t = nodeById.get(target);
      const hide = !s || !t || hiddenModules.has(s.module) || hiddenModules.has(t.module);
      el.style.display = hide ? 'none' : '';
    });
  }

  function updatePositions() {
    circles.forEach(({ el, node }) => { el.setAttribute('transform', `translate(${node.x},${node.y})`); });
    lines.forEach(({ el, source, target }) => {
      const s = nodeById.get(source), t = nodeById.get(target);
      if (!s||!t) return;
      el.setAttribute('x1',s.x); el.setAttribute('y1',s.y);
      el.setAttribute('x2',t.x); el.setAttribute('y2',t.y);
    });
  }

  // Simple force layout (repulsion + spring edges), hidden nodes excluded from forces.
  function tick() {
    const k = 0.01, repel = 1400;
    const active = nodes.filter(n => !hiddenModules.has(n.module));
    for (const n of active) { n.vx = (n.vx||0)*0.85; n.vy = (n.vy||0)*0.85; }
    for (let i=0;i<active.length;i++) {
      for (let j=i+1;j<active.length;j++) {
        const dx=active[j].x-active[i].x, dy=active[j].y-active[i].y;
        const d=Math.max(1,Math.sqrt(dx*dx+dy*dy));
        const f=repel/(d*d);
        active[i].vx -= f*dx/d; active[i].vy -= f*dy/d;
        active[j].vx += f*dx/d; active[j].vy += f*dy/d;
      }
    }
    for (const e of data.edges) {
      const s=nodeById.get(e.source), tg=nodeById.get(e.target);
      if (!s||!tg||hiddenModules.has(s.module)||hiddenModules.has(tg.module)) continue;
      const dx=tg.x-s.x, dy=tg.y-s.y, d=Math.max(1,Math.sqrt(dx*dx+dy*dy));
      const f=(d-120)*k;
      s.vx+=f*dx/d; s.vy+=f*dy/d; tg.vx-=f*dx/d; tg.vy-=f*dy/d;
    }
    // Gentle gravity toward the viewport center keeps the graph on-screen
    // without hard walls. The old clamp to [20,W-20]x[20,H-20] acted as a box
    // the repulsion pressed nodes against, so they piled up in the corners.
    const cx = W/2, cy = H/2;
    for (const n of active) {
      n.vx += (cx - n.x) * 0.003;
      n.vy += (cy - n.y) * 0.003;
      n.x += (n.vx||0);
      n.y += (n.vy||0);
    }
    updatePositions();
  }

  let animating = true;
  let frame = 0;
  function animate() {
    if (!animating || !q('#sage-graph-wrap')) { return; }
    if (frame++ < 220) { tick(); requestAnimationFrame(animate); }
    else updatePositions();
  }
  updatePositions();
  applyModuleFilter();
  animate();

  // ── module filter checkboxes (top-left overlay) ────────
  const counts = {};
  nodes.forEach(n => { counts[n.module] = (counts[n.module]||0)+1; });
  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:calc(12px * var(--fsc,1));z-index:2';
  const moduleLabels = opts.labels || { director:t('director'), navigator:t('navigator'), hero:t('hero'), writer:t('writer'), global:t('hashtag') };
  panel.innerHTML = Object.keys(moduleColors).map(mod => `
    <label style="display:flex;align-items:center;gap:6px;color:var(--t2);cursor:pointer;user-select:none">
      <input type="checkbox" class="sage-graph-mod-cb" data-mod="${mod}" ${hiddenModules.has(mod)?'':'checked'}>
      <span style="width:10px;height:10px;border-radius:50%;background:${moduleColors[mod]};display:inline-block;flex-shrink:0"></span>
      <span style="flex:1">${moduleLabels[mod]}</span>
      <span style="color:var(--t3-aa,var(--t2))">${counts[mod]||0}</span>
    </label>`).join('');
  wrap.appendChild(panel);
  panel.querySelectorAll('.sage-graph-mod-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const mod = cb.dataset.mod;
      if (cb.checked) hiddenModules.delete(mod); else hiddenModules.add(mod);
      applyModuleFilter();
    });
  });
}
