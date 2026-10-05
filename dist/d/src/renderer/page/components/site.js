'use strict';
// ═══ Site components (Procress 16 part 3b, Suggestion.md) ════════════════
// The first set a page built like a web page needs, beside the wiki ones:
//   core.datatable  a Classifier's elements as a table — columns, a filter,
//                   sort and how many rows; any page, reading the module
//                   picked in its options (the page's own when it is one)
//   core.linktext   a sentence of links — to a page, a module, an element,
//                   an anchor or a URL; a target that is gone shows red
//   core.search     a search box: type, pick a hit, go there — the whole
//                   Nexus, or one module and everything under it
// Headings H1–H3 / display are the heading block's Level (page/blocks.js).

// A heading's level: H1 · H2 (as before) · H3 · display (a big lead-in)
PB_BASIC_OPTIONS.heading = () => [{ key: 'level', type: 'select', choices: ['1', '2', '3', 'display'], default: '2', label: 'pbHeadingLevel',
  choiceKey: (v) => (v === 'display' ? 'pbLvDisplay' : `pbLvH${v}`) }];

// ── Categories of this page (Procress 16 part 5) ────────────────────────
// Wikipedia's bar at the foot of an article: the page's labels, each a link
// to its category page, and the folder it sits in. A page with neither
// draws nothing outside Arrange.
registerComponent('core.categories', {
  kind: 'core', labelKey: 'pcCategories', once: true,
  render: (c) => pageCategoriesHtml(c.page) || (pbArranging(c.page) ? pcEmpty(t('pcCategories')) : ''),
});
// Every module page ends with this bar (hub/open.js) unless it places the
// block somewhere itself.
function pageCategoriesHtml(page) {
  if (!page) return '';
  const m = findModuleNode(page.moduleId);
  const tags = page.itemKey == null ? (page.props?.tags || []) : [];
  const folder = m && m.parent_id != null ? findModuleNode(m.parent_id) : null;
  if (!tags.length && !folder) return '';
  return `<div class="pc-cats"><span class="pc-cats-label">${t('pcCategories')}:</span>
    ${tags.map((tg) => categoryLinkHtml(tg.tag_name)).join('')}
    ${folder ? `<a class="pc-cat" role="link" tabindex="0" onclick="openFolderPage(${folder.id})" onkeydown="if(event.key==='Enter')openFolderPage(${folder.id})" data-no-i18n>${x(folder.name)}</a>` : ''}</div>`;
}

// ── Data table ─────────────────────────────────────────────────────────
registerFilled('core.datatable', {
  kind: 'core', labelKey: 'pcDataTable', needsSource: false,
  options: () => [
    { key: 'source', type: 'module', kinds: ['classifier'], label: 'pcOptSource' },
    { key: 'fields', type: 'fields', of: 'source', label: 'pcOptFields' },
    { key: 'filter', type: 'text', label: 'pcOptFilter', max: 80 },
    { key: 'sortBy', type: 'fields', single: true, of: 'source', label: 'pcOptSortBy' },
    { key: 'sortDir', type: 'select', choices: ['asc', 'desc'], default: 'asc', label: 'pcOptSortDir', choiceKey: (v) => (v === 'asc' ? 'pcSortAsc' : 'pcSortDesc') },
    { key: 'rows', type: 'number', min: 1, max: 500, default: 25, label: 'pcOptRows' },
  ],
}, async (c) => {
  const own = findModuleNode(c.page.moduleId);
  const src = findModuleNode(Number(pbOpt(c, 'source'))) || (own?.kind === 'classifier' ? own : null);
  if (!src || src.kind !== 'classifier') return pcEmpty(t('pcDataTablePick'));
  const { objects = [], templates = [] } = (await api.classifier.getObjectsFull(src.id)) || {};
  const picked = (Array.isArray(pbOpt(c, 'fields')) ? pbOpt(c, 'fields') : []).map((k) => pcFindField(templates, k)).filter(Boolean);
  const cols = picked.length ? picked : templates.filter((tp) => tp.attribute_type !== 'relation').slice(0, 4);
  const val = (o, tp) => String(o.attrMap?.[tp.id] ?? '');
  const needle = String(pbOpt(c, 'filter') || '').trim().toLowerCase();
  let rows = needle ? objects.filter((o) => [o.name, ...templates.map((tp) => val(o, tp))].join('\n').toLowerCase().includes(needle)) : objects.slice();
  const by = pbOpt(c, 'sortBy') ? pcFindField(templates, pbOpt(c, 'sortBy')) : null;
  const keyOf = (o) => (by ? val(o, by) : o.name || '');
  const dir = pbOpt(c, 'sortDir') === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const [p, q2] = [keyOf(a), keyOf(b)];
    const n = Number(p) - Number(q2);
    return dir * (p !== '' && q2 !== '' && Number.isFinite(n) ? n : p.localeCompare(q2));
  });
  const total = rows.length;
  rows = rows.slice(0, Math.max(1, Number(pbOpt(c, 'rows')) || 25));
  if (!rows.length) return pcEmpty(t('pcNoElements'));
  return `<div class="pc-datatable"><table>
    <thead><tr><th>${t('name')}</th>${cols.map((tp) => `<th data-no-i18n>${x(tp.description)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((o) => `<tr><td><a class="wikilink" data-key="cobj_${o.id}" ${pcOpen(`cobj_${o.id}`)} data-no-i18n>${x(o.name || '—')}</a></td>
      ${cols.map((tp) => `<td data-no-i18n>${x(val(o, tp))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${total > rows.length ? `<div class="pc-datatable-more" data-no-i18n>${rows.length} / ${total}</div>` : ''}</div>`;
});

// ── Link text ──────────────────────────────────────────────────────────
registerComponent('core.linktext', {
  kind: 'core', labelKey: 'pcLinkText',
  options: () => [
    { key: 'lead', type: 'text', label: 'pcOptLead', max: 200 },
    { key: 'links', type: 'links', label: 'pbLinks' },
  ],
  render: (c) => {
    const links = pbLinksOf(c);
    if (!links.length) return pbLinksEmpty(c);
    const lead = String(pbOpt(c, 'lead') || '').trim();
    return `<p class="pc-linktext">${lead ? `<span data-no-i18n>${x(lead)}</span> ` : ''}${links.map((l, i) => pbLinkHtml(c, ['links', i], l)).join(', ')}</p>`;
  },
});

// ── Search box ─────────────────────────────────────────────────────────
registerComponent('core.search', {
  kind: 'core', labelKey: 'pcSearchBox',
  options: () => [{ key: 'scope', type: 'module', label: 'pcOptScope' }],
  render: (c) => `<div class="pc-search" role="search">
      <input type="search" placeholder="${x(t('search'))}" aria-label="${x(t('pcSearchBox'))}" value="${x(c.state.q || '')}"
        oninput="pcSearchInput(${xj(c.iid)},this.value)" onkeydown="if(event.key==='Enter'){this.parentElement.querySelector('.pc-search-hit')?.click()}">
      <div class="pc-search-res" data-r="res"></div></div>`,
  mount: (c) => { if (c.state.q) pcSearchRun(c.iid); },
});

function pcSearchInput(iid, v) {
  const st = pbState(iid);
  st.q = v;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => pcSearchRun(iid), 200);
}

// The keys a scoped search may return: the module, the modules under it,
// and their elements — gathered once per box and scope.
async function pcSearchScope(iid, id) {
  const st = pbState(iid);
  if (st.scopeFor === id) return st.scope;
  const keys = new Set();
  const walk = async (m) => {
    keys.add(`module_${m.id}`);
    const reg = ITEM_KIND[m.kind];
    if (reg) { try { for (const r of (await reg.list(m.id)) || []) keys.add(reg.keyOf(r)); } catch (_) {} }
    for (const k of m.children || []) await walk(k);
  };
  const root = findModuleNode(id);
  if (root) await walk(root);
  st.scope = keys;
  st.scopeFor = id;
  return keys;
}

async function pcSearchRun(iid) {
  const st = pbState(iid);
  const box = pbRoot(iid)?.querySelector('[data-r="res"]');
  const qy = String(st.q || '').trim();
  if (!box || !S.nexus) return;
  if (!qy) { box.innerHTML = ''; return; }
  const b = pbBlockOf(iid);
  const scopeId = b ? Number(pbOpt({ block: b, config: b.config || {} }, 'scope')) : 0;
  let rows = await api.search.query(S.nexus.id, qy).catch(() => []);
  if (scopeId) { const keys = await pcSearchScope(iid, scopeId); rows = rows.filter((r) => keys.has(r.key)); }
  if (String(st.q || '').trim() !== qy) return; // a newer query won
  const snip = (s) => x(s || '').replace(/\[([^\]]*)\]/g, '<b>$1</b>');
  box.innerHTML = rows.length
    ? rows.slice(0, 12).map((r) => `<a class="pc-search-hit" role="link" tabindex="0" ${pcOpen(r.key)}><span data-no-i18n>${x(r.title || r.key)}</span><small data-no-i18n>${snip(r.snippet)}</small></a>`).join('')
    : `<p class="drafter-hint">${t('leftSearchNone')}</p>`;
}
