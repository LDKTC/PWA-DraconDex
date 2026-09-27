// Locator (v3 Phase 7) reuses this whole renderer against a module-owned
// map instead of a legacy project's map list — same board, area list and
// tools. Wanderer draws its terrain with it too.
//
// v5 Part 8 (§12.3): every board is an INSTANCE (MAPS[iid]) — its own
// Konva stage, its own selected area and tool, its own elements found
// under its own root — so two maps on one page, or one map in two panes,
// no longer share one global Konva stage, S.map, S.mapAreaId,
// S.mapTool, or the #map-board id.
//   mi = { iid, root, map, kind: 'locator'|'wanderer', state, stage,
//          refresh(), areaVisible(area) }
const MAPS = {};

function mapInstance(c, opts) {
  const st = c.state;
  st.tool ||= 'move';
  const prev = MAPS[c.iid];
  MAPS[c.iid] = {
    iid: c.iid, root: c.root, map: opts.map, kind: opts.kind || 'locator', state: st,
    stage: prev?.stage || null, refresh: opts.refresh, areaVisible: opts.areaVisible || (() => true),
  };
  return MAPS[c.iid];
}
const mapEl = (mi, r) => mi.root?.querySelector(`[data-r="${r}"]`) || null;

// A stage whose instance left the page is destroyed with it.
PB_DISPOSERS.push((iid) => {
  const mi = MAPS[iid];
  if (!mi) return;
  try { mi.stage?.destroy(); } catch (_) {}
  delete MAPS[iid];
});

function refreshMapHost(iid){ MAPS[iid]?.refresh?.(); }
function selectMapArea(iid, id){ const mi = MAPS[iid]; if (!mi) return; mi.state.areaId = id; refreshMapHost(iid); }
function setMapTool(iid, tool){ const mi = MAPS[iid]; if (!mi) return; mi.state.tool = tool; refreshMapHost(iid); }

function renderAreaList(areas, mi){
  if(!areas.length){
    return `<div class="empty" style="padding:18px 10px"><p>${t('mapNoAreas')}</p></div>`;
  }
  const iid = xj(mi.iid);
  return areas.map(area => {
    const color = area.color_code || '#06b6d4';
    const active = mi.state.areaId === area.id;
    const points = mapState.pointsByArea[area.id]?.length || 0;
    return `<div class="rel-card ${active?'active':''}" onclick="selectMapArea(${iid},${area.id})">
      <span class="dot" style="background:${color}"></span>
      <div class="rel-card-content">
        <div>${x(area.area_name || 'ไม่มีชื่อ')}</div>
        <span class="rel-cat">${points} points</span>
      </div>
      <div class="rel-card-actions">
        <button class="btn btn-s btn-i" onclick="event.stopPropagation();openMapAreaModal(${iid},${area.id})">${I.edit}</button>
        <button class="btn btn-s btn-i" onclick="event.stopPropagation();delMapArea(${iid},${area.id})" style="color:var(--danger)">${I.delete}</button>
      </div>
    </div>`;
  }).join('');
}

const MAP_GEOMETRY_EPS = 0.000001;

function sameMapPoint(a,b){
  return Math.abs(a.x - b.x) < MAP_GEOMETRY_EPS && Math.abs(a.y - b.y) < MAP_GEOMETRY_EPS;
}

function mapCross(o,a,b){
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function getMapAreaBoundaryPoints(points){
  const unique = [];
  for(const p of points){
    if(!unique.some(u => sameMapPoint(u,p))) unique.push(p);
  }
  if(unique.length <= 2) return unique;

  const sorted = [...unique].sort((a,b) => a.x === b.x ? a.y - b.y : a.x - b.x);
  const lower = [];
  for(const p of sorted){
    while(lower.length >= 2 && mapCross(lower[lower.length-2], lower[lower.length-1], p) <= MAP_GEOMETRY_EPS){
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for(let i=sorted.length-1;i>=0;i--){
    const p = sorted[i];
    while(upper.length >= 2 && mapCross(upper[upper.length-2], upper[upper.length-1], p) <= MAP_GEOMETRY_EPS){
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function mapAreaLinePoints(points){
  return points.map(p => [p.x, p.y]).flat();
}

// True area-weighted polygon centroid (shoelace formula) over the ordered
// hull, not a plain vertex average — a vertex-heavy edge no longer drags
// the label off-center. Falls back to the raw points' bounding-box center
// when the hull is degenerate (line/point, area ~0).
function polygonCentroid(boundaryPts, fallbackPts){
  if(boundaryPts.length >= 3){
    let a = 0, cx = 0, cy = 0;
    for(let i=0;i<boundaryPts.length;i++){
      const p0 = boundaryPts[i], p1 = boundaryPts[(i+1) % boundaryPts.length];
      const cross = p0.x * p1.y - p1.x * p0.y;
      a += cross; cx += (p0.x + p1.x) * cross; cy += (p0.y + p1.y) * cross;
    }
    a *= 0.5;
    if(Math.abs(a) > MAP_GEOMETRY_EPS) return { cx: cx / (6*a), cy: cy / (6*a) };
  }
  const xs = fallbackPts.map(p=>p.x), ys = fallbackPts.map(p=>p.y);
  return { cx: (Math.min(...xs)+Math.max(...xs))/2, cy: (Math.min(...ys)+Math.max(...ys))/2 };
}

function getMapViewState(mapId){
  if(!mapState.viewByMap[mapId]) mapState.viewByMap[mapId] = { scale:1, tx:0, ty:0 };
  return mapState.viewByMap[mapId];
}

function rescaleMapLayer(layer, newScale, activeAreaId){
  if(!layer) return;
  for(const node of layer.getChildren()){
    if(node instanceof Konva.Circle){
      if(node.attrs.wandererPin){
        node.radius(8 / newScale);
        node.strokeWidth(2 / newScale);
        continue;
      }
      const isActiveArea = node.attrs.areaId === activeAreaId;
      node.radius((isActiveArea ? 7 : 5) / newScale);
      node.strokeWidth(2 / newScale);
    } else if(node instanceof Konva.Line){
      node.strokeWidth(2 / newScale);
    } else if(node.attrs.mapLabel){
      node.fontSize(12.5 / newScale);
      node.offsetX(node.width() / 2);
      node.offsetY(node.height() / 2);
    }
  }
}

async function renderMapBoard(mi){
  if(!mi?.map) return;
  const areas = await api.map.getAreas(mi.map.id);
  for(const a of areas) mapState.pointsByArea[a.id] = await api.map.getPoints(a.id);
  
  const container = mapEl(mi, 'konva');
  if(!container) return;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 540;
  
  const v = getMapViewState(mi.map.id);
  const st = mi.state;
  
  if (mi.stage) {
    try { mi.stage.destroy(); } catch(e){}
  }

  const boardEl = mapEl(mi, 'board');
  if (boardEl) {
    boardEl.oncontextmenu = (e)=>e.preventDefault();
  }

  const stage = mi.stage = new Konva.Stage({
    container,
    width: width,
    height: height,
  });

  const layer = new Konva.Layer();
  stage.add(layer);

  stage.scale({ x: v.scale, y: v.scale });
  stage.position({ x: v.tx, y: v.ty });

  for(const area of areas){
    // Wanderer's Area view (Plan part5 W5): while one area's dropdown is
    // open, the map narrows to just that area and what's inside it.
    if(!mi.areaVisible(area)) continue;
    const pts = mapState.pointsByArea[area.id] || [];
    const boundaryPts = getMapAreaBoundaryPoints(pts);
    const color = area.color_code || '#06b6d4';
    const isActiveArea = st.areaId === area.id;

    let poly = null;
    let label = null;
    const repositionLabel = () => {
      if(!label) return;
      const { cx, cy } = polygonCentroid(getMapAreaBoundaryPoints(pts), pts);
      label.position({ x: cx, y: cy });
      label.text(`${area.area_name || ''}\nx:${Math.round(cx)} · y:${Math.round(cy)} · ${pts.length} nodes`);
      label.offsetX(label.width() / 2);
      label.offsetY(label.height() / 2);
    };
    if(boundaryPts.length >= 2){
      poly = new Konva.Line({
        points: mapAreaLinePoints(pts),
        fill: boundaryPts.length >= 3 ? color : 'transparent',
        opacity: boundaryPts.length >= 3 ? 0.18 : 0,
        stroke: color,
        strokeWidth: 2 / v.scale,
        closed: true,
        draggable: mi.kind !== 'wanderer' && st.tool === 'move' && isActiveArea,
        areaId: area.id,
      });
      // Wanderer (Plan part5 W2): areas are inert terrain there — no
      // select/create-point behavior — so a click on the shape falls
      // through to the stage's own click handler (bindWandererStageClick),
      // which is what turns it into a link-placement click.
      if(mi.kind !== 'wanderer'){
        poly.on('click tap', (e) => {
          if(e.evt.button === 0){
            e.cancelBubble = true;
            if(st.tool === 'create' && st.areaId === area.id){
              const pointer = stage.getPointerPosition();
              const wx = (pointer.x - stage.x()) / stage.scaleX();
              const wy = (pointer.y - stage.y()) / stage.scaleX();
              pts.push({ x: wx, y: wy });
              mapState.pointsByArea[area.id] = pts;
              api.map.setPoints(area.id, pts).then(() => renderMapBoard(mi));
              return;
            }
            selectMapArea(mi.iid, area.id);
          }
        });
      }
      // Whole-area drag: dragging inside the fill (not on a vertex handle)
      // moves every point together. Konva moves the poly via its own x/y,
      // not by rewriting `points`, so we read the delta each tick, apply it
      // to the shared `pts` array (which vertex circles/label read from),
      // then reset the poly's own position back to origin on release.
      let dragOrigin = null;
      poly.on('dragstart', () => { dragOrigin = poly.position(); });
      poly.on('dragmove', () => {
        const cur = poly.position();
        const dx = cur.x - dragOrigin.x, dy = cur.y - dragOrigin.y;
        if(dx || dy){
          for(const p of pts){ p.x += dx; p.y += dy; }
          dragOrigin = cur;
          // Don't rewrite poly's own `points` here: Konva's drag transform
          // already holds the full cumulative offset in poly.position(), so
          // baking that same offset into `points` too would double it,
          // visually outrunning the vertex circles below (which only ever
          // get this tick's single, correct 1x delta). points() gets
          // normalized once, on dragend, after position() resets to origin.
          layer.getChildren().forEach(node => {
            if(node.attrs.pointRef && node.attrs.areaId === area.id){
              node.position({ x: node.attrs.pointRef.x, y: node.attrs.pointRef.y });
            }
          });
          repositionLabel();
          layer.batchDraw();
        }
      });
      poly.on('dragend', () => {
        poly.position({ x: 0, y: 0 });
        poly.points(mapAreaLinePoints(pts));
        api.map.setPoints(area.id, pts).then(() => {
          const list = mi.root?.querySelector('.map-area-list');
          if(list) list.innerHTML = renderAreaList(areas, mi);
        });
      });
      layer.add(poly);
    }

    // Area label (Locator, progress.md Phase 7): name + centroid coords +
    // node count, rendered on the shape itself and kept a constant screen
    // size while panning/zooming (font size compensates for stage scale,
    // same trick as the vertex-dot radius below).
    if (pts.length > 0) {
      const { cx, cy } = polygonCentroid(boundaryPts, pts);
      label = new Konva.Text({
        x: cx, y: cy,
        text: `${area.area_name || ''}\nx:${Math.round(cx)} · y:${Math.round(cy)} · ${pts.length} nodes`,
        fontSize: 12.5 / v.scale,
        lineHeight: 1.3,
        fill: '#e8e8f0',
        align: 'center',
        listening: false,
        mapLabel: true,
      });
      label.offsetX(label.width() / 2);
      label.offsetY(label.height() / 2);
      layer.add(label);
    }

    // Wanderer (Plan part5 W2): vertex-edit dots are a Locator authoring
    // affordance with no purpose on Wanderer's read-only terrain view — and
    // since st.areaId is a single GLOBAL (not per-module), leaving their
    // click handler active here would let a stray click mark an area
    // "active" that then leaks into a later Locator view of the same area.
    const showVertexDots = mi.kind !== 'wanderer';
    for(const p of (showVertexDots ? pts : [])){
      const circle = new Konva.Circle({
        x: p.x,
        y: p.y,
        radius: (isActiveArea ? 7 : 5) / v.scale,
        fill: isActiveArea ? '#ffffff' : color,
        stroke: color,
        strokeWidth: 2 / v.scale,
        draggable: st.tool === 'move' && isActiveArea,
        areaId: area.id,
        pointRef: p,
      });

      circle.on('dragmove', (e) => {
        const newPos = circle.position();
        p.x = newPos.x;
        p.y = newPos.y;
        if(poly) {
          const nextBoundaryPts = getMapAreaBoundaryPoints(pts);
          poly.points(mapAreaLinePoints(pts));
          poly.fill(nextBoundaryPts.length >= 3 ? color : 'transparent');
          poly.opacity(nextBoundaryPts.length >= 3 ? 0.18 : 0);
        }
        layer.batchDraw();
      });

      circle.on('dragend', () => {
        api.map.setPoints(area.id, pts).then(() => {
          const list = mi.root?.querySelector('.map-area-list');
          if(list) list.innerHTML = renderAreaList(areas, mi);
        });
      });

      circle.on('click tap', (e) => {
        if(e.evt.button === 0){
          e.cancelBubble = true;
          if(st.tool === 'delete'){
            const idx = pts.indexOf(p);
            if(idx >= 0){
              pts.splice(idx, 1);
              api.map.setPoints(area.id, pts).then(() => renderMapBoard(mi));
            }
          } else {
            selectMapArea(mi.iid, area.id);
          }
        }
      });

      layer.add(circle);
    }
  }

  let isPanning = false;
  let startPos = { x: 0, y: 0 };

  stage.on('mousedown', (e) => {
    if (e.evt.button === 2) {
      isPanning = true;
      startPos = { x: e.evt.clientX, y: e.evt.clientY };
      boardEl?.classList.add('is-panning');
    }
  });

  stage.on('mousemove', (e) => {
    if (isPanning) {
      const dx = e.evt.clientX - startPos.x;
      const dy = e.evt.clientY - startPos.y;
      startPos = { x: e.evt.clientX, y: e.evt.clientY };
      const newPos = {
        x: stage.x() + dx,
        y: stage.y() + dy,
      };
      stage.position(newPos);
      v.tx = newPos.x;
      v.ty = newPos.y;
      layer.batchDraw();
    }
  });

  stage.on('click tap', (e) => {
    if (e.evt.button !== 0) return;
    if (mi.kind === 'wanderer') return; // Wanderer has its own click.wanderer handler
    if (e.target === stage) {
      if (!st.areaId) {
        toast('เลือก Area ก่อนใช้งาน Tool', 'err');
        return;
      }
      const pointer = stage.getPointerPosition();
      const wx = (pointer.x - stage.x()) / stage.scaleX();
      const wy = (pointer.y - stage.y()) / stage.scaleX();
      const points = mapState.pointsByArea[st.areaId] || [];

      if (st.tool === 'create') {
        points.push({ x: wx, y: wy });
        mapState.pointsByArea[st.areaId] = points;
        api.map.setPoints(st.areaId, points).then(() => renderMapBoard(mi));
      }
    }
  });

  stage.on('wheel', (e) => {
    // The page scrolls past the map until it is clicked or Ctrl is held
    // (page/canvas-frame.js, §12.3).
    if (!canvasWheelTakes(boardEl, e.evt)) return;
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const step = e.evt.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.3, Math.min(4, oldScale * step));

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    v.scale = newScale;
    v.tx = newPos.x;
    v.ty = newPos.y;

    rescaleMapLayer(layer, newScale, st.areaId);
    layer.batchDraw();
    updateMapZoomLabel(mi);
  });

  const cleanupPan = () => {
    if (isPanning) {
      isPanning = false;
      boardEl?.classList.remove('is-panning');
    }
  };
  window.removeEventListener('mouseup', cleanupPan);
  window.addEventListener('mouseup', cleanupPan);

  layer.batchDraw();
}

async function openMapAreaModal(iid, id=null){
  const mi = MAPS[iid];
  if(!mi?.map) return;
  const areas = await api.map.getAreas(mi.map.id);
  const a = id ? areas.find(v=>v.id===id) : null;
  openModal(a?'✏️ แก้ไข Area':'🧩 Area ใหม่',`
    <div class="fg"><label>ชื่อ Area *</label><input id="area-n" value="${x(a?.area_name||'')}"></div>
    <div class="fg"><label>สี</label>${await colorPicker(a?.color)}</div>
    <div class="mfoot">${a?`<button class="btn btn-d" onclick="delMapArea(${xj(iid)},${id})">ลบ</button>`:''}<button class="btn btn-s" onclick="closeModal()">ยกเลิก</button><button class="btn btn-p" onclick="${a?`saveMapArea(${xj(iid)},${id})`:`createMapArea(${xj(iid)})`}">${a?'บันทึก':'สร้าง'}</button></div>`);
}
async function createMapArea(iid){ const mi=MAPS[iid]; const n=q('#area-n').value.trim(); if(!n || !mi?.map) return; const r=await api.map.createArea(mi.map.id,n,q('#sel-color').value||null); closeModal(); mi.state.areaId=r.lastInsertRowid; mapState.pointsByArea[mi.state.areaId]=[]; await refreshMapHost(iid); toast('สร้าง Area แล้ว','ok'); }
async function saveMapArea(iid, id){ const n=q('#area-n').value.trim(); if(!n) return; await api.map.updateArea(id,n,q('#sel-color').value||null); closeModal(); await refreshMapHost(iid); toast('บันทึกแล้ว','ok'); }
async function delMapArea(iid, id){ if(!await uiConfirm('ลบ Area นี้?')) return; await api.map.deleteArea(id); closeModal(); const mi=MAPS[iid]; if(mi?.state.areaId===id) mi.state.areaId=null; delete mapState.pointsByArea[id]; await refreshMapHost(iid); toast('ลบเรียบร้อยแล้ว'); }

// The zoom readout and buttons of one board (Locator and Wanderer draw the
// same .czoom strip).
function updateMapZoomLabel(mi) {
  const el = mapEl(mi, 'zoom');
  if (el && mi.map) el.textContent = `${Math.round(getMapViewState(mi.map.id).scale * 100)}%`;
}

function zoomMap(iid, dir) {
  const mi = MAPS[iid];
  const stage = mi?.stage;
  if (!stage || !mi.map) return;
  const v = getMapViewState(mi.map.id);
  const center = { x: stage.width() / 2, y: stage.height() / 2 };
  const oldScale = stage.scaleX();
  const focal = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };
  const newScale = Math.max(0.3, Math.min(4, oldScale * (dir > 0 ? 1.15 : 1 / 1.15)));
  stage.scale({ x: newScale, y: newScale });
  const newPos = { x: center.x - focal.x * newScale, y: center.y - focal.y * newScale };
  stage.position(newPos);
  v.scale = newScale; v.tx = newPos.x; v.ty = newPos.y;
  const layer = stage.getLayers()[0];
  rescaleMapLayer(layer, newScale, mi.state.areaId);
  layer?.batchDraw();
  updateMapZoomLabel(mi);
}

// The board: stage slot, tool buttons (Locator only), hint, zoom strip.
function mapBoardHtml(c, { tools = true, cls = '', height = 540 } = {}) {
  const iid = xj(c.iid);
  const tool = c.state.tool || 'move';
  return `<div data-r="board" class="map-whiteboard locator-board ${cls}" style="height:${canvasFrameHeight(c, height)}px">
    <div data-r="konva" style="width:100%;height:100%"></div>
    ${tools ? `<div class="ctoolbar-float">
      <button class="btn btn-i ${tool === 'move' ? 'btn-p' : 'btn-s'}" onclick="setMapTool(${iid},'move')" title="${t('locatorToolMove')}">${I.move}</button>
      <button class="btn btn-i ${tool === 'create' ? 'btn-p' : 'btn-s'}" onclick="setMapTool(${iid},'create')" title="${t('locatorToolCreate')}">${I.plus}</button>
      <button class="btn btn-i ${tool === 'delete' ? 'btn-p' : 'btn-s'}" onclick="setMapTool(${iid},'delete')" title="${t('locatorToolDelete')}">${I.delete}</button>
    </div>` : ''}
    <div class="chint">${t('locatorPanHint')}</div>
    <div class="czoom">
      <span class="zbtn" onclick="zoomMap(${iid},-1)">−</span>
      <span class="zlvl" data-r="zoom">100%</span>
      <span class="zbtn" onclick="zoomMap(${iid},1)">+</span>
      ${tools ? `<span class="zsep"></span><span class="locator-scalelbl" data-no-i18n>24px = 10 km</span>` : ''}
    </div>
    ${canvasFrameChromeHtml(c)}
  </div>`;
}

// ═══ HASHTAG VIEW ══════════════════════════════════════

