'use strict';
// ═══ Map "Locator" (progress.md Phase 7) ══════════════════════════════
// Reuses src/renderer/map.js's Konva canvas renderer wholesale —
// right-drag pan, wheel zoom, polygon areas with vertex dots were already
// built for Director's Map. A Locator module IS its map — one row,
// auto-created on first open.
//
// v5 Part 8 (§12.3): a scoped page component. Data is cached per module
// (LOC); the board, its stage, its selected area and tool belong to the
// instance (map.js MAPS[iid]), so a map can sit on several pages — a
// character's page, a Manager — and in several panes at once.

const LOC = {};

async function loadLocatorData(m) {
  await loadModule('src/renderer/map.js');
  await ensureKonva();
  const map = await api.map.getOrCreateModuleMap(m.id);
  const areas = await api.map.getAreas(map.id);
  await Promise.all(areas.map(async (a) => { mapState.pointsByArea[a.id] = await api.map.getPoints(a.id); }));
  LOC[m.id] = { moduleId: m.id, map, areas };
  return LOC[m.id];
}

registerComponent('locator.view', {
  kind: 'locator', label: () => kindLabel('locator'), borrow: true, canvas: true,
  load: (m) => loadLocatorData(m),
  render: (c) => buildLocatorMainHtml(c.source, c),
  mount: (c) => mountLocatorBoard(c),
});

function buildLocatorMainHtml(m, c) {
  const d = LOC[m.id];
  if (!d?.map) return kindEmptyStateHtml(m, { note: t('locatorEmpty') });
  // No areas yet: the board stays (areas are drawn on it), and under it the
  // kind's empty state stands in for the list — its one button is Add area.
  if (!(d.areas || []).length) return `${mapBoardHtml(c)}<div class="rel-underboard">${kindEmptyStateHtml(m)}</div>`;
  const areaList = typeof renderAreaList === 'function'
    ? renderAreaList(d.areas || [], { iid: c.iid, state: c.state }) : '';
  return `${mapBoardHtml(c)}
  <div class="rel-underboard">
    <div class="ph"><h4>${t('locatorAreas')}</h4><div class="acts">${cmdBtn('locator.addArea', { moduleId: m.id, iid: c.iid }, { cls: 'btn-g' })}</div></div>
    <div class="map-area-list">${areaList}</div>
  </div>`;
}

async function mountLocatorBoard(c) {
  const d = LOC[c.source.id];
  if (!d?.map) return;
  const mi = mapInstance(c, { kind: 'locator', map: d.map, refresh: () => mountLocatorBoard(c) });
  const areas = await api.map.getAreas(d.map.id);
  await Promise.all(areas.map(async (a) => { mapState.pointsByArea[a.id] = await api.map.getPoints(a.id); }));
  d.areas = areas;
  const list = c.root.querySelector('.map-area-list');
  if (list) list.innerHTML = renderAreaList(areas, mi);
  c.root.querySelectorAll('.ctoolbar-float .btn').forEach((b) => {
    const tool = /'(move|create|delete)'/.exec(b.getAttribute('onclick') || '')?.[1];
    if (tool) { b.classList.toggle('btn-p', mi.state.tool === tool); b.classList.toggle('btn-s', mi.state.tool !== tool); }
  });
  await renderMapBoard(mi);
  updateMapZoomLabel(mi);
  mountCanvasFrame(c, mapEl(mi, 'board'), () => renderMapBoard(mi));
}

// The "add area" command: the instance it was pressed in, else the first
// Locator instance of that module on screen.
const locatorIidOf = (moduleId) => Object.values(PB_INST)
  .find((i) => i.component === 'locator.view' && (i.sourceId ?? i.moduleId) === moduleId && MAPS[i.iid])?.iid || null;

function locatorAddArea(moduleId, iid) {
  const target = iid && MAPS[iid] ? iid : locatorIidOf(moduleId);
  if (target) openMapAreaModal(target);
}
