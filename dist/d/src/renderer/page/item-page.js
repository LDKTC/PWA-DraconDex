'use strict';
// ═══ Element pages (v5 Part 8, APP docs/V5.md §12.9) ════════════════════
// An element (a Classifier object, a Chronicler event, an Author chapter, a
// ChatScribe session — ITEM_KIND entries with a keyOf) has a page of blocks
// like a module does, keyed (module, element key). Every element of a
// module shares one layout, item_key '*', until one is split off to be
// arranged on its own (db/page-block.js splitItemPage); Revert drops the
// element's own stack and it follows the shared layout again.
//
// The element's own editor — what its page was before Part 8 — is one
// block, item.body. Its HTML is built by openItemNode (mod/item.js) the way
// it always was, so this component only places it.

registerComponent('item.body', {
  kind: 'item', labelKey: 'pbItemBody', once: true,
  render: (c) => {
    const node = S.activeItemNode;
    return node && node.moduleId === c.page.moduleId && node.itemKey === c.itemKey ? node.bodyHtml : '';
  },
  mount: (c) => {
    const node = S.activeItemNode;
    if (node && node.moduleId === c.page.moduleId && node.itemKey === c.itemKey) ITEM_KIND[node.itemKind]?.mount?.(node);
  },
});

// A new module's element pages start as the element's editor, then what
// used to be in the dock for it: its properties and links.
function itemPageLayout() {
  return [{ component: 'item.body' }, { component: 'core.properties' }, { component: 'core.related' }];
}

const pbItemKeyOf = (node) => node?.itemKey ?? null;

// The page's layout target: an element page that still follows the shared
// layout is arranged AS the shared layout — adding a block to one element
// would otherwise split it silently, leaving only the new block.
function pbLayoutKey(moduleId, itemKey) {
  const page = pageOf(moduleId, itemKey);
  return itemKey != null && itemKey !== '*' && page?.from === 'shared' ? '*' : itemKey;
}

// Above the blocks while arranging: which layout this is, and the way to
// the other one.
function itemPageNoteHtml(node) {
  const page = pageOf(node.moduleId, node.itemKey);
  if (!page || !pbArranging(page)) return '';
  const shared = page.from !== 'own';
  return `<div class="pb-layout-note">
    <span>${t(shared ? 'pbSharedLayout' : 'pbOwnLayout')}</span>
    ${cmdBtn(shared ? 'page.split' : 'page.revert', {}, { cls: 'btn-s btn-sm' })}
  </div>`;
}

async function splitItemPageNow() {
  const node = S.activeItemNode;
  if (!node?.itemKey) return;
  await api.block.split(node.moduleId, node.itemKey);
  await reloadModulePage(node.moduleId, node.itemKey);
  toast(t('pbSplitDone'), 'ok');
}

async function revertItemPageNow() {
  const node = S.activeItemNode;
  if (!node?.itemKey) return;
  if (!await uiConfirm(t('pbRevertConfirm'))) return;
  await api.block.revert(node.moduleId, node.itemKey);
  await reloadModulePage(node.moduleId, node.itemKey);
}
