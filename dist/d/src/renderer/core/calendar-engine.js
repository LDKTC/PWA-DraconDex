'use strict';
// ═══ Calendar engine (Process 8 part 1 — Custom-calendar) ══════════════
// Pure date arithmetic over a USER-DEFINED time unit system. No DOM, no S,
// no api — everything here is a function of (spec, numbers), which is what
// lets electron/test/calendar-engine.test.mjs exercise it directly.
//
// Lives in core/ rather than mod/ because three separate places need it:
// Chronicler's graphs (mod/chronicler-graph.js), Wanderer's time strip
// (mod/wanderer.js) and the calendar view itself. core/ is eager and
// ordered, so this file declares only function declarations plus one frozen
// const — nothing that another core file could touch during its own
// top-level execution.
//
// ── The one hard constraint on the model ───────────────────────────────
// `timeline_date` stores exactly five integers: years, month, day, hour,
// minute (src/schema/vault.sql). That is fixed, and this rewrite does not
// change it. So the unit system splits in two:
//
//   STORED units   — the five above. A spec must always define them; their
//                    sizes are what arithmetic actually uses.
//   DERIVED units  — everything else the user invents. A `cycle` unit (week)
//                    is a repeating run over a stored unit's stream; a unit
//                    placed ABOVE year (the plan's "circle" of 12 years,
//                    named by zodiac) is computed by dividing the year.
//
// Derived units are display and grouping only. That is not a shortcut — it
// is what keeps a fictional calendar re-interpretable over data already
// entered, since changing "12 years per circle" must not rewrite any row.
//
// ── Ordinals ───────────────────────────────────────────────────────────
// calToOrdinal returns whole MINUTES since the epoch (year 1, month 1,
// day 1, 00:00). This replaces Date.UTC, which was not merely imprecise for
// fictional calendars but lossy: Date.UTC rolls over instead of clamping, so
// Date.UTC(1200,0,35) === Date.UTC(1200,1,4) — day 35 of month 1 and day 4
// of month 2 collapsed onto one instant. It also mapped years 0-99 to
// 1900+y and returned null for year 0.

// The international (Gregorian) calendar, used as the built-in default and
// as the base every template is derived from. Month lengths and the 4-year
// leap cycle are expressed in the same generic vocabulary a user-authored
// calendar uses — there is no special-cased "real" calendar in this engine.
const CAL_DEFAULT_SPEC = Object.freeze({
  version: 2,
  anchor: { weekdayIndex: 0 },
  units: [
    { key: 'minute', mode: 'container', of: [] },
    { key: 'hour', mode: 'container', of: [{ unit: 'minute', count: 60 }] },
    { key: 'day', mode: 'container', of: [{ unit: 'hour', count: 24 }] },
    {
      key: 'week', mode: 'cycle', of: [{ unit: 'day', count: 7 }],
      naming: { on: true, names: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    },
    { key: 'month', mode: 'container', of: [{ unit: 'day', count: 30 }, { unit: 'week', count: 4 }] },
    {
      key: 'year', mode: 'container', of: [{ unit: 'month', count: 12 }],
      naming: { on: true, names: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] },
      lengths: { on: true, values: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] },
      // cyclePos 3 of 4 (i.e. year % 4 === 0) gives month index 1 (February)
      // 29 days. Month indexes in `variants` are 0-based, like `lengths`.
      cycle: { on: true, period: 4, variants: { 3: { 1: 29 } } },
    },
  ],
});

const CAL_STORED_UNITS = Object.freeze(['minute', 'hour', 'day', 'month', 'year']);

// JS % keeps the sign of the dividend, which breaks every "which slot of the
// cycle" question for negative years / pre-epoch dates.
function calFloorMod(n, m) {
  return ((n % m) + m) % m;
}

function calUnit(spec, key) {
  return (spec.units || []).find(u => u.key === key) || null;
}

// How many of its canonical child a unit holds by default. `of` is a LIST so
// a user can write "1 month = 4 week = 30 day" (the plan asks for it), but
// only of[0] drives arithmetic — the rest are derived views. The UI says so,
// because 4×7 ≠ 30 is an authorable contradiction.
function calCanonicalCount(spec, key) {
  const u = calUnit(spec, key);
  const first = u && Array.isArray(u.of) ? u.of[0] : null;
  return first && Number(first.count) > 0 ? Math.floor(Number(first.count)) : 0;
}

// Repair anything missing or nonsensical, and upgrade the v1 blob
// ({daysPerWeek, daysPerMonth, monthsPerYear, dayNames, monthNames}) that
// every existing vault holds in module_ui.calendarConfig. Modelled on
// parseFilterDef (mod/exhibitor.js), where the parse function is deliberately
// also the migration: a stored config is never rewritten on disk until the
// user saves, so old and new vaults both just work.
function calSpecNormalize(raw) {
  const base = JSON.parse(JSON.stringify(CAL_DEFAULT_SPEC));
  if (!raw || typeof raw !== 'object') return base;

  // v1 → v2. Detected by shape, not by a version field: v1 blobs predate
  // versioning entirely and have none. At least one v1 key must actually be
  // present — an object with neither `units` nor any v1 field carries no
  // information about what calendar was meant, so it is malformed, not a v1
  // blob describing the v1 defaults, and falls through to the default spec.
  const V1_KEYS = ['daysPerWeek', 'daysPerMonth', 'monthsPerYear', 'dayNames', 'monthNames'];
  if (!Array.isArray(raw.units) && V1_KEYS.some(k => k in raw)) {
    const dpw = Math.max(1, Math.floor(Number(raw.daysPerWeek)) || 7);
    const dpm = Math.max(1, Math.floor(Number(raw.daysPerMonth)) || 30);
    const mpy = Math.max(1, Math.floor(Number(raw.monthsPerYear)) || 12);
    const week = calUnit(base, 'week');
    const month = calUnit(base, 'month');
    const year = calUnit(base, 'year');
    week.of = [{ unit: 'day', count: dpw }];
    month.of = [{ unit: 'day', count: dpm }];
    year.of = [{ unit: 'month', count: mpy }];
    // A v1 calendar had uniform months and no leap rule; carrying the
    // Gregorian defaults over would silently change its month lengths.
    year.lengths = { on: false, values: [] };
    year.cycle = { on: false, period: 1, variants: {} };
    const dayNames = Array.isArray(raw.dayNames) ? raw.dayNames.filter(Boolean) : [];
    const monthNames = Array.isArray(raw.monthNames) ? raw.monthNames.filter(Boolean) : [];
    week.naming = { on: dayNames.length > 0, names: dayNames };
    year.naming = { on: monthNames.length > 0, names: monthNames };
    return base;
  }

  if (!Array.isArray(raw.units)) return base;

  const out = { version: 2, anchor: { weekdayIndex: 0 }, units: [] };
  if (raw.anchor && Number.isFinite(Number(raw.anchor.weekdayIndex))) {
    out.anchor.weekdayIndex = Math.floor(Number(raw.anchor.weekdayIndex));
  }
  for (const u of raw.units) {
    if (!u || typeof u.key !== 'string' || !u.key) continue;
    const of = (Array.isArray(u.of) ? u.of : [])
      .filter(o => o && typeof o.unit === 'string' && Number(o.count) > 0)
      .map(o => ({ unit: o.unit, count: Math.floor(Number(o.count)) }));
    const unit = { key: u.key, mode: u.mode === 'cycle' ? 'cycle' : 'container', of };
    if (u.naming && typeof u.naming === 'object') {
      unit.naming = {
        on: !!u.naming.on,
        names: Array.isArray(u.naming.names) ? u.naming.names.map(String) : [],
      };
    }
    if (u.lengths && typeof u.lengths === 'object') {
      unit.lengths = {
        on: !!u.lengths.on,
        values: (Array.isArray(u.lengths.values) ? u.lengths.values : [])
          .map(v => Math.max(1, Math.floor(Number(v)) || 1)),
      };
    }
    if (u.cycle && typeof u.cycle === 'object') {
      const variants = {};
      for (const [pos, ov] of Object.entries(u.cycle.variants || {})) {
        if (!ov || typeof ov !== 'object') continue;
        const inner = {};
        for (const [idx, len] of Object.entries(ov)) {
          const n = Math.floor(Number(len));
          if (Number.isFinite(n) && n > 0) inner[Math.floor(Number(idx))] = n;
        }
        variants[Math.floor(Number(pos))] = inner;
      }
      unit.cycle = { on: !!u.cycle.on, period: Math.max(1, Math.floor(Number(u.cycle.period)) || 1), variants };
    }
    out.units.push(unit);
  }
  // A spec missing a stored unit can't do arithmetic at all — fall back to
  // the default definition for whichever are absent rather than throwing on
  // every later call.
  for (const key of CAL_STORED_UNITS) {
    if (!calUnit(out, key)) out.units.push(JSON.parse(JSON.stringify(calUnit(CAL_DEFAULT_SPEC, key))));
  }
  return out;
}

// ── Year/month geometry ────────────────────────────────────────────────
// Which slot of `year`'s repeating cycle a given year sits in. Floor-mod so
// pre-epoch years land in the same rotation the positive side would.
function calYearCyclePos(spec, year) {
  const y = calUnit(spec, 'year');
  const period = (y && y.cycle && y.cycle.on) ? Math.max(1, y.cycle.period || 1) : 1;
  return calFloorMod(year - 1, period);
}

// Length of one month, honouring (in order): the year's cycle variant for
// this rotation slot, the year's flat per-month overrides, then the month
// unit's own default. monthIndex is 0-based.
function calMonthLength(spec, year, monthIndex) {
  const yu = calUnit(spec, 'year');
  if (yu && yu.cycle && yu.cycle.on) {
    const variant = yu.cycle.variants && yu.cycle.variants[calYearCyclePos(spec, year)];
    if (variant && Number(variant[monthIndex]) > 0) return Math.floor(Number(variant[monthIndex]));
  }
  if (yu && yu.lengths && yu.lengths.on) {
    const v = yu.lengths.values[monthIndex];
    if (Number(v) > 0) return Math.floor(Number(v));
  }
  return calCanonicalCount(spec, 'month') || 30;
}

function calMonthsInYear(spec) {
  return calCanonicalCount(spec, 'year') || 12;
}

function calDaysInYear(spec, year) {
  const n = calMonthsInYear(spec);
  let total = 0;
  for (let i = 0; i < n; i++) total += calMonthLength(spec, year, i);
  return total;
}

// Days from the epoch (year 1, month 1, day 1) to the start of `year`.
// Negative for pre-epoch years. Without a leap cycle this is one multiply;
// with one, it is a multiply plus at most `period` iterations — never a loop
// over the year number, which matters once a world reaches year 12000.
function calDaysBeforeYear(spec, year) {
  const yu = calUnit(spec, 'year');
  const yearsBefore = year - 1;
  if (!(yu && yu.cycle && yu.cycle.on)) return yearsBefore * calDaysInYear(spec, 1);
  const period = Math.max(1, yu.cycle.period || 1);
  let cycleTotal = 0;
  for (let i = 0; i < period; i++) cycleTotal += calDaysInYear(spec, 1 + i);
  const fullCycles = Math.floor(yearsBefore / period);
  const rem = yearsBefore - fullCycles * period;
  let days = fullCycles * cycleTotal;
  for (let i = 0; i < rem; i++) days += calDaysInYear(spec, 1 + i);
  return days;
}

// Whole days from the epoch to (year, month, day). Day index 0 is the epoch
// day itself. This is the value every grid and cycle question is built on.
function calDayIndex(spec, year, month, day) {
  let days = calDaysBeforeYear(spec, year);
  const mi = Math.max(1, Math.floor(month || 1));
  for (let i = 0; i < mi - 1; i++) days += calMonthLength(spec, year, i);
  return days + (Math.max(1, Math.floor(day || 1)) - 1);
}

// ── Ordinals ───────────────────────────────────────────────────────────
function calToOrdinal(spec, parts) {
  if (!parts) return null;
  const y = Number(parts.y), m = Number(parts.m), d = Number(parts.d);
  // Unlike the old Date.UTC path, year 0 is a perfectly good year — only a
  // missing day or month means "no date".
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || !m || !d) return null;
  const hpd = calCanonicalCount(spec, 'day') || 24;
  const mph = calCanonicalCount(spec, 'hour') || 60;
  const h = Math.min(Math.max(0, Math.floor(Number(parts.h) || 0)), hpd - 1);
  const mi = Math.min(Math.max(0, Math.floor(Number(parts.mi) || 0)), mph - 1);
  return (calDayIndex(spec, y, m, d) * hpd + h) * mph + mi;
}

function calFromOrdinal(spec, ordinal) {
  const hpd = calCanonicalCount(spec, 'day') || 24;
  const mph = calCanonicalCount(spec, 'hour') || 60;
  const perDay = hpd * mph;
  const dayIndex = Math.floor(ordinal / perDay);
  const within = ordinal - dayIndex * perDay;
  const parts = calPartsFromDayIndex(spec, dayIndex);
  parts.h = Math.floor(within / mph);
  parts.mi = within - parts.h * mph;
  return parts;
}

// Inverse of calDayIndex. Seeks the year by whole cycles first so a large
// day index doesn't walk year by year, then walks months (bounded by
// months-per-year).
function calPartsFromDayIndex(spec, dayIndex) {
  const yu = calUnit(spec, 'year');
  let year = 1;
  let remaining = dayIndex;
  if (yu && yu.cycle && yu.cycle.on) {
    const period = Math.max(1, yu.cycle.period || 1);
    let cycleTotal = 0;
    for (let i = 0; i < period; i++) cycleTotal += calDaysInYear(spec, 1 + i);
    if (cycleTotal > 0) {
      const fullCycles = Math.floor(remaining / cycleTotal);
      year += fullCycles * period;
      remaining -= fullCycles * cycleTotal;
    }
  } else {
    const perYear = calDaysInYear(spec, 1);
    if (perYear > 0) {
      const whole = Math.floor(remaining / perYear);
      year += whole;
      remaining -= whole * perYear;
    }
  }
  // Settle the remainder in both directions — the division above lands
  // within one cycle, and pre-epoch indexes come out negative.
  while (remaining < 0) { year -= 1; remaining += calDaysInYear(spec, year); }
  for (;;) {
    const inYear = calDaysInYear(spec, year);
    if (remaining < inYear) break;
    remaining -= inYear;
    year += 1;
  }
  const months = calMonthsInYear(spec);
  let month = 1;
  for (let i = 0; i < months; i++) {
    const len = calMonthLength(spec, year, i);
    if (remaining < len) { month = i + 1; break; }
    remaining -= len;
    month = i + 2;
  }
  return { y: year, m: month, d: remaining + 1, h: 0, mi: 0 };
}

// ── Cycle units (week) ─────────────────────────────────────────────────
// Which slot of a cycle unit a day falls on. The whole point of `mode:
// 'cycle'` is that this does NOT reset at the parent's boundary: a 7-day
// week over 30-day months means day 1 of each month lands on a different
// weekday, which is exactly the behaviour the plan calls out. The old grid
// had no anchor at all — day 1 always sat in column 1 and the day-name row
// was decorative.
function calCycleSlot(spec, unitKey, dayIndex) {
  const u = calUnit(spec, unitKey);
  const len = calCanonicalCount(spec, unitKey);
  if (!u || u.mode !== 'cycle' || len <= 0) return 0;
  const anchor = Math.floor(Number(spec.anchor && spec.anchor.weekdayIndex) || 0);
  return calFloorMod(dayIndex + anchor, len);
}

// A unit the user placed ABOVE year (the plan's "circle" of 12 years, named
// by zodiac) is derived by dividing the year rather than stored, so
// redefining it never rewrites data. Returns 1-based index within the unit
// plus which instance of it we are in.
function calDerivedUnitValue(spec, unitKey, year) {
  const count = calCanonicalCount(spec, unitKey);
  if (count <= 0) return null;
  const idx = calFloorMod(year - 1, count);
  return { index: idx, instance: Math.floor((year - 1) / count) + 1 };
}

// ── Labels ─────────────────────────────────────────────────────────────
// A unit's naming toggle names its CHILDREN (year names its months, a
// circle names its years) — that is how both of the plan's examples read.
function calChildName(spec, unitKey, childIndex) {
  const u = calUnit(spec, unitKey);
  if (u && u.naming && u.naming.on) {
    const n = u.naming.names[childIndex];
    if (n) return String(n);
  }
  return null;
}

function calMonthLabel(spec, monthIndex) {
  return calChildName(spec, 'year', monthIndex) || `${monthIndex + 1}`;
}

// Tick marks for the graph axes, stepping in the USER's units. Replaces the
// Gregorian stepper, which hardcoded 12 months, 365-day years and
// 86400000ms and labelled ticks with real-world month numbers nobody typed.
//
// Picks a stride from a 1/2/5 progression so a long span stays readable: with
// a fixed 1-unit step, a 1200-year timeline produced 1200 ticks, hit the
// guard, and left the axis labelled only across its first fifth.
const CAL_TICK_STRIDES = Object.freeze([1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

function calPickStride(count, target) {
  for (const s of CAL_TICK_STRIDES) if (count / s <= target) return s;
  // Past the table, round up to a power of ten that fits.
  return Math.pow(10, Math.ceil(Math.log10(Math.max(1, count / target))));
}

function calRulerTicks(spec, minOrd, maxOrd, cap = 240) {
  if (!(maxOrd > minOrd)) return [];
  const hpd = calCanonicalCount(spec, 'day') || 24;
  const mph = calCanonicalCount(spec, 'hour') || 60;
  const perDay = hpd * mph;
  const spanDays = (maxOrd - minOrd) / perDay;
  const daysPerYear = calDaysInYear(spec, 1) || 1;
  const months = calMonthsInYear(spec);
  const byYear = spanDays > daysPerYear * 4;
  const start = calFromOrdinal(spec, minOrd);
  // Aim for a readable dozen or so labels, never more than the caller's cap.
  const target = Math.min(12, cap);
  const unitSpan = byYear ? spanDays / daysPerYear : spanDays / (daysPerYear / months);
  const stride = calPickStride(Math.max(1, Math.ceil(unitSpan)), target);

  const out = [];
  let year = start.y;
  let month = byYear ? 1 : start.m;
  if (byYear) {
    // Land strides on round multiples so labels read 100, 200, 300 rather
    // than 137, 237, 337.
    year = Math.ceil(year / stride) * stride;
  }
  for (let guard = 0; guard < cap; guard++) {
    const ord = calToOrdinal(spec, { y: year, m: month, d: 1, h: 0, mi: 0 });
    if (ord === null) break;
    if (ord > maxOrd) break;
    if (ord >= minOrd) out.push({ ordinal: ord, label: byYear ? String(year) : calMonthLabel(spec, month - 1) });
    if (byYear) { year += stride; } else {
      month += stride;
      while (month > months) { month -= months; year += 1; }
    }
  }
  return out;
}
