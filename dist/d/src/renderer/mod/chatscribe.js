'use strict';
// ═══ Chat "Scribe" (progress.md Phase 12) ══════════════════════════════
// Chat-style note page (mockup docs/mockups/06-scribe-chat.png): a Scribe
// module holds sessions ("1 session = 1 note"); each session is a stream
// of right-aligned bubbles with HH:MM timestamps, day dividers and an
// input row at the bottom (Enter sends). Bubble text runs through the
// markdown inline pass so [[wikilinks]] resolve and click through; the
// message text is wikilink-indexed under the session's chss_<id> key
// (src/db/chatscribe.js + src/db/wiki.js).

const CHATSCRIBE_VIEWS = ['chat', 'transcript'];
const CHATSCRIBE_VIEW_LABEL = { chat: 'Chat', transcript: 'Log' };
// v5 Part 8 (§12.3): a scoped page component — data per module, view per
// instance, S.chatScribeData = the current instance (page/kind-state.js).
const CHS = kindState({ prop: 'chatScribeData', kind: 'scribe', component: 'scribe.view', views: CHATSCRIBE_VIEWS });
registerComponent('scribe.view', {
  kind: 'scribe', label: () => kindLabel('scribe'), borrow: true,
  presets: () => CHATSCRIBE_VIEWS, presetLabel: (p) => CHATSCRIBE_VIEW_LABEL[p],
  load: (m) => loadChatScribeData(m),
  render: (c) => buildChatScribeMainHtml(c.source, c),
  mount: () => mountChatScribe(),
});

async function loadChatScribeData(m) {
  const [sessions, ui] = await Promise.all([
    api.chatscribe.getSessions(m.id),
    api.module.getUi(m.id),
  ]);
  const prev = CHS.M[m.id] || null;
  // A [[chss]] wikilink jump (openEntityByKey) pre-selects its session.
  let selectedId = S.pendingChatSession || prev?.selectedId || Number(ui.activeSession) || null;
  S.pendingChatSession = null;
  if (selectedId && !sessions.find(s => s.id === selectedId)) selectedId = null;
  if (!selectedId && sessions.length) selectedId = sessions[0].id;
  const messages = selectedId ? await api.chatscribe.getMessages(selectedId) : [];
  CHS.setModule(m.id, { moduleId: m.id, ui, sessions, selectedId, messages });
}

async function setChatScribeView(view) {
  await CHS.setView(view); // the instance's preset (page/kind-state.js)
}

async function selectChatSession(id) {
  const d = S.chatScribeData;
  d.selectedId = id;
  d.messages = await api.chatscribe.getMessages(id);
  await api.module.setUi(d.moduleId, 'activeSession', String(id));
  renderNexusHome();
}

// SQLite datetime('now') stores UTC — display in local time.
function chsDate(createAt) {
  const dt = new Date(String(createAt).replace(' ', 'T') + 'Z');
  return isNaN(dt) ? null : dt;
}
const chsTime = (createAt) => {
  const dt = chsDate(createAt);
  return dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '';
};
function chsDayLabel(createAt) {
  const dt = chsDate(createAt);
  if (!dt) return '';
  const now = new Date();
  if (dt.toDateString() === now.toDateString()) return t('chatToday');
  return dt.toLocaleDateString();
}

function buildChatScribeMainHtml(m, c) {
  const d = CHS.instance(c);
  if (!d) return `<div class="empty" style="margin-top:40px"><div class="ei">${moduleIconHtml(m)}</div><h3>${x(m.name)}</h3></div>`;
  const viewBar = viewBarHtml(CHATSCRIBE_VIEWS, d.view, v => `setChatScribeView('${v}')`, v => CHATSCRIBE_VIEW_LABEL[v], { noI18n: true });
  const toolbar = `<div class="classifier-toolbar">
    ${cmdBtn('scribe.newSession', { moduleId: m.id }, { cls: 'btn-p' })}
    ${viewBar}
  </div>`;
  if (!d.sessions.length) {
    return toolbar + kindEmptyStateHtml(m);
  }
  const rows = d.sessions.map(s => `
    <div class="li${s.id === d.selectedId ? ' sel' : ''}" onclick="selectChatSession(${s.id})">
      <span class="name">${x(s.name)}<small class="chs-snippet">${x(String(s.last_message || '').slice(0, 40))}</small></span>
      <span class="cnt" data-no-i18n>${s.message_count}</span>
      <span class="acts">
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();openChatSessionModal(${m.id},${s.id})" title="${t('edit')}">${I.edit}</button>
      </span>
    </div>`).join('');
  const column = `<div class="author-chapters">
    <div class="au-col-label" data-no-i18n>SESSIONS · ${x(m.name)}</div>
    ${rows}
    <div class="li au-add" onclick="openChatSessionModal(${m.id})">${I.plus}<span class="name">${t('chatNewSession')}</span></div>
  </div>`;
  const ses = d.sessions.find(s => s.id === d.selectedId);
  const body = d.view === 'transcript' ? buildChatTranscriptHtml(d) : buildChatBubblesHtml(ses, d.messages);
  return `${toolbar}<div class="author-layout">${column}<div class="author-main chs-main">${body}</div></div>`;
}

// ── Chat view: bubble stream + input row ────────────────────────────────
// Parameterized on (session, messages) rather than reading S.chatScribeData
// directly (Plan part4) — the session's own dedicated item page
// (src/renderer/mod/item.js) reuses this exact function with its own
// freshly-fetched session/messages, distinct ids/send-hook via `opts`.
function buildChatBubblesHtml(session, messages, opts = {}) {
  if (!session) return '';
  const resolve = typeof resolveWikiNameCached === 'function' ? resolveWikiNameCached : null;
  let html = '';
  let lastDay = null;
  for (const g of messages) {
    const day = chsDayLabel(g.create_at);
    if (day !== lastDay) {
      lastDay = day;
      html += `<div class="chs-day" data-no-i18n>${x(day)} · session: ${x(session.name)}</div>`;
    }
    const bg = g.color_code ? ` style="background:${x(g.color_code)}"` : '';
    html += `<div class="chs-row${g.side === 'l' ? ' left' : ''}">
      <div class="chs-bubble" data-msg-id="${g.id}"${bg}>
        <span class="chs-text">${_mdInline(g.message, resolve)}</span>
        <span class="chs-time" data-no-i18n>${chsTime(g.create_at)}</span>
        <span class="chs-acts">
          <button class="btn btn-g btn-i" onclick="event.stopPropagation();openChatBubbleColorPopup(${g.id},this)" title="${t('color')}">${I.layer}</button>
          <button class="btn btn-g btn-i" onclick="event.stopPropagation();openChatMessageModal(${g.id})" title="${t('edit')}">${I.edit}</button>
          <button class="btn btn-g btn-i" onclick="event.stopPropagation();deleteChatMessageRow(${g.id})" title="${t('delete')}">${I.delete}</button>
        </span>
      </div>
    </div>`;
  }
  if (!messages.length) html = `<div class="empty" style="margin-top:30px"><p>${t('nestEmpty')}</p></div>`;
  const streamId = opts.streamId || 'chs-stream';
  const inputId = opts.inputId || 'chs-input';
  const onSend = opts.onSend || 'sendChatMessage()';
  return `<div id="${streamId}" class="chs-stream">${html}</div>
    <div class="chs-inputrow">
      <button class="btn btn-s btn-i" onclick="openChatLinkPicker('${inputId}')" title="${t('moduleLink')}">${I.relation}</button>
      <input id="${inputId}" data-wiki placeholder="${t('chatTypeNote')}" onkeydown="if(event.key==='Enter')${onSend}">
      <button class="btn btn-p" onclick="${onSend}">${t('chatSend')}</button>
    </div>`;
}

// Plan part5 Scribe #2: a message is already plain markdown-with-wikilinks
// text (see _mdInline above / reindexChatSession in src/db/chatscribe.js),
// so "insert a link" needs no new schema/message-type — just splice a
// `[[Name]]` at the input's cursor, same quickIndex picker pattern already
// used by Wanderer's/Designer's link pickers.
let _chsLinkInputId = 'chs-input';
function openChatLinkPicker(inputId) {
  _chsLinkInputId = inputId || 'chs-input';
  if (!S.nexus) return;
  api.wiki.quickIndex(S.nexus.id).then(ix => {
    const opts = ix.map(e => `<option value="${x(e.name)}">${x(e.name)} (${x(e.type)})</option>`).join('');
    openModal(t('moduleLink'), `
      <div class="fg"><label>${t('moduleLink')}</label><select id="chs-link-pick">${opts}</select></div>
      <div class="mfoot">
        <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
        <button class="btn btn-p" onclick="submitChatLinkInsert()">${t('create')}</button>
      </div>`);
  });
}

function submitChatLinkInsert() {
  const name = pbQOr('#chs-link-pick')?.value;
  closeModal();
  if (!name) return;
  const input = pbQOr(`#${_chsLinkInputId}`);
  if (!input) return;
  const linkText = `[[${name}]]`;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + linkText + input.value.slice(end);
  input.focus();
  const pos = start + linkText.length;
  input.setSelectionRange(pos, pos);
}

// Plan part5 Scribe #1: color popup — same click-to-popup, live-save idiom
// as Chronicler's openChroniclerEventIconPopup, but the leaner colorPicker()
// (core.js) instead of iconPicker() since a chat bubble has no icon.
async function openChatBubbleColorPopup(msgId, anchor) {
  closeAllPopups();
  if (!anchor) return;
  const sessionId = chatScribeActiveSessionId();
  const messages = sessionId ? await api.chatscribe.getMessages(sessionId) : [];
  const g = messages.find(m => m.id === msgId);
  if (!g) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup icon-edit-popup';
  pop.innerHTML = await colorPicker(g.color || null);
  document.body.appendChild(pop);
  pop.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target.closest('.cswatch')) saveChatBubbleColorLive(msgId);
  });
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

async function saveChatBubbleColorLive(msgId) {
  const color = pbQOr('#sel-color')?.value || null;
  const sessionId = chatScribeActiveSessionId();
  const messages = sessionId ? await api.chatscribe.getMessages(sessionId) : [];
  const g = messages.find(m => m.id === msgId);
  await api.chatscribe.updateMessageStyle(msgId, color, g?.side || 'r');
  await refreshChatScribeMessages();
}

// Plan part5 Scribe #1: drag a bubble left/right to flip which side it sits
// on (a real slide gesture, not a click-toggle) — delegated to the stream
// container so re-renders don't accumulate duplicate listeners; the
// AbortController-based re-bind idiom mirrors bindTimelineGraphInteractions
// in src/renderer/timeline.js.
let _chsDragCleanup = null;
function bindChatBubbleDrag(streamId) {
  if (_chsDragCleanup) _chsDragCleanup();
  const stream = pbQOr(`#${streamId}`);
  if (!stream) return;
  const controller = new AbortController();
  _chsDragCleanup = () => controller.abort();
  let dragEl = null, startX = 0, moved = false;
  stream.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const bubble = e.target.closest('.chs-bubble');
    if (!bubble || e.target.closest('.chs-acts')) return;
    dragEl = bubble; startX = e.clientX; moved = false;
  }, { signal: controller.signal });
  document.addEventListener('mousemove', (e) => {
    if (!dragEl) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    const row = dragEl.closest('.chs-row');
    const maxW = row ? row.offsetWidth : 300;
    const clamped = Math.max(-maxW, Math.min(maxW, dx));
    dragEl.style.transform = `translateX(${clamped}px)`;
  }, { signal: controller.signal });
  document.addEventListener('mouseup', async (e) => {
    if (!dragEl) return;
    const bubble = dragEl; dragEl = null;
    if (!moved) { bubble.style.transform = ''; return; }
    const dx = e.clientX - startX;
    bubble.style.transform = '';
    const row = bubble.closest('.chs-row');
    const threshold = (row?.offsetWidth || 300) * 0.25;
    const msgId = Number(bubble.dataset.msgId);
    const sessionId = chatScribeActiveSessionId();
    const messages = sessionId ? await api.chatscribe.getMessages(sessionId) : [];
    const g = messages.find(m => m.id === msgId);
    const curSide = g?.side || 'r';
    let side = curSide;
    if (dx < -threshold) side = 'l';
    else if (dx > threshold) side = 'r';
    if (side !== curSide) {
      await api.chatscribe.updateMessageStyle(msgId, g?.color || null, side);
      await refreshChatScribeMessages();
    }
  }, { signal: controller.signal });
}

// Post-DOM hook (registered in renderNexusHome): keep the stream pinned to
// the newest bubble and the input ready.
function mountChatScribe() {
  const d = S.chatScribeData;
  if (!d || d.view !== 'chat') return;
  const stream = pbQOr('#chs-stream');
  if (stream) stream.scrollTop = stream.scrollHeight;
  bindChatBubbleDrag('chs-stream');
}

async function sendChatMessage() {
  const d = S.chatScribeData;
  const el = pbQOr('#chs-input');
  const text = el?.value.trim();
  if (!text || !d?.selectedId) return;
  await api.chatscribe.createMessage(d.selectedId, text);
  d.messages = await api.chatscribe.getMessages(d.selectedId);
  const ses = d.sessions.find(s => s.id === d.selectedId);
  if (ses) { ses.message_count = d.messages.length; ses.last_message = text; }
  renderNexusHome();
  const input = pbQOr('#chs-input');
  if (input) input.focus();
}

// ── Transcript view: plain time-stamped log ─────────────────────────────
function buildChatTranscriptHtml(d) {
  const ses = d.sessions.find(s => s.id === d.selectedId);
  if (!ses) return '';
  const resolve = typeof resolveWikiNameCached === 'function' ? resolveWikiNameCached : null;
  const rows = d.messages.map(g => `
    <div class="chs-tr-row">
      <span class="chs-tr-time" data-no-i18n>${chsDayLabel(g.create_at)} ${chsTime(g.create_at)}</span>
      <span class="chs-tr-text">${_mdInline(g.message, resolve)}</span>
    </div>`).join('');
  return `<div class="chs-transcript">
    <div class="au-col-label" data-no-i18n>TRANSCRIPT · ${x(ses.name)}</div>
    ${rows || `<div class="empty" style="margin-top:30px"><p>${t('nestEmpty')}</p></div>`}
  </div>`;
}

// ── Session + message CRUD ──────────────────────────────────────────────
function openChatSessionModal(moduleId, id = null) {
  const ses = id ? S.chatScribeData?.sessions.find(s => s.id === id) : null;
  openModal(ses ? t('moduleEdit') : t('chatNewSession'), `
    <div class="fg"><label>${t('name')} *</label><input id="cs-name" value="${x(ses?.name || '')}"></div>
    <div class="mfoot">
      ${ses ? `<button class="btn btn-d" onclick="deleteChatSessionRow(${ses.id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitChatSession(${moduleId},${ses ? ses.id : 'null'})">${ses ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => pbQOr('#cs-name').focus(), 60);
}

async function submitChatSession(moduleId, id) {
  const name = pbQOr('#cs-name').value.trim();
  if (!name) return;
  if (id) await api.chatscribe.renameSession(id, name);
  else {
    const newId = await api.chatscribe.createSession(moduleId, name);
    S.chatScribeData.selectedId = newId;
  }
  closeModal();
  await reloadSource(moduleId);
  invalidateNestItems(moduleId, id ? 0 : 1);
  toast(id ? t('saved') : t('created'), 'ok');
}

async function deleteChatSessionRow(id) {
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  await api.chatscribe.deleteSession(id);
  closeModal();
  const d = S.chatScribeData;
  if (d.selectedId === id) d.selectedId = null;
  await reloadSource(d.moduleId);
  invalidateNestItems(d.moduleId, -1);
  toast(t('deleted'), 'ok');
}

// Current session id regardless of which of the two contexts (Plan part4)
// is showing this message row — the module's own Chat view, or the
// session's own dedicated item page.
function chatScribeActiveSessionId() {
  return S.activeItemNode?.itemKind === 'scribe' ? S.activeItemNode.id : S.chatScribeData?.selectedId;
}

// Re-render whichever context is currently live after a message CRUD —
// mirrors the equivalent branch in chronicler.js's saveChroniclerInspectorField.
async function refreshChatScribeMessages() {
  if (S.activeItemNode?.itemKind === 'scribe') {
    await openItemNode('scribe', S.activeItemNode.moduleId, S.activeItemNode.id);
    return;
  }
  const d = S.chatScribeData;
  if (!d) return;
  d.messages = await api.chatscribe.getMessages(d.selectedId);
  const ses = d.sessions.find(s => s.id === d.selectedId);
  if (ses) ses.message_count = d.messages.length;
  renderNexusHome();
}

async function openChatMessageModal(id) {
  const sessionId = chatScribeActiveSessionId();
  const messages = sessionId ? await api.chatscribe.getMessages(sessionId) : [];
  const g = messages.find(v => v.id === id);
  if (!g) return;
  openModal(t('moduleEdit'), `
    <div class="fg"><label>${t('content')}</label><textarea id="cm-text" data-wiki rows="3">${x(g.message)}</textarea></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitChatMessage(${id})">${t('save')}</button>
    </div>`);
  setTimeout(() => pbQOr('#cm-text').focus(), 60);
}

async function submitChatMessage(id) {
  const text = pbQOr('#cm-text').value.trim();
  if (!text) return;
  await api.chatscribe.updateMessage(id, text);
  closeModal();
  await refreshChatScribeMessages();
  toast(t('saved'), 'ok');
}

async function deleteChatMessageRow(id) {
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  await api.chatscribe.deleteMessage(id);
  await refreshChatScribeMessages();
  toast(t('deleted'), 'ok');
}
