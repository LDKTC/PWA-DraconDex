'use strict';
// ═══ Narrator — conditions, set-ops and play-test (v5 Part 7, V5.md §11.6) ═
// What articy:draft calls global variables, conditions, instructions and
// simulation mode, built from parts the app already had (the user's call,
// §11.13 #8–9):
//   a variable   a Classifier object in a "story variables" category — its
//                fields marked role varType / varDefault (hub/presets.js)
//   a condition  on a choice option: ALL of [{key, op, value}] must hold
//   a set-op     on a choice option: applied in order when it is picked
// Both are chosen from dropdowns; nothing is typed as an expression.
//
// Play-test is the reader view's second mode. It starts every variable at
// its default, hides options whose condition fails (a switch shows them,
// greyed, for checking), shows the variables live beside the script, and
// never writes back — the run lives in S.narratorPlay only.

const NAR_COND_OPS = ['==', '!=', '>', '>=', '<', '<='];
const NAR_SET_OPS = ['=', '+=', '-=', 'toggle'];

const narParseLogic = (json) => { try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };

// The small "if 2 · set 1" beside an option, and the button that edits it.
function narratorLogicBtnHtml(o) {
  const c = narParseLogic(o.condition).length, s = narParseLogic(o.set_ops).length;
  const badge = c || s ? `<span class="nar-logic-badge" data-no-i18n>${c ? `if ${c}` : ''}${c && s ? ' · ' : ''}${s ? `set ${s}` : ''}</span>` : '';
  return `<button class="btn btn-g btn-i nar-logic-btn${c || s ? ' on' : ''}" onclick="openNarratorLogicModal(${o.id})" title="${t('narLogic')}">${I.func}${badge}</button>`;
}

// ── Editor ──────────────────────────────────────────────────────────────
let _narLogic = null; // { optId, cond: [], set: [], vars: [] }

async function openNarratorLogicModal(optId) {
  const o = (S.narratorData?.choiceOptions || []).find(op => op.id === optId);
  if (!o || !S.nexus) return;
  const vars = await api.narrator.variables(S.nexus.id);
  _narLogic = { optId, cond: narParseLogic(o.condition), set: narParseLogic(o.set_ops), vars };
  openModal(t('narLogic'), `<div id="nar-logic-body"></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="saveNarratorLogic()">${t('save')}</button>
    </div>`);
  paintNarratorLogic();
}

function paintNarratorLogic() {
  const L2 = _narLogic, host = q('#nar-logic-body');
  if (!L2 || !host) return;
  if (!L2.vars.length) {
    host.innerHTML = `<p class="drafter-hint">${t('narNoVariables')}</p>`;
    return;
  }
  const varSel = (list, i) => `<select onchange="_narLogic.${list}[${i}].key=this.value;paintNarratorLogic()">
    ${L2.vars.map(v => `<option value="${x(v.key)}"${v.key === L2[list][i].key ? ' selected' : ''}>${x(v.moduleName)} › ${x(v.name)}</option>`).join('')}</select>`;
  const opSel = (list, i, ops) => `<select onchange="_narLogic.${list}[${i}].op=this.value;paintNarratorLogic()" data-no-i18n>
    ${ops.map(op => `<option${op === L2[list][i].op ? ' selected' : ''}>${op}</option>`).join('')}</select>`;
  const valIn = (list, i) => {
    const e = L2[list][i];
    if (e.op === 'toggle') return '<span></span>';
    const v = L2.vars.find(vv => vv.key === e.key);
    if (v?.type === 'bool') return `<select onchange="_narLogic.${list}[${i}].value=this.value" data-no-i18n>
      ${['true', 'false'].map(b => `<option${String(e.value) === b ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
    return `<input value="${x(e.value ?? '')}" ${v?.type === 'number' ? 'type="number"' : ''} oninput="_narLogic.${list}[${i}].value=this.value">`;
  };
  const rows = (list, ops) => L2[list].map((_, i) => `<div class="nar-logic-row">
      ${varSel(list, i)}${opSel(list, i, ops)}${valIn(list, i)}
      <button class="btn btn-g btn-i" onclick="_narLogic.${list}.splice(${i},1);paintNarratorLogic()" title="${t('delete')}">${I.delete}</button>
    </div>`).join('');
  host.innerHTML = `
    <div class="fg"><label>${t('narCondition')}</label>
      <p class="drafter-hint">${t('narConditionHint')}</p>
      ${rows('cond', NAR_COND_OPS)}
      <button class="btn btn-s btn-sm" onclick="addNarratorLogicRow('cond')">${I.plus} ${t('narAddCondition')}</button>
    </div>
    <div class="fg"><label>${t('narSetOps')}</label>
      <p class="drafter-hint">${t('narSetOpsHint')}</p>
      ${rows('set', NAR_SET_OPS)}
      <button class="btn btn-s btn-sm" onclick="addNarratorLogicRow('set')">${I.plus} ${t('narAddSetOp')}</button>
    </div>`;
}

function addNarratorLogicRow(list) {
  const v = _narLogic.vars[0];
  _narLogic[list].push({ key: v.key, op: list === 'cond' ? '==' : '=', value: v.type === 'bool' ? 'true' : '' });
  paintNarratorLogic();
}

async function saveNarratorLogic() {
  const L2 = _narLogic;
  if (!L2) return;
  await api.narrator.setChoiceLogic(L2.optId, L2.cond, L2.set);
  _narLogic = null;
  closeModal();
  await reloadSource(S.narratorData.moduleId);
  toast(t('saved'), 'ok');
}

// ── Evaluation (pure — test/narrator-logic.test.mjs) ─────────────────────
function narCoerce(type, v) {
  if (type === 'number') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  if (type === 'bool') return v === true || /^(true|1|yes)$/i.test(String(v ?? '').trim());
  return String(v ?? '');
}

// vars: Map key -> { type, value }. An unknown variable fails the condition.
function narConditionHolds(list, vars) {
  return list.every((c) => {
    const v = vars.get(c.key);
    if (!v) return false;
    const a = v.value, b = narCoerce(v.type, c.value);
    switch (c.op) {
      case '==': return a === b;
      case '!=': return a !== b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '<': return a < b;
      case '<=': return a <= b;
      default: return false;
    }
  });
}

function narApplySetOps(list, vars) {
  for (const s of list) {
    const v = vars.get(s.key);
    if (!v) continue;
    if (s.op === 'toggle') v.value = v.type === 'bool' ? !v.value : v.value;
    else if (s.op === '=') v.value = narCoerce(v.type, s.value);
    else if (v.type === 'number') v.value += (s.op === '-=' ? -1 : 1) * narCoerce('number', s.value);
    else if (v.type === 'text' && s.op === '+=') v.value += String(s.value ?? '');
  }
}

// ── Play-test ───────────────────────────────────────────────────────────
function setNarratorReaderMode(mode) {
  S.narratorReaderMode = mode;
  if (mode === 'play') S.narratorPlay = null; // fresh run each time it is entered
  mountNarratorReader();
}

function narratorReaderModeBarHtml() {
  const mode = S.narratorReaderMode === 'play' ? 'play' : 'script';
  return viewBarHtml(['script', 'play'], mode, v => `setNarratorReaderMode('${v}')`, v => t(v === 'play' ? 'narPlayTest' : 'narScript'));
}

async function startNarratorPlay() {
  const d = S.narratorData;
  const vars = new Map((await api.narrator.variables(S.nexus.id)).map(v => [v.key, { ...v, value: narCoerce(v.type, v.initial) }]));
  const inDeg = new Set(d.edges.map(e => e.to_ref));
  const start = d.selectedId || d.dialogues.find(dl => !inDeg.has(dl.id))?.id || d.dialogues[0]?.id;
  S.narratorPlay = { vars, changed: new Set(), dialogueId: start, idx: 0, log: [], pending: null, showHidden: !!S.narratorPlay?.showHidden, cache: new Map() };
  await narratorPlayAdvance();
}

async function narratorPlayRows(id) {
  const P = S.narratorPlay;
  if (!P.cache.has(id)) {
    const [talks, opts] = await Promise.all([api.narrator.getTalks(id), api.narrator.getChoiceOptions(id)]);
    P.cache.set(id, { talks, opts });
  }
  return P.cache.get(id);
}

// Read lines until a choice or the end of the dialogue.
async function narratorPlayAdvance() {
  const P = S.narratorPlay, d = S.narratorData;
  if (!P || P.dialogueId == null) return paintNarratorPlay();
  const { talks, opts } = await narratorPlayRows(P.dialogueId);
  if (P.idx === 0) {
    const dl = d.dialogues.find(dd => dd.id === P.dialogueId);
    P.log.push({ kind: 'head', text: dl?.name || '', color: dl?.color_code });
  }
  while (P.idx < talks.length && P.log.length < 500) {
    const tk = talks[P.idx];
    if (tk.row_type === 'choice') {
      P.pending = { kind: 'choice', prompt: tk.talk_sentence, opts: opts.filter(o => o.talk_ref === tk.id) };
      return paintNarratorPlay();
    }
    P.log.push({ kind: 'line', speaker: tk.speaker, text: tk.talk_sentence });
    P.idx++;
  }
  const outs = d.edges.filter(e => e.from_ref === P.dialogueId);
  P.pending = outs.length ? { kind: 'route', outs } : { kind: 'end' };
  paintNarratorPlay();
}

async function pickNarratorPlayOption(optId) {
  const P = S.narratorPlay;
  const o = P?.pending?.opts?.find(op => op.id === optId);
  if (!o) return;
  P.log.push({ kind: 'pick', text: o.option_text });
  const before = new Map([...P.vars].map(([k, v]) => [k, v.value]));
  narApplySetOps(narParseLogic(o.set_ops), P.vars);
  for (const [k, v] of P.vars) if (before.get(k) !== v.value) P.changed.add(k);
  if (o.effect_kind === 'text' && o.effect_text) P.log.push({ kind: 'note', text: o.effect_text });
  if (o.effect_kind === 'reply' && o.effect_text) P.log.push({ kind: 'line', text: o.effect_text });
  P.pending = null;
  if (o.effect_kind === 'jump' && o.jump_ref) { P.dialogueId = o.jump_ref; P.idx = 0; }
  else P.idx++;
  await narratorPlayAdvance();
}

async function followNarratorPlayRoute(toId) {
  const P = S.narratorPlay;
  if (!P) return;
  P.pending = null; P.dialogueId = toId; P.idx = 0;
  await narratorPlayAdvance();
}

function toggleNarratorPlayHidden() {
  if (!S.narratorPlay) return;
  S.narratorPlay.showHidden = !S.narratorPlay.showHidden;
  paintNarratorPlay();
}

function paintNarratorPlay() {
  const host = pbQOr('#nar-reader'), P = S.narratorPlay, d = S.narratorData;
  if (!host || !P) return;
  const log = P.log.map(l => l.kind === 'head'
    ? `<h4 class="nar-play-head" style="color:${x(l.color || 'var(--accent)')}">${x(l.text)}</h4>`
    : l.kind === 'pick' ? `<div class="nar-read-line nar-play-pick">▸ ${x(l.text || '')}</div>`
    : l.kind === 'note' ? `<div class="nar-read-line ghost">${x(l.text)}</div>`
    : `<div class="nar-read-line">${l.speaker ? `<b>${x(l.speaker)}:</b> ` : ''}${x(l.text || '')}</div>`).join('');
  let next = '';
  const pd = P.pending;
  if (pd?.kind === 'choice') {
    const shown = pd.opts.map(o => {
      const ok = narConditionHolds(narParseLogic(o.condition), P.vars);
      if (!ok && !P.showHidden) return '';
      return `<button class="btn ${ok ? 'btn-s' : 'btn-g'} nar-play-opt" ${ok ? `onclick="pickNarratorPlayOption(${o.id})"` : 'disabled'}>
        ${x(o.option_text || '…')}${ok ? '' : ` <span class="ghost">(${t('narHiddenByCondition')})</span>`}</button>`;
    }).join('');
    next = `${pd.prompt ? `<div class="nar-read-line">${x(pd.prompt)}</div>` : ''}${shown || `<p class="drafter-hint">${t('narNoOptionOpen')}</p>`}`;
  } else if (pd?.kind === 'route') {
    next = pd.outs.map(e => `<button class="btn btn-s nar-play-opt" onclick="followNarratorPlayRoute(${e.to_ref})">→ ${x(e.label || d.dialogues.find(dd => dd.id === e.to_ref)?.name || '')}</button>`).join('');
  } else if (pd?.kind === 'end') {
    next = `<p class="drafter-hint">${t('narPlayEnd')}</p>`;
  }
  const vars = [...P.vars.values()].map(v => `<div class="nar-play-var${P.changed.has(v.key) ? ' changed' : ''}">
      <span>${x(v.name)}</span><b data-no-i18n>${x(String(v.value))}</b></div>`).join('')
    || `<p class="drafter-hint">${t('narNoVariables')}</p>`;
  host.innerHTML = `<div class="nar-play-bar">${narratorReaderModeBarHtml()}
      <button class="btn btn-s btn-sm" onclick="startNarratorPlay()">${I.return} ${t('narRestart')}</button>
      <label class="nar-play-hidden"><input type="checkbox"${P.showHidden ? ' checked' : ''} onchange="toggleNarratorPlayHidden()"> ${t('narShowHidden')}</label>
    </div>
    <div class="nar-play">
      <div class="nar-play-script">${log}<div class="nar-play-next">${next}</div></div>
      <aside class="nar-play-vars"><div class="au-col-label">${t('narVariables')}</div>${vars}</aside>
    </div>`;
}
