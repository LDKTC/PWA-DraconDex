'use strict';
// ═══ Drawing "Sketcher" (progress.md Phase 15) ═════════════════════════
// Freehand canvas (mockup docs/mockups/28-sketcher.png): pen + eraser on
// an HTML5 canvas (strokes are whole polylines — the eraser deletes
// strokes, never pixels), floating tool pill (colors + widths + pin),
// right-drag pan + Ctrl-wheel zoom like the map board, module-link pins
// as chips on the canvas, multiple pages, and PNG export. Pinning uses a
// quickIndex picker modal — drag-from-Search-Link arrives with Phase 20.

const SKETCHER_VIEWS = ['canvas', 'pages', 'gallery', 'export'];
const SKETCHER_VIEW_LABEL = { canvas: 'Canvas', pages: 'Pages', gallery: 'Gallery', export: 'Export' };
// v5 Part 8 (§12.3): a scoped page component — data per module, view per
// instance, S.sketcherData = the current instance (page/kind-state.js).
const SKT = kindState({ prop: 'sketcherData', kind: 'sketcher', component: 'sketcher.view', views: SKETCHER_VIEWS });
registerComponent('sketcher.view', {
  kind: 'sketcher', label: () => kindLabel('sketcher'), borrow: true, canvas: true,
  presets: () => SKETCHER_VIEWS, presetLabel: (p) => SKETCHER_VIEW_LABEL[p],
  load: (m) => loadSketcherData(m),
  render: (c) => buildSketcherMainHtml(c.source, c),
  mount: () => { mountSketcherBoard(); mountSketcherExtras(); },
});
const SK_W = 1600, SK_H = 1100;
const SK_COLORS = ['#e879f9', '#facc15', '#38bdf8', '#f8fafc'];
const SK_WIDTHS = [2, 4, 7];

// Render-only tool state (not persisted — the active view/page are).
const skTool = { mode: 'pen', color: SK_COLORS[0], width: SK_WIDTHS[1], zoom: {} };

async function loadSketcherData(m) {
  const [pages, ui] = await Promise.all([
    api.sketcher.getPages(m.id),
    api.module.getUi(m.id),
  ]);
  let pageId = Number(ui.activePage) || null;
  if (pageId && !pages.find(p => p.id === pageId)) pageId = null;
  if (!pageId && pages.length) pageId = pages[0].id;
  const [strokes, pins] = pageId
    ? await Promise.all([api.sketcher.getStrokes(pageId), api.sketcher.getPins(pageId)])
    : [[], []];
  const pinEntities = await api.wiki.resolveKeys(pins.map(p => p.linker_key));
  const byKey = new Map(pinEntities.map(e2 => [e2.key, e2]));
  for (const p of pins) p.entity = byKey.get(p.linker_key) || null;
  SKT.setModule(m.id, { moduleId: m.id, ui, pages, pageId, strokes, pins });
}

async function setSketcherView(view) {
  await SKT.setView(view); // the instance's preset (page/kind-state.js)
}

async function selectSketchPage(id) {
  const d = S.sketcherData;
  d.pageId = id;
  await api.module.setUi(d.moduleId, 'activePage', String(id));
  await reloadSource(d.moduleId);
}

function buildSketcherMainHtml(m, c) {
  const d = SKT.instance(c);
  if (!d) return `<div class="empty" style="margin-top:40px"><div class="ei">${moduleIconHtml(m)}</div><h3>${x(m.name)}</h3></div>`;
  const viewBar = viewBarHtml(SKETCHER_VIEWS, d.view, v => `setSketcherView('${v}')`, v => SKETCHER_VIEW_LABEL[v], { noI18n: true });
  const toolbar = `<div class="classifier-toolbar">
    ${cmdBtn('sketcher.newPage', { moduleId: m.id }, { cls: 'btn-p' })}
    ${viewBar}
  </div>`;
  if (!d.pages.length) {
    return toolbar + kindEmptyStateHtml(m);
  }
  if (d.view === 'pages') return toolbar + buildSketchPagesHtml(d);
  if (d.view === 'gallery') return toolbar + buildSketchGalleryHtml(d);
  if (d.view === 'export') return toolbar + buildSketchExportHtml(d);
  const pageIdx = d.pages.findIndex(p => p.id === d.pageId) + 1;
  return `${toolbar}
    <div class="cn-wrap">
      <div id="sk-board" class="nar-board sk-board">
        <div id="sk-stage" style="width:${SK_W}px;height:${SK_H}px">
          <canvas id="sk-canvas" width="${SK_W}" height="${SK_H}"></canvas>
        </div>
      </div>
      <div class="sk-tools" data-no-i18n>
        <button class="btn btn-g btn-i${skTool.mode === 'pen' ? ' act' : ''}" data-cmd="sketcher.pen" onclick="runCommand('sketcher.pen')" title="${t('penTool')}">✏️</button>
        <button class="btn btn-g btn-i${skTool.mode === 'eraser' ? ' act' : ''}" data-cmd="sketcher.eraser" onclick="runCommand('sketcher.eraser')" title="${t('eraserTool')}">🧽</button>
        <span class="zsep"></span>
        ${SK_COLORS.map(c => `<span class="sk-swatch${skTool.color === c ? ' act' : ''}" style="background:${c}" onclick="setSketchColor('${c}')"></span>`).join('')}
        <span class="zsep"></span>
        ${SK_WIDTHS.map(w => `<span class="sk-width${skTool.width === w ? ' act' : ''}" onclick="setSketchWidth(${w})"><span style="height:${w}px"></span></span>`).join('')}
        <span class="zsep"></span>
        <button class="btn btn-g btn-i" data-cmd="sketcher.pinLink" onclick="runCommand('sketcher.pinLink')" title="${t('pinModuleLink')}">🔗</button>
      </div>
      ${cmdBtn('sketcher.exportPng', { moduleId: d.moduleId }, { cls: 'btn-p sk-export' })}
      <div class="chint" data-no-i18n>${t('sketcherHint')}</div>
      <div class="czoom" data-no-i18n>
        <button class="btn btn-g btn-i" onclick="sketchZoomBy(-0.15)">−</button>
        <span id="sk-zoom-label">100%</span>
        <button class="btn btn-g btn-i" onclick="sketchZoomBy(0.15)">＋</button>
        <span class="cn-count">${t('pageWord')} ${pageIdx}/${d.pages.length}</span>
      </div>
    </div>`;
}

function setSketchTool(mode) { skTool.mode = mode; renderNexusHome(); }
function setSketchColor(c) { skTool.color = c; skTool.mode = 'pen'; renderNexusHome(); }
function setSketchWidth(w) { skTool.width = w; renderNexusHome(); }

// ── Canvas mounting: draw strokes, wire pen/eraser/pan/zoom/pins ────────
// The drawing itself is mod/sketch-render.js — shared with Designer panels.
function drawSketchStrokes(ctx, strokes) {
  ctx.clearRect(0, 0, SK_W, SK_H);
  renderSketchStrokes(ctx, strokes, SK_COLORS[0]);
}

function sketchStrokeHit(stroke, px, py, slack) {
  const pts = typeof stroke.points === 'string' ? JSON.parse(stroke.points) : stroke.points;
  const r = slack + (stroke.width || 3) / 2;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const tt = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const qx = ax + tt * dx, qy = ay + tt * dy;
    if ((px - qx) ** 2 + (py - qy) ** 2 <= r * r) return true;
  }
  return false;
}

function mountSketcherBoard() {
  const d = S.sketcherData;
  if (!d || d.view !== 'canvas' || !d.pageId) return;
  const board = pbQOr('#sk-board'), stage = pbQOr('#sk-stage'), canvas = pbQOr('#sk-canvas');
  if (!board || !stage || !canvas) return;
  const ctx = canvas.getContext('2d');
  drawSketchStrokes(ctx, d.strokes);

  const zoomOf = () => skTool.zoom[d.moduleId] || 1;
  stage.style.transform = `scale(${zoomOf()})`;
  stage.style.transformOrigin = '0 0';
  const lbl = pbQOr('#sk-zoom-label');
  if (lbl) lbl.textContent = `${Math.round(zoomOf() * 100)}%`;

  const toStage = (e2) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e2.clientX - r.left) / zoomOf(), y: (e2.clientY - r.top) / zoomOf() };
  };

  // pen / eraser
  canvas.addEventListener('pointerdown', async (e2) => {
    if (e2.button !== 0) return;
    e2.preventDefault();
    try { canvas.setPointerCapture(e2.pointerId); } catch (_) {}
    if (skTool.mode === 'eraser') {
      const erase = async (ev) => {
        const p = toStage(ev);
        const hit = d.strokes.find(s => sketchStrokeHit(s, p.x, p.y, 8));
        if (hit) {
          d.strokes = d.strokes.filter(s => s !== hit);
          drawSketchStrokes(ctx, d.strokes);
          await api.sketcher.deleteStroke(hit.id);
        }
      };
      await erase(e2);
      const mv = (ev) => erase(ev);
      const up = () => {
        canvas.removeEventListener('pointermove', mv);
        canvas.removeEventListener('pointerup', up);
      };
      canvas.addEventListener('pointermove', mv);
      canvas.addEventListener('pointerup', up);
      return;
    }
    const pts = [];
    const start = toStage(e2);
    pts.push(start.x, start.y);
    ctx.strokeStyle = skTool.color;
    ctx.lineWidth = skTool.width;
    ctx.lineJoin = ctx.lineCap = 'round';
    let lx = start.x, ly = start.y;
    const mv = (ev) => {
      const p = toStage(ev);
      if (Math.abs(p.x - lx) + Math.abs(p.y - ly) < 1.2) return;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lx = p.x; ly = p.y;
      pts.push(p.x, p.y);
    };
    const up = async () => {
      canvas.removeEventListener('pointermove', mv);
      canvas.removeEventListener('pointerup', up);
      if (pts.length < 4) { pts.push(pts[0] + 0.5, pts[1] + 0.5); }
      const rounded = pts.map(v => Math.round(v * 10) / 10);
      const id = await api.sketcher.addStroke(d.pageId, skTool.color, skTool.width, rounded);
      d.strokes.push({ id, page_ref: d.pageId, color: skTool.color, width: skTool.width, points: JSON.stringify(rounded) });
    };
    canvas.addEventListener('pointermove', mv);
    canvas.addEventListener('pointerup', up);
  });

  // pins as chips over the canvas
  stage.querySelectorAll('.sk-pin').forEach(el => el.remove());
  for (const pin of d.pins) {
    const el = document.createElement('div');
    el.className = 'sk-pin';
    el.style.left = `${pin.x}px`;
    el.style.top = `${pin.y}px`;
    const e3 = pin.entity;
    el.innerHTML = `<span data-no-i18n>[[${x(e3 ? e3.name : pin.linker_key)}]]</span>
      <small data-no-i18n>${x(e3 ? e3.type : '?')}</small>
      <button class="btn btn-g btn-i sk-pin-x" title="${t('delete')}">×</button>`;
    el.querySelector('.sk-pin-x').addEventListener('pointerdown', async (ev) => {
      ev.stopPropagation();
      await api.sketcher.deletePin(pin.id);
      d.pins = d.pins.filter(p => p !== pin);
      el.remove();
    });
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      const sx = ev.clientX, sy = ev.clientY, ox = pin.x, oy = pin.y;
      let moved = false;
      const mv = (e4) => {
        const dx = (e4.clientX - sx) / zoomOf(), dy = (e4.clientY - sy) / zoomOf();
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        pin.x = ox + dx; pin.y = oy + dy;
        el.style.left = `${pin.x}px`;
        el.style.top = `${pin.y}px`;
      };
      const up = async () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        if (moved) await api.sketcher.movePin(pin.id, pin.x, pin.y);
        else if (pin.linker_key) openEntityByKey(pin.linker_key);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
    stage.appendChild(el);
  }

  // Land the viewport on the drawing (bbox center), not the canvas corner.
  if (!board.dataset.scrolled) {
    board.dataset.scrolled = '1';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of d.strokes) {
      const pts = typeof s.points === 'string' ? JSON.parse(s.points) : s.points;
      for (let i = 0; i + 1 < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
      }
    }
    for (const pin of d.pins) {
      minX = Math.min(minX, pin.x); maxX = Math.max(maxX, pin.x);
      minY = Math.min(minY, pin.y); maxY = Math.max(maxY, pin.y);
    }
    if (minX < Infinity) {
      board.scrollLeft = Math.max(0, (minX + maxX) / 2 * zoomOf() - board.clientWidth / 2);
      board.scrollTop = Math.max(0, (minY + maxY) / 2 * zoomOf() - board.clientHeight / 2);
    }
  }

  // right-drag pan + Ctrl-wheel zoom
  bindCanvasCtx(board, 'sketcher.canvas');
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
    if (!e2.ctrlKey) return;
    e2.preventDefault();
    sketchZoomBy(e2.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });
}

function sketchZoomBy(dz) {
  const d = S.sketcherData;
  if (!d) return;
  const z = Math.min(3, Math.max(0.3, (skTool.zoom[d.moduleId] || 1) + dz));
  skTool.zoom[d.moduleId] = z;
  const stage = pbQOr('#sk-stage');
  if (stage) {
    stage.style.transform = `scale(${z})`;
    stage.style.transformOrigin = '0 0';
  }
  const lbl = pbQOr('#sk-zoom-label');
  if (lbl) lbl.textContent = `${Math.round(z * 100)}%`;
}

// ── Pages view ──────────────────────────────────────────────────────────
function buildSketchPagesHtml(d) {
  return `<div class="hlist" style="max-width:560px">${d.pages.map((p, i) => `
    <div class="li${p.id === d.pageId ? ' sel' : ''}" onclick="selectSketchPage(${p.id}).then(()=>setSketcherView('canvas'))">
      <span class="name">${i + 1}. ${x(p.name)}</span>
      <span class="cnt" data-no-i18n>${p.stroke_count}</span>
      <span class="acts">
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();moveSketchPageRow(${p.id},-1)" title="↑">↑</button>
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();moveSketchPageRow(${p.id},1)" title="↓">↓</button>
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();openSketchPageModal(${d.moduleId},${p.id})" title="${t('edit')}">${I.edit}</button>
      </span>
    </div>`).join('')}</div>`;
}

async function moveSketchPageRow(id, dir) {
  await api.sketcher.movePage(id, dir);
  await reloadSource(S.sketcherData.moduleId);
}

// ── Gallery / Export: offscreen page renders ────────────────────────────
async function sketchPageDataUrl(pageId, scale = 1) {
  const [strokes] = await Promise.all([api.sketcher.getStrokes(pageId)]);
  const c = document.createElement('canvas');
  c.width = SK_W * scale;
  c.height = SK_H * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  drawSketchStrokes(ctx, strokes);
  return c.toDataURL('image/png');
}

function buildSketchGalleryHtml(d) {
  return `<div class="sk-gallery" id="sk-gallery">${d.pages.map((p, i) => `
    <div class="sk-thumb" onclick="selectSketchPage(${p.id}).then(()=>setSketcherView('canvas'))">
      <img data-page="${p.id}" alt="">
      <span data-no-i18n>${i + 1}. ${x(p.name)}</span>
    </div>`).join('')}</div>`;
}

function buildSketchExportHtml(d) {
  const p = d.pages.find(pp => pp.id === d.pageId);
  return `<div class="sk-exportview">
    <img id="sk-export-img" alt="" style="max-width:100%;border:1px solid var(--border);border-radius:var(--r);background:#0b0b10">
    <div style="margin-top:10px">
      <button class="btn btn-p" onclick="exportSketchPng()">${t('exportPng')} — ${x(p ? p.name : '')}</button>
    </div>
  </div>`;
}

// Post-DOM hook: fills gallery thumbnails / export preview.
async function mountSketcherExtras() {
  const d = S.sketcherData;
  if (!d) return;
  if (d.view === 'gallery') {
    for (const img of (pbRoot(d.iid)?.querySelectorAll('#sk-gallery img[data-page]') || [])) {
      img.src = await sketchPageDataUrl(Number(img.dataset.page), 0.16);
    }
  } else if (d.view === 'export') {
    const img = pbQOr('#sk-export-img');
    if (img && d.pageId) img.src = await sketchPageDataUrl(d.pageId, 0.5);
  }
}

async function exportSketchPng() {
  const d = S.sketcherData;
  if (!d?.pageId) return;
  const page = d.pages.find(p => p.id === d.pageId);
  const dataUrl = await sketchPageDataUrl(d.pageId, 1);
  try {
    const res = await api.sketcher.exportPng(page?.name || 'sketch', dataUrl);
    if (res?.saved) { toast(`${t('saved')} — ${res.saved}`, 'ok'); return; }
  } catch (_) {}
  // No native dialog (canceled / web fallback): download via anchor.
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${page?.name || 'sketch'}.png`;
  a.click();
  toast(t('saved'), 'ok');
}

// ── Page CRUD + pin picker ──────────────────────────────────────────────
function openSketchPageModal(moduleId, id = null) {
  const p = id ? S.sketcherData?.pages.find(pp => pp.id === id) : null;
  openModal(p ? t('moduleEdit') : t('newPage'), `
    <div class="fg"><label>${t('name')} *</label><input id="sp-name" value="${x(p?.name || '')}"></div>
    <div class="mfoot">
      ${p ? `<button class="btn btn-d" onclick="deleteSketchPageRow(${p.id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitSketchPage(${moduleId},${p ? p.id : 'null'})">${p ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => pbQOr('#sp-name').focus(), 60);
}

async function submitSketchPage(moduleId, id) {
  const name = pbQOr('#sp-name').value.trim();
  if (!name) return;
  if (id) await api.sketcher.renamePage(id, name);
  else {
    const newId = await api.sketcher.createPage(moduleId, name);
    await api.module.setUi(moduleId, 'activePage', String(newId));
    S.sketcherData.pageId = newId;
  }
  closeModal();
  await reloadSource(moduleId);
  toast(id ? t('saved') : t('created'), 'ok');
}

async function deleteSketchPageRow(id) {
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  await api.sketcher.deletePage(id);
  closeModal();
  const d = S.sketcherData;
  if (d.pageId === id) d.pageId = null;
  await reloadSource(d.moduleId);
  toast(t('deleted'), 'ok');
}

async function openSketchPinModal() {
  const d = S.sketcherData;
  if (!d?.pageId) return;
  const ix = await api.wiki.quickIndex(S.nexus.id);
  openModal(t('pinModuleLink'), `
    <div class="fg"><label>${t('moduleLink')}</label>
      <select id="skp-key">${ix.map(e2 =>
        `<option value="${x(e2.key)}">${x(e2.name)} (${x(e2.type)})</option>`).join('')}
      </select></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitSketchPin()">${t('create')}</button>
    </div>`);
}

async function submitSketchPin() {
  const d = S.sketcherData;
  const key = pbQOr('#skp-key').value;
  if (!key) return;
  const board = pbQOr('#sk-board');
  const zoom = skTool.zoom[d.moduleId] || 1;
  const px = board ? (board.scrollLeft + board.clientWidth / 2) / zoom : SK_W / 2;
  const py = board ? (board.scrollTop + board.clientHeight / 2) / zoom : SK_H / 2;
  await api.sketcher.addPin(d.pageId, key, px, py);
  closeModal();
  await reloadSource(d.moduleId);
  toast(t('created'), 'ok');
}
