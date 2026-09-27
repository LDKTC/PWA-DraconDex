'use strict';
// ═══ Chronicler graphs (Process 8 part 1) ══════════════════════════════
// Split out of mod/chronicler.js, which was already 575 lines — over the band
// dracondex-file-arch flags — before this round added pan/zoom to Downline and
// icon/date rendering to Oneline. Everything that draws an SVG timeline lives
// here; the module shell, event CRUD, the inspector and the calendar view stay
// in chronicler.js.
//
// buildChroniclerOneLineHtml and its geometry are also consumed by
// mod/wanderer.js (its time strip), so the signature is fixed.

// Per-module graph display toggles (Plan: "more menu เพื่อ toggle icon, date
// on/off บน graph"). Persisted in module_ui like `view`/`calendarConfig`
// rather than in S.settings, because this is a property of one timeline's
// presentation, not a global UI preference.
function chroniclerGraphShows() {
  const d = S.chroniclerData || {};
  return { icon: d.graphShowIcon !== false, date: d.graphShowDate !== false };
}

async function toggleChroniclerGraphOption(key) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  const d = S.chroniclerData;
  if (!d) return;
  const prop = key === 'icon' ? 'graphShowIcon' : 'graphShowDate';
  d[prop] = d[prop] === false;
  await api.module.setUi(d.moduleId, prop, d[prop] ? '1' : '0');
  const pop = document.querySelector('.chr-graph-options-popup');
  if (pop) pop.innerHTML = buildChroniclerGraphOptionsHtml();
  pbUse(__iid); await mountChroniclerGraph();
}

function buildChroniclerGraphOptionsHtml() {
  const s = chroniclerGraphShows();
  const row = (key, on, labelKey) =>
    `<div class="togglerow nest-opt-row" onclick="toggleChroniclerGraphOption('${key}')"><span class="tg${on ? ' on' : ''}"></span>${t(labelKey)}</div>`;
  return row('icon', s.icon, 'chrGraphShowIcon') + row('date', s.date, 'chrGraphShowDate');
}

function openChroniclerGraphOptions(anchor) {
  closeAllPopups();
  if (!anchor) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup chr-graph-options-popup';
  pop.innerHTML = buildChroniclerGraphOptionsHtml();
  document.body.appendChild(pop);
  pop.addEventListener('click', e => e.stopPropagation());
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

// An event's icon on the graph. Inline SVG can't host the icon markup directly
// (it is HTML — a <span> glyph, an <img>, or an <svg> of its own), so it goes
// in a foreignObject. Only drawn when the event actually has an icon: an empty
// box on every node would just be noise.
function chroniclerEventIconSvg(ev, cx, cy, size = 15) {
  if (!ev.icon) return '';
  return `<foreignObject data-event-icon="${ev.id}" data-start-ts="${ev.__ts || ''}" data-oy="${cy}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}">
    <div xmlns="http://www.w3.org/1999/xhtml" class="chr-node-icon">${iconRefHtml(ev.icon, '')}</div>
  </foreignObject>`;
}

// ── Downline ────────────────────────────────────────────────────────────
async function buildChroniclerDownlineHtml(evs, tlid, col, inspectorEventId) {
  const TOP = 26, W = 340, LINE_X = 40;
  const H = Math.max(360, Math.min(720, evs.length * 96));
  const tsOf = (ev) => timelineTsFromParts(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
  const allTs = evs.map(tsOf).filter(ts => ts !== null);
  const minTs = allTs.length ? Math.min(...allTs) : 0;
  const spanTs = Math.max(1, (allTs.length ? Math.max(...allTs) : 1) - minTs);
  const yFromTs = (ts) => ts === null ? TOP : TOP + ((ts - minTs) / spanTs) * (H - 2 * TOP);
  const shows = chroniclerGraphShows();
  // Zoom/pan (bound below) recomputes each element's own position from its
  // data-oy attribute instead of scaling a wrapping <g> — a group scale()
  // would stretch circle radius, font size and icon size along with the
  // intended spacing, exactly the bug Oneline avoids on its axis by
  // recomputing x from data-start-ts. Only the vertical line's own y1/y2
  // (also data-o*-tagged, below) is meant to visually lengthen with zoom.
  let svg = `<svg id="chr-downline-svg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <g id="chr-downline-content">
    <line id="chr-downline-line" data-oy1="${TOP - 10}" data-oy2="${H - TOP + 10}" x1="${LINE_X}" y1="${TOP - 10}" x2="${LINE_X}" y2="${H - TOP + 10}" stroke="var(--border)" stroke-width="2"/>`;
  for (const ev of evs) {
    const ts = tsOf(ev), y = yFromTs(ts), ec = ev.color_code || col;
    const sTxt = fmtDate(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
    // Plan: the date trails the name on the SAME line instead of sitting on a
    // second line under it, so adjacent events can't have their two-line
    // clusters overlap and read as one event.
    const label = shows.date ? `${ev.event_name || '—'}  ·  ${sTxt}` : (ev.event_name || '—');
    const iconX = LINE_X + 20;
    const textX = (shows.icon && ev.icon) ? iconX + 20 : iconX;
    svg += `<circle data-oy="${y}" cx="${LINE_X}" cy="${y}" r="6" fill="${ec}" style="cursor:pointer" onclick="toggleChroniclerInspector(${tlid},${ev.id})"/>
      ${shows.icon ? chroniclerEventIconSvg(ev, iconX + 7, y - 4) : ''}
      <text data-oy="${y}" x="${textX}" y="${y + 1}" fill="var(--t1)" font-size="12.5" style="cursor:pointer" onclick="toggleChroniclerInspector(${tlid},${ev.id})">${x(label)}</text>`;
  }
  svg += `</g></svg>`;
  return `<div class="chr-downline">
    <div class="chr-downline-graph" id="chr-downline-board">${svg}<div class="chr-downline-note" data-no-i18n>${t('trueTimeScaleNote')}</div></div>
    <div class="chr-downline-list">${await buildChroniclerEventListHtml(evs, tlid, col, inspectorEventId)}</div>
  </div>`;
}

// Downline had no interaction at all before this round. Deliberately its own
// binding rather than bindTimelineGraphInteractions: that one is a singleton
// (timelineGraphCleanup aborts whatever was bound last) and works on the X
// axis by recomputing every element's x from data-start-ts. Downline is
// vertical, so sharing it would mean teaching it a second axis and giving up
// the single-graph invariant the comment there relies on — but it follows the
// same "recompute position from a stored original, don't scale the element
// itself" strategy: every mover carries its pre-zoom y as data-oy, and
// updateChroniclerDownlineY() maps it through the current scale/pan without
// ever touching r, font-size, or icon width/height.
function updateChroniclerDownlineY(st) {
  const svg = pbQ('#chr-downline-svg');
  if (!svg) return;
  svg.querySelectorAll('[data-oy]').forEach((el) => {
    const ny = Number(el.dataset.oy) * st.scale + st.ty;
    if (el.tagName === 'circle') el.setAttribute('cy', ny);
    else if (el.tagName === 'text') el.setAttribute('y', ny + 1);
    else if (el.tagName === 'foreignObject') {
      const size = Number(el.getAttribute('height')) || 15;
      el.setAttribute('y', ny - size / 2);
    }
  });
  const line = pbQ('#chr-downline-line');
  if (line) {
    line.setAttribute('y1', Number(line.dataset.oy1) * st.scale + st.ty);
    line.setAttribute('y2', Number(line.dataset.oy2) * st.scale + st.ty);
  }
}

function bindChroniclerDownlineInteractions() {
  const board = pbQ('#chr-downline-board');
  if (!board || !pbQ('#chr-downline-content')) return;
  // One binding per board element (v5 Part 8: several boards may be live).
  board._dlAbort?.abort();
  const ac = new AbortController();
  board._dlAbort = ac;
  canvasEngage(board);
  const st = (S.chroniclerData.downlineView ||= { scale: 1, ty: 0 });
  const iid = pbCurrent();
  updateChroniclerDownlineY(st);

  board.addEventListener('wheel', (e) => {
    if (!canvasWheelTakes(board, e)) return; // the page scrolls past it (§12.3)
    e.preventDefault();
    pbUse(iid);
    const my = e.clientY - board.getBoundingClientRect().top + board.scrollTop;
    const old = st.scale;
    st.scale = Math.max(0.5, Math.min(8, old * (e.deltaY < 0 ? 1.12 : 0.88)));
    // Keep whatever is under the cursor under the cursor, same anchoring the
    // oneline wheel handler uses.
    st.ty = my - ((my - st.ty) / old) * st.scale;
    updateChroniclerDownlineY(st);
  }, { signal: ac.signal, passive: false });

  // Right-button drag, matching Oneline's pan gesture — left-drag stays free
  // for text selection and for clicking a node.
  let panning = false, lastY = 0;
  board.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    panning = true; lastY = e.clientY;
    board.classList.add('is-panning');
    e.preventDefault();
  }, { signal: ac.signal });
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    pbUse(iid);
    st.ty += e.clientY - lastY; lastY = e.clientY; updateChroniclerDownlineY(st);
  }, { signal: ac.signal });
  window.addEventListener('mouseup', () => {
    panning = false; board.classList.remove('is-panning');
  }, { signal: ac.signal });
  bindCanvasCtx(board, 'chronicler.graph', { resettable: true }, { signal: ac.signal });
}

function resetChroniclerDownlineView() {
  if (!S.chroniclerData) return;
  S.chroniclerData.downlineView = { scale: 1, ty: 0 };
  mountChroniclerGraph();
}

// ── Oneline ─────────────────────────────────────────────────────────────
async function buildChroniclerOneLineHtml(evs, tlid, col, inspectorEventId) {
  // LINE_Y/SVG_H grew this round to make room for the icon row, which sits
  // outside the date (Plan: "icon ... อยู่ด้านนอกสุดโดยอยู่นอกไปกว่า date").
  const MARGIN = 80, LINE_Y = 100, SVG_H = 200;
  const hostW = (pbRoot(pbCurrent())?.offsetWidth || q('#main-inner')?.offsetWidth || 900);
  const trackW = Math.max(hostW, 900);
  const usable = trackW - (2 * MARGIN);
  const graphState = timelineGraphState[tlid] ||= { scale: 1, tx: 0, yOffsets: {} };
  const startTs = evs.map(ev => timelineTsFromParts(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute));
  const allTs = startTs.filter(ts => ts !== null);
  const minTs = allTs.length ? Math.min(...allTs) : 0;
  const maxTs = allTs.length ? Math.max(...allTs) : 1;
  const spanTs = Math.max(1, maxTs - minTs);
  const xFromTs = (ts) => ts === null ? MARGIN : MARGIN + ((ts - minTs) / spanTs) * usable * graphState.scale;
  const shows = chroniclerGraphShows();

  let svg = `<svg id="timeline-graph-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${trackW} ${SVG_H}" data-min-ts="${minTs}" data-span-ts="${spanTs}" data-usable="${usable}" data-margin="${MARGIN}" data-line-y="${LINE_Y}" data-card-w="0" data-tlid="${tlid}">
    <g id="timeline-graph-content" transform="translate(${graphState.tx},0)">
    <line id="timeline-axis-line" x1="${MARGIN}" y1="${LINE_Y}" x2="${MARGIN + usable * graphState.scale}" y2="${LINE_Y}" stroke="var(--border)" stroke-width="8" stroke-linecap="round" opacity="0.75" style="cursor:crosshair"/>
    ${buildTimelineRulerSvg(minTs, maxTs, xFromTs, LINE_Y)}`;
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i], ec = ev.color_code || col, xi = xFromTs(startTs[i]);
    ev.__ts = startTs[i] || '';
    const sTxt = fmtDate(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
    // Mockup 04: event name + date alternate above/below the axis with a
    // short connector tick, instead of tooltip-only dots.
    const above = i % 2 === 0;
    const tickY1 = above ? LINE_Y - 10 : LINE_Y + 10;
    const tickY2 = above ? LINE_Y - 26 : LINE_Y + 26;
    const nameY = above ? LINE_Y - 42 : LINE_Y + 42;
    // Plan: the date faces AWAY from the axis — below the name when the cluster
    // hangs below, above the name when it sits above. It used to be -30 in the
    // `above` case, i.e. between the name and the axis, which read as the date
    // belonging to the axis rather than to its event.
    const dateY = above ? LINE_Y - 56 : LINE_Y + 56;
    const iconY = above ? LINE_Y - 74 : LINE_Y + 72;
    // data-event-tick/-label/-date/-icon carry the same start-ts key as the dot
    // so updateTimelineGraphX() (pan/zoom) repositions the whole cluster
    // together — without these, only the dot moved on zoom and the rest were
    // left behind at their original x (Plan part3 #1).
    svg += `<line data-event-tick="${ev.id}" data-start-ts="${startTs[i] || ''}" x1="${xi}" y1="${tickY1}" x2="${xi}" y2="${tickY2}" stroke="var(--border)" stroke-width="1"/>
      <text data-event-label="${ev.id}" data-start-ts="${startTs[i] || ''}" x="${xi}" y="${nameY}" text-anchor="middle" fill="var(--t1)" font-size="12" style="cursor:pointer" onclick="toggleChroniclerInspector(${tlid},${ev.id})">${x(ev.event_name || '—')}</text>
      ${shows.date ? `<text data-event-date="${ev.id}" data-start-ts="${startTs[i] || ''}" x="${xi}" y="${dateY}" text-anchor="middle" fill="var(--t3-aa,var(--t2))" font-size="10">${x(sTxt)}</text>` : ''}
      ${shows.icon ? chroniclerEventIconSvg(ev, xi, iconY) : ''}
      <circle data-event-dot="${ev.id}" data-start-ts="${startTs[i] || ''}" cx="${xi}" cy="${LINE_Y}" r="7" fill="${ec}" style="cursor:pointer" onclick="toggleChroniclerInspector(${tlid},${ev.id})"><title>${x(ev.event_name || '')} — ${x(sTxt)}</title></circle>`;
  }
  svg += `</g></svg>`;

  // Plan part3 #2: clicking a node selects it and shows an editable
  // inspector below the graph instead of only opening the full modal.
  let inspHtml = '';
  const selEv = inspectorEventId ? evs.find(e => e.id === inspectorEventId) : null;
  if (selEv) {
    inspHtml = `<div class="chr-insp-row open" style="margin-top:14px">
      <div class="ph"><h4>${x(selEv.event_name || t('name'))}</h4>
        <button class="btn btn-g btn-i" onclick="toggleChroniclerInspector(${tlid},${selEv.id})" title="${t('close')}">${I.close}</button>
      </div>
      <div class="chr-insp-body" id="chr-oneline-insp">${await buildChroniclerEventInspectorHtml(selEv, tlid)}</div>
    </div>`;
  }
  return `<div class="timeline-graph-board" id="timeline-graph-board" style="height:${SVG_H}px">${svg}<div id="timeline-axis-tip" class="timeline-axis-tip hidden"></div></div>${inspHtml}`;
}

// Dashed connectors join events that share the exact same start date
// (same timeline_date row id, from api.timeline.getOrCreateDate's dedupe) —
// the natural definition of "the same moment" across two lines.
function buildChroniclerCompareHtml(evsA, evsB, key, colA, colB) {

  const MARGIN = 80, LINE_Y_A = 90, LINE_Y_B = 260, SVG_H = 340;
  const hostW = (pbRoot(pbCurrent())?.offsetWidth || q('#main-inner')?.offsetWidth || 900);
  const trackW = Math.max(hostW, 900);
  const usable = trackW - (2 * MARGIN);
  const graphState = timelineGraphState[key] ||= { scale: 1, tx: 0, yOffsets: {} };
  const tsOf = (ev) => timelineTsFromParts(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
  const allTs = [...evsA, ...evsB].map(tsOf).filter(ts => ts !== null);
  const minTs = allTs.length ? Math.min(...allTs) : 0;
  const maxTs = allTs.length ? Math.max(...allTs) : 1;
  const spanTs = Math.max(1, maxTs - minTs);
  const xFromTs = (ts) => ts === null ? MARGIN : MARGIN + ((ts - minTs) / spanTs) * usable * graphState.scale;

  let svg = `<svg id="timeline-graph-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${trackW} ${SVG_H}" data-min-ts="${minTs}" data-span-ts="${spanTs}" data-usable="${usable}" data-margin="${MARGIN}" data-line-y="${LINE_Y_A}" data-card-w="0" data-tlid="${key}">
    <g id="timeline-graph-content" transform="translate(${graphState.tx},0)">
    <line id="timeline-axis-line" x1="${MARGIN}" y1="${LINE_Y_A}" x2="${MARGIN + usable * graphState.scale}" y2="${LINE_Y_A}" stroke="var(--border)" stroke-width="8" stroke-linecap="round" opacity="0.75"/>
    <line x1="${MARGIN}" y1="${LINE_Y_B}" x2="${MARGIN + usable * graphState.scale}" y2="${LINE_Y_B}" stroke="var(--border)" stroke-width="8" stroke-linecap="round" opacity="0.75"/>
    ${buildTimelineRulerSvg(minTs, maxTs, xFromTs, (LINE_Y_A + LINE_Y_B) / 2)}`;

  for (const evA of evsA) {
    const evB = evsB.find(e => e.start_at === evA.start_at);
    if (!evB) continue;
    const aTs = tsOf(evA), bTs = tsOf(evB);
    svg += `<line class="tl-cmp-link" data-a-ts="${aTs}" data-b-ts="${bTs}" x1="${xFromTs(aTs)}" y1="${LINE_Y_A}" x2="${xFromTs(bTs)}" y2="${LINE_Y_B}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5,4" opacity="0.85"/>`;
  }
  for (const ev of evsA) {
    const ts = tsOf(ev), ec = ev.color_code || colA, sTxt = fmtDate(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
    svg += `<circle data-event-dot="${ev.id}" data-start-ts="${ts || ''}" cx="${xFromTs(ts)}" cy="${LINE_Y_A}" r="7" fill="${ec}" style="cursor:pointer" onclick="openChroniclerEventModal(${ev.timeline_id},${ev.id})"><title>${x(ev.event_name || '')} — ${x(sTxt)}</title></circle>`;
  }
  for (const ev of evsB) {
    const ts = tsOf(ev), ec = ev.color_code || colB, sTxt = fmtDate(ev.s_day, ev.s_month, ev.s_years, ev.s_hour, ev.s_minute);
    svg += `<circle data-event-dot="${ev.id}" data-start-ts="${ts || ''}" cx="${xFromTs(ts)}" cy="${LINE_Y_B}" r="7" fill="${ec}" style="cursor:pointer" onclick="openChroniclerEventModal(${ev.timeline_id},${ev.id})"><title>${x(ev.event_name || '')} — ${x(sTxt)}</title></circle>`;
  }
  svg += `</g></svg>`;
  return `<div class="timeline-graph-board" id="timeline-graph-board" style="height:${SVG_H}px">${svg}<div id="timeline-axis-tip" class="timeline-axis-tip hidden"></div></div>`;
}
