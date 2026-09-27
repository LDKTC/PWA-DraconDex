'use strict';
// ═══ Classifier field types (v5 Part 7, APP docs/V5.md §11.3) ═══════════
// Ten types, one table. Before Part 7 the popup offered text / textarea /
// date, while Artisan already wrote 'number' — which the list showed as
// "Text" and the popup silently rewrote to 'text' on the next save.
//
//   type       value stored in                      notes
//   text       classifier_attribute (string)
//   textarea   classifier_attribute (string)
//   number     classifier_attribute (string)        sorts / computes as a number
//   date       classifier_attribute (d-m-y h:mi)
//   select     classifier_attribute (one choice)    choices in template.options
//   multi      classifier_attribute (JSON array)    same choices
//   checkbox   classifier_attribute ('0' / '1')
//   url        classifier_attribute (http(s) URL)   opened by main, never in-app
//   relation   entity_relation rows                 rel_type = ctpl_<field id>,
//                                                   from_key = cobj_<object>
//   formula    nothing — computed                   options.expr, core/formula.js
//
// A relation field's rows are ordinary relations: the Exhibitor shows them
// and may edit or delete them too (the user's call, §11.13) — this file and
// the Exhibitor write the same rows.

const CLS_FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multi', 'checkbox', 'url', 'relation', 'formula'];
const CLASSIFIER_DISPTYPE_KEY = {
  text: 'dispTypeText', textarea: 'dispTypeTextarea', date: 'dispTypeDate', number: 'dispTypeNumber',
  select: 'dispTypeSelect', multi: 'dispTypeMulti', checkbox: 'dispTypeCheckbox', url: 'dispTypeUrl',
  relation: 'dispTypeRelation', formula: 'dispTypeFormula',
};
// Which types are prose a [[link]] may sit in (db/wiki-sources.js agrees).
const CLS_WIKI_TYPES = new Set(['text', 'textarea']);
// Types whose table cell is typed into directly; the rest open the object.
const CLS_CELL_EDIT_TYPES = new Set(['text', 'number', 'url']);
// What a relation field may point at, in the viewer index's own kinds.
const CLS_RELATION_KINDS = ['object', 'event', 'dialogue', 'chapter', 'chat', 'module', 'page', 'file'];

const clsType = (c) => (CLS_FIELD_TYPES.includes(c?.attribute_type) ? c.attribute_type : 'text');
function clsFieldOpts(c) {
  try { const o = JSON.parse(c?.options || '{}'); return o && typeof o === 'object' ? o : {}; }
  catch (_) { return {}; }
}
const clsChoices = (c) => (Array.isArray(clsFieldOpts(c).choices) ? clsFieldOpts(c).choices.map(String) : []);
function clsMultiValue(raw) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.map(String) : []; }
  catch (_) { return raw ? [String(raw)] : []; }
}
const clsFieldRels = (oid, tid) => (typeof _clsLinks !== 'undefined' ? _clsLinks : [])
  .filter(l => l.from_key === `cobj_${oid}` && l.rel_type === `ctpl_${tid}`);
// A field's name by id — for a relation row whose rel_type is ctpl_<id>.
function clsFieldNameOf(tid) {
  return clsFindTemplate(tid)?.description || t('dispTypeRelation');
}
const clsKeyName = (key) => (typeof _clsLinkIndex !== 'undefined' && _clsLinkIndex[key]?.name) || key;

// The fields an object's formulas can read: its category's shared fields
// plus its own private ones.
function clsFormulaText(o, c) {
  const fields = [...clsData(o.module_ref).templates, ...(o.privateTemplates || [])];
  if (!fields.some(f => f.id === c.id)) fields.push(c);
  const vals = { ...(o.attrMap || {}) };
  for (const pt of o.privateTemplates || []) vals[pt.id] = pt.value;
  const r = formulaValue(c, fields, vals);
  return r.ok ? { text: formatFormulaValue(r.value) } : { text: '⚠', error: r.error };
}

// ── The value on an object's page ───────────────────────────────────────
function clsFieldValueHtml(o, c) {
  const raw = o.attrMap?.[c.id] ?? '';
  const val = x(raw);
  const data = `data-oid="${o.id}" data-tid="${c.id}"`;
  switch (clsType(c)) {
    case 'textarea':
      return `<textarea class="pv-textarea" data-wiki ${data} onblur="saveClassifierAttrInput(this)">${val}</textarea>`;
    case 'date':
      return clsDateInputsHtml(o, c);
    case 'number':
      return `<input class="pv-input" type="number" step="any" ${data} value="${val}" onchange="saveClassifierAttrInput(this)">`;
    case 'select':
      return `<select class="pv-input" ${data} onchange="saveClassifierAttrInput(this)">
        <option value="">—</option>
        ${clsChoices(c).map(ch => `<option value="${x(ch)}"${ch === raw ? ' selected' : ''} data-no-i18n>${x(ch)}</option>`).join('')}
        ${raw && !clsChoices(c).includes(raw) ? `<option value="${val}" selected data-no-i18n>${val}</option>` : ''}
      </select>`;
    case 'multi': {
      const on = new Set(clsMultiValue(raw));
      return `<span class="pv cls-multi">${clsChoices(c).map(ch => `
        <label class="cls-multi-opt"><input type="checkbox" data-choice="${x(ch)}"${on.has(ch) ? ' checked' : ''}
          onchange="saveClsMulti(${o.id},${c.id},this)"><span data-no-i18n>${x(ch)}</span></label>`).join('') || `<span class="ghost">${t('clsNoChoices')}</span>`}</span>`;
    }
    case 'checkbox':
      return `<span class="pv"><span class="tg${raw === '1' ? ' on' : ''}" role="switch" aria-checked="${raw === '1'}" onclick="toggleClsCheckbox(${o.id},${c.id},this)"></span></span>`;
    case 'url':
      return `<span class="pv cls-url">
        <input class="pv-input" type="url" ${data} value="${val}" placeholder="https://" onchange="saveClsUrl(this)">
        ${raw ? `<button class="btn btn-g btn-i" onclick="api.classifier.openUrl(${o.id},${c.id})" title="${x(t('assetOpenLink'))}">${I.export}</button>` : ''}
      </span>`;
    case 'relation': {
      const rels = clsFieldRels(o.id, c.id);
      return `<span class="pv cls-rel">
        ${rels.map(r => `<span class="htag cls-rel-chip"><span onclick="openEntityByKey('${x(r.to_key)}')" data-no-i18n>${x(clsKeyName(r.to_key))}</span>
          <span class="cls-rel-x" onclick="removeClsRelation(${r.id})" title="${x(t('delete'))}">×</span></span>`).join('')}
        <button class="btn btn-g btn-i" onclick="openClsRelationPicker(${o.module_ref ?? S.activeModuleNode?.id ?? 'null'},${o.id},${c.id})" title="${x(t('clsRelationAdd'))}">${I.plus}</button>
      </span>`;
    }
    case 'formula': {
      const f = clsFormulaText(o, c);
      return `<span class="pv cls-formula" title="${x(f.error || clsFieldOpts(c).expr || '')}" data-no-i18n>${x(f.text)}</span>`;
    }
    default:
      return `<span class="pv" contenteditable="true" data-wiki ${data} onblur="saveClassifierAttrCell(this)">${val}</span>`;
  }
}

// ── The table cell ──────────────────────────────────────────────────────
function clsFieldCellHtml(m, o, c) {
  const type = clsType(c);
  const raw = o.attrMap?.[c.id] ?? '';
  if (CLS_CELL_EDIT_TYPES.has(type)) {
    return `<td class="cls-cell${type === 'number' ? ' cls-num' : ''}" contenteditable="true"${type === 'text' ? ' data-wiki' : ''} data-oid="${o.id}" data-tid="${c.id}" onblur="saveClassifierAttrCell(this)">${x(raw)}</td>`;
  }
  if (type === 'textarea') {
    return `<td class="cls-cell" contenteditable="true" data-wiki data-oid="${o.id}" data-tid="${c.id}" onblur="saveClassifierAttrCell(this)">${x(raw)}</td>`;
  }
  if (type === 'date') {
    return `<td class="cls-cell" contenteditable="true" data-oid="${o.id}" data-tid="${c.id}" onblur="saveClassifierAttrCell(this)">${x(raw)}</td>`;
  }
  let text;
  if (type === 'multi') text = clsMultiValue(raw).join(', ');
  else if (type === 'checkbox') text = raw === '1' ? '✓' : '';
  else if (type === 'relation') text = clsFieldRels(o.id, c.id).map(r => clsKeyName(r.to_key)).join(', ');
  else if (type === 'formula') text = clsFormulaText(o, c).text;
  else text = raw;
  return `<td class="cls-cell cls-cell-ro${type === 'formula' ? ' cls-num' : ''}" onclick="openItemNode('classifier',${m.id},${o.id})" data-no-i18n>${x(text || '')}</td>`;
}

// ── Saving ──────────────────────────────────────────────────────────────
async function clsStoreValue(oid, tid, value) {
  await api.classifier.upsertAttr(oid, tid, value);
  const obj = clsFindObject(oid);
  if (obj) obj.attrMap[tid] = value;
}

async function saveClsMulti(oid, tid, el) {
  const box = el.closest('.cls-multi');
  const picked = [...box.querySelectorAll('input[data-choice]:checked')].map(i => i.dataset.choice);
  await clsStoreValue(oid, tid, picked.length ? JSON.stringify(picked) : '');
}

async function toggleClsCheckbox(oid, tid, el) {
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  el.setAttribute('aria-checked', String(on));
  await clsStoreValue(oid, tid, on ? '1' : '0');
  if (clsData(clsModuleOfObject(oid)).templates.some(tp => tp.attribute_type === 'formula')) refreshClassifier();
}

async function saveClsUrl(el) {
  const v = el.value.trim();
  if (v && !/^https?:\/\//i.test(v)) { toast(t('assetUrlInvalid'), 'err'); return; }
  await clsStoreValue(Number(el.dataset.oid), Number(el.dataset.tid), v);
  refreshClassifier();
}

// ── Relation field: pick a target ──────────────────────────────────────
async function openClsRelationPicker(moduleId, oid, tid) {
  const c = clsFindTemplate(tid) || { options: null };
  const kinds = clsFieldOpts(c).targetKinds;
  const allow = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
  // A bundle's field can point into one category ("Weapon" → the Weapons
  // Classifier it was made with, §11.7).
  const inModule = clsFieldOpts(c).targetModuleId || null;
  const have = new Set(clsFieldRels(oid, tid).map(r => r.to_key));
  const pool = (await api.viewer.index(S.nexus.id))
    .filter(it => (!allow || allow.has(it.kind)) && (!inModule || it.moduleId === inModule) && it.key !== `cobj_${oid}` && !have.has(it.key));
  window._clsRelPick = { moduleId, oid, tid, pool };
  openModal(t('clsRelationAdd'), `
    <input id="cls-rel-q" placeholder="${x(t('kindSearch'))}" oninput="paintClsRelationPicker()" autocomplete="off">
    <div class="objlist cls-rel-list" id="cls-rel-list"></div>
    <div class="mfoot"><button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button></div>`);
  paintClsRelationPicker();
  setTimeout(() => q('#cls-rel-q')?.focus(), 60);
}

function paintClsRelationPicker() {
  const p = window._clsRelPick;
  const list = q('#cls-rel-list');
  if (!p || !list) return;
  const needle = (q('#cls-rel-q')?.value || '').trim().toLowerCase();
  const rows = p.pool.filter(it => !needle || String(it.name).toLowerCase().includes(needle)).slice(0, 60);
  list.innerHTML = rows.map(it => `<div class="li" onclick="pickClsRelation('${x(it.key)}')">
      <span class="name" data-no-i18n>${x(it.name)}</span>
      <span class="drafter-hint" data-no-i18n>${x(it.moduleName || '')}</span></div>`).join('')
    || `<div class="empty"><p>${t('qsNoResults')}</p></div>`;
}

async function pickClsRelation(key) {
  const p = window._clsRelPick;
  if (!p) return;
  await api.viewer.createRelation(S.nexus.id, `cobj_${p.oid}`, key, null, null, { relType: `ctpl_${p.tid}`, moduleRef: p.moduleId });
  closeModal();
  await refreshClassifier();
}

async function removeClsRelation(relId) {
  await api.viewer.deleteRelation(relId);
  await refreshClassifier();
}

// ── The type settings in the fields modal ───────────────────────────────
function clsFieldOptionsHtml(cur) {
  const type = clsType(cur);
  const o = clsFieldOpts(cur);
  return `
    <div class="fg cls-opt" data-for="select multi"${['select', 'multi'].includes(type) ? '' : ' hidden'}>
      <label>${t('clsChoices')}</label>
      <textarea id="ct-choices" rows="4" placeholder="${x(t('clsChoicesHint'))}">${x((o.choices || []).join('\n'))}</textarea>
    </div>
    <div class="fg cls-opt" data-for="formula"${type === 'formula' ? '' : ' hidden'}>
      <label>${t('clsFormula')}</label>
      <input id="ct-expr" value="${x(o.expr || '')}" placeholder="{HP} * 2 + {Level}" data-no-i18n>
      <div class="sync-hint">${t('clsFormulaHint')}</div>
    </div>
    <div class="fg cls-opt" data-for="relation"${type === 'relation' ? '' : ' hidden'}>
      <label>${t('clsRelationTargets')}</label>
      <div class="cls-multi">${CLS_RELATION_KINDS.map(k => `<label class="cls-multi-opt"><input type="checkbox" data-kind="${k}"${(o.targetKinds || []).includes(k) ? ' checked' : ''}><span data-no-i18n>${x(VIEWER_KIND_LABEL[k] || k)}</span></label>`).join('')}</div>
      <div class="sync-hint">${t('clsRelationTargetsHint')}</div>
    </div>`;
}

function onClsTypeChange(sel) {
  document.querySelectorAll('.cls-opt').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(sel.value); });
}

// The options JSON for the type chosen in the modal, or null.
function readClsFieldOptions(type) {
  if (type === 'select' || type === 'multi') {
    const choices = [...new Set((q('#ct-choices')?.value || '').split('\n').map(s => s.trim()).filter(Boolean))];
    return choices.length ? { choices } : null;
  }
  if (type === 'formula') {
    const expr = (q('#ct-expr')?.value || '').trim();
    return expr ? { expr } : null;
  }
  if (type === 'relation') {
    const targetKinds = [...document.querySelectorAll('.cls-opt[data-for="relation"] input[data-kind]:checked')].map(i => i.dataset.kind);
    return targetKinds.length ? { targetKinds } : null;
  }
  return null;
}
