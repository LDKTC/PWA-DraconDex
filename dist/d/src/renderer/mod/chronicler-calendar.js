'use strict';
// ═══ Chronicler calendar view + Custom-calendar (Process 8 part 1) ═════
// Split out of mod/chronicler.js the same way mod/chronicler-graph.js was;
// the file-arch checker had already named "Calendar view" as one of that
// file's seams. Everything the calendar owns lives here: the grid, the view
// bar, the Custom-calendar panel, the two setup flows and templates.
//
// The date maths is NOT here — it is core/calendar-engine.js, which is pure
// and unit-tested. This file is presentation and persistence only.
//
// Persistence: the module's own spec is JSON in module_ui.calendarConfig
// (per-module display config with no ids — what that blob is for). Templates
// are a real nexus-scoped table, because they must be shareable across every
// Chronicler in the vault, which module_ui cannot express.

// Which units the view bar offers, and which the panel can edit. The view bar
// deliberately omits the smallest unit, as the Plan asks —
// a grid of minutes is not a calendar.
function chroniclerCalUnits() {
  return (S.chroniclerData?.calendarSpec?.units || []);
}
function chroniclerCalViewUnits() {
  return chroniclerCalUnits().slice(1);
}

// Builtin unit keys get a translated label; user-invented ones are shown
// verbatim under data-no-i18n, so translateCommonUiText() cannot rewrite a
// name the user chose (the known quirk in docs/SYSTEMS.md §11).
const CHRONICLER_CAL_UNIT_KEY = {
  minute: 'calUnitMinute', hour: 'calUnitHour', day: 'calUnitDay',
  week: 'calUnitWeek', month: 'calUnitMonth', year: 'calUnitYear',
};
function chroniclerCalUnitLabel(key) {
  return CHRONICLER_CAL_UNIT_KEY[key] ? t(CHRONICLER_CAL_UNIT_KEY[key]) : key;
}
function chroniclerCalIsBuiltinUnit(key) {
  return !!CHRONICLER_CAL_UNIT_KEY[key];
}

// ── Persistence ─────────────────────────────────────────────────────────
// Live-save, matching how the event inspector and the graph toggles behave.
// The preview is then always the real spec rather than a draft that could
// disagree with it.
async function saveChroniclerCalendarSpec(spec) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  const d = S.chroniclerData;
  if (!d) return;
  d.calendarSpec = calSpecNormalize(spec);
  d.calendarConfig = d.calendarSpec;
  await api.module.setUi(d.moduleId, 'calendarConfig', JSON.stringify(d.calendarSpec));
  pbUse(__iid); await mountChroniclerGraph();
}

function chroniclerCalSpec() {
  return S.chroniclerData?.calendarSpec || calSpecNormalize(null);
}

// Every edit goes through here so a structurally invalid spec can never be
// written: calSpecNormalize repairs it on the way in, and the caller mutates
// a copy rather than the live object.
function chroniclerCalEditUnit(unitKey, mutate) {
  const spec = JSON.parse(JSON.stringify(chroniclerCalSpec()));
  const u = spec.units.find(v => v.key === unitKey);
  if (!u) return null;
  mutate(u, spec);
  return spec;
}

// ── The grid ────────────────────────────────────────────────────────────
// One page per unit: the cells are that unit's CHILDREN. A month shows its
// days, a year its months, a day its hours. Under the old code the only
// possible page was a month, and its day-name header was decorative — day 1
// always sat in column 1 because nothing computed a weekday.
function chroniclerCalCells(spec, zoom, cursor) {
  const monthsInYear = calCanonicalCount(spec, 'year') || 12;
  if (zoom === 'year') {
    return Array.from({ length: monthsInYear }, (_, i) => ({
      label: calChildName(spec, 'year', i) || String(i + 1),
      match: (ev) => ev.s_years === cursor.y && ev.s_month === i + 1,
    }));
  }
  if (zoom === 'month') {
    const len = calMonthLength(spec, cursor.y, cursor.m - 1);
    return Array.from({ length: len }, (_, i) => ({
      label: String(i + 1),
      match: (ev) => ev.s_years === cursor.y && ev.s_month === cursor.m && ev.s_day === i + 1,
    }));
  }
  if (zoom === 'week') {
    const len = calCanonicalCount(spec, 'week') || 7;
    const startIdx = calDayIndex(spec, cursor.y, cursor.m, cursor.d)
      - calCycleSlot(spec, 'week', calDayIndex(spec, cursor.y, cursor.m, cursor.d));
    return Array.from({ length: len }, (_, i) => {
      const p = calPartsFromDayIndex(spec, startIdx + i);
      return {
        label: `${p.d}/${p.m}`,
        match: (ev) => ev.s_years === p.y && ev.s_month === p.m && ev.s_day === p.d,
      };
    });
  }
  if (zoom === 'day') {
    const hpd = calCanonicalCount(spec, 'day') || 24;
    return Array.from({ length: hpd }, (_, i) => ({
      label: String(i).padStart(2, '0'),
      match: (ev) => ev.s_years === cursor.y && ev.s_month === cursor.m && ev.s_day === cursor.d && (ev.s_hour || 0) === i,
    }));
  }
  // A user-invented unit above year: its children are years, derived by
  // division rather than stored (see the engine's header).
  const count = calCanonicalCount(spec, zoom) || 0;
  if (count > 0) {
    const inst = calDerivedUnitValue(spec, zoom, cursor.y);
    const firstYear = inst ? (inst.instance - 1) * count + 1 : 1;
    return Array.from({ length: count }, (_, i) => ({
      label: calChildName(spec, zoom, i) || String(firstYear + i),
      match: (ev) => ev.s_years === firstYear + i,
    }));
  }
  return [];
}

// How many columns the grid uses. A month page lays out on the week cycle so
// the weekday header means something; everything else just wraps.
function chroniclerCalColumns(spec, zoom) {
  if (zoom === 'month' || zoom === 'week') return calCanonicalCount(spec, 'week') || 7;
  if (zoom === 'day') return 6;
  return 4;
}

// Leading blanks so day 1 lands under its real weekday. This is the payoff of
// the cycle model — with 30-day months and a 7-day week the offset shifts
// every month instead of resetting.
function chroniclerCalLeadOffset(spec, zoom, cursor) {
  if (zoom !== 'month') return 0;
  return calCycleSlot(spec, 'week', calDayIndex(spec, cursor.y, cursor.m, 1));
}

function chroniclerCalCursorLabel(spec, zoom, cursor) {
  if (zoom === 'year') return `${cursor.y}`;
  if (zoom === 'month') return `${calChildName(spec, 'year', cursor.m - 1) || cursor.m} · ${cursor.y}`;
  if (zoom === 'week' || zoom === 'day') return `${cursor.d}/${cursor.m}/${cursor.y}`;
  const inst = calDerivedUnitValue(spec, zoom, cursor.y);
  return inst ? `${chroniclerCalUnitLabel(zoom)} ${inst.instance}` : `${cursor.y}`;
}

function setChroniclerCalZoom(zoom) {
  S.chroniclerData.calZoom = zoom;
  mountChroniclerGraph();
}

// Steps the cursor by one instance of whatever unit is on screen.
function navChroniclerCalendar(delta) {
  const d = S.chroniclerData;
  const spec = chroniclerCalSpec();
  const c = { ...(d.calCursor || { y: 1, m: 1, d: 1 }) };
  const months = calCanonicalCount(spec, 'year') || 12;
  if (d.calZoom === 'year') c.y += delta;
  else if (d.calZoom === 'month') {
    c.m += delta;
    while (c.m > months) { c.m -= months; c.y += 1; }
    while (c.m < 1) { c.m += months; c.y -= 1; }
    c.d = 1;
  } else if (d.calZoom === 'week' || d.calZoom === 'day') {
    const step = d.calZoom === 'week' ? (calCanonicalCount(spec, 'week') || 7) : 1;
    const p = calPartsFromDayIndex(spec, calDayIndex(spec, c.y, c.m, c.d) + delta * step);
    c.y = p.y; c.m = p.m; c.d = p.d;
  } else {
    c.y += delta * (calCanonicalCount(spec, d.calZoom) || 1);
  }
  d.calCursor = c;
  mountChroniclerGraph();
}

function buildChroniclerCalendarHtml(evs, data) {
  const spec = chroniclerCalSpec();
  const zoom = chroniclerCalViewUnits().some(u => u.key === data.calZoom) ? data.calZoom : 'month';
  const cursor = data.calCursor || { y: 1, m: 1, d: 1 };
  const cells = chroniclerCalCells(spec, zoom, cursor);
  const cols = chroniclerCalColumns(spec, zoom);
  const lead = chroniclerCalLeadOffset(spec, zoom, cursor);

  // The week header only makes sense where the grid is laid out on the week
  // cycle; elsewhere the columns are just wrapping.
  const wkLen = calCanonicalCount(spec, 'week') || 7;
  const header = (zoom === 'month' || zoom === 'week')
    ? Array.from({ length: wkLen }, (_, i) =>
      `<div class="chr-cal-dowcell" data-no-i18n>${x(calChildName(spec, 'week', i) || `D${i + 1}`)}</div>`).join('')
    : '';

  const blanks = Array.from({ length: lead }, () => `<div class="chr-cal-cell chr-cal-blank"></div>`).join('');
  const body = cells.map(cell => {
    const hits = evs.filter(cell.match);
    return `<div class="chr-cal-cell">
      <div class="chr-cal-daynum" data-no-i18n>${x(cell.label)}</div>
      ${hits.map(ev => `<div class="chr-cal-ev" style="background:${x(ev.color_code || 'var(--accent)')}"
        onclick="toggleChroniclerInspector(${ev.timeline_id},${ev.id})" title="${x(ev.event_name || '')}">${x(ev.event_name || '—')}</div>`).join('')}
    </div>`;
  }).join('');

  const viewBar = `<div class="viewbar">${chroniclerCalViewUnits().map(u =>
    `<span class="vitem${u.key === zoom ? ' act' : ''}" onclick="setChroniclerCalZoom('${x(u.key)}')" ${chroniclerCalIsBuiltinUnit(u.key) ? '' : 'data-no-i18n'}>${x(chroniclerCalUnitLabel(u.key))}</span>`).join('')}</div>`;

  // The panel deliberately covers the bar rather than pushing it down — the
  // Plan asks for exactly that: the custom div may cover the view bar.
  const panel = data.calPanelOpen ? buildChroniclerCalPanelHtml(spec, data) : '';
  const inspector = data.inspectorEventId
    ? buildChroniclerCalInspectorHtml(evs, data) : '';

  return `<div class="chr-calendar">
    <div class="chr-cal-barwrap">
      <div class="classifier-toolbar chr-cal-bar">
        <button class="btn btn-s btn-i" onclick="navChroniclerCalendar(-1)">‹</button>
        <span class="vlbl" data-no-i18n>${x(chroniclerCalCursorLabel(spec, zoom, cursor))}</span>
        <button class="btn btn-s btn-i" onclick="navChroniclerCalendar(1)">›</button>
        ${viewBar}
        <button class="btn btn-g btn-i" onclick="toggleChroniclerCalPanel()" title="${t('calCustomCalendar')}">${I.edit}</button>
      </div>
      ${panel}
    </div>
    <div class="chr-cal-grid" style="grid-template-columns:repeat(${cols},1fr)">${header}${blanks}${body}</div>
    ${inspector}
  </div>`;
}

// Clicking an event opens the inspector, like every other Chronicler view.
// It used to open the icon/colour popup here alone, which was inconsistent.
function buildChroniclerCalInspectorHtml(evs, data) {
  const ev = evs.find(e => e.id === data.inspectorEventId);
  if (!ev) return '';
  return `<div class="chr-insp-row open" style="margin-top:14px">
    <div class="ph"><h4>${x(ev.event_name || t('name'))}</h4>
      <button class="btn btn-g btn-i" onclick="toggleChroniclerInspector(${ev.timeline_id},${ev.id})" title="${t('close')}">${I.close}</button>
    </div>
    <div class="chr-insp-body" id="chr-cal-insp"></div>
  </div>`;
}

// ── Custom-calendar panel ───────────────────────────────────────────────
function toggleChroniclerCalPanel() {
  S.chroniclerData.calPanelOpen = !S.chroniclerData.calPanelOpen;
  mountChroniclerGraph();
}

function setChroniclerCalPanelUnit(key) {
  S.chroniclerData.calPanelUnit = key;
  mountChroniclerGraph();
}

function buildChroniclerCalPanelHtml(spec, data) {
  const units = spec.units;
  const unitKey = units.some(u => u.key === data.calPanelUnit) ? data.calPanelUnit : units[0].key;
  const unit = units.find(u => u.key === unitKey);
  const pages = units.map(u =>
    `<span class="vitem${u.key === unitKey ? ' act' : ''}" onclick="setChroniclerCalPanelUnit('${x(u.key)}')" ${chroniclerCalIsBuiltinUnit(u.key) ? '' : 'data-no-i18n'}>${x(chroniclerCalUnitLabel(u.key))}</span>`).join('');

  return `<div class="chr-cal-panel">
    <div class="chr-cal-panel-bar">
      <div class="viewbar chr-cal-pagebar">${pages}</div>
      <button class="btn btn-g chr-cal-panel-btn" onclick="openChroniclerCalAddUnit()">${I.plus} ${t('calAddUnit')}</button>
      <button class="btn btn-g chr-cal-panel-btn" onclick="openChroniclerCalTemplates()">${t('calTemplates')}</button>
      <button class="btn btn-g chr-cal-panel-btn" onclick="startChroniclerCalQuickSetup()">${t('calQuickSetup')}</button>
      <button class="btn btn-g chr-cal-panel-btn" onclick="openChroniclerCalAdvanced()">${t('calAdvancedSetup')}</button>
      <button class="btn btn-g btn-i" onclick="toggleChroniclerCalPanel()" title="${t('close')}">${I.close}</button>
    </div>
    <div class="chr-cal-panel-body">${buildChroniclerCalUnitPageHtml(spec, unit)}</div>
  </div>`;
}

function buildChroniclerCalUnitPageHtml(spec, unit) {
  const child = unit.of[0];
  // The smallest unit has nothing under it to size, name or lay out.
  if (!child) return `<div class="cls-lv-empty">${t('calSmallestUnit')}</div>`;

  const childLabel = chroniclerCalUnitLabel(child.unit);
  const count = child.count;
  const extras = unit.of.slice(1);
  const naming = unit.naming || { on: false, names: [] };
  const lengths = unit.lengths || { on: false, values: [] };
  const grandchild = (spec.units.find(u => u.key === child.unit)?.of || [])[0];

  // Extra sub-unit references (Plan: "1 month = 4 week = 30 day"). Only the
  // first drives arithmetic, and the hint says so — 4x7 != 30 is authorable.
  const extraRows = extras.map((o, i) => `<div class="chr-cal-row">
    <span class="chr-cal-eq">=</span>
    <input class="cls-lv-inp chr-cal-num" type="number" min="1" value="${o.count}"
      onchange="setChroniclerCalExtraCount('${x(unit.key)}',${i},this.value)">
    <span class="chr-cal-unitname" data-no-i18n>${x(chroniclerCalUnitLabel(o.unit))}</span>
    <button class="btn btn-g btn-i" onclick="removeChroniclerCalExtra('${x(unit.key)}',${i})" title="${t('delete')}">${I.delete}</button>
  </div>`).join('');

  const otherUnits = spec.units.filter(u => u.key !== unit.key && u.key !== child.unit);
  const addExtra = otherUnits.length ? `<div class="chr-cal-row">
    <span class="chr-cal-eq">=</span>
    <select id="chr-cal-extra-unit" class="chr-cal-sel">${otherUnits.map(u =>
      `<option value="${x(u.key)}">${x(chroniclerCalUnitLabel(u.key))}</option>`).join('')}</select>
    <button class="btn btn-g" onclick="addChroniclerCalExtra('${x(unit.key)}')">${I.plus}</button>
  </div>` : '';

  // Per-child length overrides. Only meaningful when the child itself has a
  // size (a month has days; an hour's minutes are uniform by definition).
  const lengthRows = (lengths.on && grandchild) ? `<div class="chr-cal-grid-edit">
    ${Array.from({ length: count }, (_, i) => `<label class="chr-cal-cellin">
      <span data-no-i18n>${x(naming.names[i] || `${childLabel} ${i + 1}`)}</span>
      <input class="cls-lv-inp" type="number" min="1"
        value="${lengths.values[i] != null ? lengths.values[i] : grandchild.count}"
        onchange="setChroniclerCalLength('${x(unit.key)}',${i},this.value)">
    </label>`).join('')}
  </div>` : '';

  const nameRows = naming.on ? `<div class="chr-cal-grid-edit">
    ${Array.from({ length: count }, (_, i) => `<label class="chr-cal-cellin">
      <span data-no-i18n>${i + 1}</span>
      <input class="cls-lv-inp" value="${x(naming.names[i] || '')}"
        onchange="setChroniclerCalName('${x(unit.key)}',${i},this.value)">
    </label>`).join('')}
  </div>` : '';

  const removable = !chroniclerCalIsBuiltinUnit(unit.key);
  return `
    <div class="chr-cal-row chr-cal-mainrow">
      <span class="chr-cal-eq" data-no-i18n>1 ${x(chroniclerCalUnitLabel(unit.key))} =</span>
      <input class="cls-lv-inp chr-cal-num" type="number" min="1" value="${count}"
        onchange="setChroniclerCalCount('${x(unit.key)}',this.value)">
      <span class="chr-cal-unitname" data-no-i18n>${x(childLabel)}</span>
      ${removable ? `<button class="btn btn-d chr-cal-panel-btn" onclick="removeChroniclerCalUnit('${x(unit.key)}')">${t('calRemoveUnit')}</button>` : ''}
    </div>
    ${extraRows}${addExtra}
    ${extras.length ? `<div class="chr-cal-hint">${t('calSubUnitHint')}</div>` : ''}
    <div class="chr-cal-toggles">
      ${grandchild ? `<div class="togglerow" onclick="toggleChroniclerCalFlag('${x(unit.key)}','lengths')">
        <span class="tg${lengths.on ? ' on' : ''}"></span>${t('calToggleCustomLengths')}</div>` : ''}
      <div class="togglerow" onclick="toggleChroniclerCalFlag('${x(unit.key)}','naming')">
        <span class="tg${naming.on ? ' on' : ''}"></span>${t('calToggleNaming')}</div>
      ${unit.mode === 'cycle' ? `<span class="chr-cal-modechip" data-no-i18n>${x(t('calModeCycle'))}</span>` : ''}
    </div>
    ${lengthRows}${nameRows}
    <div class="chr-cal-previewlabel">${t('calPreview')}</div>
    ${buildChroniclerCalPreviewHtml(spec, unit)}`;
}

// A miniature of what this unit looks like laid out — the Plan's
// Plan: every unit page carries a preview calendar table.
function buildChroniclerCalPreviewHtml(spec, unit) {
  const child = unit.of[0];
  if (!child) return '';
  const naming = unit.naming || { on: false, names: [] };
  const cols = unit.key === 'month' ? (calCanonicalCount(spec, 'week') || 7) : Math.min(child.count, 12);
  const lead = unit.key === 'month' ? calCycleSlot(spec, 'week', calDayIndex(spec, 1, 1, 1)) : 0;
  const blanks = Array.from({ length: lead }, () => `<div class="chr-cal-pcell chr-cal-blank"></div>`).join('');
  const cells = Array.from({ length: Math.min(child.count, 96) }, (_, i) =>
    `<div class="chr-cal-pcell" data-no-i18n>${x(naming.names[i] || String(i + 1))}</div>`).join('');
  const truncated = child.count > 96 ? `<div class="chr-cal-hint" data-no-i18n>… ${child.count}</div>` : '';
  return `<div class="chr-cal-preview" style="grid-template-columns:repeat(${Math.max(1, cols)},1fr)">${blanks}${cells}</div>${truncated}`;
}

// ── Panel edits (each live-saves) ───────────────────────────────────────
async function setChroniclerCalCount(unitKey, value) {
  const n = Math.max(1, Math.floor(Number(value)) || 1);
  const spec = chroniclerCalEditUnit(unitKey, (u) => { if (u.of[0]) u.of[0].count = n; });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

async function setChroniclerCalExtraCount(unitKey, idx, value) {
  const n = Math.max(1, Math.floor(Number(value)) || 1);
  const spec = chroniclerCalEditUnit(unitKey, (u) => { if (u.of[idx + 1]) u.of[idx + 1].count = n; });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

async function addChroniclerCalExtra(unitKey) {
  const target = pbQOr('#chr-cal-extra-unit')?.value;
  if (!target) return;
  const spec = chroniclerCalEditUnit(unitKey, (u) => { u.of.push({ unit: target, count: 1 }); });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

async function removeChroniclerCalExtra(unitKey, idx) {
  const spec = chroniclerCalEditUnit(unitKey, (u) => { u.of.splice(idx + 1, 1); });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

async function toggleChroniclerCalFlag(unitKey, flag) {
  const spec = chroniclerCalEditUnit(unitKey, (u) => {
    const cur = u[flag] || (flag === 'naming' ? { on: false, names: [] } : { on: false, values: [] });
    u[flag] = { ...cur, on: !cur.on };
  });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

async function setChroniclerCalName(unitKey, idx, value) {
  const spec = chroniclerCalEditUnit(unitKey, (u) => {
    const names = (u.naming?.names || []).slice();
    while (names.length <= idx) names.push('');
    names[idx] = String(value || '');
    u.naming = { on: true, names };
  });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

async function setChroniclerCalLength(unitKey, idx, value) {
  const n = Math.max(1, Math.floor(Number(value)) || 1);
  const spec = chroniclerCalEditUnit(unitKey, (u, sp) => {
    const child = u.of[0];
    const fallback = (sp.units.find(v => v.key === child.unit)?.of || [])[0]?.count || 1;
    const values = (u.lengths?.values || []).slice();
    while (values.length <= idx) values.push(fallback);
    values[idx] = n;
    u.lengths = { on: true, values };
  });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

// ── User-invented units ─────────────────────────────────────────────────
// A new unit must name the unit it is built from, and where it sits on the
// time scale — the Plan requires the user to choose that. Position is the
// index in the ordered list, which IS the time scale.
function openChroniclerCalAddUnit() {
  const spec = chroniclerCalSpec();
  openModal(t('calAddUnit'), `
    <div class="fg"><label>${t('calUnitName')} *</label><input id="chr-cal-nu-name"></div>
    <div class="fg"><label>${t('calUnitSubUnit')}</label>
      <select id="chr-cal-nu-of">${spec.units.map(u =>
        `<option value="${x(u.key)}">${x(chroniclerCalUnitLabel(u.key))}</option>`).join('')}</select></div>
    <div class="fg"><label>${t('calUnitCount')}</label><input id="chr-cal-nu-count" type="number" min="1" value="12"></div>
    <div class="fg"><label>${t('calUnitPosition')}</label>
      <select id="chr-cal-nu-pos">${spec.units.map((u, i) =>
        `<option value="${i + 1}">${t('calAfter')} ${x(chroniclerCalUnitLabel(u.key))}</option>`).join('')}</select></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitChroniclerCalAddUnit()">${t('create')}</button>
    </div>`);
}

async function submitChroniclerCalAddUnit() {
  const name = pbQOr('#chr-cal-nu-name')?.value.trim();
  if (!name) return;
  const spec = JSON.parse(JSON.stringify(chroniclerCalSpec()));
  // The key is the user's own text; a collision would make calUnit() ambiguous.
  if (spec.units.some(u => u.key === name)) { toast(t('calUnitExists'), 'err'); return; }
  const of = pbQOr('#chr-cal-nu-of').value;
  const count = Math.max(1, Math.floor(Number(pbQOr('#chr-cal-nu-count').value)) || 1);
  const pos = Math.max(1, Math.min(spec.units.length, Math.floor(Number(pbQOr('#chr-cal-nu-pos').value)) || spec.units.length));
  spec.units.splice(pos, 0, { key: name, mode: 'container', of: [{ unit: of, count }], naming: { on: false, names: [] } });
  closeModal();
  S.chroniclerData.calPanelUnit = name;
  await saveChroniclerCalendarSpec(spec);
  toast(t('created'), 'ok');
}

async function removeChroniclerCalUnit(unitKey) {
  if (chroniclerCalIsBuiltinUnit(unitKey)) return;
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  const spec = JSON.parse(JSON.stringify(chroniclerCalSpec()));
  spec.units = spec.units.filter(u => u.key !== unitKey);
  // Anything that referenced it would dangle, so drop those references too.
  for (const u of spec.units) u.of = u.of.filter(o => o.unit !== unitKey);
  S.chroniclerData.calPanelUnit = 'day';
  await saveChroniclerCalendarSpec(spec);
  toast(t('deleted'), 'ok');
}

// ── Quick setup ─────────────────────────────────────────────────────────
// Walks from the second-smallest unit up to the largest, one number per step
// (the Plan: second-smallest up to largest, one step at a time). The
// smallest unit has nothing below it to size, so it is not a step. Same
// declarative shape as
// core/welcome.js's WELCOME_STEPS, and it reuses that flow's i18n keys.
function startChroniclerCalQuickSetup() {
  S.chroniclerCalWizard = { idx: 0, spec: JSON.parse(JSON.stringify(chroniclerCalSpec())) };
  renderChroniclerCalQuickStep();
}

function chroniclerCalQuickSteps() {
  return (S.chroniclerCalWizard?.spec.units || []).filter(u => u.of && u.of[0]);
}

function renderChroniclerCalQuickStep() {
  const w = S.chroniclerCalWizard;
  const steps = chroniclerCalQuickSteps();
  if (!w || !steps.length) return;
  const idx = Math.max(0, Math.min(steps.length - 1, w.idx));
  const unit = steps[idx];
  const last = idx === steps.length - 1;
  openModal(`${t('calQuickSetup')} · ${idx + 1} / ${steps.length}`, `
    <div class="chr-cal-hint">${t('calQuickIntro')}</div>
    <div class="fg"><label data-no-i18n>1 ${x(chroniclerCalUnitLabel(unit.key))} = ? ${x(chroniclerCalUnitLabel(unit.of[0].unit))}</label>
      <input id="chr-cal-qs" type="number" min="1" value="${unit.of[0].count}"></div>
    <div class="mfoot">
      ${idx ? `<button class="btn btn-s" onclick="chroniclerCalQuickGo(-1)">${t('guideBack')}</button>` : ''}
      <button class="btn btn-p" onclick="chroniclerCalQuickGo(1)">${last ? t('guideDone') : t('guideNext')}</button>
    </div>`);
}

async function chroniclerCalQuickGo(delta) {
  const w = S.chroniclerCalWizard;
  if (!w) return;
  const steps = chroniclerCalQuickSteps();
  const unit = steps[Math.max(0, Math.min(steps.length - 1, w.idx))];
  // Commit the visible step before moving, in either direction, so going back
  // and forward again doesn't quietly discard what was typed.
  const v = Math.max(1, Math.floor(Number(pbQOr('#chr-cal-qs')?.value)) || 1);
  if (unit && unit.of[0]) unit.of[0].count = v;
  const next = w.idx + delta;
  if (next >= steps.length) {
    const spec = w.spec;
    S.chroniclerCalWizard = null;
    closeModal();
    await saveChroniclerCalendarSpec(spec);
    toast(t('saved'), 'ok');
    return;
  }
  w.idx = Math.max(0, next);
  renderChroniclerCalQuickStep();
}

// ── Advanced setup ──────────────────────────────────────────────────────
// Patterns over patterns: a repeating cycle whose slots override the child
// lengths (leap years), and the container/cycle mode that decides whether a
// unit resets at its parent's boundary (weekdays).
function openChroniclerCalAdvanced() {
  const spec = chroniclerCalSpec();
  const unitKey = spec.units.some(u => u.key === S.chroniclerData.calPanelUnit) ? S.chroniclerData.calPanelUnit : 'year';
  const unit = spec.units.find(u => u.key === unitKey);
  const cyc = unit.cycle || { on: false, period: 1, variants: {} };
  const child = unit.of[0];
  const childCount = child ? child.count : 0;
  const grandchild = child ? (spec.units.find(u => u.key === child.unit)?.of || [])[0] : null;

  const variantRows = (cyc.on && grandchild) ? Array.from({ length: Math.max(1, cyc.period) }, (_, pos) => `
    <div class="chr-cal-variant">
      <div class="chr-cal-previewlabel" data-no-i18n>${t('calCycleSlot')} ${pos + 1}</div>
      <div class="chr-cal-grid-edit">
        ${Array.from({ length: childCount }, (_, i) => `<label class="chr-cal-cellin">
          <span data-no-i18n>${x((unit.naming?.names || [])[i] || i + 1)}</span>
          <input class="cls-lv-inp" type="number" min="1" placeholder="${(unit.lengths?.values || [])[i] ?? grandchild.count}"
            value="${(cyc.variants[pos] || {})[i] ?? ''}"
            onchange="setChroniclerCalVariant('${x(unitKey)}',${pos},${i},this.value)">
        </label>`).join('')}
      </div>
    </div>`).join('') : '';

  openModal(`${t('calAdvancedSetup')} — ${chroniclerCalUnitLabel(unitKey)}`, `
    <div class="chr-cal-hint">${t('calAdvancedIntro')}</div>
    <div class="togglerow" onclick="toggleChroniclerCalMode('${x(unitKey)}')">
      <span class="tg${unit.mode === 'cycle' ? ' on' : ''}"></span>${t('calModeCycleLabel')}</div>
    <div class="chr-cal-hint">${t('calModeHint')}</div>
    <div class="togglerow" onclick="toggleChroniclerCalCycle('${x(unitKey)}')">
      <span class="tg${cyc.on ? ' on' : ''}"></span>${t('calCycleOn')}</div>
    ${cyc.on ? `<div class="fg"><label>${t('calCyclePeriod')}</label>
      <input id="chr-cal-period" type="number" min="1" value="${cyc.period}"
        onchange="setChroniclerCalPeriod('${x(unitKey)}',this.value)"></div>` : ''}
    ${variantRows}
    <div class="mfoot"><button class="btn btn-p" onclick="closeModal()">${t('guideDone')}</button></div>`);
}

async function toggleChroniclerCalMode(unitKey) {
  const spec = chroniclerCalEditUnit(unitKey, (u) => { u.mode = u.mode === 'cycle' ? 'container' : 'cycle'; });
  if (spec) { await saveChroniclerCalendarSpec(spec); openChroniclerCalAdvanced(); }
}

async function toggleChroniclerCalCycle(unitKey) {
  const spec = chroniclerCalEditUnit(unitKey, (u) => {
    const cur = u.cycle || { on: false, period: 4, variants: {} };
    u.cycle = { ...cur, on: !cur.on, period: Math.max(1, cur.period || 4) };
  });
  if (spec) { await saveChroniclerCalendarSpec(spec); openChroniclerCalAdvanced(); }
}

async function setChroniclerCalPeriod(unitKey, value) {
  const n = Math.max(1, Math.floor(Number(value)) || 1);
  const spec = chroniclerCalEditUnit(unitKey, (u) => {
    u.cycle = { ...(u.cycle || { on: true, variants: {} }), on: true, period: n };
  });
  if (spec) { await saveChroniclerCalendarSpec(spec); openChroniclerCalAdvanced(); }
}

// Blank clears the override for that slot, falling back to the flat length.
async function setChroniclerCalVariant(unitKey, pos, idx, value) {
  const spec = chroniclerCalEditUnit(unitKey, (u) => {
    const cyc = u.cycle || { on: true, period: 1, variants: {} };
    const variants = { ...cyc.variants };
    const slot = { ...(variants[pos] || {}) };
    const n = Math.floor(Number(value));
    if (!value || !Number.isFinite(n) || n <= 0) delete slot[idx];
    else slot[idx] = n;
    variants[pos] = slot;
    u.cycle = { ...cyc, variants };
  });
  if (spec) await saveChroniclerCalendarSpec(spec);
}

// ── Templates ───────────────────────────────────────────────────────────
async function openChroniclerCalTemplates() {
  const nx = S.nexus.id;
  // Seed the international calendar on first open, so the list is never empty
  // and the default is always reachable.
  await api.calendar.ensureBuiltin(nx, t('calInternational'), JSON.stringify(calSpecNormalize(null)));
  const list = await api.calendar.listTemplates(nx);
  openModal(t('calTemplates'), `
    <div class="cls-link-list">${list.map(tp => `<div class="cls-link-row">
      <span class="cls-link-name" data-no-i18n>${x(tp.name)}</span>
      ${tp.builtin ? `<span class="cls-link-lbl">${t('calBuiltin')}</span>` : ''}
      <button class="btn btn-g" onclick="applyChroniclerCalTemplate(${tp.id})">${t('calApply')}</button>
      ${tp.builtin ? '' : `<button class="btn btn-g btn-i" onclick="deleteChroniclerCalTemplate(${tp.id})" title="${t('delete')}">${I.delete}</button>`}
    </div>`).join('') || `<div class="cls-lv-empty">${t('nestEmpty')}</div>`}</div>
    <div class="fg" style="margin-top:10px"><label>${t('calSaveAsTemplate')}</label>
      <input id="chr-cal-tpl-name" placeholder="${t('name')}"></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="saveChroniclerCalTemplate()">${t('save')}</button>
    </div>`);
}

async function saveChroniclerCalTemplate() {
  const name = pbQOr('#chr-cal-tpl-name')?.value.trim();
  if (!name) return;
  await api.calendar.saveTemplate(S.nexus.id, name, JSON.stringify(chroniclerCalSpec()));
  closeModal();
  toast(t('saved'), 'ok');
}

async function applyChroniclerCalTemplate(id) {
  const list = await api.calendar.listTemplates(S.nexus.id);
  const tp = list.find(v => v.id === id);
  if (!tp) return;
  let parsed = null;
  try { parsed = JSON.parse(tp.spec); } catch (_) { parsed = null; }
  closeModal();
  await saveChroniclerCalendarSpec(calSpecNormalize(parsed));
  toast(t('saved'), 'ok');
}

async function deleteChroniclerCalTemplate(id) {
  await api.calendar.deleteTemplate(id);
  await openChroniclerCalTemplates();
}
