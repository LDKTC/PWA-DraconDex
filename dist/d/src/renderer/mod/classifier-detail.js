'use strict';
// ═══ Classifier element detail (Process 8 part 1, v5 Part 3) ═══════════
// Everything that renders the body of ONE element: its field rows (text,
// textarea, the 5-box date), the level / condition tables, its own private
// fields, and its linked elements. The view shell is classifier.js, field
// definitions classifier-fields.js, menus and object CRUD classifier-ctx.js.
//
// Both callers of renderClassifierObjectDetail pick these up for free: the
// module's own List+Detail view (renderClassifierListDetail) and the element's
// dedicated Builder page (ITEM_KIND.classifier.renderBody, mod/item.js).

// ── Date attribute (Plan: "input ประเภท date ... 5 ช่องใน 1 row") ────────
// Reuses Chronicler's dateInputsHTML/.date-row-inline widget rather than a
// second one, so both modules read the same. What it does NOT reuse is
// getDateFromInputs — that resolves to a timeline_date row id, which is
// Chronicler's storage; a classifier attribute is a TEXT column, so the five
// parts are serialized to the same "D/M/YYYY HH:MM" string fmtDate produces
// and re-split on render. Per-row prefix because dateInputsHTML builds ids
// from it and a detail view renders many of these at once.
const CLS_DATE_PREFIX = (oid, tid) => `cls-date-${oid}-${tid}`;

// "3/7/1482 09:30" -> the shape dateInputsHTML expects. Anything unparseable
// (including values typed into the old free-text box before this round) comes
// back empty rather than throwing, so the row still renders and can be refilled.
function clsParseDateValue(val) {
  const m = /^\s*(\d+)\/(\d+)\/(\d+)(?:\s+(\d+):(\d+))?\s*$/.exec(String(val || ''));
  if (!m) return null;
  return { d: +m[1], mo: +m[2], y: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0) };
}

function clsDateInputsHtml(o, c) {
  const p = CLS_DATE_PREFIX(o.id, c.id);
  const v = clsParseDateValue(o.attrMap[c.id]);
  const ev = v ? { d: v.d, mo: v.mo, y: v.y, h: v.h, mi: v.mi } : null;
  const save = `saveClassifierAttrDate(${o.id},${c.id},this)`;
  return dateInputsHTML(p, ev, 'd', 'mo', 'y', 'h', 'mi', save);
}

// Day/month/year are required together — a partial date saves as empty rather
// than as a half-written string no reader could parse back.
// `el` is the input that changed: the five are read from ITS row, so the
// same object shown twice (two panes, a borrowed view) cannot read the
// other copy's boxes (v5 Part 8 — no window-global ids on a page).
async function saveClassifierAttrDate(oid, tid, el) {
  const p = CLS_DATE_PREFIX(oid, tid);
  const row = el?.closest('.date-row-inline');
  const num = (sfx) => parseInt(row?.querySelector(`[id="${p}-${sfx}"]`)?.value, 10) || 0;
  // V5.md §7.5 bug #2: dateInputsHTML (timeline.js) names the month input
  // `${prefix}-m`; this read `-mo`, which never exists, so every date field
  // saved as ''. The 'mo' passed to dateInputsHTML above is a VALUE key only.
  const d = num('d'), mo = num('m'), y = num('y');
  const value = (d && mo && y) ? fmtDate(d, mo, y, num('h'), num('min')) : '';
  await api.classifier.upsertAttr(oid, tid, value);
  const obj = clsFindObject(oid);
  if (obj) obj.attrMap[tid] = value;
}

// ── Level / condition table ─────────────────────────────────────────────
// Replaces the old "number box + step buttons parsed from the template's
// level_steps string". Stages are per element now and free text, so the shape
// is a table the user adds rows to. Column set is driven by the template's two
// flags (Plan: condition alone = condi+info, condition+levelable = level+
// condi+info), and levelable alone gets level+info by the same rule.
function clsLevelColumns(c) {
  const cols = [];
  if (c.levelable) cols.push(['level_label', 'levelColLevel']);
  if (c.has_condition) cols.push(['condition_value', 'condition']);
  cols.push(['info_value', 'levelColInfo']);
  return cols;
}

// Column width ratio (Process 8 part 2): level is capped at 10% of the row,
// condition takes 30% of whatever's left after level's share — so it's still
// ~30% of the full row when there's no level column at all — and info takes
// the rest. Grip/action stay small fixed percentages of their own rather than
// px, so they share the same 100%-of-row budget as the data columns instead
// of fighting table-layout:fixed's px-vs-% column math.
function clsLevelColumnWidths(c) {
  const gripPct = 6, actPct = 8;
  const rowPct = 100 - gripPct - actPct;
  const levelPct = c.levelable ? rowPct * 0.10 : 0;
  const condPct = c.has_condition ? (rowPct - levelPct) * 0.30 : 0;
  const infoPct = rowPct - levelPct - condPct;
  return { gripPct, actPct, level_label: levelPct, condition_value: condPct, info_value: infoPct };
}

function renderClassifierLevelTableHtml(o, c) {
  const cols = clsLevelColumns(c);
  const rows = (o.levelMap?.[c.id]) || [];
  const w = clsLevelColumnWidths(c);
  const colgroup = `<colgroup><col style="width:${w.gripPct}%">
    ${cols.map(([field]) => `<col style="width:${w[field]}%">`).join('')}
    <col style="width:${w.actPct}%"></colgroup>`;
  const head = cols.map(([, k]) => `<th>${t(k)}</th>`).join('');
  const body = rows.map(r => `<tr data-lid="${r.id}"
      oncontextmenu="openCtx('classifier.level',event,{objectId:${o.id},templateId:${c.id},levelId:${r.id}})"
      ondragover="onClassifierLevelRowDragOver(event,this)"
      ondragleave="this.classList.remove('drop-before','drop-after')"
      ondrop="onClassifierLevelRowDrop(event,${o.id},${c.id},${r.id})">
    <td class="cls-lv-grip"><span class="nar-grip" draggable="true" title="${t('dragReorder')}"
      ondragstart="onClassifierLevelRowDragStart(event,${r.id})">${I.move}</span></td>
    ${cols.map(([field]) => `<td><input class="cls-lv-inp" value="${x(r[field] || '')}"
      data-lid="${r.id}" data-field="${field}" onblur="saveClassifierLevelField(this)"></td>`).join('')}
    <td class="cls-lv-act"><button class="btn btn-g btn-i" onclick="deleteClassifierLevelRow(${r.id})" title="${t('delete')}">${I.delete}</button></td>
  </tr>`).join('');
  // §7.4 / §7.10 (HIG Disclosure controls): a table that already has rows
  // starts folded, so a detail page of several levelable fields reads as a
  // list of fields rather than a wall of tables. Open state is remembered
  // per (object, field) for the session.
  const key = `${o.id}:${c.id}`;
  const open = !rows.length || S.clsLevelOpen?.has(key);
  const summary = rows.length ? `${x(rows[rows.length - 1].level_label || rows[rows.length - 1].condition_value || '')} · ${rows.length}` : '';
  return `<details class="cls-lv-wrap"${open ? ' open' : ''} ontoggle="toggleClassifierLevelOpen('${key}',this.open)">
    <summary class="cls-lv-head"><span class="pk">${x(c.description)}</span>
      <span class="cls-lv-sum" data-no-i18n>${summary}</span>
      <button class="btn btn-g cls-lv-add" onclick="event.preventDefault();addClassifierLevel(${o.id},${c.id})">${I.plus} ${t('levelAddRow')}</button></summary>
    ${rows.length ? `<table class="cls-lv-table">${colgroup}<thead><tr><th></th>${head}<th></th></tr></thead><tbody>${body}</tbody></table>`
      : `<div class="cls-lv-empty">${t('levelNoRows')}</div>`}
  </details>`;
}

function toggleClassifierLevelOpen(key, open) {
  S.clsLevelOpen = S.clsLevelOpen || new Set();
  if (open) S.clsLevelOpen.add(key); else S.clsLevelOpen.delete(key);
}

// Drag-reorder for level rows, mirroring narrator-dialogue.js's
// onNarratorRowDragStart/DragOver/Drop. The drag source is the grip, not the
// row, since rows are almost entirely <input> and a drag begun on one would
// just select text. Scoped to one attribute's own row set — each table only
// ever renders one attribute's rows, so there's no cross-attribute drop
// target to guard against in the UI, and moveLevels' own WHERE clause
// (object_ref AND template_ref) is a defense-in-depth guarantee besides.
function onClassifierLevelRowDragStart(ev, id) {
  S.dragClassifierLevelRow = id;
  ev.dataTransfer.effectAllowed = 'move';
  ev.stopPropagation();
}

function onClassifierLevelRowDragOver(ev, row) {
  if (S.dragClassifierLevelRow == null) return;
  ev.preventDefault();
  ev.stopPropagation();
  const r = row.getBoundingClientRect();
  const before = (ev.clientY - r.top) / r.height < 0.5;
  row.classList.remove('drop-before', 'drop-after');
  row.classList.add(before ? 'drop-before' : 'drop-after');
}

async function onClassifierLevelRowDrop(ev, objectId, templateId, targetId) {
  ev.preventDefault();
  ev.stopPropagation();
  const row = ev.currentTarget;
  const before = row.classList.contains('drop-before');
  row.classList.remove('drop-before', 'drop-after');
  const dragId = S.dragClassifierLevelRow;
  S.dragClassifierLevelRow = null;
  if (dragId == null || dragId === targetId) return;
  // Read the current order straight off the table rather than off the
  // cache: the element page (item.js's openItemNode path) hydrates its own
  // levelMap, so the DOM is the one place this row set is reliably found.
  const ids = Array.from(row.closest('tbody').querySelectorAll('tr[data-lid]'))
    .map(tr => Number(tr.dataset.lid)).filter(id => id !== dragId);
  const idx = ids.indexOf(targetId);
  ids.splice(before ? idx : idx + 1, 0, dragId);
  await api.classifier.moveLevels(objectId, templateId, ids);
  await reloadClassifierDetail();
}

async function addClassifierLevel(oid, tid) {
  await api.classifier.createLevel(oid, tid);
  S.clsLevelOpen = S.clsLevelOpen || new Set();
  S.clsLevelOpen.add(`${oid}:${tid}`);
  await reloadClassifierDetail();
}

// Insert above / below / duplicate (§7.4 level-row menu). createLevel always
// appends; the new id is then moved into place with the same moveLevels the
// drag handler uses, reading the current order off the table (see
// onClassifierLevelRowDrop for why the DOM, not a cache).
async function insertClassifierLevel(oid, tid, refId, where, copyFrom = null) {
  const newId = await api.classifier.createLevel(oid, tid);
  // The row the menu was opened on (hub/ctxmenu.js keeps it) — not the first
  // row with that id in the window, which may be another pane's copy.
  const scope = S.ctxTarget?.closest?.('tbody') || document;
  if (copyFrom) {
    const src = scope.querySelector(`tr[data-lid="${copyFrom}"]`);
    for (const inp of src ? src.querySelectorAll('input[data-field]') : []) {
      if (inp.value) await api.classifier.updateLevelField(newId, inp.dataset.field, inp.value);
    }
  }
  const tbody = scope.querySelector(`tr[data-lid="${refId}"]`)?.closest('tbody');
  if (tbody) {
    const ids = [...tbody.querySelectorAll('tr[data-lid]')].map(tr => Number(tr.dataset.lid));
    const idx = ids.indexOf(refId);
    ids.splice(where === 'before' ? idx : idx + 1, 0, newId);
    await api.classifier.moveLevels(oid, tid, ids);
  }
  await reloadClassifierDetail();
}

async function saveClassifierLevelField(el) {
  await api.classifier.updateLevelField(Number(el.dataset.lid), el.dataset.field, el.value.trim());
  // Deliberately no re-render: the user may be tabbing straight into the next
  // cell, and rebuilding the table would blow away their focus mid-row. The
  // local cache is patched instead so the next real render is still correct.
  const rows = clsAllData().flatMap(d => d.objects)
    .flatMap(o => Object.values(o.levelMap || {}).flat());
  const row = rows.find(r => r.id === Number(el.dataset.lid));
  if (row) row[el.dataset.field] = el.value.trim();
}

// §7.5 bug #5: this deleted on one click with no confirm and no undo.
async function deleteClassifierLevelRow(id) {
  if (!await uiConfirm(t('confirmDeleteLevelRow'))) return;
  await api.classifier.deleteLevel(id);
  await reloadClassifierDetail();
}

// The detail body renders in a Classifier instance and on the element's own
// page — refresh whichever is live.
async function reloadClassifierDetail() {
  await refreshClassifier(); // mod/classifier.js — module view or element page, whichever is live
}

// ── Linked elements from other Major modules ────────────────────────────
// Stored as entity_relation rows keyed cobj_<id> — the same vault-wide,
// module-agnostic link table Connector and the Relation view already write, so
// this needs no schema of its own. The picker and the "which module did this
// come from" label both come from viewer.index, whose rows already carry
// moduleName/moduleKind.
// Both entry points (the module view's loadClassifierData and the element
// page's renderBody) hand their already-fetched relations + viewer index here,
// so the render pass below stays synchronous — renderClassifierObjectDetail is
// called from string-building code that can't await.
let _clsLinks = [];
let _clsLinkIndex = {};
function setClassifierLinkData(relations, index) {
  _clsLinks = relations || [];
  _clsLinkIndex = {};
  for (const e of (index || [])) _clsLinkIndex[e.key] = e;
}

// The one read-only relation renderer (§7.4 "one relation surface") — the
// Relation view calls it for every object in the category, the detail page
// for one. A relation between two keys of the set shows once.
function classifierRelationRowsHtml(keys) {
  const seen = new Set();
  return _clsLinks.filter(l => keys.has(l.from_key) || keys.has(l.to_key)).map(l => {
    if (seen.has(l.id)) return '';
    seen.add(l.id);
    const mine = keys.has(l.from_key) ? l.from_key : l.to_key;
    const otherKey = mine === l.from_key ? l.to_key : l.from_key;
    const e = _clsLinkIndex[otherKey];
    const own = keys.size > 1 ? _clsLinkIndex[mine] : null;
    // The module name is the point, not decoration: a linked element is
    // meaningless without knowing which module it lives in.
    const from = e ? `${e.moduleName || '—'}${e.moduleKind ? ` · ${kindLabel(e.moduleKind)}` : ''}` : '—';
    const arrow = l.directed === 0 ? '—' : mine === l.from_key ? '→' : '←';
    // A relation field's row (§11.3) is labelled with the field, not its id.
    const rt = /^ctpl_\d+$/.test(l.rel_type || '') ? clsFieldNameOf(Number(l.rel_type.slice(5))) : l.rel_type;
    const lbl = [l.label, rt && `(${rt})`].filter(Boolean).join(' ');
    return `<div class="cls-link-row">
      ${own ? `<span class="cls-link-name" onclick="openEntityByKey('${x(mine)}')">${x(own.name)}</span>` : ''}
      <span data-no-i18n>${arrow}</span>
      <span class="cls-link-name" onclick="openEntityByKey('${x(otherKey)}')">${x(e ? e.name : otherKey)}</span>
      <span class="cls-link-mod">${x(from)}</span>
      ${lbl ? `<span class="cls-link-lbl">${x(lbl)}</span>` : ''}
    </div>`;
  }).join('');
}

function renderClassifierLinksHtml(o) {
  const rows = classifierRelationRowsHtml(new Set([`cobj_${o.id}`]));
  return `<div class="insp-label cls-link-label">${t('linkedElements')}</div>
    <div class="cls-link-list">${rows || `<div class="cls-lv-empty">${t('noLinkedElements')}</div>`}</div>
    <button class="btn btn-g" style="margin:4px 14px" onclick="openExhibitorFor(${o.module_ref ?? S.activeItemNode?.moduleId ?? S.activeModuleNode?.id ?? 'null'},'cobj_${o.id}')">${I.relation} ${t('openInExhibitor')}</button>`;
}

// v5 (APP docs/V5.md §3.5): links are read here, authored in an Exhibitor.

// ── One attribute row ───────────────────────────────────────────────────
// Branch order matters: a levelable or conditioned template renders as the
// table above and ignores attribute_type entirely, since its values live in
// classifier_level rather than in the single attribute_value cell.
function renderClassifierAttrRowHtml(o, c) {
  if (c.levelable || c.has_condition) return renderClassifierLevelTableHtml(o, c);
  // v5 Part 7 (§11.3): one renderer per field type, mod/cls-field-types.js.
  return `<div class="prop"><span class="pk">${x(c.description)}</span>${clsFieldValueHtml(o, c)}</div>`;
}

// `templates` defaults to the module's cache — the item page
// (src/renderer/mod/item.js) passes its own freshly-fetched templates, since
// it can be opened without the module's data ever having loaded.
function renderClassifierObjectDetail(m, o, templates = clsData(m.id).templates) {
  let html = `<h3 style="margin-bottom:8px" oncontextmenu="openCtx('classifier.object',event,{moduleId:${m.id},objectId:${o.id}})">${x(o.name)}</h3>`;
  for (const c of templates) html += renderClassifierAttrRowHtml(o, c);
  // §7.4: a field is reachable where it is missing — no trip to the fields
  // modal to add one more.
  html += `<div class="cls-addfield">
    <input class="cls-addfield-inp" data-r="addfield" placeholder="${x(t('clsAddFieldPlaceholder'))}"
      onkeydown="if(event.key==='Enter'){event.preventDefault();addClassifierFieldInline(${m.id},${o.id},this)}">
    <button class="btn btn-g btn-sm" onclick="addClassifierFieldInline(${m.id},${o.id},this)" title="${x(t('clsAddFieldShared'))}">${I.plus} ${t('clsAddField')}</button>
  </div>`;
  // Private fields: any number, on every object (§7.4 — this used to be one
  // field, and only when the category's cat_type was 'character').
  const priv = o.privateTemplates || [];
  const privRows = priv.map(pt => `<div class="prop">
      <span class="pk">${x(pt.description)}</span>
      <span class="pv" contenteditable="true" data-wiki data-oid="${o.id}" data-tid="${pt.id}" onblur="saveClassifierAttrCell(this)">${x(pt.value || '')}</span>
      <button class="btn btn-g btn-i" onclick="deleteClassifierPrivateField(${pt.id})" title="${t('delete')}">${I.delete}</button>
    </div>`).join('');
  html += `<details class="cls-priv"${priv.length ? '' : ' open'}>
    <summary class="insp-label">${t('customAttribute')}${priv.length ? ` <span class="cnt" data-no-i18n>${priv.length}</span>` : ''}</summary>
    ${privRows}
    <button class="btn btn-g" style="margin:4px 14px" onclick="openClassifierCustomAttrModal(${m.id},${o.id})">${I.plus} ${t('customAttribute')}</button>
  </details>`;
  html += renderClassifierLinksHtml(o);
  return html;
}
