'use strict';
// ═══ Core components + basic blocks (v5 Part 8, APP docs/V5.md §12.2/§12.8) ═
// What the Module Inspector dock held now sits on the page:
//   core.properties  the description (still module.description — FTS, wiki
//                    and sync read that column), tags, the link count, and
//                    the page's property blocks, edited in place (what
//                    module_attribute's modal was)
//   core.related     outgoing links and backlinks
// and the blocks that are not components: text (Markdown with [[links]]),
// heading, divider, image, columns.

const PROP_TYPES = ['text', 'textarea', 'number', 'date', 'checkbox', 'url'];
// Kinds whose own view IS the description editor: a second editor on the
// same text in Properties would let either one overwrite the other.
const DESC_IN_VIEW = new Set(['inspector', 'drafter']);

registerComponent('core.properties', {
  kind: 'core', labelKey: 'pbProperties', once: true,
  render: (c) => {
    const p = c.page.props || { props: [], tags: [], links: { outgoing: [], backlinks: [] } };
    const m = findModuleNode(c.page.moduleId);
    const own = c.itemKey == null;
    const desc = own && m && !DESC_IN_VIEW.has(m.kind) ? `<div class="pb-desc" data-r="desc"></div>` : '';
    const tags = own ? `<div class="pb-tags" data-r="tags">${pbTagChipsHtml(c.page.moduleId, p)}</div>` : '';
    const rows = p.props.map((r) => pbPropRowHtml(c, r)).join('');
    return `${desc}${tags}
      <div class="pb-props">${rows}
        <button class="btn btn-g btn-sm pb-prop-add" onclick="pbPropAdd(${xj(c.iid)})">${I.plus} ${t('addAttribute')}</button>
      </div>`;
  },
  mount: (c) => {
    const el = c.root.querySelector('[data-r="desc"]');
    const m = findModuleNode(c.page.moduleId);
    if (!el || !m) return;
    createMarkdownEditor(el, {
      title: t('moduleDetailSpec'), content: m.description || '', srcKey: `module_${m.id}`,
      mode: m.description ? 'preview' : 'edit',
      save: async (content) => {
        await api.module.updateDescription(m.id, content);
        const node = findModuleNode(m.id);
        if (node) node.description = content;
      },
    });
  },
});

function pbTagChipsHtml(moduleId, p) {
  const chips = (p.tags || []).map((tg) => `<span class="htag" style="border-color:${x(tg.color_code || '#6366f1')};color:${x(tg.color_code || '#6366f1')}">#${x(tg.tag_name)}</span>`).join('');
  const n = (p.links?.outgoing?.length || 0) + (p.links?.backlinks?.length || 0);
  const links = `<span class="htag lk" data-no-i18n title="${t('openInExhibitor')}" onclick="openExhibitorFor(${moduleId},'module_${moduleId}')">🔗 ${n}</span>`;
  return `${chips}${links}<button class="btn btn-g btn-i" onclick="openModuleTagPopup(${moduleId}, this)" title="${t('tagLink')}">${I.plus}</button>`;
}

function pbPropInputHtml(c, r) {
  const on = `onchange="pbPropSave(${xj(c.iid)},${r.id},this)"`;
  const v = r.content ?? '';
  switch (r.prop_type) {
    case 'textarea': return `<textarea class="pv-textarea" rows="2" ${on}>${x(v)}</textarea>`;
    case 'number': return `<input class="pv-input" type="number" value="${x(v)}" ${on}>`;
    case 'date': return `<input class="pv-input" type="date" value="${x(v)}" ${on}>`;
    case 'checkbox': return `<input type="checkbox" ${v === '1' ? 'checked' : ''} ${on}>`;
    case 'url': return `<input class="pv-input" type="url" value="${x(v)}" ${on}>${/^https?:\/\//i.test(v) ? ` <a class="htag lk" href="${x(v)}" target="_blank" rel="noopener">↗</a>` : ''}`;
    default: return `<input class="pv-input" value="${x(v)}" ${on}>`;
  }
}

function pbPropRowHtml(c, r) {
  return `<div class="prop pb-prop" data-pid="${r.id}">
    <input class="pk pb-prop-name" value="${x(r.prop_name || '')}" placeholder="${x(t('name'))}" onchange="pbPropRename(${xj(c.iid)},${r.id},this.value)">
    <span class="pv">${pbPropInputHtml(c, r)}</span>
    <span class="acts">
      <select class="pb-prop-type" onchange="pbPropType(${xj(c.iid)},${r.id},this.value)">
        ${PROP_TYPES.map((tp) => `<option value="${tp}"${(r.prop_type || 'text') === tp ? ' selected' : ''}>${t(CLASSIFIER_DISPTYPE_KEY[tp])}</option>`).join('')}
      </select>
      <button class="btn btn-g btn-i" onclick="pbPropDelete(${xj(c.iid)},${r.id})" title="${t('delete')}">${I.delete}</button>
    </span>
  </div>`;
}

const pbPropOf = (iid, pid) => { const i = pbInst(iid); return pageOf(i?.moduleId, i?.itemKey)?.props?.props.find((r) => r.id === pid) || null; };

async function pbPropSave(iid, pid, el) {
  const i = pbInst(iid); const r = pbPropOf(iid, pid);
  if (!i || !r) return;
  const value = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
  await api.block.setProp(i.moduleId, i.itemKey, pid, r.prop_name, value, r.prop_type || 'text');
  r.content = value;
}
async function pbPropRename(iid, pid, name) {
  const i = pbInst(iid); const r = pbPropOf(iid, pid);
  if (!i || !r || !name.trim()) return;
  await api.block.setProp(i.moduleId, i.itemKey, pid, name.trim(), r.content, r.prop_type || 'text');
  r.prop_name = name.trim();
}
async function pbPropType(iid, pid, type) {
  const i = pbInst(iid); const r = pbPropOf(iid, pid);
  if (!i || !r) return;
  await api.block.setProp(i.moduleId, i.itemKey, pid, r.prop_name, r.content, type);
  await refreshPageProps(i.moduleId, i.itemKey);
}
async function pbPropAdd(iid) {
  const i = pbInst(iid);
  if (!i) return;
  const n = (pageOf(i.moduleId, i.itemKey)?.props?.props.length || 0) + 1;
  await api.block.setProp(i.moduleId, i.itemKey, null, `${t('pbProperty')} ${n}`, '', 'text');
  await refreshPageProps(i.moduleId, i.itemKey);
  const rows = pbRoot(iid)?.querySelectorAll('.pb-prop-name');
  const last = rows?.[rows.length - 1];
  last?.focus(); last?.select();
}
async function pbPropDelete(iid, pid) {
  const i = pbInst(iid);
  if (!i) return;
  const r = await api.block.remove(pid);
  await refreshPageProps(i.moduleId, i.itemKey);
  if (r?.rows) toastAction(t('deleted'), t('scUndo'), async () => { await api.block.restore(r.rows); await refreshPageProps(i.moduleId, i.itemKey); });
}

registerComponent('core.related', {
  kind: 'core', labelKey: 'pbRelated', once: true,
  render: (c) => {
    const links = c.page.props?.links || { outgoing: [], backlinks: [] };
    const mid = c.page.moduleId;
    const chip = (l) => (l.key ? `<span class="htag lk" onclick="openEntityByKey(${xj(l.key)})">${x(l.name)}</span>` : `<span class="htag" style="opacity:.5">[[${x(l.name)}]]</span>`);
    const key = c.itemKey ?? `module_${mid}`;
    return `<div class="pb-related">
      <div class="pb-label">${t('outgoingLinks')}</div>
      <div class="insp-chips">${links.outgoing.length ? links.outgoing.map(chip).join('') : `<span class="pv ghost">—</span>`}</div>
      <div class="pb-label">${t('backlinks')}</div>
      <div class="insp-chips">${links.backlinks.length ? links.backlinks.map(chip).join('') : `<span class="pv ghost">${t('noBacklinks')}</span>`}</div>
      <button class="btn btn-g btn-sm" onclick="openExhibitorFor(${mid},${xj(key)})">${I.relation} ${t('openInExhibitor')}</button>
    </div>`;
  },
});

// ── basic blocks ────────────────────────────────────────────────────────
function pbBasicHtml(c, seen) {
  const b = c.block;
  switch (b.block_type) {
    case 'text': return `<div class="pb-md" data-r="md"></div>`;
    case 'heading': return `<input class="pb-heading" value="${x(b.content || '')}" placeholder="${x(t('pbHeading'))}" onchange="pbSetContent(${xj(c.iid)},this.value)">`;
    // both draw through the decor components (components/decor.js, D2)
    case 'divider': return pcDividerHtml(c);
    case 'image': {
      const f = /^file_(\d+)$/.exec(b.source_key || '');
      if (f) return pcFigureHtml(c, Number(f[1]), b.content);
      return `<button class="btn btn-s btn-sm" onclick="pbPickImage(${xj(c.iid)})">${I.plus} ${t('pbChooseImage')}</button>`;
    }
    case 'columns': {
      const n = Math.min(3, Math.max(2, Number(c.config.n) || 2));
      const cols = Array.from({ length: n }, (_, col) => `<div class="pb-col" data-col="${col}">${pbChildrenHtml(c, col, n, seen)}</div>`).join('');
      return `<div class="pb-cols" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${cols}</div>`;
    }
    default: return '';
  }
}

function pbBasicMount(c) {
  if (c.block.block_type !== 'text') return;
  const el = c.root.querySelector(':scope > .pb-body > [data-r="md"]');
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = '1';
  const b = c.block;
  const i = pbInst(c.iid);
  createMarkdownEditor(el, {
    title: '', content: b.content || '', mode: b.content ? 'preview' : 'edit',
    srcKey: i?.itemKey && i.itemKey !== '*' ? i.itemKey : `module_${c.page.moduleId}`,
    save: async (content) => { await api.block.update(b.id, { content }); b.content = content; pbRefreshFootnotes(c.page, b.id); },
    footnotes: () => pbFootnoteCtx(c.page),
  });
}

async function pbSetContent(iid, value) {
  const i = pbInst(iid);
  const b = i && pageOf(i.moduleId, i.itemKey)?.blocks.find((bb) => bb.id === i.blockId);
  if (!b) return;
  await api.block.update(b.id, { content: value });
  b.content = value;
}

// The picture picker (page/imagepick.js, EXPORT-DECOR D4): search, recent,
// import a new one right there.
function pbPickImage(iid) {
  const i = pbInst(iid);
  if (!i || !S.nexus) return;
  openPbImagePicker({ moduleId: i.moduleId, onPick: ([id]) => id && pbSetImage(iid, `file_${id}`) });
}

async function pbSetImage(iid, key) {
  const i = pbInst(iid);
  if (!i) return;
  await api.block.update(i.blockId, { sourceKey: key });
  closeModal();
  await reloadModulePage(i.moduleId, i.itemKey);
}

// Live-saves on every tag add/remove (matches every other .kind-popup) —
// no Save/Cancel footer. hashtagSelector/addModalTag/removeModalTag
// (core.js) are shared with modals that save on a button, so this wraps
// them with a delegated click listener instead of changing them.
async function openModuleTagPopup(moduleId, anchor) {
  closeAllPopups();
  if (!anchor) return;
  const current = (pageOf(moduleId)?.props?.tags || []).map((tg) => tg.id);
  const pop = document.createElement('div');
  pop.className = 'kind-popup tag-link-popup';
  pop.innerHTML = await hashtagSelector('modtag', current);
  document.body.appendChild(pop);
  pop.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.target.closest('.htag-item') || e.target.closest('.htag-chip button')) {
      await api.module.setTags(moduleId, getModalTagIds('modtag'));
      // Only the chips: a whole-page render would pull this popup's anchor
      // out from under it.
      const page = pageOf(moduleId);
      if (page) page.props.tags = await api.module.getTags(moduleId);
      if (S.inspectorData?.moduleId === moduleId) S.inspectorData.tags = page?.props.tags || [];
      document.querySelectorAll('.pbc-core-properties [data-r="tags"]').forEach((el) => {
        const i = pbInst(el.closest('.pblock')?.dataset.iid);
        if (i?.moduleId === moduleId && page) el.innerHTML = pbTagChipsHtml(moduleId, page.props);
      });
    }
  });
  renderModalTagSuggestions('modtag');
  positionPopupNear(pop, anchor.getBoundingClientRect());
}

// ── footnotes across the page (Procress 14, TEMPLATES §7.3) ─────────────
// One numbering for the whole page, in block order: [^a] in the first text
// block is 1 wherever else it is referenced. A References block on the page
// lists the notes; without one, each text block lists its own.
function pbFootnoteCtx(page) {
  const notes = new Map();
  const order = [];
  for (const b of page?.blocks || []) {
    if (b.block_type !== 'text' || !b.content) continue;
    const f = mdFootnotes(b.content);
    for (const [id, note] of f.notes) if (!notes.has(id)) notes.set(id, note);
    for (const id of f.order) if (!order.includes(id)) order.push(id);
  }
  const hideDefs = (page?.blocks || []).some((b) => b.component === 'core.references');
  return { notes, order, hideDefs, num: (id) => { const n = order.indexOf(id); return n < 0 ? '?' : n + 1; } };
}

// A saved note can renumber every other block and the References list.
function pbRefreshFootnotes(page, savedId) {
  if (!page) return;
  rerenderPageBlocks((i, b) => i.moduleId === page.moduleId && (i.itemKey ?? null) === (page.itemKey ?? null)
    && (b.component === 'core.references' || (b.block_type === 'text' && b.id !== savedId && /\[\^/.test(b.content || ''))));
}
