'use strict';
// ═══ Content-item "minor module" pages (Plan part4) ═══════════════════
// A content item is a row living INSIDE a module's own data — one
// Classifier object, one Chronicler event, one Author chapter, one
// ChatScribe session, one Designer node — NOT a `module`-table row (that's
// the pre-existing "Add Minor Module" feature, a different, already-shipped
// concept). This file is the per-kind registry (ITEM_KIND) plus the shared
// open/render machinery that gives one content item its own Builder tab,
// alongside its existing inline treatment inside the owning module's view.
//
// Every ITEM_KIND entry's list(moduleId) is the single fetch primitive,
// reused by the Nest tree's lazy expand (hub.js's ensureNestItemsLoaded),
// this file's own openItemNode, and fetchOneItem below — the same "fetch
// the parent-scoped list, find by id" convention src/renderer/mod/
// chronicler.js's openChroniclerEventModal already established, generalized
// instead of hand-copied per kind. Both the item's own page and the owning
// module's inline view always re-fetch fresh through this same path, so
// neither ever renders a stale hand-copied object.

const ITEM_KIND = {
  classifier: {
    badgeKey: 'itemBadgeClassifierObject',
    icon: () => I.layer,
    keyOf: (o) => `cobj_${o.id}`,
    async list(moduleId) { return api.classifier.getObjects(moduleId); },
    nameOf: (o) => o.name,
    async renderBody(o, m) {
      // Single-object variant of getObjectsFull's hydration — 1 object is not a
      // fan-out, so it stays a hand-built shape. Keep the two in step: levels
      // and the link index were added to both in Process 8 part 1.
      await loadModule('src/renderer/timeline.js');
      const [attrs, objTemplates, levels, relations, index] = await Promise.all([
        api.classifier.getAttrs(o.id),
        api.classifier.getObjectTemplates(m.id, o.id),
        api.classifier.getLevels(o.id),
        api.viewer.getRelations(S.nexus.id),
        api.viewer.index(S.nexus.id),
      ]);
      const attrMap = {}, levelMap = {};
      for (const a of attrs) attrMap[a.template_ref] = a.attribute_value;
      for (const l of levels) (levelMap[l.template_ref] ||= []).push(l);
      setClassifierLinkData(relations, index);
      const templates = objTemplates.filter(tp => tp.object_ref == null);
      const hydrated = {
        ...o, attrMap, levelMap,
        privateTemplates: objTemplates.filter(tp => tp.object_ref === o.id)
          .map(tp => ({ id: tp.id, description: tp.description, value: attrMap[tp.id] || '' })),
      };
      return renderClassifierObjectDetail(m, hydrated, templates);
    },
  },
  chronicler: {
    badgeKey: 'itemBadgeChroniclerEvent',
    icon: () => I.timeline,
    keyOf: (e) => `tlev_${e.id}`,
    async list(moduleId) {
      const tls = await api.timeline.getModuleTimelines(moduleId);
      const lists = await Promise.all(tls.map(tl =>
        api.timeline.getEvents(tl.id).then(evs => evs.map(e => ({ ...e, __parentId: tl.id })))));
      return lists.flat();
    },
    nameOf: (e) => e.event_name,
    async renderBody(ev) {
      // The inspector body renders the event's linked-elements section, which
      // reads from module-level caches loadChroniclerData fills. This page can
      // be opened without the module's own view ever having loaded, so prime
      // them here too (same reasoning as the classifier entry above).
      await loadModule('src/renderer/timeline.js');
      await reloadChroniclerLinks();
      return `<div class="chr-insp-body" id="item-chr-insp">${await buildChroniclerEventInspectorHtml(ev, ev.__parentId)}</div>`;
    },
  },
  author: {
    badgeKey: 'itemBadgeAuthorChapter',
    icon: () => I.book,
    keyOf: (c) => `bchp_${c.id}`,
    async list(moduleId) { return api.author.getChapters(moduleId); },
    nameOf: (c) => c.name,
    async renderBody() { return `<div id="author-item-editor" class="scribe-editor au-editor"></div>`; },
    mount(node) {
      mountAuthorRichEditor(fq('#author-item-editor'), node.item);
    },
  },
  scribe: {
    badgeKey: 'itemBadgeChatSession',
    icon: () => I.story,
    keyOf: (s) => `chss_${s.id}`,
    async list(moduleId) { return api.chatscribe.getSessions(moduleId); },
    nameOf: (s) => s.name,
    async renderBody(s) {
      const messages = await api.chatscribe.getMessages(s.id);
      return buildChatBubblesHtml(s, messages, {
        streamId: 'item-chs-stream', inputId: 'item-chs-input', onSend: `sendItemChatMessage(${s.id})`,
      });
    },
    mount() {
      const el = fq('#item-chs-stream');
      if (el) el.scrollTop = el.scrollHeight;
      bindChatBubbleDrag('item-chs-stream');
    },
  },
  // Procress 11's last item (V5.md §12.4): the four element families that
  // had keys but no page. Each page shows the element and its blocks; the
  // full editor stays in the module (the board, the table list, the canvas,
  // the map), one click away through itemOpenInModuleHtml.
  narrator: {
    badgeKey: 'itemBadgeDialogue',
    icon: () => I.narrator,
    keyOf: (d) => `sdlg_${d.id}`,
    async list(moduleId) { return api.narrator.getDialogues(moduleId); },
    nameOf: (d) => d.name,
    async renderBody(dl) {
      const [talks, options] = await Promise.all([api.narrator.getTalks(dl.id), api.narrator.getChoiceOptions(dl.id)]);
      const rows = talks.map((tk) => (tk.row_type === 'choice'
        ? `<li class="item-choice"><ul>${options.filter((o) => o.talk_ref === tk.id)
          .map((o) => `<li>${x(o.option_text || '…')}</li>`).join('')}</ul></li>`
        : `<li>${tk.speaker ? `<b>${x(tk.speaker)}</b> ` : ''}${x(tk.talk_sentence || '')}</li>`)).join('');
      return `${dl.description ? `<div class="md-preview">${mdRender(dl.description)}</div>` : ''}
        <ol class="item-lines" data-no-i18n>${rows || ''}</ol>
        ${rows ? '' : `<div class="empty"><p>${t('nestEmpty')}</p></div>`}
        ${itemOpenInModuleHtml(`sdlg_${dl.id}`)}`;
    },
  },
  diviner: {
    badgeKey: 'itemBadgeDivinerTable',
    icon: () => I.list,
    keyOf: (tb) => `divt_${tb.id}`,
    async list(moduleId) { return api.diviner.getTables(moduleId); },
    nameOf: (tb) => tb.name,
    async renderBody(tb) {
      const entries = await api.diviner.getEntries(tb.id);
      const rows = entries.map((e) => `<li>${x(e.entry_text || e.linker_key || '…')}</li>`).join('');
      return `${tb.dice ? `<p class="drafter-hint" data-no-i18n>${x(tb.dice)}</p>` : ''}
        ${rows ? `<ol class="item-lines" data-no-i18n>${rows}</ol>` : `<div class="empty"><p>${t('divNoEntries')}</p></div>`}
        <div class="mfoot">
          <span id="item-div-result" class="item-roll" data-no-i18n></span>
          <button class="btn btn-p" onclick="rollItemDivinerTable(${tb.id})">${t('divRoll')}</button>
        </div>
        ${itemOpenInModuleHtml(`divt_${tb.id}`)}`;
    },
  },
  sketcher: {
    badgeKey: 'itemBadgeSketchPage',
    icon: () => I.sketcher,
    keyOf: (p) => `skpg_${p.id}`,
    async list(moduleId) { return api.sketcher.getPages(moduleId); },
    nameOf: (p) => p.name,
    // Drawn to a PNG up front rather than on mount, so the HTML export
    // (hub/html-export.js), which never mounts an element body, has it too.
    async renderBody(p) {
      return `<img class="item-sketch" src="${await sketchPageDataUrl(p.id, 0.5)}" alt="${x(p.name)}">
        ${itemOpenInModuleHtml(`skpg_${p.id}`)}`;
    },
  },
  wanderer: {
    badgeKey: 'itemBadgeMapPin',
    icon: () => I.wanderer,
    keyOf: (p) => `mevt_${p.id}`,
    async list(moduleId) { return api.wanderer.list(moduleId); },
    // A pin's own caption, else the event it marks, else its number.
    nameOf: (p) => p.label || p.event_name || `${t('itemBadgeMapPin')} #${p.id}`,
    async renderBody(p) {
      const [linked] = p.linker_key ? await api.wiki.resolveKeys([p.linker_key]) : [];
      return `<div class="fg"><label>${t('pinCaption')}</label>
          <input id="item-pin-label" value="${x(p.label || '')}" data-no-i18n
            onchange="saveItemPinLabel(${p.id}, this.value)"></div>
        ${p.event_name ? `<div class="fg"><label>${t('itemBadgeChroniclerEvent')}</label>
          <a class="wikilink" data-key="tlev_${p.event_ref}" data-no-i18n>${x(p.event_name)}</a></div>` : ''}
        ${linked ? `<div class="fg"><label>${t('pinLinkedTo')}</label>
          <a class="wikilink" data-key="${x(p.linker_key)}" data-no-i18n>${x(linked.name || p.linker_key)}</a></div>` : ''}
        ${itemOpenInModuleHtml(`module_${p.module_ref}`)}`;
    },
  },
  designer: {
    badgeKey: 'itemBadgeDesignNode',
    icon: () => I.relation,
    async list(moduleId) { return api.designer.getNodes(moduleId); },
    // design_node has no dedicated name column — best-effort label from its
    // own short text, else a shape glyph + id (Plan part4 #6).
    nameOf: (n) => n.node_text ? (n.node_text.length > 24 ? n.node_text.slice(0, 24) + '…' : n.node_text) : `${DG_SHAPE_GLYPH[n.shape] || '□'} #${n.id}`,
    async renderBody(n) {
      return `${buildDesignNodeFieldsHtml(n, { prefix: 'item-dn' })}
        <div class="mfoot"><button class="btn btn-p" onclick="saveItemDesignNode(${n.id})">${t('save')}</button></div>`;
    },
  },
};

// The way from an element's page to the element in its module's own view:
// openEntityByKey (core/router.js) opens the module with it selected.
function itemOpenInModuleHtml(key) {
  return `<div class="mfoot"><button class="btn btn-g" onclick="openEntityByKey('${x(key)}')">${t('itemOpenInModule')}</button></div>`;
}

async function rollItemDivinerTable(tableId) {
  const r = await api.diviner.roll(tableId);
  const el = fq('#item-div-result');
  if (el && r?.ok) el.textContent = r.text;
}

async function saveItemPinLabel(id, value) {
  await api.wanderer.setLabel(id, value.trim());
  invalidateNestItems(S.activeItemNode.moduleId);
  toast(t('saved'), 'ok');
}

async function fetchOneItem(itemKind, moduleId, id) {
  const items = await ITEM_KIND[itemKind].list(moduleId);
  return items.find(i => i.id === id);
}

async function openItemNode(itemKind, moduleId, id) {
  if (S.activeItemNode?.id !== id || S.activeItemNode?.itemKind !== itemKind) pageAutoCollapseLeft(); // page/focus.js
  const reg = ITEM_KIND[itemKind];
  if (!reg) return;
  const key = builderPageKey({ kind: 'item', itemKind, moduleId, id });
  const item = await fetchOneItem(itemKind, moduleId, id);
  if (!item) {
    // Stale tab — the item was deleted elsewhere while this tab existed.
    const b = builderState();
    b.panes.forEach((pane, idx) => { if (pane.tabs.includes(key)) builderCloseTab(idx, key); });
    toast(t('itemNotFound'), 'error');
    return;
  }
  const m = findModuleNode(moduleId);
  const bodyHtml = await reg.renderBody(item, m);
  // v5 Part 8 (§12.9): an element with an entity key has a page of blocks —
  // the shared '*' layout until it is split. The body above is one of them
  // (item.body, page/item-page.js).
  const itemKey = reg.keyOf ? reg.keyOf(item) : null;
  if (itemKey && m) await loadModulePage(m, itemKey);
  S.activeItemNode = { itemKind, moduleId, id, item, m, bodyHtml, itemKey };
  S.activeModuleNode = null;
  S.filePreview = null;
  S.sageHut = null;
  S.importDockPage = false;
  if (typeof builderNavigate === 'function') builderNavigate({ kind: 'item', itemKind, moduleId, id });
  S.itemNodeCache.set(key, { name: reg.nameOf(item), color: m?.color_code || 'var(--accent)', badge: t(reg.badgeKey), icon: reg.icon() });
  renderNexusHome();
}

function buildItemPageHtml(node) {
  const reg = ITEM_KIND[node.itemKind];
  const col = node.m?.color_code || 'var(--accent)';
  const name = reg.nameOf(node.item);
  const paged = node.itemKey && pageOf(node.moduleId, node.itemKey);
  return `${pageHeadHtml({
      color: col, title: `<span data-no-i18n>${x(name)}</span>`, titleText: name,
      after: `<span class="kind-chip" data-no-i18n>${x(t(reg.badgeKey))}</span>`,
      sub: `<span data-no-i18n>${x(node.m?.name || '')}</span>`,
      acts: paged ? pageHeadActsHtml(node.moduleId, node.itemKey) : '',
      addr: { moduleId: node.moduleId, itemName: name },
      layout: paged ? pageHeadLayout(node.moduleId, node.itemKey) : null,
    })}
    ${paged ? `<div class="item-page-body module-page${pageReadableOn(node.moduleId) ? ' page-readable' : ''}">${itemPageNoteHtml(node)}${pageBlocksHtml(node.moduleId, node.itemKey)}</div>`
      : `<div class="item-page-body">${node.bodyHtml}</div>`}`;
}

// ── ChatScribe item page: send handler mirroring sendChatMessage, but
// scoped to a specific session id rather than S.chatScribeData's current
// selection, and refreshing via openItemNode instead of renderNexusHome. ──
async function sendItemChatMessage(sessionId) {
  const el = fq('#item-chs-input');
  const text = el?.value.trim();
  if (!text) return;
  await api.chatscribe.createMessage(sessionId, text);
  invalidateNestItems(S.activeItemNode.moduleId);
  await openItemNode('scribe', S.activeItemNode.moduleId, sessionId);
}

// ── Designer item page: save handler mirroring submitDesignNode, but
// reading the id-prefixed fields (buildDesignNodeFieldsHtml({prefix:
// 'item-dn'})) and refreshing via openItemNode instead of openModuleNode. ──
async function saveItemDesignNode(id) {
  const n = S.activeItemNode.item;
  const text = fq('#item-dn-text')?.value ?? n.node_text;
  const shape = fq('#item-dn-shape')?.value || n.shape;
  const colorEl = document.querySelector('#item-dn-colors .sk-swatch.act');
  const color = colorEl ? colorEl.dataset.color : n.color;
  const moduleId = S.activeItemNode.moduleId;
  await api.designer.updateNode(id, shape, text, color);
  invalidateNestItems(moduleId);
  await openItemNode('designer', moduleId, id);
  toast(t('saved'), 'ok');
}
