'use strict';
// ═══ Timeline "Chronicler" (progress.md Phase 8) ══════════════════════
// A module owns any number of timeline "lines" (generalized `timeline`
// table, module_ref instead of project_id — same shape as Director's
// project-scoped timelines). Down-line reuses timeline.js's existing
// true-time-scale SVG graph + pan/zoom/drag interactions as-is
// (buildTimelineGraphHtml / bindTimelineGraphInteractions are already
// project-agnostic, keyed only by timeline id). One-line and Compare
// Parallel are new, lighter views built the same way but plotted on flat
// axis lines instead of the zigzag layout.

const CHRONICLER_VIEWS = ['oneline', 'downline', 'compare', 'calendar'];
const CHRONICLER_VIEW_LABEL = { oneline: 'Oneline', downline: 'Downline', compare: 'Compare', calendar: 'Calendar' };

// CHRONICLER_CALENDAR_DEFAULTS / chroniclerCalendarConfig are gone: the
// calendar is a unit spec now, normalized by calSpecNormalize (which still
// upgrades the old five-field blob) and held as S.chroniclerData.calendarSpec.

function sortChroniclerEvents(evs, spec) {
  spec = spec || timelineCalendarSpec();
  const key = (e) => calToOrdinal(spec, { y: e.s_years, m: e.s_month, d: e.s_day, h: e.s_hour, mi: e.s_minute });
  return evs.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    // A dateless event keeps its arrival order rather than jumping to the top.
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ka - kb;
  });
}

// ── Data per module, state per instance (v5 Part 8, §12.3) ─────────────
// CHR_M holds what belongs to the module (its lines, its calendar, its
// graph toggles); CHR_I what one instance on a page is looking at (the
// view, the line, the open event, the calendar's zoom and cursor). An
// instance's object reads and writes the module's fields THROUGH to CHR_M,
// so a calendar edited in one instance is the calendar of all of them.
// S.chroniclerData is the CURRENT instance's object (page/page.js) — the
// hundred readers of it in this kind did not have to change.
const CHR_M = {};
const CHR_I = {};
const CHR_MODULE_FIELDS = ['timelines', 'calendarConfig', 'calendarSpec', 'graphShowIcon', 'graphShowDate'];

Object.defineProperty(S, 'chroniclerData', {
  configurable: true,
  get() {
    const cur = CHR_I[pbCurrent()];
    if (cur) return cur;
    // The palette, with no Chronicler instance current: the open module's.
    const m = S.activeModuleNode;
    return m?.kind === 'chronicler' ? CHR_I[pbFirstInstance('chronicler.view', m.id)] || null : null;
  },
  set() { /* state lives per instance now — see CHR_I */ },
});

async function loadChroniclerData(m) {
  await loadModule('src/renderer/timeline.js');
  const [timelines, ui, relations, index] = await Promise.all([
    api.timeline.getModuleTimelines(m.id),
    api.module.getUi(m.id),
    api.viewer.getRelations(S.nexus.id),
    api.viewer.index(S.nexus.id),
  ]);
  setChroniclerLinkData(relations, index);
  let calendarConfig = null;
  try { calendarConfig = ui.calendarConfig ? JSON.parse(ui.calendarConfig) : null; } catch (_) { calendarConfig = null; }
  CHR_M[m.id] = {
    moduleId: m.id, timelines, ui, calendarConfig,
    // calSpecNormalize also upgrades the v1 blob, so an existing vault's
    // calendar keeps its shape without ever being rewritten on disk.
    calendarSpec: calSpecNormalize(calendarConfig),
    // Process 8 part 1: graph display toggles. Stored as '0'/'1' strings in
    // module_ui, absent meaning on, so a timeline made before this round shows
    // both rather than silently losing its labels.
    graphShowIcon: ui.graphShowIcon !== '0',
    graphShowDate: ui.graphShowDate !== '0',
  };
  return CHR_M[m.id];
}

// One instance's state object, made on first render and kept across them.
function chrInstance(c) {
  const mod = CHR_M[c.source.id];
  if (!mod) return null;
  let d = CHR_I[c.iid];
  if (!d || d.moduleId !== mod.moduleId) {
    d = {
      iid: c.iid, moduleId: mod.moduleId, activeId: null, compareId: null, inspectorEventId: null,
      // Which unit the calendar grid is zoomed to, and where it is pointed —
      // a scroll position, not a setting, so never stored.
      calZoom: 'month', calCursor: null,
      // Custom-calendar panel: open state and which unit page it is showing.
      calPanelOpen: false, calPanelUnit: 'day',
      downlineView: { scale: 1, ty: 0 },
    };
    for (const k of CHR_MODULE_FIELDS) {
      Object.defineProperty(d, k, { enumerable: true, get: () => CHR_M[d.moduleId]?.[k], set: (v) => { if (CHR_M[d.moduleId]) CHR_M[d.moduleId][k] = v; } });
    }
    CHR_I[c.iid] = d;
  }
  const p = c.config?.preset || mod.ui.view;
  d.view = CHRONICLER_VIEWS.includes(p) ? p : 'oneline';
  if (!d.activeId || !d.timelines.find((tl) => tl.id === d.activeId)) d.activeId = d.timelines[0]?.id || null;
  // compareId is another chronicler MODULE's id (not a line id — each
  // chronicler module holds only 1 line, see C2).
  if (d.compareId && !modulesOfKind('chronicler').find((cm) => cm.id === d.compareId && cm.id !== d.moduleId)) d.compareId = null;
  if (S.pendingChroniclerEvent != null) { d.inspectorEventId = S.pendingChroniclerEvent; S.pendingChroniclerEvent = null; }
  return d;
}
PB_DISPOSERS.push((iid) => { delete CHR_I[iid]; });

registerComponent('chronicler.view', {
  kind: 'chronicler', label: () => kindLabel('chronicler'), borrow: true, canvas: true,
  presets: () => CHRONICLER_VIEWS, presetLabel: (p) => CHRONICLER_VIEW_LABEL[p],
  load: (m) => loadChroniclerData(m),
  render: (c) => buildChroniclerMainHtml(c.source, c),
  mount: () => mountChroniclerGraph(),
});

// A view chip: this instance's preset, and the module's default.
async function setChroniclerView(view) {
  const d = S.chroniclerData;
  if (!d) return;
  d.inspectorEventId = null;
  await api.module.setUi(d.moduleId, 'view', view);
  if (CHR_M[d.moduleId]) CHR_M[d.moduleId].ui = { ...CHR_M[d.moduleId].ui, view };
  if (S.inspectorData?.moduleId === d.moduleId) S.inspectorData.ui = { ...S.inspectorData.ui, view };
  await pbSetConfig(d.iid, { preset: view });
}

async function selectChroniclerTimeline(moduleId, id) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  S.chroniclerData.activeId = Number(id) || null;
  S.chroniclerData.inspectorEventId = null;
  renderNexusHome();
}

async function setChroniclerCompare(id) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  S.chroniclerData.compareId = Number(id) || null;
  S.chroniclerData.inspectorEventId = null;
  pbUse(__iid); await mountChroniclerGraph();
}

function buildChroniclerMainHtml(m, c) {
  const data = chrInstance(c);
  if (!data) return `<div class="empty" style="margin-top:40px"><div class="ei">${moduleIconHtml(m)}</div><h3>${x(m.name)}</h3></div>`;
  const { timelines, activeId, compareId, view } = data;
  const viewBar = viewBarHtml(CHRONICLER_VIEWS, view, v => `setChroniclerView('${v}')`, v => CHRONICLER_VIEW_LABEL[v]);
  // Only ever 1 line per chronicler module — no line-picker needed once one
  // exists, and the "add line" button hides itself the same way.
  const lineSelect = timelines.length > 1 ? `<select id="chr-line-select" data-cmd="chronicler.switchLine" onchange="selectChroniclerTimeline(${m.id},this.value)">
    ${timelines.map(t => `<option value="${t.id}" ${t.id === activeId ? 'selected' : ''}>${x(t.line_name || '—')}</option>`).join('')}
  </select>` : '';
  const cc = { moduleId: m.id }; // the commands' context
  // v5 Part 6 (APP docs/V5.md §10.6 — Chronicler is the measure of the
  // rule): the top bar keeps the one action the page exists for, Add Event,
  // and the view chips. Line switching, editing the line and the graph's own
  // options float over the graph in .chr-tools (the Sketcher .sk-tools
  // pattern) — each is also a command, so Ctrl+P and the graph's right-click
  // reach it too (§10.1). Add-line is the empty page's one button.
  const toolbar = `<div class="classifier-toolbar">
    ${cmdBtn('chronicler.addEvent', cc, { cls: 'btn-p' })}
    ${viewBar}
  </div>`;
  const tools = [
    lineSelect,
    cmdBtn('chronicler.editLine', cc, { iconOnly: true }),
    cmdBtn('chronicler.graphOptions', cc, { iconOnly: true }),
    cmdBtn('chronicler.resetView', cc, { iconOnly: true }),
  ].filter(Boolean).join('');

  if (!timelines.length) {
    return toolbar + kindEmptyStateHtml(m, { note: t('noTimelineYet') });
  }

  let compareBar = '';
  if (view === 'compare') {
    // Compare picks another CHRONICLER MODULE (each now holds only 1 line),
    // not another line within this same module.
    const opts = modulesOfKind('chronicler').filter(cm => cm.id !== m.id);
    compareBar = `<div class="classifier-toolbar" style="margin-top:8px">
      <span class="vlbl">${t('compareWith')}:</span>
      <select id="chr-compare-select" onchange="setChroniclerCompare(this.value)">
        <option value="">--</option>
        ${opts.map(cm => `<option value="${cm.id}" ${cm.id === compareId ? 'selected' : ''}>${x(cm.name || '—')}</option>`).join('')}
      </select>
    </div>`;
  }

  return `${toolbar}${compareBar}
    <div class="chr-stage">
      ${tools ? `<div class="chr-tools">${tools}</div>` : ''}
      <div data-r="graph-host"></div>
    </div>`;
}

// Post-DOM hook (parallels mountLocatorBoard/mountDetailEditor): fetches
// events for whichever timeline(s) the current view needs and renders the
// SVG graph, then binds the shared pan/zoom/drag interactions.
// Re-mounts the CURRENT instance; it may run across several awaits while
// another instance mounts too, so it re-binds its own after each one.
async function mountChroniclerGraph() {
  const data = S.chroniclerData;
  const iid = data?.iid;
  const host = iid ? pbRoot(iid)?.querySelector('[data-r="graph-host"]') : null;
  if (!data || !host || !data.activeId) return;
  const activeTl = data.timelines.find(t => t.id === data.activeId);
  const col = activeTl?.color_code || '#06b6d4';
  const evs = sortChroniclerEvents(await api.timeline.getEvents(data.activeId), data.calendarSpec);
  pbUse(iid);

  if (data.view === 'compare') {
    if (!data.compareId) {
      host.innerHTML = `<div class="empty" style="margin-top:20px"><div class="ei">${I.timeline}</div><h3>${t('pickCompareTimeline')}</h3></div>`;
      return;
    }
    // compareId is another chronicler module's id — fetch its single line.
    const compareLines = await api.timeline.getModuleTimelines(data.compareId);
    const compareTl = compareLines[0] || null;
    const evsB = compareTl ? sortChroniclerEvents(await api.timeline.getEvents(compareTl.id), data.calendarSpec) : [];
    pbUse(iid);
    const key = `cmp-${data.activeId}-${data.compareId}`;
    host.innerHTML = buildChroniclerCompareHtml(evs, evsB, key, col, compareTl?.color_code || '#f97316');
    bindTimelineGraphInteractions(key);
    return;
  }

  if (data.view === 'calendar') {
    // The cursor starts on the first event so an existing timeline opens
    // showing something, rather than on an empty year 0.
    if (data.calCursor == null) {
      const first = evs[0];
      data.calCursor = { y: first?.s_years ?? 1, m: first?.s_month ?? 1, d: first?.s_day ?? 1 };
    }
    host.innerHTML = buildChroniclerCalendarHtml(evs, data);
    return;
  }

  if (!evs.length) {
    host.innerHTML = `<div class="empty" style="margin-top:20px"><div class="ei">${I.timeline}</div><h3>${t('noEventsYet')}</h3>
        <button class="btn btn-p" onclick="openChroniclerEventModal(${data.activeId})">${I.plus} ${t('addEvent')}</button></div>`;
    return;
  }
  if (data.view === 'downline') {
    // Mockup 22: a vertical proportional time line on the left, the event
    // list on the right. Gained wheel-zoom / right-drag-pan in Process 8
    // part 1 — see bindChroniclerDownlineInteractions for why it is a
    // separate binding from the oneline one rather than a shared axis.
    host.innerHTML = await buildChroniclerDownlineHtml(evs, data.activeId, col, data.inspectorEventId);
    pbUse(iid);
    bindChroniclerDownlineInteractions();
    return;
  }
  host.innerHTML = await buildChroniclerOneLineHtml(evs, data.activeId, col, data.inspectorEventId);
  pbUse(iid);
  bindTimelineGraphInteractions(data.activeId);
}

// ═══ Event Inspector (Plan part3 #2/#2.1/#2.2) ═════════════════════════
// A single id on chroniclerData (not a Set) — only one inspector is ever
// open at a time, in either view. That's a hard requirement (#2.2) rather
// than just a UX choice: the shared colorPicker() widget below renders
// singleton ids (#sel-color, #cpicker-grid, …), so more than one instance
// mounted at once would collide.
async function toggleChroniclerInspector(tlid, evId) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  const data = S.chroniclerData;
  if (!data) return;
  data.inspectorEventId = (data.inspectorEventId === evId) ? null : evId;
  pbUse(__iid); await mountChroniclerGraph();
}

async function buildChroniclerEventInspectorHtml(ev, tlid) {
  // Process 8 part 1: start and end sit side by side. Two stacked .fg blocks,
  // each holding a full 5-box date row, made the inspector far taller and wider
  // than the information in it justified.
  return `
    <div class="fg"><label>${t('name')} *</label><input id="chr-insp-n" value="${x(ev.event_name || '')}" onchange="saveChroniclerInspectorField(${ev.id},${tlid})"></div>
    <div class="chr-daterow">
      <div class="fg"><label>${t('startDate')} *</label>${dateInputsHTML('chr-insp-s', ev, 's_day', 's_month', 's_years', 's_hour', 's_minute', `saveChroniclerInspectorField(${ev.id},${tlid})`)}</div>
      <div class="fg"><label>${t('endDate')}</label>${dateInputsHTML('chr-insp-e', ev, 'e_day', 'e_month', 'e_years', 'e_hour', 'e_minute', `saveChroniclerInspectorField(${ev.id},${tlid})`)}</div>
    </div>
    <div class="fg"><label>${t('story')}</label><textarea id="chr-insp-story" data-wiki onchange="saveChroniclerInspectorField(${ev.id},${tlid})">${x(ev.story || '')}</textarea></div>
    ${renderChroniclerEventLinksHtml(ev)}`;
}

// ── Linked elements from other Major modules ────────────────────────────
// Same mechanism as the classifier's element links (mod/classifier-detail.js):
// entity_relation rows, here keyed tlev_<id>. migrate_v3.js already writes that
// key kind, so nothing new is needed in the schema. viewer.index supplies both
// the picker and the "which module did this come from" label the Plan asks for.
let _chrLinks = [];
let _chrLinkIndex = {};
function setChroniclerLinkData(relations, index) {
  _chrLinks = relations || [];
  _chrLinkIndex = {};
  for (const e of (index || [])) _chrLinkIndex[e.key] = e;
}

function renderChroniclerEventLinksHtml(ev) {
  const self = `tlev_${ev.id}`;
  const rows = _chrLinks.filter(l => l.from_key === self || l.to_key === self).map(l => {
    const otherKey = l.from_key === self ? l.to_key : l.from_key;
    const e = _chrLinkIndex[otherKey];
    const from = e ? `${e.moduleName || '—'}${e.moduleKind ? ` · ${kindLabel(e.moduleKind)}` : ''}` : '—';
    return `<div class="cls-link-row">
      <span class="cls-link-name" onclick="openEntityByKey('${x(otherKey)}')">${x(e ? e.name : otherKey)}</span>
      <span class="cls-link-mod">${x(from)}</span>
      ${l.label ? `<span class="cls-link-lbl">${x(l.label)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="insp-label cls-link-label">${t('linkedElements')}</div>
    <div class="cls-link-list">${rows || `<div class="cls-lv-empty">${t('noLinkedElements')}</div>`}</div>
    <button class="btn btn-g" style="margin:4px 0" onclick="openExhibitorFor(${S.activeItemNode?.moduleId ?? S.activeModuleNode?.id ?? 'null'},'tlev_${ev.id}')">${I.relation} ${t('openInExhibitor')}</button>`;
}

// v5 (APP docs/V5.md §3.5): links are read here, authored in an Exhibitor.

async function reloadChroniclerLinks() {
  const [relations, index] = await Promise.all([
    api.viewer.getRelations(S.nexus.id),
    api.viewer.index(S.nexus.id),
  ]);
  setChroniclerLinkData(relations, index);
}

// Color+icon are picked via clicking the event's dot (openChroniclerEventIconPopup)
// instead of an inline swatch grid — same click-to-popup, live-save pattern
// as hub.js's module-tree icon popup (openModuleIconPopup/saveModuleIconLive).
async function openChroniclerEventIconPopup(evId, anchor, tlid) {
  closeAllPopups();
  if (!anchor) return;
  const evs = await api.timeline.getEvents(tlid);
  const ev = evs.find(e => e.id === evId);
  if (!ev) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup icon-edit-popup';
  pop.innerHTML = await iconPicker(ev.icon || null, ev.color || null, ev.event_name);
  document.body.appendChild(pop);
  pop.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target.closest('.ipk-cell') || e.target.closest('.cswatch')) saveChroniclerEventIconLive(evId, tlid);
  });
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

async function saveChroniclerEventIconLive(evId, tlid) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  const icon = getIconPickerValue() || null;
  const color = q('#sel-color')?.value || null;
  await api.timeline.updateEventIcon(evId, icon, color);
  if (S.chroniclerData?.moduleId != null) invalidateNestItems(S.chroniclerData.moduleId);
  pbUse(__iid); await mountChroniclerGraph();
}

async function saveChroniclerInspectorField(evId, tlid) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  try {
    const n = pbQOr('#chr-insp-n')?.value.trim();
    if (!n) { toast(t('name'), 'err'); return; }
    const sid = await getDateFromInputs('chr-insp-s');
    if (!sid) { toast(t('startDate'), 'err'); return; }
    const eid = await getDateFromInputs('chr-insp-e');
    const story = pbQOr('#chr-insp-story')?.value.trim() || '';
    const existing = (await api.timeline.getEvents(tlid)).find(e => e.id === evId);
    await api.timeline.updateEvent(evId, n, sid, eid, existing?.color || null, story); // color/icon unchanged — set via the dot's icon popup
    // This same reused body (buildChroniclerEventInspectorHtml) renders in
    // two contexts (Plan part4): the module's own Oneline/Downline view, or
    // the event's own dedicated item page — refresh whichever is live.
    if (S.activeItemNode?.itemKind === 'chronicler' && S.activeItemNode?.id === evId) {
      invalidateNestItems(S.activeItemNode.moduleId);
      await openItemNode('chronicler', S.activeItemNode.moduleId, evId);
    } else {
      if (S.chroniclerData?.moduleId != null) invalidateNestItems(S.chroniclerData.moduleId);
      pbUse(__iid); await mountChroniclerGraph();
    }
    toast(t('saved'), 'ok');
  } catch (e) { toast(e.message, 'err'); console.error(e); }
}

// buildChroniclerDownlineHtml / buildChroniclerOneLineHtml /
// buildChroniclerCompareHtml and the graph display toggles moved to
// mod/chronicler-graph.js (Process 8 part 1) — see that file's header.

// The calendar view, its Custom-calendar panel and both setup wizards moved to
// mod/chronicler-calendar.js (Process 8 part 1) — see that file's header.

// Plan part3 #2.1/#2.2: each row expands into an inline, autosaving
// inspector instead of jumping to the modal — and since inspectorEventId is
// a single value (not a Set), opening one row's dropdown always collapses
// whichever other row was open.
async function buildChroniclerEventListHtml(evs, tlid, col, inspectorEventId) {
  if (!evs.length) return '';
  let html = `<div class="ph"><h4>${t('name')}</h4><button class="btn btn-p" style="padding:6px 12px;font-size:calc(12.5px * var(--fsc,1))" onclick="openChroniclerEventModal(${tlid})">${I.plus} ${t('addEvent')}</button></div><div class="objlist">`;
  for (const ev of evs) {
    const ec = ev.color_code || col;
    const sTxt = fmtDate(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
    const hasEnd = !!(ev.e_day && ev.e_month && ev.e_years);
    const dateTxt = hasEnd ? `${sTxt} - ${fmtDate(ev.e_day, ev.e_month, ev.e_years, ev.e_hour, ev.e_minute)}` : sTxt;
    const open = inspectorEventId === ev.id;
    // Process 8 part 1: name, date and chevron share ONE row — the date used to
    // sit on a second line, which made two adjacent collapsed events read as
    // one four-line block. Delete moved into the expanded body (below), so the
    // collapsed row carries nothing destructive.
    html += `<div class="chr-insp-row${open ? ' open' : ''}">
      <div class="objrow" onclick="toggleChroniclerInspector(${tlid},${ev.id})">
        <div class="odot" style="background:${ec};cursor:pointer" onclick="event.stopPropagation();openChroniclerEventIconPopup(${ev.id},this,${tlid})"></div>
        <div class="oname chr-ev-name">${x(ev.event_name || '—')}</div>
        <div class="chr-ev-date">${x(dateTxt)}</div>
        <svg class="icon tree-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="${open ? '6 9 12 15 18 9' : '9 18 15 12 9 6'}"/></svg>
      </div>
      ${open ? `<div class="chr-insp-body" id="chr-insp-body-${ev.id}">${await buildChroniclerEventInspectorHtml(ev, tlid)}
        <div class="chr-insp-foot"><button class="btn btn-d" onclick="deleteChroniclerEvent(${ev.id},${tlid})">${I.delete} ${t('delete')}</button></div>
      </div>` : ''}
    </div>`;
  }
  html += `</div>`;
  return html;
}

// Line and event CRUD live in mod/chronicler-crud.js (v5 Part 8 split).
