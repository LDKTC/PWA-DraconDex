'use strict';
// ═══ Chronicler — line and event CRUD ══════════════════════════════════
// Split out of mod/chronicler.js in v5 Part 8, when per-instance state pushed
// that file past the ~500-line band. Everything here acts on the CURRENT
// Chronicler instance (S.chroniclerData, page/page.js pbCurrent).

// ═══ Timeline line CRUD ════════════════════════════════════════════════
async function openChroniclerTimelineModal(moduleId, id = null) {
  const tl = id ? S.chroniclerData.timelines.find(t => t.id === id) : null;
  openModal(tl ? t('chroniclerLineEdit') : t('chroniclerLineNew'), `
    <div class="fg"><label>${t('name')} *</label><input id="chr-tl-name" value="${x(tl?.line_name || '')}"></div>
    <div class="fg"><label>${t('color')}</label>${await colorPicker(tl?.color)}</div>
    <div class="mfoot">${tl ? `<button class="btn btn-d" onclick="deleteChroniclerTimeline(${moduleId},${id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitChroniclerTimelineForm(${moduleId},${tl ? id : 'null'})">${tl ? t('save') : t('create')}</button></div>`);
  setTimeout(() => q('#chr-tl-name').focus(), 60);
}

async function submitChroniclerTimelineForm(moduleId, id) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  const name = q('#chr-tl-name').value.trim();
  if (!name) return;
  const colorId = q('#sel-color').value || null;
  if (id) {
    await api.timeline.update(id, name, colorId);
  } else {
    if (S.chroniclerData.timelines.length >= 1) { closeModal(); return; } // only 1 line/module (C2)
    const r = await api.timeline.createModuleTimeline(moduleId, name, colorId);
    S.chroniclerData.activeId = r.lastInsertRowid;
  }
  closeModal();
  const m = findModuleNode(moduleId);
  await loadChroniclerData(m);
  renderNexusHome();
  toast(id ? t('saved') : t('created'), 'ok');
}

async function deleteChroniclerTimeline(moduleId, id) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  await api.timeline.delete(id);
  closeModal();
  const m = findModuleNode(moduleId);
  if (S.chroniclerData.activeId === id) S.chroniclerData.activeId = null;
  await loadChroniclerData(m);
  renderNexusHome();
  toast(t('deleted'), 'ok');
}

// ═══ Event CRUD (module-scoped: no Director relation/hashtag coupling —
// those systems are project-scoped, see progress.md Section C item 8 for
// the same reasoning applied to Classifier) ═════════════════════════════
async function openChroniclerEventModal(tlid, evId = null) {
  let ev = null;
  if (evId) { const evs = await api.timeline.getEvents(tlid); ev = evs.find(e => e.id === evId); }
  openModal(ev ? t('chroniclerEventEdit') : t('chroniclerEventNew'), `
    <div class="fg"><label>${t('name')} *</label><input id="chr-ev-n" value="${x(ev?.event_name || '')}"></div>
    <div class="fg"><label>${t('startDate')} *</label>${dateInputsHTML('chr-ev-s', ev, 's_day', 's_month', 's_years', 's_hour', 's_minute')}</div>
    <div class="fg"><label>${t('endDate')}</label>${dateInputsHTML('chr-ev-e', ev, 'e_day', 'e_month', 'e_years', 'e_hour', 'e_minute')}</div>
    <div class="fg"><label>${t('story')}</label><textarea id="chr-ev-story" data-wiki>${x(ev?.story || '')}</textarea></div>
    <div class="mfoot">${ev ? `<button class="btn btn-d" onclick="deleteChroniclerEvent(${evId},${tlid})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="${ev ? `saveChroniclerEvent(${evId},${tlid})` : `createChroniclerEvent(${tlid})`}">${ev ? t('save') : t('create')}</button></div>`);
  setTimeout(() => q('#chr-ev-n').focus(), 60);
}

async function createChroniclerEvent(tlid) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  try {
    const n = q('#chr-ev-n').value.trim();
    if (!n) { toast(t('name'), 'err'); return; }
    const sid = await getDateFromInputs('chr-ev-s');
    if (!sid) { toast(t('startDate'), 'err'); return; }
    const eid = await getDateFromInputs('chr-ev-e');
    const story = q('#chr-ev-story')?.value.trim() || '';
    await api.timeline.createEvent(tlid, n, sid, eid, null, story); // color/icon set later via the dot's icon popup
    closeModal();
    pbUse(__iid); await mountChroniclerGraph();
    if (S.chroniclerData?.moduleId != null) invalidateNestItems(S.chroniclerData.moduleId, 1);
    toast(t('created'), 'ok');
  } catch (e) { toast(e.message, 'err'); console.error(e); }
}

async function saveChroniclerEvent(evId, tlid) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  try {
    const n = q('#chr-ev-n').value.trim();
    if (!n) { toast(t('name'), 'err'); return; }
    const sid = await getDateFromInputs('chr-ev-s');
    if (!sid) { toast(t('startDate'), 'err'); return; }
    const eid = await getDateFromInputs('chr-ev-e');
    const story = q('#chr-ev-story')?.value.trim() || '';
    const existing = (await api.timeline.getEvents(tlid)).find(e => e.id === evId);
    await api.timeline.updateEvent(evId, n, sid, eid, existing?.color || null, story); // color/icon unchanged — set via the dot's icon popup
    closeModal();
    pbUse(__iid); await mountChroniclerGraph();
    if (S.chroniclerData?.moduleId != null) invalidateNestItems(S.chroniclerData.moduleId);
    toast(t('saved'), 'ok');
  } catch (e) { toast(e.message, 'err'); console.error(e); }
}

async function deleteChroniclerEvent(evId, tlid) {
  const __iid = pbCurrent(); // re-bound below: an await can hand the turn to another instance
  if (!await uiConfirm(t('confirmDeleteItem'))) return;
  await api.timeline.deleteEvent(evId);
  if (S.chroniclerData?.inspectorEventId === evId) S.chroniclerData.inspectorEventId = null;
  closeModal();
  const moduleId = S.chroniclerData?.moduleId;
  pbUse(__iid); await mountChroniclerGraph();
  if (moduleId != null) invalidateNestItems(moduleId, -1);
  toast(t('deleted'), 'ok');
}
