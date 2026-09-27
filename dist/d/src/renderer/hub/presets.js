'use strict';
// ═══ Presets — where one module's work starts (v5 Part 6, APP docs/V5.md §10.8)
// A preset is a starting point for ONE module of one kind. Two sources, one
// list per kind:
//   built-in   KIND_PRESETS below — shipped with the app, names and field
//              names translated at apply time
//   the user's own   module_preset rows in the vault (db/preset.js), saved
//              with "Save as preset…" on any module — they travel with the
//              .ddx and with a whole-vault snapshot
// Offered in two places: the kind picker (a row with presets opens a flyout;
// clicking the row itself still creates an empty module) and the kind's
// empty page (hub/kind-page.js kindEmptyStateHtml), as chips.
//
// Artisan is untouched and still the way to build a whole structure at once
// (§10.8): a preset is the quick start for a single module.

// A field name is an i18n key here, resolved with t() when applied — the
// field is then an ordinary field in the user's language, editable like any.
const KIND_PRESETS = {
  classifier: [
    { id: 'character', nameKey: 'presetCharacter', icon: 'person',
      spec: { catType: 'character', fields: [
        { nameKey: 'pfAge' }, { nameKey: 'pfRole' },
        { nameKey: 'pfAppearance', type: 'textarea' }, { nameKey: 'pfBackground', type: 'textarea' },
      ] } },
    { id: 'item', nameKey: 'presetItem', icon: 'item',
      spec: { catType: 'object', fields: [
        { nameKey: 'pfType' }, { nameKey: 'pfOwner' }, { nameKey: 'pfDescription', type: 'textarea' },
      ] } },
    { id: 'place', nameKey: 'presetPlace', icon: 'map',
      spec: { catType: 'object', fields: [
        { nameKey: 'pfRegion' }, { nameKey: 'pfClimate' }, { nameKey: 'pfDescription', type: 'textarea' },
      ] } },
    // v5 Part 7 (§11.6) — the modules that almost were, as Classifier shapes.
    // `role` marks a field the app itself reads (Narrator's story variables);
    // `choiceKeys` are a select's choices, translated like the field names.
    { id: 'variables', nameKey: 'presetVariables', icon: 'func',
      spec: { catType: 'element', fields: [
        { nameKey: 'pfVarType', type: 'select', role: 'varType', choiceKeys: ['varTypeNumber', 'varTypeBool', 'varTypeText'] },
        { nameKey: 'pfVarDefault', role: 'varDefault' },
      ] } },
    { id: 'secrets', nameKey: 'presetSecrets', icon: 'eyeOff',
      spec: { catType: 'element', fields: [{ nameKey: 'pfTruth', type: 'textarea' }] } },
    { id: 'awareness', nameKey: 'presetAwareness', icon: 'person',
      spec: { catType: 'element', fields: [
        { nameKey: 'pfWho', type: 'relation', targetKinds: ['object'] },
        { nameKey: 'pfWhat', type: 'relation', targetKinds: ['object'] },
        { nameKey: 'pfKnowStatus', type: 'select', choiceKeys: ['knowKnows', 'knowSuspects', 'knowWrong'] },
        { nameKey: 'pfLearnedAt', type: 'relation', targetKinds: ['chapter'] },
      ] } },
    { id: 'threads', nameKey: 'presetThreads', icon: 'relation',
      spec: { catType: 'element', fields: [{ nameKey: 'pfDescription', type: 'textarea' }] } },
    { id: 'beats', nameKey: 'presetBeats', icon: 'timeline',
      spec: { catType: 'element', fields: [
        { nameKey: 'pfOfThread', type: 'relation', targetKinds: ['object'] },
        { nameKey: 'pfBeatType', type: 'select', choiceKeys: ['beatSetup', 'beatRemind', 'beatPayoff', 'beatRedHerring'] },
        { nameKey: 'pfInChapter', type: 'relation', targetKinds: ['chapter'] },
      ] } },
    { id: 'skills', nameKey: 'presetSkills', icon: 'star',
      spec: { catType: 'element', fields: [
        { nameKey: 'pfDescription', type: 'textarea' },
        { nameKey: 'pfSkillEffect', levelable: true, hasCondition: true },
        { nameKey: 'pfUsableBy', type: 'relation', targetKinds: ['object'] },
      ] } },
    { id: 'quests', nameKey: 'presetQuests', icon: 'map',
      spec: { catType: 'element', fields: [
        { nameKey: 'pfQuestStatus', type: 'select', choiceKeys: ['questNotStarted', 'questActive', 'questDone', 'questFailed'] },
        { nameKey: 'pfQuestGiver', type: 'relation', targetKinds: ['object'] },
        { nameKey: 'pfObjectives', type: 'textarea' },
        { nameKey: 'pfReward' },
        { nameKey: 'pfInChapter', type: 'relation', targetKinds: ['chapter', 'event'] },
      ] } },
  ],
  // v5 Part 7 (§11.5): the name / word generator is a Diviner preset, not a
  // module of its own — a 'join' table whose entries roll the other two.
  // The syllables are an example to replace, so they are not translated.
  diviner: [
    { id: 'names', nameKey: 'presetNameGen', icon: 'dice',
      spec: { tables: [
        { nameKey: 'presetTblPrefix', entries: ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Kor'].map(text => ({ text })) },
        { nameKey: 'presetTblSuffix', entries: ['an', 'eth', 'ion', 'mir', 'os', 'wyn', 'dor', 'ra'].map(text => ({ text })) },
        { nameKey: 'presetTblName', mode: 'join', entries: [{ table: 0 }, { table: 1 }] },
      ] } },
    { id: 'd20', nameKey: 'presetTblD20', icon: 'dice',
      spec: { tables: [
        { nameKey: 'presetTblD20', dice: '1d20', entries: [[1, 5], [6, 10], [11, 15], [16, 20]].map(([lo, hi]) => ({ lo, hi })) },
      ] } },
  ],
};

// The user's presets for the open Nexus, refreshed with the module tree
// (hub/kinds.js reloadModuleTree) — the kind picker is synchronous.
let _presetCache = { nexusId: null, rows: [] };
async function refreshPresetCache() {
  refreshPageTemplates(); // hub/page-templates.js — the kind picker's flyout lists them
  const nx = S.nexus?.id;
  if (nx == null || typeof api.preset?.list !== 'function') { _presetCache = { nexusId: nx, rows: [] }; return; }
  try { _presetCache = { nexusId: nx, rows: await api.preset.list(nx, null) }; }
  catch (_) { _presetCache = { nexusId: nx, rows: [] }; }
}

const userPresetCount = () => (_presetCache.nexusId === S.nexus?.id ? _presetCache.rows.length : 0);

// Every preset for a kind, built-ins first: [{ ref, name, icon }].
function presetsFor(kind) {
  const own = _presetCache.nexusId === S.nexus?.id ? _presetCache.rows.filter(r => r.kind === kind) : [];
  return [
    ...(KIND_PRESETS[kind] || []).map(p => ({ ref: `b:${p.id}`, name: t(p.nameKey), icon: p.icon })),
    ...own.map(r => ({ ref: `u:${r.id}`, name: r.name, icon: r.spec?.icon && I[r.spec.icon] ? r.spec.icon : 'star', own: true })),
  ];
}

// A built-in field's options JSON: its choices in this language, its
// relation targets, and its role (what the app reads it as), or null.
function presetFieldOptions(f) {
  const o = {};
  if (f.choiceKeys) o.choices = f.choiceKeys.map(k => t(k));
  if (f.targetKinds) o.targetKinds = f.targetKinds;
  if (f.role) o.role = f.role;
  return Object.keys(o).length ? JSON.stringify(o) : null;
}

// ref -> a spec db/preset.js can apply (built-in field names translated now).
function presetSpec(kind, ref) {
  if (ref.startsWith('b:')) {
    const p = (KIND_PRESETS[kind] || []).find(x2 => x2.id === ref.slice(2));
    if (!p) return null;
    return {
      ...p.spec,
      fields: (p.spec.fields || []).map(f => ({
        name: t(f.nameKey), type: f.type || 'text', levelable: !!f.levelable, hasCondition: !!f.hasCondition,
        options: presetFieldOptions(f),
      })),
      tables: (p.spec.tables || []).map(tb => ({ ...tb, name: t(tb.nameKey) })),
    };
  }
  return _presetCache.rows.find(r => `u:${r.id}` === ref)?.spec || null;
}

async function applyPresetToModule(moduleId, kind, ref) {
  const spec = presetSpec(kind, ref);
  if (!spec) return;
  await api.preset.apply(moduleId, spec);
}

// From the kind picker's flyout: create, then shape it.
async function createModuleFromPreset(kind, parentId, ref) {
  await quickCreateModule(kind, parentId, ref);
}

// From a kind's empty page: shape the module that is already there.
async function startModuleFromPreset(moduleId, ref) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  await applyPresetToModule(moduleId, m.kind, ref);
  await reloadModuleTree();
  await openModuleNode(moduleId);
  toast(t('created'), 'ok');
}

function presetChipsHtml(m) {
  const list = presetsFor(m.kind);
  if (!list.length) return '';
  return `<div class="preset-chips">
    <span class="drafter-hint">${t('presetStartFrom')}</span>
    ${list.map(p => `<button class="btn btn-s btn-sm" onclick="startModuleFromPreset(${m.id},${xj(p.ref)})">${I[p.icon] || ''} <span${p.own ? ' data-no-i18n' : ''}>${x(p.name)}</span></button>`).join('')}
  </div>`;
}

// The kind picker's flyout for a kind that has presets.
function openPresetSubmenu(ev, kind, parentId) {
  const pid = parentId == null ? 'null' : Number(parentId);
  openCtxSubmenu(ev, `
    <div class="kind-list-item" onclick="closeAllPopups();quickCreateModule('${kind}',${pid})"><span class="kli-name">${x(t('presetEmpty'))}</span></div>
    ${templateMenuHtml(kind, pid)}
    ${presetsFor(kind).length ? `<div class="ctx-sep"></div><div class="ctx-head">${t('presetsTitle')}</div>` : ''}
    ${presetsFor(kind).map(p => `<div class="kind-list-item" onclick="closeAllPopups();createModuleFromPreset('${kind}',${pid},${xj(p.ref)})">
      <span class="kicon">${I[p.icon] || ''}</span><span class="kli-name"${p.own ? ' data-no-i18n' : ''}>${x(p.name)}</span></div>`).join('')}`);
}

// ── Save / manage ───────────────────────────────────────────────────────
function openSavePresetModal(moduleId) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  openModal(t('savePreset'), `
    <div class="fg"><label>${t('name')} *</label><input id="preset-name" value="${x(m.name)}"
      onkeydown="if(event.key==='Enter'){event.preventDefault();submitSavePreset(${moduleId})}"></div>
    <div class="sync-hint">${t('savePresetHint')}</div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitSavePreset(${moduleId})">${t('save')}</button>
    </div>`);
  setTimeout(() => { const el = q('#preset-name'); el?.focus(); el?.select(); }, 60);
}

async function submitSavePreset(moduleId) {
  const name = q('#preset-name')?.value.trim();
  if (!name) { toast(t('nameRequired'), 'err'); q('#preset-name')?.focus(); return; }
  try { await api.preset.save(S.nexus.id, moduleId, name); }
  catch (_) { toast(t('driveErrServer'), 'err'); return; }
  closeModal();
  await refreshPresetCache();
  toast(t('presetSaved'), 'ok');
}

async function openManagePresetsModal() {
  await refreshPresetCache();
  const rows = _presetCache.rows;
  openModal(t('managePresets'), `
    ${rows.length ? `<div class="objlist">${rows.map(r => `
      <div class="li"><span class="kicon" style="color:${x(KIND_COLOR[r.kind] || 'var(--accent)')}">${I[KIND_ICON[r.kind]] || ''}</span>
        <span class="name" data-no-i18n>${x(r.name)}</span>
        <span class="drafter-hint" data-no-i18n>${x(kindLabel(r.kind))}</span>
        <button class="btn btn-g btn-i" onclick="deleteUserPreset(${r.id})" title="${x(t('delete'))}">${I.delete}</button>
      </div>`).join('')}</div>` : `<div class="empty"><p>${t('presetsNone')}</p></div>`}
    <div class="mfoot"><button class="btn btn-s" onclick="closeModal()">${t('close')}</button></div>`);
}

async function deleteUserPreset(id) {
  if (!await uiConfirm(t('presetDeleteConfirm'))) return;
  await api.preset.delete(id);
  await openManagePresetsModal();
}
