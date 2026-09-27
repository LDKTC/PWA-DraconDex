'use strict';
// ═══ Diviner — random tables and dice (v5 Part 7, APP docs/V5.md §11.5) ══
// The page: tables down the left (the Author/Scribe column), the open table
// on the right — its roll button and last result on top, then its entries,
// then its roll history. A dice table shows each entry's range; a weighted
// one shows its weight. An entry can roll another table in its place
// (nesting, the name generator) or name any entity as [[Name]].
// The rolling itself is main-process (db/diviner.js): one write for the
// result and its history row, and a crypto random source.

// The kind's icon. Registered here, not in core/state.js's I (that file sits
// at the 500-line band); every reader looks icons up at render time.
I.dice = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/></svg>`;

// v5 Part 8 (§12.3): a scoped page component — data per module, the
// current instance's through S.divinerData (page/kind-state.js).
const DIV = kindState({ prop: 'divinerData', kind: 'diviner', component: 'diviner.view' });
registerComponent('diviner.view', {
  kind: 'diviner', label: () => kindLabel('diviner'), borrow: true,
  load: (m) => loadDivinerData(m),
  render: (c) => buildDivinerMainHtml(c.source, c),
});

async function loadDivinerData(m) {
  const [tables, ui] = await Promise.all([api.diviner.getTables(m.id), api.module.getUi(m.id)]);
  const prev = DIV.M[m.id] || null;
  let selectedId = Number(ui.activeTable) || prev?.selectedId || null;
  if (selectedId && !tables.some(tb => tb.id === selectedId)) selectedId = null;
  if (!selectedId && tables.length) selectedId = tables[0].id;
  const [entries, rolls] = selectedId
    ? await Promise.all([api.diviner.getEntries(selectedId), api.diviner.getRolls(selectedId)])
    : [[], []];
  // Names for the entries' links, in one round trip — a table in another
  // Diviner as much as an object in a Classifier (divt_ resolves like any key).
  const keys = [...new Set(entries.map(e => e.linker_key).filter(Boolean))];
  const linkNames = new Map(keys.length ? (await api.wiki.resolveKeys(keys)).map(r => [r.key, r.name]) : []);
  DIV.setModule(m.id, { moduleId: m.id, ui, tables, selectedId, entries, rolls, linkNames, last: prev?.selectedId === selectedId ? prev.last : null });
}

async function refreshDiviner() {
  const mid = S.divinerData?.moduleId;
  if (mid != null) await reloadSource(mid);
}

async function selectDivinerTable(id) {
  const d = S.divinerData;
  if (!d) return;
  await api.module.setUi(d.moduleId, 'activeTable', String(id));
  d.last = null;
  await refreshDiviner();
}

const divTable = () => S.divinerData?.tables.find(tb => tb.id === S.divinerData.selectedId) || null;

function buildDivinerMainHtml(m, ic) {
  const d = DIV.instance(ic);
  if (!d) return '';
  const c = { moduleId: m.id };
  const toolbar = `<div class="classifier-toolbar">
    ${cmdBtn('diviner.newTable', c, { cls: 'btn-p' })}
    ${cmdBtn('diviner.newEntry', c)}
    ${cmdBtn('diviner.editTable', c)}
    <span class="div-dice">
      <input id="div-dice-expr" placeholder="2d6+1" data-no-i18n onkeydown="if(event.key==='Enter')rollDivinerDiceOnly()">
      ${cmdBtn('diviner.rollDice', c, { iconOnly: true })}
      <span id="div-dice-out" class="div-dice-out" data-no-i18n></span>
    </span>
  </div>`;
  if (!d.tables.length) return toolbar + kindEmptyStateHtml(m);
  const rows = d.tables.map(tb => `
    <div class="li${tb.id === d.selectedId ? ' sel' : ''}" onclick="selectDivinerTable(${tb.id})">
      <span class="name">${x(tb.name)}<small class="chs-snippet" data-no-i18n>${x(tb.mode === 'join' ? t('divModeJoin') : tb.dice || t('divWeighted'))}</small></span>
      <span class="cnt" data-no-i18n>${tb.entry_count}</span>
    </div>`).join('');
  const column = `<div class="author-chapters">
    ${rows}
    <div class="li au-add" onclick="openDivinerTableModal(${m.id})">${I.plus}<span class="name">${t('divNewTable')}</span></div>
  </div>`;
  const tb = divTable();
  return `${toolbar}<div class="author-layout">${column}<div class="author-main div-main">${tb ? divinerTableHtml(tb, d) : ''}</div></div>`;
}

function divinerTableHtml(tb, d) {
  const dice = tb.mode !== 'join' && tb.dice;
  const last = d.last;
  const result = last ? `<div class="div-result${last.cycle || last.deep ? ' warn' : ''}">
      <div class="div-result-text">${_mdInline(last.text || '—', typeof resolveWikiNameCached === 'function' ? resolveWikiNameCached : null)}</div>
      ${last.dice ? `<div class="div-result-dice" data-no-i18n>${x(last.dice)}</div>` : ''}
      ${last.steps?.length > 1 ? `<div class="div-steps" data-no-i18n>${last.steps.map(s => x(s.name) + (s.dice ? ` (${x(s.dice)})` : '')).join(' → ')}</div>` : ''}
      ${last.cycle ? `<div class="drafter-hint">${t('divCycle')}</div>` : last.deep ? `<div class="drafter-hint">${t('divTooDeep')}</div>` : ''}
    </div>` : `<div class="div-result empty-result"><p class="drafter-hint">${t('divRollHint')}</p></div>`;
  const head = `<div class="div-head">
    <h3>${x(tb.name)}</h3>
    <span class="div-chip" data-no-i18n>${x(tb.mode === 'join' ? t('divModeJoin') : dice || t('divWeighted'))}</span>
    ${cmdBtn('diviner.roll', { moduleId: d.moduleId }, { cls: 'btn-p div-roll' })}
  </div>`;
  const entries = d.entries.map((e, i) => divinerEntryRowHtml(e, i, d.entries.length, tb)).join('')
    || `<p class="cls-lv-empty">${t('divNoEntries')}</p>`;
  const hist = d.rolls.length ? `<details class="cls-adv div-hist" open>
      <summary>${t('divHistory')} <span class="cnt" data-no-i18n>${d.rolls.length}</span></summary>
      ${d.rolls.map(r => `<div class="div-hist-row"><span>${x(r.result_text || '—')}</span><small data-no-i18n>${x(r.dice_result || '')}</small></div>`).join('')}
      <button class="btn btn-g btn-sm" onclick="clearDivinerHistory()">${t('divClearHistory')}</button>
    </details>` : '';
  return `${head}${result}
    <div class="div-entries">
      <div class="div-entry div-entry-head">
        <span>${dice ? t('divRange') : tb.mode === 'join' ? '#' : t('divWeight')}</span><span>${t('divEntryText')}</span><span></span>
      </div>
      ${entries}
      <div class="li au-add" onclick="addDivinerEntry()">${I.plus}<span class="name">${t('divNewEntry')}</span></div>
    </div>
    ${hist}`;
}

function divinerEntryRowHtml(e, i, n, tb) {
  const dice = tb.mode !== 'join' && tb.dice;
  const num = (field, v, w = '4.5em') => `<input type="number" step="1" value="${x(v ?? '')}" style="width:${w}" data-no-i18n
    onchange="saveDivinerEntry(${e.id},{${field}:this.value})">`;
  const lead = dice ? `${num('lo', e.range_lo)}<span data-no-i18n>–</span>${num('hi', e.range_hi)}`
    : tb.mode === 'join' ? `<span class="ghost" data-no-i18n>${i + 1}</span>` : num('weight', e.weight);
  const linked = e.linker_key ? divinerLinkLabel(e.linker_key) : '';
  return `<div class="div-entry">
    <span class="div-lead">${lead}</span>
    <span class="div-text">
      <input data-wiki value="${x(e.entry_text || '')}" placeholder="${x(linked ? '' : t('divEntryText'))}" onchange="saveDivinerEntry(${e.id},{text:this.value})">
      ${linked ? `<span class="div-chip div-link" title="${x(t('divLinkHint'))}">${linked}</span>` : ''}
    </span>
    <span class="acts">
      <button class="btn btn-g btn-i" onclick="openDivinerLinkModal(${e.id})" title="${t('divLinkTo')}">${I.relation}</button>
      <button class="btn btn-g btn-i" onclick="moveDivinerEntry(${e.id},-1)" ${i === 0 ? 'disabled' : ''} title="${t('divMoveUp')}">↑</button>
      <button class="btn btn-g btn-i" onclick="moveDivinerEntry(${e.id},1)" ${i === n - 1 ? 'disabled' : ''} title="${t('divMoveDown')}">↓</button>
      <button class="btn btn-g btn-i" onclick="deleteDivinerEntryRow(${e.id})" title="${t('delete')}">${I.delete}</button>
    </span>
  </div>`;
}

// 🎲 for "rolls that table", the entity's name otherwise.
function divinerLinkLabel(key) {
  const name = S.divinerData?.linkNames?.get(key) || key;
  return `${/^divt_\d+$/.test(key) ? I.dice : I.relation} ${x(name)}`;
}

async function rollDiviner() {
  const d = S.divinerData;
  const tb = divTable();
  if (!tb) return;
  d.last = await api.diviner.roll(tb.id);
  d.rolls = await api.diviner.getRolls(tb.id);
  renderNexusHome();
}

async function rollDivinerDiceOnly() {
  const expr = pbQOr('#div-dice-expr')?.value || '1d20';
  const r = await api.diviner.rollDice(expr);
  const out = pbQOr('#div-dice-out');
  if (!r?.ok) { toast(t('divBadDice'), 'error'); return; }
  if (out) out.textContent = r.text;
}

async function clearDivinerHistory() {
  const tb = divTable();
  if (!tb || !await uiConfirm(t('divClearHistoryConfirm'))) return;
  await api.diviner.clearRolls(tb.id);
  await refreshDiviner();
}

// ── tables ──────────────────────────────────────────────────────────────
function openDivinerTableModal(moduleId, id = null) {
  const tb = id ? S.divinerData?.tables.find(r => r.id === id) : null;
  const mode = tb?.mode || 'pick';
  openModal(tb ? t('divEditTable') : t('divNewTable'), `
    <div class="fg"><label>${t('name')} *</label><input id="dvt-name" value="${x(tb?.name || '')}"></div>
    <div class="fg"><label>${t('divMode')}</label>
      <select id="dvt-mode" onchange="q('#dvt-dice-row').style.display=this.value==='join'?'none':''">
        <option value="pick"${mode === 'pick' ? ' selected' : ''}>${t('divModePick')}</option>
        <option value="join"${mode === 'join' ? ' selected' : ''}>${t('divModeJoin')}</option>
      </select>
    </div>
    <div class="fg" id="dvt-dice-row"${mode === 'join' ? ' style="display:none"' : ''}><label>${t('divDice')}</label>
      <input id="dvt-dice" value="${x(tb?.dice || '')}" placeholder="1d20" data-no-i18n>
      <p class="drafter-hint">${t('divDiceHint')}</p>
    </div>
    <div class="mfoot">
      ${tb ? `<button class="btn btn-d" onclick="deleteDivinerTableRow(${tb.id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitDivinerTable(${moduleId},${tb ? tb.id : 'null'})">${tb ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => q('#dvt-name')?.focus(), 60);
}

async function submitDivinerTable(moduleId, id) {
  const name = q('#dvt-name').value.trim();
  if (!name) { toast(t('nameRequired'), 'err'); q('#dvt-name')?.focus(); return; }
  const mode = q('#dvt-mode').value;
  const dice = mode === 'join' ? '' : q('#dvt-dice').value;
  const r = id ? await api.diviner.updateTable(id, name, dice, mode) : await api.diviner.createTable(moduleId, name, dice, mode);
  if (!r?.ok) { toast(t(r?.code === 'bad_dice' ? 'divBadDice' : 'driveErrServer'), 'error'); return; }
  closeModal();
  if (!id) await api.module.setUi(moduleId, 'activeTable', String(r.id));
  await refreshDiviner();
  toast(t(id ? 'saved' : 'created'), 'ok');
}

async function deleteDivinerTableRow(id) {
  const tb = S.divinerData?.tables.find(r => r.id === id);
  if (!await uiConfirm(`${t('delete')} "${tb?.name || ''}"?`)) return;
  await api.diviner.deleteTable(id);
  closeModal();
  await refreshDiviner();
  toast(t('deleted'), 'ok');
}

// ── entries ─────────────────────────────────────────────────────────────
async function addDivinerEntry() {
  const tb = divTable();
  if (!tb) return;
  await api.diviner.createEntry(tb.id, '');
  await refreshDiviner();
  const inputs = document.querySelectorAll('.div-entry .div-text input');
  inputs[inputs.length - 1]?.focus();
}

async function saveDivinerEntry(id, patch) {
  await api.diviner.updateEntry(id, patch);
  if ('text' in patch) { const e = S.divinerData.entries.find(r => r.id === id); if (e) e.entry_text = patch.text; return; }
  await refreshDiviner(); // a range or weight may have been normalised
}

async function moveDivinerEntry(id, dir) {
  await api.diviner.moveEntry(id, dir);
  await refreshDiviner();
}

async function deleteDivinerEntryRow(id) {
  await api.diviner.deleteEntry(id);
  await refreshDiviner();
}

// Roll another table in this entry's place, or name an entity. A table
// that would close a loop is shown but disabled — the roll guards anyway.
async function openDivinerLinkModal(entryId) {
  const d = S.divinerData;
  const e = d?.entries.find(r => r.id === entryId);
  if (!e || !S.nexus) return;
  const [tables, ix] = await Promise.all([api.diviner.tablesInNexus(S.nexus.id), api.wiki.quickIndex(S.nexus.id)]);
  const blocked = new Set();
  await Promise.all(tables.map(async tb => { if (tb.id === d.selectedId || await api.diviner.wouldCycle(d.selectedId, tb.id)) blocked.add(tb.id); }));
  const cur = e.linker_key || '';
  openModal(t('divLinkTo'), `
    <div class="fg"><label>${t('divRollTable')}</label>
      <select id="dvl-table"><option value="">—</option>
        ${tables.map(tb => `<option value="divt_${tb.id}"${cur === `divt_${tb.id}` ? ' selected' : ''}${blocked.has(tb.id) ? ' disabled' : ''}>${x(tb.module_name)} › ${x(tb.name)}${blocked.has(tb.id) ? ' ⟲' : ''}</option>`).join('')}
      </select>
      <p class="drafter-hint">${t('divRollTableHint')}</p>
    </div>
    <div class="fg"><label>${t('divLinkEntity')}</label>
      <select id="dvl-entity"><option value="">—</option>
        ${ix.filter(it => !it.key.startsWith('divt_')).map(it => `<option value="${x(it.key)}"${cur === it.key ? ' selected' : ''}>${x(it.name)} (${x(it.type)})</option>`).join('')}
      </select>
    </div>
    <div class="mfoot">
      ${cur ? `<button class="btn btn-d" onclick="submitDivinerLink(${entryId},null)">${t('divUnlink')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitDivinerLink(${entryId})">${t('save')}</button>
    </div>`);
}

async function submitDivinerLink(entryId, forced) {
  const key = forced === null ? null : (q('#dvl-table')?.value || q('#dvl-entity')?.value || null);
  await api.diviner.updateEntry(entryId, { linkerKey: key });
  closeModal();
  await refreshDiviner();
}
