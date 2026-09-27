'use strict';
// ═══ Saved filter — the selection engine (v5 Part 4, APP docs/V5.md §8.9) ═
// One engine, three screens: Exhibitor and Manager both turn a module_ui
// `filterDef` into a selection of viewer.index rows (§8.10 — index 1 →
// filter 1 → screens N). Split out of mod/exhibitor.js when Manager became
// its second reader. The popup that edits a filter is here too; it takes the
// module whose filter it edits, so it no longer assumes an Exhibitor.

// Plan part6 #1: Obsidian-style filter — groups of rules, AND within a
// group, OR (union) between groups. Rule fields: kind (module type,
// multi-select of MODULE_KINDS — no operator, a closed enum), childOf
// (this module or its immediate children — no operator, structural
// membership), hashtag/name/handle (5 string operators: is/is not/starts
// with/ends with/contains). handle is v5 Part 4 (§8.9): only module rows
// carry one, so it selects modules by their @handle.
// ⚠ DraconDex-APK's filter_editor.dart holds the same field list — adding a
// field here without it splits the two front-ends (§8.11.1).
const FILTER_FIELDS = ['kind', 'childOf', 'hashtag', 'name', 'handle'];
const FILTER_OPS = ['is', 'isNot', 'startsWith', 'endsWith', 'contains'];

function parseFilterDef(ui) {
  let raw = {};
  try { raw = JSON.parse(ui.filterDef || '{}'); } catch (_) {}
  if (Array.isArray(raw.groups)) return { groups: raw.groups };
  // Migrate the old flat {query,kinds,moduleIds,tag} shape. moduleIds had
  // OR semantics ("item's module is any of these") — since one group can
  // only AND its rules, each old moduleId becomes its own group (with
  // query/tag folded in as shared AND conditions) to preserve that OR.
  // Old item-kind `kinds` has no destination field in the new module-kind
  // model and is intentionally dropped.
  const baseRules = [];
  if (raw.query) baseRules.push({ field: 'name', op: 'contains', value: raw.query });
  if (raw.tag) baseRules.push({ field: 'hashtag', op: 'is', value: raw.tag });
  const groups = [];
  if (Array.isArray(raw.moduleIds) && raw.moduleIds.length) {
    for (const mid of raw.moduleIds) groups.push({ rules: [...baseRules, { field: 'childOf', moduleId: mid }] });
  } else if (baseRules.length) {
    groups.push({ rules: baseRules });
  }
  return { groups };
}

// this module or its immediate child modules (one level down only, no
// recursion needed) — a local equivalent of quickswitch.js's qsDescendants,
// inlined because quickswitch.js is lazy-loaded and viewer.js/connector.js
// run much earlier in the app lifecycle.
function filterModuleScope(rootId) {
  const out = new Set([rootId]);
  const m = findModuleNode(rootId);
  for (const c of (m?.children || [])) out.add(c.id);
  return out;
}

function strOpMatch(hay, op, needle) {
  const a = (hay || '').toLowerCase();
  const b = (needle || '').trim().replace(/^#/, '').toLowerCase();
  if (!b) return true; // an unfilled rule value never blocks a match
  if (op === 'isNot') return a !== b;
  if (op === 'startsWith') return a.startsWith(b);
  if (op === 'endsWith') return a.endsWith(b);
  if (op === 'contains') return a.includes(b);
  return a === b; // 'is' (default)
}

function ruleMatches(it, r) {
  if (r.field === 'kind') return !r.values?.length || r.values.includes(it.moduleKind);
  if (r.field === 'childOf') return r.moduleId != null && filterModuleScope(r.moduleId).has(it.moduleId);
  if (r.field === 'hashtag') return (it.tags || []).some(tg => strOpMatch(tg, r.op, r.value));
  if (r.field === 'name') return strOpMatch(it.name, r.op, r.value);
  if (r.field === 'handle') return !!it.handle && strOpMatch(it.handle, r.op, String(r.value || '').replace(/^@/, ''));
  return true;
}

function applyFilterGroups(items, def, selfModuleId) {
  return items.filter(it => {
    if (it.key === `module_${selfModuleId}`) return false; // not itself
    if (!def.groups.length) return true;
    return def.groups.some(g => g.rules.length && g.rules.every(r => ruleMatches(it, r)));
  });
}

function filterRuleLabel(r) {
  if (r.field === 'kind') return (r.values || []).map(k => kindLabel(k)).join(' + ') || t('filterField_kind');
  if (r.field === 'childOf') { const m = findModuleNode(r.moduleId); return `⊂ ${x(m ? m.name : '?')}`; }
  if (r.field === 'hashtag') return `#${x(r.value || '')}`;
  if (r.field === 'name') return `"${x(r.value || '')}"`;
  if (r.field === 'handle') return `@${x(String(r.value || '').replace(/^@/, ''))}`;
  return '?';
}

function filterChipsHtml(def) {
  if (!def.groups.length) return `<span class="vw-chip">${t('filterAll')}</span>`;
  return def.groups.map(g => `<span class="vw-chip">${g.rules.map(filterRuleLabel).join(' &amp; ') || '—'}</span>`)
    .join(`<span class="vw-chip-or" data-no-i18n>${t('filterOr')}</span>`);
}

// ── Saved-filter editor popup ────────────────────────────────────────────
// Obsidian-style: groups of rules OR'd together, each group's rules AND'd.
// Live-saves on every structural change (matches every other .kind-popup in
// this codebase) — no Save/Cancel footer. Free-text rule values (hashtag/
// name) debounce-save ~500ms after typing stops instead of on every
// keystroke.
let filterPopupDebounce = null;

// Every module at every depth — with collectors as the only folders now
// (§8.8) a "childOf" target can sit anywhere in the tree, not just in the
// top two levels this list used to stop at.
function flattenModulesForFilter() {
  return flattenModuleTree(S.moduleTree, 0).map(({ m }) => m);
}

function filterRuleValueHtml(r, gi, ri, mods) {
  if (r.field === 'kind') {
    return `<select class="fp-input" multiple size="4" data-act="val-kind" data-gi="${gi}" data-ri="${ri}" data-no-i18n>
      ${MODULE_KINDS.map(k => `<option value="${k}" ${(r.values || []).includes(k) ? 'selected' : ''}>${kindLabel(k)}</option>`).join('')}
    </select>`;
  }
  if (r.field === 'childOf') {
    return `<select class="fp-input" data-act="val-childof" data-gi="${gi}" data-ri="${ri}">
      <option value="">—</option>
      ${mods.map(mm => `<option value="${mm.id}" ${r.moduleId === mm.id ? 'selected' : ''}>${x(mm.name)} (${kindLabel(mm.kind)})</option>`).join('')}
    </select>`;
  }
  return `<select class="fp-op" data-act="val-op" data-gi="${gi}" data-ri="${ri}" data-no-i18n>
      ${FILTER_OPS.map(op => `<option value="${op}" ${r.op === op ? 'selected' : ''}>${t('filterOp_' + op)}</option>`).join('')}
    </select>
    <input class="fp-input" data-act="val-text" data-gi="${gi}" data-ri="${ri}" value="${x(r.value || '')}"
      ${r.field === 'hashtag' ? 'list="fp-hashtag-list" placeholder="#tag"' : r.field === 'handle' ? 'placeholder="@handle"' : `placeholder="${t('name')}"`}>`;
}

function filterRuleRowHtml(r, gi, ri, mods) {
  return `<div class="fp-rule-row">
    <select class="fp-field" data-act="field" data-gi="${gi}" data-ri="${ri}">
      ${FILTER_FIELDS.map(f => `<option value="${f}" ${r.field === f ? 'selected' : ''}>${t('filterField_' + f)}</option>`).join('')}
    </select>
    ${filterRuleValueHtml(r, gi, ri, mods)}
    <button class="btn btn-g btn-i" data-act="del-rule" data-gi="${gi}" data-ri="${ri}" title="${t('delete')}">${I.delete}</button>
  </div>`;
}

function renderFilterPopupBody() {
  const def = S.filterDraft.def;
  const mods = flattenModulesForFilter();
  const groupsHtml = def.groups.map((g, gi) => `
    ${gi > 0 ? `<div class="fp-or-divider">${t('filterOr')}</div>` : ''}
    <div class="fp-group">
      <div class="fp-rules">${g.rules.map((r, ri) => filterRuleRowHtml(r, gi, ri, mods)).join('') || `<div class="ghost fp-empty">${t('filterAll')}</div>`}</div>
      <div class="fp-group-actions">
        <button class="btn btn-g btn-sm" data-act="add-rule" data-gi="${gi}">${I.plus} ${t('filterAddRule')}</button>
        ${def.groups.length > 1 ? `<button class="btn btn-g btn-i" data-act="del-group" data-gi="${gi}" title="${t('delete')}">${I.delete}</button>` : ''}
      </div>
    </div>`).join('');
  return `<div class="fp-groups">${groupsHtml}</div>
    <button class="btn btn-g fp-add-group" data-act="add-group">${I.plus} ${t('filterAddGroup')}</button>
    <datalist id="fp-hashtag-list">${(S.filterPopupTags || []).map(tg => `<option value="${x(tg)}">`).join('')}</datalist>`;
}

// moduleId/def: the module whose `filterDef` this edits (an Exhibitor or a
// Manager) and its current parsed value.
async function openSavedFilterPopup(anchor, moduleId, def) {
  closeAllPopups();
  if (moduleId == null || !def || !anchor) return;
  S.filterDraft = { moduleId, def: JSON.parse(JSON.stringify(def)) };
  if (!S.filterDraft.def.groups.length) S.filterDraft.def.groups.push({ rules: [] });
  // Snapshot the rect, not the element — `anchor` sits inside #main-inner,
  // which persistFilterDraft's openModuleNode() rebuilds from scratch on
  // every save, so the live element goes stale after the first persist.
  const r = anchor.getBoundingClientRect();
  S.filterPopupAnchorRect = { top: r.top, bottom: r.bottom, left: r.left };
  S.filterPopupTags = (await api.hashtag.getAll()).map(h => h.tag_name);
  const pop = document.createElement('div');
  pop.className = 'kind-popup filter-popup';
  pop.innerHTML = renderFilterPopupBody();
  document.body.appendChild(pop);
  wireFilterPopup(pop);
  positionPopupNear(pop, S.filterPopupAnchorRect);
}

function wireFilterPopup(pop) {
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName !== 'BUTTON') return;
    const def = S.filterDraft.def;
    const gi = Number(btn.dataset.gi), ri = Number(btn.dataset.ri);
    if (btn.dataset.act === 'add-group') def.groups.push({ rules: [] });
    else if (btn.dataset.act === 'del-group') { def.groups.splice(gi, 1); if (!def.groups.length) def.groups.push({ rules: [] }); }
    else if (btn.dataset.act === 'add-rule') def.groups[gi].rules.push({ field: 'kind', values: [] });
    else if (btn.dataset.act === 'del-rule') def.groups[gi].rules.splice(ri, 1);
    else return;
    persistFilterDraft(pop);
  });
  pop.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName !== 'SELECT') return;
    const gi = Number(el.dataset.gi), ri = Number(el.dataset.ri);
    const rule = S.filterDraft.def.groups[gi]?.rules[ri];
    if (!rule) return;
    if (el.dataset.act === 'field') {
      const field = el.value;
      S.filterDraft.def.groups[gi].rules[ri] = field === 'kind' ? { field, values: [] }
        : field === 'childOf' ? { field, moduleId: null }
        : { field, op: 'contains', value: '' };
    } else if (el.dataset.act === 'val-kind') rule.values = [...el.selectedOptions].map(o => o.value);
    else if (el.dataset.act === 'val-childof') rule.moduleId = el.value ? Number(el.value) : null;
    else if (el.dataset.act === 'val-op') rule.op = el.value;
    else return;
    persistFilterDraft(pop);
  });
  pop.addEventListener('input', (e) => {
    const el = e.target.closest('[data-act="val-text"]');
    if (!el) return;
    const gi = Number(el.dataset.gi), ri = Number(el.dataset.ri);
    const rule = S.filterDraft.def.groups[gi]?.rules[ri];
    if (!rule) return;
    rule.value = el.value;
    clearTimeout(filterPopupDebounce);
    filterPopupDebounce = setTimeout(() => persistFilterDraft(pop, false), 500);
  });
}

async function persistFilterDraft(pop, rerenderPopup = true) {
  const draft = S.filterDraft;
  await api.module.setUi(draft.moduleId, 'filterDef', JSON.stringify(draft.def));
  await openModuleNode(draft.moduleId);
  if (!document.body.contains(pop)) return; // closed mid-save
  if (rerenderPopup) {
    pop.innerHTML = renderFilterPopupBody();
    positionPopupNear(pop, S.filterPopupAnchorRect);
  }
}
