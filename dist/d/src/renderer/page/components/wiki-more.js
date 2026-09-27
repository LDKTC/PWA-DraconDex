'use strict';
// ═══ Wiki components, part 2 (Procress 14, APP docs/TEMPLATES.md §7.3) ══
// Two containers — tabs and a toggle — that hold blocks of their own the
// way columns do (parent_id + config.col, page/page.js pbChildrenHtml), the
// navbox, and the list of a page's children.

// ── Tabs: each tab its own stack of blocks; config.col is the tab ───────
const PC_TAB_MAX = 8;
function pcTabNames(c) {
  const v = pbOpt(c, 'tabs');
  const names = (Array.isArray(v) ? v : []).map((s) => String(s ?? '').trim().slice(0, 40)).filter(Boolean).slice(0, PC_TAB_MAX);
  return names.length ? names : [`${t('pcTab')} 1`, `${t('pcTab')} 2`];
}
const pcTabOn = (c, n) => Math.min(n - 1, Math.max(0, c.state.tab ?? ((Number(pbOpt(c, 'start')) || 1) - 1)));

registerComponent('core.tabs', {
  kind: 'core', labelKey: 'pcTabs', container: true,
  options: () => [
    { key: 'tabs', type: 'list', label: 'pcOptTabs', max: PC_TAB_MAX, placeholder: 'pcTab' },
    { key: 'look', type: 'select', label: 'pcOptLook', choices: ['line', 'boxed', 'pills'], default: 'line', choiceKey: (v) => `pcTabs${pbCap(v)}` },
    { key: 'start', type: 'number', label: 'pcOptStartTab', min: 1, max: PC_TAB_MAX, default: 1 },
  ],
  render: (c) => {
    const names = pcTabNames(c);
    const on = pcTabOn(c, names.length);
    const seen = new Set();
    const id = (i) => `pct-${c.iid.replace('.', '-')}-${i}`;
    return `<div class="pc-tabs" data-look="${pbOpt(c, 'look')}">
      <div class="pc-tabstrip" role="tablist">${names.map((n, i) => `<div class="pc-tab${i === on ? ' on' : ''}" role="tab" tabindex="${i === on ? 0 : -1}"
        id="${id(i)}" aria-selected="${i === on}" onclick="pcTabGo(${xj(c.iid)},${i})"
        onkeydown="pcTabKey(event,${xj(c.iid)},${i},${names.length})" data-no-i18n>${x(n)}</div>`).join('')}</div>
      ${names.map((n, i) => `<div class="pc-tabpanel" role="tabpanel" aria-labelledby="${id(i)}" data-tab="${i}"${i === on ? '' : ' hidden'}>
        <div class="pc-tab-title" data-no-i18n>${x(n)}</div>${pbChildrenHtml(c, i, names.length, seen)}</div>`).join('')}
    </div>`;
  },
});

// Switch without a re-render: the other tabs' blocks stay mounted (a caret,
// a stage), only hidden.
function pcTabGo(iid, i) {
  const root = pbRoot(iid);
  const tabs = root?.querySelector(':scope > .pb-body > .pc-tabs');
  if (!tabs) return;
  pbState(iid).tab = i;
  tabs.querySelectorAll(':scope > .pc-tabstrip > .pc-tab').forEach((el, j) => {
    el.classList.toggle('on', j === i);
    el.setAttribute('aria-selected', String(j === i));
    el.tabIndex = j === i ? 0 : -1;
  });
  tabs.querySelectorAll(':scope > .pc-tabpanel').forEach((el, j) => { el.hidden = j !== i; });
  window.dispatchEvent(new Event('resize'));
}
function pcTabKey(e, iid, i, n) {
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pcTabGo(iid, i); return; }
  if (to == null) return;
  e.preventDefault();
  const j = (to + n) % n;
  pcTabGo(iid, j);
  pbRoot(iid)?.querySelectorAll('.pc-tabstrip > .pc-tab')[j]?.focus();
}

// ── Toggle: a heading that opens onto blocks of its own ─────────────────
registerComponent('core.toggle', {
  kind: 'core', labelKey: 'pcToggle', container: true,
  options: () => [
    { key: 'title', type: 'text', label: 'pbHeaderTitle', max: 80 },
    { key: 'start', type: 'select', label: 'pcOptStart', choices: ['closed', 'open'], default: 'closed', choiceKey: (v) => `pbColl${pbCap(v)}` },
  ],
  render: (c) => {
    const open = c.state.open ?? pbOpt(c, 'start') === 'open';
    const title = pbOpt(c, 'title') || t('pcToggle');
    return `<div class="pc-toggle${open ? ' open' : ''}">
      <div class="pc-toggle-head" role="button" tabindex="0" aria-expanded="${open}" onclick="pcToggleGo(${xj(c.iid)})"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pcToggleGo(${xj(c.iid)})}">
        <span class="pc-toggle-chev" aria-hidden="true">▸</span><span data-no-i18n>${x(title)}</span></div>
      <div class="pc-toggle-body">${pbChildrenHtml(c, 0, 1, new Set())}</div>
    </div>`;
  },
});
function pcToggleGo(iid) {
  const el = pbRoot(iid)?.querySelector(':scope > .pb-body > .pc-toggle');
  if (!el) return;
  const open = !el.classList.contains('open');
  pbState(iid).open = open;
  el.classList.toggle('open', open);
  el.querySelector(':scope > .pc-toggle-head')?.setAttribute('aria-expanded', String(open));
  if (open) window.dispatchEvent(new Event('resize'));
}

// A module's elements as {key, name} — the rows the Nest already loaded,
// keyed the way their pages are (mod/item.js ITEM_KIND).
function pcNestItems(m) {
  const reg = typeof ITEM_KIND !== 'undefined' ? ITEM_KIND[m?.kind] : null;
  const rows = m ? S.nestItems?.get(m.id) : null;
  if (!reg || !Array.isArray(rows)) return [];
  return rows.map((r) => ({ key: reg.keyOf(r), name: reg.nameOf(r) }));
}

// ── Navbox: groups of links at the foot of a page, folding. Filled from a
// module — its elements grouped by one field (a Classifier), or its child
// modules and elements — or from links typed in, grouped by their group.
registerFilled('core.navbox', {
  kind: 'core', labelKey: 'pcNavbox', needsSource: false,
  options: () => [
    { key: 'title', type: 'text', label: 'pbHeaderTitle', max: 80 },
    { key: 'source', type: 'module', label: 'pcOptSource' },
    { key: 'groupBy', type: 'fields', single: true, label: 'pcOptGroupBy', of: 'source' },
    { key: 'links', type: 'links', label: 'pbLinks', grouped: true },
    { key: 'start', type: 'select', label: 'pcOptStart', choices: ['open', 'closed'], default: 'open', choiceKey: (v) => `pbColl${pbCap(v)}` },
  ],
}, async (c) => {
  pbWarmWikiIndex();
  const groups = new Map(); // name → [html]
  const put = (g, html) => (groups.get(g) || groups.set(g, []).get(g)).push(html);
  const src = findModuleNode(Number(pbOpt(c, 'source')));
  if (src) {
    const here = c.page.itemKey;
    const link = (key, name) => `<a class="wikilink${key === here ? ' on' : ''}" data-key="${x(key)}" data-no-i18n>${x(name || '—')}</a>`;
    if (src.kind === 'classifier') {
      const { objects = [], templates = [] } = (await api.classifier.getObjectsFull(src.id)) || {};
      const by = pbOpt(c, 'groupBy');
      const tp = by ? pcFindField(templates, by) : null;
      for (const o of objects.slice(0, 300)) put(tp ? (String(o.attrMap?.[tp.id] ?? '').trim() || t('pcNoValue')) : '', link(`cobj_${o.id}`, o.name));
    } else {
      for (const k of src.children || []) put('', link(`module_${k.id}`, k.name));
      for (const it of pcNestItems(src).slice(0, 300)) put('', link(it.key, it.name));
    }
  }
  pbLinksOf(c).forEach((l, i) => put(String(l.group || ''), pbLinkHtml(c, ['links', i], l)));
  if (!groups.size) return pbLinksEmpty(c);
  const title = pbOpt(c, 'title') || src?.name || t('pcNavbox');
  const open = c.state.open ?? pbOpt(c, 'start') === 'open';
  return `<div class="pc-navbox${open ? ' open' : ''}">
    <div class="pc-navbox-head" role="button" tabindex="0" aria-expanded="${open}" onclick="pcNavboxGo(${xj(c.iid)})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pcNavboxGo(${xj(c.iid)})}"><span data-no-i18n>${x(title)}</span><span class="pc-toggle-chev" aria-hidden="true">▸</span></div>
    <div class="pc-navbox-body">${[...groups].map(([g, items]) => `<div class="pc-navbox-row">${g ? `<div class="pc-navbox-g" data-no-i18n>${x(g)}</div>` : ''}
      <div class="pc-navbox-items">${items.join('<span class="pc-dot-sep" aria-hidden="true">·</span>')}</div></div>`).join('')}</div>
  </div>`;
});
function pcNavboxGo(iid) {
  const el = pbRoot(iid)?.querySelector('.pc-navbox');
  if (!el) return;
  const open = !el.classList.contains('open');
  pbState(iid).open = open;
  el.classList.toggle('open', open);
  el.querySelector(':scope > .pc-navbox-head')?.setAttribute('aria-expanded', String(open));
}

// ── Children: the modules under this page's module (and, below the last
// level, the elements it holds) — a list, a tree, or cards.
registerComponent('core.children', {
  kind: 'core', labelKey: 'pcChildren',
  options: () => [
    { key: 'depth', type: 'number', label: 'pcOptDepth', min: 1, max: 3, default: 1 },
    { key: 'layout', type: 'select', label: 'pcOptLayout', choices: ['list', 'tree', 'cards'], default: 'list', choiceKey: (v) => `pcKids${pbCap(v)}` },
    { key: 'sort', type: 'select', label: 'pcOptSort', choices: ['order', 'name'], default: 'order', choiceKey: (v) => `pcSort${pbCap(v)}` },
  ],
  render: (c) => {
    if (c.page.itemKey) return `<div class="pc">${pcEmpty(t('pcChildrenNone'))}</div>`;
    const depth = pbOpt(c, 'depth');
    const layout = pbOpt(c, 'layout');
    const byName = pbOpt(c, 'sort') === 'name';
    const kidsOf = (m) => {
      const mods = [...(m.children || [])].map((k) => ({ key: `module_${k.id}`, name: k.name, m: k }));
      const items = pcNestItems(m);
      const all = [...mods, ...items];
      return byName ? all.sort((a, b) => String(a.name).localeCompare(String(b.name))) : all;
    };
    const root = findModuleNode(c.page.moduleId);
    const top = root ? kidsOf(root) : [];
    if (!top.length) return `<div class="pc">${pcEmpty(t('pcChildrenNone'))}</div>`;
    const row = (k) => `<a class="wikilink" data-key="${x(k.key)}" data-no-i18n>${k.m ? `<span class="kicon">${moduleIconHtml(k.m)}</span>` : ''}${x(k.name || '—')}</a>`;
    if (layout === 'cards') {
      return `<div class="pc-kids-cards">${top.slice(0, 60).map((k) => `<div class="pc-kid-card">${row(k)}${k.m ? `<span class="pc-li-sub">${x(kindLabel(k.m.kind))}</span>` : ''}</div>`).join('')}</div>`;
    }
    const list = (items, d) => `<ul class="pc-kids${layout === 'tree' ? ' pc-kids-tree' : ''}">${items.slice(0, 200).map((k) =>
      `<li>${row(k)}${k.m && d < depth ? (() => { const sub = kidsOf(k.m); return sub.length ? list(sub, d + 1) : ''; })() : ''}</li>`).join('')}</ul>`;
    return `<div class="pc">${list(top, 1)}</div>`;
  },
});
