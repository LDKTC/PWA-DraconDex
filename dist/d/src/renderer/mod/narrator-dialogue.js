'use strict';
// ═══ Narrator — the conversation editor ═══════════════════════════════
// Split out of mod/narrator.js (Process 8 part 2), which was already 559
// lines before this round added choices to it. The board, its pan/zoom and
// the dialogue/edge CRUD stay there; everything that edits the *contents* of
// the selected dialogue lives here.
//
// A dialogue is ONE ordered list holding two row kinds, both story_talk rows
// distinguished by row_type:
//   'talk'   — a spoken line (speaker + sentence + an optional element link)
//   'choice' — a branch; its options are story_choice_option rows
// Sharing one talk_order sequence is what lets a choice be dragged in between
// two lines. An option's effect is one of:
//   'text'  a plain consequence sentence ("+10 relation")
//   'reply' an extra spoken line that follows the choice
//   'jump'  another dialogue — a jump also owns a story_edge, so picking one
//           draws the route on the board instead of leaving it implicit.
const NARRATOR_LINK_TYPES = ['object', 'event', 'dialogue', 'chapter', 'chat'];
const NARRATOR_EFFECT_KINDS = ['none', 'text', 'jump', 'reply'];
const NARRATOR_EFFECT_LABEL_KEY = {
  none: 'effectNone', text: 'effectText', jump: 'effectJump', reply: 'effectReply',
};

// ── Conversation editor (right of the board) ────────────────────────────
function buildNarratorConvHtml(d) {
  const dl = d.dialogues.find(dd => dd.id === d.selectedId);
  if (!dl) return '';
  const col = dl.color_code || '#6366f1';
  const rows = d.talks.map(tk => (tk.row_type === 'choice'
    ? buildNarratorChoiceHtml(d, tk)
    : buildNarratorTalkHtml(d, tk))).join('');
  return `<div class="nar-conv">
    <div class="ph"><h4 style="border-left:3px solid ${x(col)};padding-left:8px">${x(dl.name)} · ${t('conversation')}</h4>
      <button class="btn btn-g btn-i" onclick="openNarratorLinkFilterModal(${d.moduleId})" title="${t('narratorLinkFilter')}">${I.edit}</button>
    </div>
    <div class="nar-talks">${rows || `<div class="empty" style="padding:14px"><p>${t('nestEmpty')}</p></div>`}</div>
    <div class="nar-talk nar-talk-new">
      <input id="nt-new-speaker" class="nt-speaker" placeholder="${t('speaker')}">
      <input id="nt-new-text" class="nt-text" placeholder="…" onkeydown="if(event.key==='Enter')addNarratorTalk()">
      <button class="btn btn-p btn-i" onclick="addNarratorTalk()" title="${t('addTalk')}">${I.plus}</button>
      <button class="btn btn-g btn-i" onclick="addNarratorChoice()" title="${t('addChoice')}">${I.relation}</button>
    </div>
  </div>`;
}

// The wrapper is the drop target for both row kinds — dropping anywhere on a
// choice, options included, moves the whole choice.
function narratorRowDropAttrs(tk) {
  return `ondragover="onNarratorRowDragOver(event,this)"
    ondragleave="this.classList.remove('drop-before','drop-after')"
    ondrop="onNarratorRowDrop(event,${tk.id})"`;
}

// The drag SOURCE is this grip, not the row: a row is almost entirely <input>,
// and a drag begun on one selects text instead of moving the row. Author's
// chapter rows can be draggable whole because they hold no inputs at all.
function narratorRowGripHtml(tk) {
  return `<span class="nar-grip" draggable="true" title="${t('dragReorder')}"
    ondragstart="onNarratorRowDragStart(event,${tk.id})">${I.move}</span>`;
}

function buildNarratorTalkHtml(d, tk) {
  // A lit-up link button told the user *that* a line was linked but never to
  // what — the row below names the element and the module it lives in, the
  // same two-part label Classifier/Chronicler link rows use.
  const le = narratorEntityByKey(d, tk.linker_key);
  const linkRow = tk.linker_key ? `
    <div class="cls-link-row">
      <span class="cls-link-name" onclick="openEntityByKey('${x(tk.linker_key)}')">${x(le ? le.name : tk.linker_key)}</span>
      <span class="cls-link-mod">${x(narratorEntityModuleLabel(le))}</span>
      <button class="btn btn-g btn-i" onclick="clearNarratorTalkLink(${tk.id})" title="${t('delete')}">${I.delete}</button>
    </div>` : '';
  return `<div class="nar-row" ${narratorRowDropAttrs(tk)}>
    <div class="nar-talk">
      ${narratorRowGripHtml(tk)}
      <input class="nt-speaker" value="${x(tk.speaker || '')}" placeholder="${t('speaker')}"
        onblur="saveNarratorTalk(${tk.id},this,'speaker')">
      <input class="nt-text" value="${x(tk.talk_sentence || '')}" placeholder="…"
        onblur="saveNarratorTalk(${tk.id},this,'text')">
      <button class="btn btn-g btn-i${tk.linker_key ? ' act' : ''}" onclick="openNarratorTalkLinkModal(${tk.id})" title="${t('addLinkedElement')}">${I.relation}</button>
      <button class="btn btn-g btn-i" onclick="deleteNarratorTalk(${tk.id})" title="${t('delete')}">${I.delete}</button>
    </div>${linkRow}
  </div>`;
}

function buildNarratorChoiceHtml(d, tk) {
  const opts = (d.choiceOptions || []).filter(o => o.talk_ref === tk.id);
  const optRows = opts.map(o => buildNarratorChoiceOptionHtml(d, o)).join('')
    || `<div class="cls-lv-empty">${t('levelNoRows')}</div>`;
  return `<div class="nar-row nar-choice" ${narratorRowDropAttrs(tk)}>
    <div class="nar-choice-head">
      ${narratorRowGripHtml(tk)}
      <span class="kind" data-no-i18n>${t('choice')}</span>
      <input class="nt-text" value="${x(tk.talk_sentence || '')}" placeholder="${t('choicePrompt')}"
        onblur="saveNarratorTalk(${tk.id},this,'text')">
      <button class="btn btn-g btn-i" onclick="addNarratorChoiceOption(${tk.id})" title="${t('addChoiceOption')}">${I.plus}</button>
      <button class="btn btn-g btn-i" onclick="deleteNarratorTalk(${tk.id})" title="${t('delete')}">${I.delete}</button>
    </div>
    <div class="nar-choice-opts">${optRows}</div>
  </div>`;
}

function buildNarratorChoiceOptionHtml(d, o) {
  const kind = NARRATOR_EFFECT_KINDS.includes(o.effect_kind) ? o.effect_kind : 'none';
  const kindSel = `<select class="nco-kind" onchange="saveNarratorChoiceOption(${o.id})">
    ${NARRATOR_EFFECT_KINDS.map(k =>
      `<option value="${k}" ${k === kind ? 'selected' : ''}>${t(NARRATOR_EFFECT_LABEL_KEY[k])}</option>`).join('')}
  </select>`;
  // 'jump' picks a dialogue; 'text' and 'reply' are both a free sentence, so
  // they share one input and differ only in how the reader renders them.
  let effectField = '';
  if (kind === 'jump') {
    effectField = `<select class="nco-jump" onchange="saveNarratorChoiceOption(${o.id})">
      <option value="">--</option>
      ${d.dialogues.map(dd =>
        `<option value="${dd.id}" ${dd.id === o.jump_ref ? 'selected' : ''}>${x(dd.name)}</option>`).join('')}
    </select>`;
  } else if (kind !== 'none') {
    effectField = `<input class="nco-effect" value="${x(o.effect_text || '')}" placeholder="${t('effect')}"
      onblur="saveNarratorChoiceOption(${o.id})">`;
  }
  return `<div class="nar-choice-opt" data-opt="${o.id}">
    <input class="nco-text" value="${x(o.option_text || '')}" placeholder="${t('choiceOption')}"
      onblur="saveNarratorChoiceOption(${o.id})">
    ${kindSel}${effectField}
    ${narratorLogicBtnHtml(o)}
    <button class="btn btn-g btn-i" onclick="deleteNarratorChoiceOption(${o.id})" title="${t('delete')}">${I.delete}</button>
  </div>`;
}

async function saveNarratorTalk(id, el, field) {
  const d = S.narratorData;
  const tk = d.talks.find(t2 => t2.id === id);
  if (!tk) return;
  const speaker = field === 'speaker' ? el.value.trim() : (tk.speaker || '');
  const text = field === 'text' ? el.value : (tk.talk_sentence || '');
  if (speaker === (tk.speaker || '') && text === (tk.talk_sentence || '')) return;
  await api.narrator.updateTalk(id, speaker, text, tk.linker_key || null);
  tk.speaker = speaker; tk.talk_sentence = text;
}

async function addNarratorTalk() {
  const d = S.narratorData;
  if (!d?.selectedId) return;
  const speaker = q('#nt-new-speaker')?.value.trim() || '';
  const text = q('#nt-new-text')?.value.trim() || '';
  if (!text) return;
  await api.narrator.createTalk(d.selectedId, speaker, text, null, 'talk');
  await reloadSource(d.moduleId);
}

// A choice starts empty with one blank option — an empty choice row with no
// options at all reads as a bug rather than as "now add options".
async function addNarratorChoice() {
  const d = S.narratorData;
  if (!d?.selectedId) return;
  const id = await api.narrator.createTalk(d.selectedId, null, '', null, 'choice');
  await api.narrator.createChoiceOption(id, '');
  await reloadSource(d.moduleId);
}

async function deleteNarratorTalk(id) {
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  const d = S.narratorData;
  // Deleting a choice drops the edges its jump options owned, unless another
  // option still points the same way.
  const tk = d.talks.find(t2 => t2.id === id);
  if (tk?.row_type === 'choice') {
    for (const o of (d.choiceOptions || []).filter(op => op.talk_ref === id && op.jump_ref)) {
      await narratorDropJumpEdge(d, o, o.jump_ref);
    }
  }
  await api.narrator.deleteTalk(id);
  await reloadSource(d.moduleId);
}

// ── Choice options ──────────────────────────────────────────────────────
async function addNarratorChoiceOption(talkId) {
  const d = S.narratorData;
  await api.narrator.createChoiceOption(talkId, '');
  await reloadSource(d.moduleId);
}

// One handler for every field of an option row: it reads the whole row back
// out of the DOM, so switching the effect kind and editing its value are the
// same write. Re-renders only when the kind changed, since that swaps which
// effect field is on screen.
async function saveNarratorChoiceOption(id) {
  const d = S.narratorData;
  const o = (d.choiceOptions || []).find(op => op.id === id);
  const row = q(`.nar-choice-opt[data-opt="${id}"]`);
  if (!o || !row) return;
  const text = row.querySelector('.nco-text')?.value.trim() || '';
  const kind = row.querySelector('.nco-kind')?.value || 'none';
  const jumpRaw = row.querySelector('.nco-jump')?.value || '';
  const jump = kind === 'jump' && jumpRaw ? Number(jumpRaw) : null;
  const effect = kind === 'text' || kind === 'reply'
    ? (row.querySelector('.nco-effect')?.value || '') : '';
  const kindChanged = kind !== (o.effect_kind || 'none');
  const prevJump = o.jump_ref || null;
  await api.narrator.updateChoiceOption(id, text, kind, effect, jump);
  o.option_text = text; o.effect_kind = kind; o.effect_text = effect; o.jump_ref = jump;
  // The board is the record of where a choice leads, so a jump keeps a real
  // story_edge in step with it: create the new one, drop the old one if it is
  // no longer pointed at by anything.
  if (prevJump !== jump) {
    if (prevJump) await narratorDropJumpEdge(d, o, prevJump);
    if (jump) await api.narrator.createEdge(d.moduleId, narratorChoiceDialogueId(d, o), jump, text || null);
    await reloadSource(d.moduleId);
    return;
  }
  if (kindChanged) await reloadSource(d.moduleId);
}

async function deleteNarratorChoiceOption(id) {
  const d = S.narratorData;
  const o = (d.choiceOptions || []).find(op => op.id === id);
  if (o?.jump_ref) await narratorDropJumpEdge(d, o, o.jump_ref);
  await api.narrator.deleteChoiceOption(id);
  await reloadSource(d.moduleId);
}

function narratorChoiceDialogueId(d, o) {
  return d.talks.find(tk => tk.id === o.talk_ref)?.dialogue_ref ?? d.selectedId;
}

// Removes the edge a jump option owned — but only when no *other* option
// still jumps the same way, and never one the user drew by hand from a
// dialogue that has no such option left.
async function narratorDropJumpEdge(d, o, jumpRef) {
  const from = narratorChoiceDialogueId(d, o);
  const stillUsed = (d.choiceOptions || []).some(op =>
    op.id !== o.id && op.jump_ref === jumpRef && narratorChoiceDialogueId(d, op) === from);
  if (stillUsed) return;
  const edge = (d.edges || []).find(e => e.from_ref === from && e.to_ref === jumpRef);
  if (edge) await api.narrator.deleteEdge(edge.id);
}

// ── Reorder ─────────────────────────────────────────────────────────────
// Native HTML5 drag-and-drop with a before/after split, the same shape
// mod/author.js uses for chapters (rows don't nest, so no third "in" zone).
// One list, both row kinds — that is the whole point of the shared
// talk_order sequence.
function onNarratorRowDragStart(ev, id) {
  S.dragNarratorRow = id;
  ev.dataTransfer.effectAllowed = 'move';
  ev.stopPropagation();
}

function onNarratorRowDragOver(ev, row) {
  if (S.dragNarratorRow == null) return;
  ev.preventDefault();
  ev.stopPropagation();
  const r = row.getBoundingClientRect();
  const before = (ev.clientY - r.top) / r.height < 0.5;
  row.classList.remove('drop-before', 'drop-after');
  row.classList.add(before ? 'drop-before' : 'drop-after');
}

async function onNarratorRowDrop(ev, targetId) {
  ev.preventDefault();
  ev.stopPropagation();
  const row = ev.currentTarget;
  const before = row.classList.contains('drop-before');
  row.classList.remove('drop-before', 'drop-after');
  const dragId = S.dragNarratorRow;
  S.dragNarratorRow = null;
  if (dragId == null || dragId === targetId) return;
  const d = S.narratorData;
  const ids = d.talks.map(tk => tk.id).filter(id => id !== dragId);
  const idx = ids.indexOf(targetId);
  ids.splice(before ? idx : idx + 1, 0, dragId);
  await api.narrator.moveTalks(d.selectedId, ids);
  await reloadSource(d.moduleId);
}

// ── Element links on a conversation line ────────────────────────────────
// Plan part5 Narrator #2 introduced a per-line link to any vault entity,
// filtered by an allowlist saved on the module (module_ui.narratorLinkFilter)
// — the same JSON-blob convention Chronicler's calendarConfig uses. Process 8
// part 2 narrowed what may be linked: minor elements only, and only those of
// modules linked to this Narrator.
async function narratorLinkFilterTypes(moduleId) {
  const ui = await api.module.getUi(moduleId);
  try {
    const arr = ui.narratorLinkFilter ? JSON.parse(ui.narratorLinkFilter) : null;
    if (!Array.isArray(arr)) return null;
    // Saved filters from before Process 8 part 2 name quickIndex types
    // ('module', 'note', …) that viewer.index never produces — dropping them
    // on read is what makes the change migration-free.
    const known = arr.filter(ty => NARRATOR_LINK_TYPES.includes(ty));
    return known.length ? known : null;
  } catch (_) { return null; }
}

// Which modules is this Narrator linked to? An entity_relation row whose two
// keys are both `module_<id>` is that link (drawn in Connector, or from a
// module's own link section); either direction counts. Only elements owned by
// one of those modules may be attached to a conversation line.
function narratorLinkedModuleIds(d) {
  const self = `module_${d.moduleId}`;
  const ids = new Set();
  for (const r of (d.relations || [])) {
    const from = String(r.from_key || ''), to = String(r.to_key || '');
    if (from === self && to.startsWith('module_')) ids.add(Number(to.slice(7)));
    else if (to === self && from.startsWith('module_')) ids.add(Number(from.slice(7)));
  }
  return ids;
}

// The minor elements those modules own, honouring the module's saved kind
// filter. Modules themselves are never offered — that is the whole point of
// the change; the same rule Classifier's link modal uses
// (mod/classifier-detail.js, `!key.startsWith('module_')`).
function narratorLinkableEntities(d, allow) {
  const linked = narratorLinkedModuleIds(d);
  return (d.entityIndex || []).filter(e =>
    // Assets (v5 file_<id>) are not story entities — a choice never links one.
    !String(e.key).startsWith('module_') && e.kind !== 'file' && linked.has(e.moduleId) &&
    (!allow || allow.includes(e.kind)));
}

function narratorEntityByKey(d, key) {
  if (!key) return null;
  return (d.entityIndex || []).find(e => e.key === key) || null;
}

// "<name> · <kind>" of the module an element lives in — a linked element is
// meaningless without it, which is why part 1 put the same label on
// Classifier's and Chronicler's link rows.
function narratorEntityModuleLabel(e) {
  if (!e) return '—';
  return `${e.moduleName || '—'}${e.moduleKind ? ` · ${kindLabel(e.moduleKind)}` : ''}`;
}

async function openNarratorTalkLinkModal(talkId) {
  const d = S.narratorData;
  const tk = d.talks.find(t2 => t2.id === talkId);
  if (!tk || !S.nexus) return;
  const allow = await narratorLinkFilterTypes(d.moduleId);
  const list = narratorLinkableEntities(d, allow);
  // A link this line already holds stays selectable even if its module has
  // since been unlinked — otherwise merely opening the modal and saving would
  // silently drop it.
  const cur = tk.linker_key && !list.some(e => e.key === tk.linker_key)
    ? narratorEntityByKey(d, tk.linker_key) : null;
  const offered = cur ? [cur, ...list] : list;
  if (!offered.length) {
    openModal(t('addLinkedElement'), `
      <div class="empty" style="padding:18px"><p>${t('narratorLinkNoModule')}</p></div>
      <div class="mfoot"><button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button></div>`);
    return;
  }
  const opts = `<option value="">--</option>` + offered.map(e =>
    `<option value="${x(e.key)}" ${tk.linker_key === e.key ? 'selected' : ''}>${x(e.name)} — ${x(narratorEntityModuleLabel(e))}</option>`).join('');
  openModal(t('addLinkedElement'), `
    <div class="fg"><label>${t('element')}</label><select id="nt-link-key">${opts}</select></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitNarratorTalkLink(${talkId})">${t('save')}</button>
    </div>`);
}

async function submitNarratorTalkLink(talkId) {
  const d = S.narratorData;
  const tk = d.talks.find(t2 => t2.id === talkId);
  if (!tk) return;
  const key = q('#nt-link-key')?.value || null;
  await api.narrator.updateTalk(talkId, tk.speaker || '', tk.talk_sentence || '', key);
  tk.linker_key = key;
  closeModal();
  await reloadSource(d.moduleId);
  toast(t('saved'), 'ok');
}

async function clearNarratorTalkLink(talkId) {
  const d = S.narratorData;
  const tk = d.talks.find(t2 => t2.id === talkId);
  if (!tk) return;
  await api.narrator.updateTalk(talkId, tk.speaker || '', tk.talk_sentence || '', null);
  tk.linker_key = null;
  await reloadSource(d.moduleId);
}

async function openNarratorLinkFilterModal(moduleId) {
  const allow = (await narratorLinkFilterTypes(moduleId)) || [];
  const rows = NARRATOR_LINK_TYPES.map(ty => `
    <div class="togglerow" onclick="toggleNarratorLinkFilterType(this)" data-type="${ty}">
      <span class="tg${allow.includes(ty) ? ' on' : ''}"></span><span data-no-i18n>${ty}</span>
    </div>`).join('');
  openModal(t('narratorLinkFilter'), `
    <div id="nar-link-filter-rows">${rows}</div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="saveNarratorLinkFilter(${moduleId})">${t('save')}</button>
    </div>`);
}

function toggleNarratorLinkFilterType(el) {
  el.querySelector('.tg').classList.toggle('on');
}

async function saveNarratorLinkFilter(moduleId) {
  const allow = [...document.querySelectorAll('#nar-link-filter-rows .togglerow')]
    .filter(row => row.querySelector('.tg').classList.contains('on'))
    .map(row => row.dataset.type);
  await api.module.setUi(moduleId, 'narratorLinkFilter', JSON.stringify(allow));
  closeModal();
  toast(t('saved'), 'ok');
}
