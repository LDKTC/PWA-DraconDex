'use strict';
// ═══ Classifier — right-click, object CRUD, quick start (v5 Part 3) ═════
// APP docs/V5.md §7.4 "right-click everywhere", on the menu engine in
// hub/ctxmenu.js. Three surfaces:
//   classifier.object    list row · table row · grid card · graph node ·
//                        detail heading → open · rename · colour/icon ·
//                        duplicate · link · move · delete
//   classifier.category  empty list / grid / toolbar area → add object ·
//                        fields · colour/icon · delete
//   classifier.level     a level row → insert above/below · duplicate · delete

const clsObjectById = (id) => clsFindObject(id)
  || (S.activeItemNode?.itemKind === 'classifier' && S.activeItemNode.id === id ? { id, name: S.activeItemNode.item?.name } : null);

// v5 Part 6: rows are commands (core/commands.js). The selected object is
// the palette's target for the object commands; a level row has none.
CTX_PROVIDERS['classifier.object'] = ({ moduleId, objectId }) => {
  const c = { moduleId, objectId };
  return [
    cmdItem('classifier.openObject', c),
    { sep: true },
    cmdItem('classifier.renameObject', c),
    cmdItem('classifier.objectIcon', c),
    cmdItem('classifier.duplicateObject', c),
    cmdItem('classifier.objectExhibitor', c),
    cmdItem('classifier.moveObject', c),
    { sep: true },
    cmdItem('classifier.deleteObject', c),
  ];
};

CTX_PROVIDERS['classifier.category'] = ({ moduleId }) => [
  cmdItem('classifier.addObject', { moduleId }),
  cmdItem('classifier.fields', { moduleId }),
  cmdItem('module.icon', { moduleId }),
  { sep: true },
  cmdItem('module.delete', { moduleId }),
];

CTX_PROVIDERS['classifier.level'] = ({ objectId, templateId, levelId }) => {
  const c = { objectId, templateId, levelId };
  return [
    cmdItem('classifier.levelAbove', c),
    cmdItem('classifier.levelBelow', c),
    cmdItem('classifier.levelDuplicate', c),
    { sep: true },
    cmdItem('classifier.levelDelete', c),
  ];
};

// ── Quick start (§7.4) ──────────────────────────────────────────────────
// An empty category to "1 object, 1 field, ready to type into" in one
// click — what used to be ~10 clicks, 4 typed names and two modals.
async function classifierQuickStart(moduleId) {
  const oid = await api.classifier.createObject(moduleId, t('clsFirstObjectName'), null, null);
  const templates = await api.classifier.getTemplates(moduleId);
  if (!templates.length) await api.classifier.createTemplate(moduleId, t('clsFirstFieldName'), 'text', false, false, null);
  S.clsPendingSelect = oid;
  await api.module.setUi(moduleId, 'activeView', 'listDetail');
  const m = findModuleNode(moduleId);
  if (m) await loadClassifierData(m);
  invalidateNestItems(moduleId, 1);
  toast(t('created'), 'ok');
}

// ── Object CRUD ─────────────────────────────────────────────────────────
async function openClassifierObjectModal(moduleId, objectId) {
  const m = findModuleNode(moduleId) || S.activeModuleNode;
  const o = objectId ? clsFindObject(objectId) : null;
  openModal(o ? t('moduleEdit') : t('addObject'), `
    <div class="fg"><label>${t('name')} *</label><input id="co-name" value="${x(o?.name || '')}"
      onkeydown="if(event.key==='Enter'){event.preventDefault();submitClassifierObjectForm(${moduleId},${o ? o.id : 'null'})}"></div>
    <div class="fg"><label>${t('iconCollection')}</label>${await iconPicker(o?.icon || null, o?.color || null, o?.name || '', m?.cat_type === 'character' ? t('catTypeCharacter') : t('catTypeObject'))}</div>
    <div class="mfoot">
      ${o ? `<button class="btn btn-d" onclick="deleteClassifierObjectRow(${o.id})">${t('delete')}</button>` : ''}
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitClassifierObjectForm(${moduleId},${o ? o.id : 'null'})">${o ? t('save') : t('create')}</button>
    </div>`);
  setTimeout(() => q('#co-name').focus(), 60);
}

async function submitClassifierObjectForm(moduleId, objectId) {
  const name = q('#co-name').value.trim();
  // §7.5 bug #8: an empty name used to do nothing at all.
  if (!name) { toast(t('nameRequired'), 'err'); q('#co-name')?.focus(); return; }
  const colorId = q('#sel-color').value || null;
  const icon = typeof getIconPickerValue === 'function' ? getIconPickerValue() : null;
  if (objectId) await api.classifier.updateObject(objectId, name, colorId, icon);
  else S.clsPendingSelect = await api.classifier.createObject(moduleId, name, colorId, icon);
  closeModal();
  const mod = findModuleNode(moduleId);
  if (mod && CLS[moduleId]) await loadClassifierData(mod);
  // No renderNexusHome() here — invalidateNestItems schedules a coalesced
  // one (Plan part2 #2.5), so this path repaints once instead of twice.
  invalidateNestItems(moduleId, objectId ? 0 : 1);
  toast(objectId ? t('saved') : t('created'), 'ok');
}

async function deleteClassifierObjectRow(objectId) {
  // §7.5 bug #4: this said "Delete this module?".
  if (!await uiConfirm(t('confirmDeleteObject'))) return;
  const moduleId = clsModuleOfObject(objectId) ?? S.activeItemNode?.moduleId ?? S.activeModuleNode?.id;
  await api.classifier.deleteObject(objectId);
  closeModal();
  if (S.classifierSelectedObject === objectId) S.classifierSelectedObject = null;
  if (S.activeItemNode?.itemKind === 'classifier' && S.activeItemNode.id === objectId && moduleId != null) {
    await openModuleNode(moduleId);
  } else if (moduleId != null && CLS[moduleId]) {
    await loadClassifierData(findModuleNode(moduleId));
  }
  if (moduleId != null) invalidateNestItems(moduleId, -1);
  else renderNexusHome();
  toast(t('deleted'), 'ok');
}

async function duplicateClassifierObject(objectId) {
  const src = clsObjectById(objectId);
  const nid = await api.classifier.duplicateObject(objectId, src ? `${src.name} ${t('clsCopySuffix')}` : null);
  const moduleId = clsModuleOfObject(objectId) ?? S.activeItemNode?.moduleId;
  if (nid) S.clsPendingSelect = nid;
  await refreshClassifier();
  if (moduleId != null) invalidateNestItems(moduleId, 1);
  toast(t('created'), 'ok');
}

async function moveClassifierObject(objectId, targetModuleId) {
  const from = clsModuleOfObject(objectId) ?? S.activeItemNode?.moduleId;
  const ok = await api.classifier.moveObject(objectId, targetModuleId);
  if (!ok) return;
  if (S.classifierSelectedObject === objectId) S.classifierSelectedObject = null;
  if (S.activeItemNode?.itemKind === 'classifier' && S.activeItemNode.id === objectId) {
    await openItemNode('classifier', targetModuleId, objectId);
  } else {
    await refreshClassifier();
  }
  if (from != null) invalidateNestItems(from, -1);
  invalidateNestItems(targetModuleId, 1);
  toast(t('saved'), 'ok');
}
