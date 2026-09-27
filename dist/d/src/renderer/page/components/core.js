'use strict';
// ═══ Core page components (Procress 14, APP docs/TEMPLATES.md §2.1, §7.3) ══
// The ones any page may hold: an infobox of the element's fields, a callout,
// a row of numbers and the page's contents (the wiki ones — hatnote, see
// also, links — are in components/wiki.js). Each keeps to the
// page it sits on (kind 'core'); config comes from the template or the
// arrange bar.

// Infobox: the element's fields, the ones config.fields names (by key) or
// all of them — docked right / left / full, as a table or stacked.
registerFilled('core.infobox', {
  kind: 'core', labelKey: 'pcInfobox', once: true,
  options: () => [
    { key: 'fields', type: 'fields', label: 'pcOptFields' },
    { key: 'layout', type: 'select', label: 'pcOptLayout', choices: ['table', 'stacked'], default: 'table', choiceKey: (v) => `pcLayout${pbCap(v)}` },
    { key: 'dock', type: 'select', label: 'pcOptDock', choices: ['right', 'left', 'full'], default: 'right', choiceKey: (v) => `pcDock${pbCap(v)}` },
  ],
}, async (c) => {
  const dock = pbOpt(c, 'dock');
  const layout = pbOpt(c, 'layout');
  const oid = pcObjectId(c.itemKey);
  let rows = [];
  if (oid) {
    const [templates, attrs] = await Promise.all([api.classifier.getTemplates(c.page.moduleId), api.classifier.getAttrs(oid)]);
    const byTpl = new Map((attrs || []).map((a) => [a.template_ref, a.attribute_value]));
    const fields = pbOpt(c, 'fields');
    const want = Array.isArray(fields) && fields.length
      ? fields.map((k) => pcFindField(templates, k)).filter(Boolean)
      : (templates || []).filter((tp) => tp.attribute_type !== 'relation');
    rows = want.map((tp) => ({ label: tp.description, value: byTpl.get(tp.id) ?? '' }));
  } else {
    rows = (c.page.props?.props || []).map((p) => ({ label: p.prop_name, value: p.content ?? '' }));
  }
  const title = c.itemKey ? (S.activeItemNode?.item?.name || '') : (c.source?.name || '');
  const body = rows.length
    ? rows.map((r) => (layout === 'table'
      ? `<div class="pc-ib-row"><span class="pc-ib-k">${x(r.label)}</span><span class="pc-ib-v">${r.value === '' ? '<span class="ghost">—</span>' : x(r.value)}</span></div>`
      : `<div class="pc-ib-stack"><div class="pc-ib-k">${x(r.label)}</div><div class="pc-ib-v">${r.value === '' ? '<span class="ghost">—</span>' : x(r.value)}</div></div>`)).join('')
    : pcEmpty(t('pcInfoboxEmpty'));
  return `<aside class="pc-infobox" data-dock="${dock}">${title ? `<div class="pc-ib-title">${x(title)}</div>` : ''}${body}</aside>`;
});

// Callout: a note in a tone, written right on the page (block.content).
const PC_TONES = ['note', 'tip', 'warning', 'quote', 'secret'];
registerComponent('core.callout', {
  kind: 'core', labelKey: 'pcCallout',
  options: () => [{ key: 'tone', type: 'select', label: 'pcOptTone', choices: PC_TONES, default: 'note', choiceKey: (v) => `pcTone${pbCap(v)}` }],
  render: (c) => {
    const tone = pbOpt(c, 'tone');
    return `<div class="pc-callout" data-tone="${tone}">
      <div class="pc-callout-body" contenteditable="true" data-ph="${x(t('pcCalloutPh'))}"
        onblur="pcCalloutSave(${xj(c.iid)},this)">${x(c.block.content || '')}</div>
    </div>`;
  },
});
async function pcCalloutSave(iid, el) {
  const i = pbInst(iid);
  const b = i && pageOf(i.moduleId, i.itemKey)?.blocks.find((bb) => bb.id === i.blockId);
  if (!b) return;
  const text = el.innerText.trim();
  if (text === (b.content || '')) return;
  await api.block.update(b.id, { content: text });
  b.content = text;
}

// Stats: a row of numbers — an element's own fields (config.tiles: [{field}]),
// or, on a module page, how much the module holds.
registerFilled('core.stats', { kind: 'core', labelKey: 'pcStats' }, async (c) => {
  const tiles = [];
  const oid = pcObjectId(c.itemKey);
  const want = Array.isArray(c.config.tiles) ? c.config.tiles.slice(0, 6) : [];
  if (oid && want.length) {
    const [templates, attrs] = await Promise.all([api.classifier.getTemplates(c.page.moduleId), api.classifier.getAttrs(oid)]);
    const byTpl = new Map((attrs || []).map((a) => [a.template_ref, a.attribute_value]));
    for (const tile of want) {
      const tp = pcFindField(templates, tile.field);
      if (tp) tiles.push({ name: tile.label || tp.description, value: byTpl.get(tp.id) ?? '—' });
    }
  } else {
    const src = c.source;
    const items = S.nestItems?.get(src.id);
    tiles.push({ name: t('pcStatItems'), value: Array.isArray(items) ? items.length : 0 });
    const kids = findModuleNode(src.id)?.children?.length || 0;
    if (kids) tiles.push({ name: t('pcStatModules'), value: kids });
    const links = c.page.props?.links;
    if (links) tiles.push({ name: t('backlinks'), value: (links.backlinks || []).length });
  }
  if (!tiles.length) return pcEmpty(t('pcStatsEmpty'));
  return `<div class="pc-stats">${tiles.map((s) => `<div class="pc-stat"><div class="pc-stat-v">${x(String(s.value))}</div><div class="pc-stat-k">${x(s.name)}</div></div>`).join('')}</div>`;
});

// Contents: the page's own headings.
registerComponent('core.toc', {
  kind: 'core', labelKey: 'pcToc', once: true,
  render: (c) => {
    const hs = (c.page.blocks || []).filter((b) => b.block_type === 'heading' && (b.content || '').trim());
    if (!hs.length) return `<div class="pc">${pcEmpty(t('pcTocEmpty'))}</div>`;
    return `<nav class="pc pc-toc"><div class="pc-head">${t('pcToc')}</div>${hs.map((b) =>
      `<a class="pc-toc-row" role="link" tabindex="0" onclick="pbScrollToAnchor(${xj(pbAnchorOf(b))})"
        onkeydown="if(event.key==='Enter')pbScrollToAnchor(${xj(pbAnchorOf(b))})">${x(b.content)}</a>`).join('')}</nav>`;
  },
});
