// Editing an existing module: inline rename, inline handle, pin, the live
// icon/color popup and delete. There is no module form modal any more (v5
// Part 4, §8.3) — every field it had is edited in place.
// ═══ Inline rename — Nest row + module detail header share one flag ════
function startRenameModule(id) {
  S.renamingModuleId = id;
  renderNexusHome();
  focusRenameInput(id);
}

// Waits for the rename <input> to land in the DOM after a re-render, then
// focuses it and selects the whole guideword/name so typing replaces it
// immediately — shared by both the dblclick-to-rename and just-created
// module paths.
function focusRenameInput(id) {
  setTimeout(() => {
    const el = q(S.activeModuleNode?.id === id ? `#rename-head-${id}` : `#rename-nest-${id}`);
    el?.focus(); el?.select();
  }, 30);
}

async function saveModuleRename(id, value) {
  const name = value.trim();
  const m = findModuleNode(id);
  if (name && m && name !== m.name) await api.module.update(id, { name });
  S.renamingModuleId = null;
  await reloadModuleTree();
}

async function toggleModulePin(id) {
  const m = findModuleNode(id);
  if (!m) return;
  await api.module.update(id, { pinned: m.pinned ? 0 : 1 });
  await reloadModuleTree();
}

// ═══ Icon/color quick-popup — live-saves on every pick ═════════════════
async function openModuleIconPopup(id, anchor) {
  closeAllPopups();
  const m = findModuleNode(id);
  if (!m || !anchor) return;
  const pop = document.createElement('div');
  pop.className = 'kind-popup icon-edit-popup';
  pop.innerHTML = await iconPicker(m.icon || null, m.color || null, m.name, kindLabel(m.kind));
  document.body.appendChild(pop);
  pop.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target.closest('.ipk-cell') || e.target.closest('.cswatch')) saveModuleIconLive(id);
  });
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

async function saveModuleIconLive(id) {
  const icon = getIconPickerValue() || null;
  const color = q('#sel-color')?.value || null;
  await api.module.update(id, { icon, color, icon_color: color });
  await reloadModuleTree();
}

// ═══ Inline handle — the navbar is its only editor (v5 Part 4, §8.3) ══
// The module form modal used to be the one place in the app a handle could
// be edited; with the modal gone it lives on the page's navbar, next to the
// name, with the same inline-edit idiom as rename (one flag, one input).
function moduleHandleHtml(m) {
  if (S.editingHandleId === m.id) {
    const cur = S.handleDraft ?? m.handle ?? '';
    return `<input id="handle-head-${m.id}" class="rename-input module-handle-inp" value="${x(cur)}" placeholder="${x(t('moduleHandleHint'))}"
      data-no-i18n onclick="event.stopPropagation()" onblur="saveModuleHandle(${m.id},this.value)"
      onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){cancelModuleHandleEdit()}">`;
  }
  return m.handle
    ? `<span class="module-handle" data-no-i18n title="${x(t('moduleHandle'))}" ondblclick="startEditModuleHandle(${m.id})">@${x(m.handle)}</span>`
    : `<button class="btn btn-g btn-sm module-handle-add" onclick="startEditModuleHandle(${m.id})" title="${x(t('moduleHandle'))}" data-no-i18n>@</button>`;
}

async function startEditModuleHandle(id) {
  if (S.activeModuleNode?.id !== id) await openModuleNode(id);
  S.editingHandleId = id;
  S.handleDraft = null;
  renderNexusHome();
  setTimeout(() => { const el = q(`#handle-head-${id}`); el?.focus(); el?.select(); }, 30);
}

function cancelModuleHandleEdit() {
  S.editingHandleId = null;
  S.handleDraft = null;
  renderNexusHome();
}

async function saveModuleHandle(id, value) {
  if (S.editingHandleId !== id) return; // Escape already cancelled; blur follows
  const m = findModuleNode(id);
  const next = String(value || '').trim();
  if (m && next === (m.handle || '')) { cancelModuleHandleEdit(); return; }
  // A duplicate or malformed handle throws out of the db layer (module.js's
  // assertHandleFree/normalizeHandle). Catching it here is what keeps the
  // field open with the user's typing intact — the contract the old modal's
  // submitModuleForm had, moved here whole (§8.3).
  try {
    await api.module.update(id, { handle: next });
  } catch (e) {
    toast(t(/invalid/.test(e.message) ? 'handleInvalid' : 'handleTaken'), 'err');
    S.handleDraft = next;
    renderNexusHome();
    setTimeout(() => { const el = q(`#handle-head-${id}`); el?.focus(); el?.select(); }, 30);
    return;
  }
  S.editingHandleId = null;
  S.handleDraft = null;
  await reloadModuleTree();
  toast(t('saved'), 'ok');
}

// v5 Part 7 (APP docs/V5.md §11.4): delete moves the module — and
// everything under it — to the trash, and says so with an Undo instead of
// asking first. The confirm lives on "Empty trash", which is the step that
// cannot be taken back (hub/trash.js). This replaces Part 5's per-category
// confirm text (moduleDeleteMessage): with an Undo, nothing is lost by
// saying less.
async function deleteModuleNode(id) {
  const m = findModuleNode(id);
  if (!m || !S.nexus) return;
  const r = await api.trash.module(S.nexus.id, id);
  if (!r?.ok) { toast(t('driveErrServer'), 'err'); return; }
  if (S.activeModuleNode?.id === id) S.activeModuleNode = null;
  await reloadModuleTree();
  renderNexusHome();
  const blocks = r.textBlocks ? ` · ${r.textBlocks} ${t('pbTextBlocksToo')}` : '';
  toastAction(`${t('movedToTrash')}: ${m.name}${blocks}`, t('scUndo'), () => restoreTrashItem(r.trashId));
}

// A Nest row's single click (open) and its name's double click (rename)
// are the same physical gesture for their first ~250ms — a dblclick is
// preceded by two ordinary 'click' events, so opening the module
// immediately on click would fire (and flash the module open) before the
// browser even recognizes the dblclick. Deferring the open lets the
// rename's dblclick handler cancel it first (Plan part1 #5 — this was the
// "click meant for the rename box lands on the module's body button" bug:
// the leaked open made startRenameModule think the module was already
// active and focus the header's rename box instead of the Nest row's).
let _rowOpenTimer = null;
function scheduleRowOpen(id) {
  clearTimeout(_rowOpenTimer);
  _rowOpenTimer = setTimeout(() => { _rowOpenTimer = null; openModuleNode(id); }, 250);
}
function cancelRowOpen() {
  clearTimeout(_rowOpenTimer);
  _rowOpenTimer = null;
}
