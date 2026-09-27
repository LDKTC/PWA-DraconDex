// Date+time input row builder and reader — shared by Chronicler's event
// modal (mod/chronicler.js) with the timeline domain, not Director-specific.
function dateInputsHTML(prefix,ev,dayKey,mKey,yKey,hKey,minKey,onchangeFn=''){
  const oc = onchangeFn ? ` onchange="${onchangeFn}"` : '';
  // A day need not have 24 hours, nor an hour 60 minutes, once the calendar
  // is user-defined — these were hardcoded max="23"/max="59".
  const spec = timelineCalendarSpec();
  const hoursPerDay = calCanonicalCount(spec, 'day') || 24;
  const minsPerHour = calCanonicalCount(spec, 'hour') || 60;
  return `<div class="date-row-inline">
    <input id="${prefix}-d" class="date-inp" type="number" placeholder="DD" min="1" value="${ev?ev[dayKey]||'':''}"${oc}>
    <span class="date-sep">/</span>
    <input id="${prefix}-m" class="date-inp" type="number" placeholder="MM" min="1" value="${ev?ev[mKey]||'':''}"${oc}>
    <span class="date-sep">/</span>
    <input id="${prefix}-y" class="date-inp date-inp-y" type="number" placeholder="YYYY" value="${ev?ev[yKey]||'':''}"${oc}>
    <input id="${prefix}-h" class="date-inp" type="number" placeholder="HH" min="0" max="${hoursPerDay-1}" value="${ev?ev[hKey]||0:0}"${oc}>
    <span class="date-sep">:</span>
    <input id="${prefix}-min" class="date-inp" type="number" placeholder="MM" min="0" max="${minsPerHour-1}" value="${ev?ev[minKey]||0:0}"${oc}>
  </div>`;
}
async function getDateFromInputs(prefix){
  // The current page instance's row first (an inline inspector), else the
  // one open modal's.
  const v = (sfx) => parseInt((pbQ(`#${prefix}-${sfx}`) || q(`#${prefix}-${sfx}`))?.value) || 0;
  const d=v('d'), m=v('m'), y=v('y');
  if(!d||!m||!y) return null;
  const h=v('h'), min=v('min');
  return await api.timeline.getOrCreateDate(d,m,y,h,min);
}

// ── Shared graph builder (Chronicler, progress.md Phase 8, reuses this
// exact SVG + bindTimelineGraphInteractions for its own Down-line view) ──
// Which calendar the graphs are currently drawing in. Chronicler owns the
// spec; Wanderer borrows the one belonging to whichever Chronicler module it
// references. Falls back to the default so a caller with neither loaded (a
// stray render, the Classifier's date attribute) still works.
function timelineCalendarSpec(){
  // Both are the CURRENT page instance's (page/page.js) — v5 Part 8.
  return S.chroniclerData?.calendarSpec || S.wandererData?.calendarSpec || calSpecNormalize(null);
}

// Absolute position of a date, in the calendar's own minutes. This used to be
// Date.UTC, which for a fictional calendar was not merely imprecise but lossy:
// it rolls over rather than clamping, so Date.UTC(1200,0,35) and
// Date.UTC(1200,1,4) were the SAME instant and two distinct dates stacked on
// one pixel. It also read years 0-99 as 1900+y, and the `!y` guard threw away
// year 0 entirely, pinning those events to the axis's left edge.
// Name and signature are unchanged — mod/chronicler-graph.js and
// mod/wanderer.js call this in four places.
function timelineTsFromParts(d,m,y,hh,min){
  return calToOrdinal(timelineCalendarSpec(), { y, m, d, h: hh, mi: min });
}

// Month/year tick marks along the axis so gaps read as a true time scale,
// not just proportional dot spacing. Ticks carry data-tick-ts so
// updateTimelineGraphX() (pan/zoom) can reposition them like everything else.
function buildTimelineRulerSvg(minTs, maxTs, xFromTs, LINE_Y){
  // Ticks now step in the USER's units and carry the calendar's own month
  // names. The old body was wholly Gregorian — 12 months implied by
  // getUTCMonth(), 365*4 for the year/month threshold, 86400000 ms per day —
  // so a fictional calendar got ticks labelled with real-world months nobody
  // had typed, spaced by a year length it does not have.
  const ticks = calRulerTicks(timelineCalendarSpec(), minTs, maxTs);
  let svg = '';
  for(const tk of ticks){
    const cx = xFromTs(tk.ordinal);
    svg += `<line class="tl-ruler-tick" data-tick-ts="${tk.ordinal}" x1="${cx}" y1="${LINE_Y-14}" x2="${cx}" y2="${LINE_Y+14}" stroke="var(--border)" stroke-width="1.5" opacity="0.55"/>
      <text class="tl-ruler-label" data-tick-ts="${tk.ordinal}" x="${cx}" y="${LINE_Y+30}" text-anchor="middle" font-size="10.5" fill="var(--t3-aa,var(--t2))">${x(tk.label)}</text>`;
  }
  return svg;
}

// v5 Part 8: the graph's elements are looked up inside the current page
// instance (page/page.js pbQ), not in the window — a timeline shown on two
// pages, or a Chronicler beside a Wanderer, no longer answers for the other.
function applyTimelineGraphTransform(tlid, g){
  const st = timelineGraphState[tlid];
  g = g || pbQ('#timeline-graph-content');
  if(!st || !g) return;
  g.setAttribute('transform', `translate(${st.tx},0)`);
}

function bindTimelineGraphInteractions(tlid){
  const board = pbQ('#timeline-graph-board');
  const svg = pbQ('#timeline-graph-svg');
  const tip = pbQ('#timeline-axis-tip');
  const axis = pbQ('#timeline-axis-line');
  const content = pbQ('#timeline-graph-content');
  if(!board || !svg) return;
  canvasEngage(board);
  const st = timelineGraphState[tlid] ||= { scale:1, tx:0, yOffsets:{} };
  let pan = null;
  let nodeDrag = null;
  let movedNode = false;
  // One binding per board element — a second board elsewhere keeps its own.
  board._tgAbort?.abort();
  const controller = new AbortController();
  board._tgAbort = controller;

  const svgX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return ((clientX - rect.left) / rect.width) * vb.width;
  };
  const svgY = (clientY) => {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return ((clientY - rect.top) / rect.height) * vb.height;
  };
  const margin = Number(svg.dataset.margin||80);
  const usable = Number(svg.dataset.usable||1);
  const cardW = Number(svg.dataset.cardW||96);
  const minTs = Number(svg.dataset.minTs||0);
  const spanTs = Number(svg.dataset.spanTs||1);
  const clampTx = () => {
    const width = svg.viewBox.baseVal.width;
    const minTx = Math.min(0, width - margin - (margin + usable) * st.scale);
    st.tx = Math.max(minTx - 80, Math.min(80, st.tx));
  };
  const xFromTs = (ts) => {
    if(ts===null || ts==='') return margin;
    const ratio = (ts - minTs)/spanTs;
    return margin + (ratio*usable*st.scale);
  };
  const updateTimelineGraphX = () => {
    const axisLine = axis;
    if(axisLine) axisLine.setAttribute('x2', String(margin + usable * st.scale));
    svg.querySelectorAll('[data-event-range]').forEach(rect => {
      const s = Number(rect.dataset.startTs||'');
      const e = Number(rect.dataset.endTs||'');
      if(isNaN(s) || isNaN(e)) return;
      let xStart = xFromTs(s);
      let xEnd = xFromTs(e);
      if(xEnd < xStart){ const t = xStart; xStart = xEnd; xEnd = t; }
      rect.setAttribute('x', xStart);
      rect.setAttribute('width', Math.max(2, xEnd - xStart));
    });
    svg.querySelectorAll('[data-event-stem]').forEach(stem => {
      const s = Number(stem.dataset.startTs||'');
      if(isNaN(s)) return;
      const x = xFromTs(s);
      stem.setAttribute('x1', x);
      stem.setAttribute('x2', x);
    });
    svg.querySelectorAll('[data-event-dot]').forEach(dot => {
      const s = Number(dot.dataset.startTs||'');
      if(isNaN(s)) return;
      dot.setAttribute('cx', xFromTs(s));
    });
    svg.querySelectorAll('[data-event-node]').forEach(node => {
      const s = Number(node.dataset.startTs||'');
      if(isNaN(s)) return;
      node.setAttribute('cx', xFromTs(s));
    });
    // Chronicler one-line view's tick connector + name/date labels (Plan
    // part3 #1 — these used to have no data-* key at all, so zooming moved
    // the dot but left them behind).
    svg.querySelectorAll('[data-event-tick]').forEach(tick => {
      const s = Number(tick.dataset.startTs||'');
      if(isNaN(s)) return;
      const x = xFromTs(s);
      tick.setAttribute('x1', x);
      tick.setAttribute('x2', x);
    });
    svg.querySelectorAll('[data-event-label]').forEach(label => {
      const s = Number(label.dataset.startTs||'');
      if(isNaN(s)) return;
      label.setAttribute('x', xFromTs(s));
    });
    svg.querySelectorAll('[data-event-date]').forEach(label => {
      const s = Number(label.dataset.startTs||'');
      if(isNaN(s)) return;
      label.setAttribute('x', xFromTs(s));
    });
    svg.querySelectorAll('[data-event-card]').forEach(card => {
      const s = Number(card.dataset.startTs||'');
      if(isNaN(s)) return;
      card.setAttribute('x', xFromTs(s) - (cardW / 2));
    });
    svg.querySelectorAll('.tl-ruler-tick').forEach(tick => {
      const s = Number(tick.dataset.tickTs||'');
      if(isNaN(s)) return;
      const tx = xFromTs(s);
      tick.setAttribute('x1', tx);
      tick.setAttribute('x2', tx);
    });
    svg.querySelectorAll('.tl-ruler-label').forEach(label => {
      const s = Number(label.dataset.tickTs||'');
      if(isNaN(s)) return;
      label.setAttribute('x', xFromTs(s));
    });
    svg.querySelectorAll('.tl-cmp-link').forEach(link => {
      const a = Number(link.dataset.aTs||''), b = Number(link.dataset.bTs||'');
      if(isNaN(a) || isNaN(b)) return;
      link.setAttribute('x1', xFromTs(a));
      link.setAttribute('x2', xFromTs(b));
    });
  };

  // Bound once per board element: this function re-runs on every re-render
  // of the same board, and an addEventListener pair would stack.
  if (!board._ctxBound) { board._ctxBound = true; bindCanvasCtx(board, 'chronicler.graph'); }
  board.onwheel = (e) => {
    // The page scrolls past the graph until it is clicked or Ctrl is held
    // (page/canvas-frame.js, §12.3).
    if (!canvasWheelTakes(board, e)) return;
    e.preventDefault();
    const mx = svgX(e.clientX);
    const oldScale = st.scale || 1;
    const nextScale = Math.max(0.5, Math.min(8, oldScale * (e.deltaY < 0 ? 1.12 : 0.88)));
    const worldX = (mx - st.tx) / oldScale;
    st.scale = nextScale;
    st.tx = mx - worldX * nextScale;
    clampTx();
    applyTimelineGraphTransform(tlid, content);
    updateTimelineGraphX();
  };
  board.onmousedown = (e) => {
    if(e.button !== 2) return;
    e.preventDefault();
    pan = { x:e.clientX, tx:st.tx };
    board.classList.add('is-panning');
  };
  document.addEventListener('mousemove', onMove, { signal: controller.signal });
  document.addEventListener('mouseup', onUp, { signal: controller.signal });

  function onMove(e){
    if(pan){
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      st.tx = pan.tx + ((e.clientX - pan.x) / rect.width) * vb.width;
      clampTx();
      applyTimelineGraphTransform(tlid, content);
    }
    if(nodeDrag){
      movedNode = true;
      const y = Math.max(34, Math.min(svg.viewBox.baseVal.height - 34, svgY(e.clientY)));
      const id = nodeDrag.id;
      st.yOffsets[id] = y;
      const node = svg.querySelector(`[data-event-node="${id}"]`);
      const stem = svg.querySelector(`[data-event-stem="${id}"]`);
      const card = svg.querySelector(`[data-event-card="${id}"]`);
      if(node) node.setAttribute('cy', y);
      if(stem) stem.setAttribute('y2', y);
      if(card){
        const up = node?.dataset.cardUp === '1';
        card.setAttribute('y', up ? y - 66 : y + 10);
      }
    }
  }
  function onUp(){
    pan = null;
    nodeDrag = null;
    board.classList.remove('is-panning');
    setTimeout(()=>{ movedNode = false; }, 0);
  }

  if(axis && tip){
    axis.addEventListener('mousemove', e => {
      const xWorld = svgX(e.clientX) - st.tx;
      const ratio = Math.max(0, Math.min(1, (xWorld - margin) / (usable * st.scale)));
      tip.textContent = fmtTimelinePoint(minTs + ratio * spanTs);
      tip.style.left = `${e.clientX - board.getBoundingClientRect().left + 10}px`;
      tip.style.top = `${e.clientY - board.getBoundingClientRect().top - 28}px`;
      tip.classList.remove('hidden');
    });
    axis.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  }
}
