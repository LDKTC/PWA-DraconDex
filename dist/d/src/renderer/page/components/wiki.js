'use strict';
// ═══ Wiki components (Procress 14, APP docs/TEMPLATES.md §7.3) ══════════
// The ones that move a reader around a page and between pages, all on the
// one link model (page/links.js): a bar of links, link cards, the hatnote
// line, "see also", and the references a page's footnotes make. Containers
// (tabs, toggle), the navbox and the children list are in wiki-more.js.

const pbLinksEmpty = (c) => pcEmpty(pbArranging(c.page) ? t('pbLinksEmptyArrange') : t('pbLinksEmpty'));

// ── Link bar: pills / tabs / underline / buttons, optionally sticky ─────
registerComponent('core.linkbar', {
  kind: 'core', labelKey: 'pcLinkbar',
  options: () => [
    { key: 'links', type: 'links', label: 'pbLinks' },
    { key: 'bar', type: 'select', label: 'pcOptBar', choices: ['pills', 'tabs', 'underline', 'buttons'], default: 'pills', choiceKey: (v) => `pcBar${pbCap(v)}` },
    { key: 'align', type: 'select', label: 'pbStyleAlign', choices: ['left', 'center'], default: 'left', choiceKey: (v) => `align${pbCap(v)}` },
    { key: 'sticky', type: 'toggle', label: 'pcOptSticky', default: false },
  ],
  render: (c) => {
    pbWarmWikiIndex();
    const links = pbLinksOf(c);
    if (!links.length) return pbLinksEmpty(c);
    return `<nav class="pc-linkbar" data-bar="${pbOpt(c, 'bar')}" data-align="${pbOpt(c, 'align')}"${pbOpt(c, 'sticky') ? ' data-sticky' : ''} aria-label="${x(t('pcLinkbar'))}">
      ${links.map((l, i) => pbLinkHtml(c, ['links', i], l)).join('')}</nav>`;
  },
  // Which in-page link is "here": the last anchored block whose top has
  // passed the top third of the view.
  mount: (c) => {
    const bar = c.root.querySelector('.pc-linkbar');
    const links = pbLinksOf(c);
    const anchors = links.map((l) => pbLinkResolve(l)).map((r) => (r.kind === 'anchor' ? r.anchor : null));
    if (!bar || !anchors.some(Boolean) || typeof IntersectionObserver === 'undefined') return;
    const pane = c.root.closest('.page-blocks');
    const els = anchors.map((a) => (a ? pane?.querySelector(`.pblock[data-anchor="${CSS.escape(a)}"]`) : null));
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }
      let on = -1;
      els.forEach((el, i) => { if (el && seen.has(el)) on = on < 0 ? i : on; });
      if (on < 0) return;
      bar.querySelectorAll(':scope > .pb-link').forEach((a, i) => a.classList.toggle('on', i === on));
    }, { rootMargin: '0px 0px -66% 0px' });
    els.forEach((el) => el && io.observe(el));
    PB_LINKBAR_IO.set(c.iid, io);
  },
});
const PB_LINKBAR_IO = new Map();
PB_DISPOSERS.push((iid) => { PB_LINKBAR_IO.get(iid)?.disconnect(); PB_LINKBAR_IO.delete(iid); });

// ── Link cards: a page with its cover and two fields, or a web address ──
registerComponent('core.linkcard', {
  kind: 'core', labelKey: 'pcLinkcard',
  options: () => [
    { key: 'links', type: 'links', label: 'pbLinks' },
    { key: 'layout', type: 'select', label: 'pcOptLayout', choices: ['card', 'compact', 'button'], default: 'card', choiceKey: (v) => `pcCard${pbCap(v)}` },
    { key: 'cols', type: 'select', label: 'pbColumns', choices: ['1', '2', '3'], default: '2' },
  ],
  render: (c) => {
    pbWarmWikiIndex();
    const links = pbLinksOf(c);
    if (!links.length) return pbLinksEmpty(c);
    const layout = pbOpt(c, 'layout');
    if (layout === 'button') return `<div class="pc-lc-buttons">${links.map((l, i) => pbLinkHtml(c, ['links', i], l, 'pc-lc-btn')).join('')}</div>`;
    return `<div class="pc-lc-grid" data-layout="${layout}" style="grid-template-columns:repeat(${Number(pbOpt(c, 'cols'))},minmax(0,1fr))">${links.map((l, i) => {
      const r = pbLinkResolve(l);
      const go = `pbLinkGo(${xj(c.iid)},${xv(['links', i])})`;
      const inner = r.kind === 'url'
        ? `<div class="pb-sum"><div class="pb-sum-body"><div class="pb-sum-name" data-no-i18n>${x(pbLinkLabel(l, r))}</div><div class="pb-ext" data-no-i18n>${x(r.host)} ↗</div></div></div>`
        : `<div class="pb-sum"><div class="pb-sum-body"><div class="pb-sum-name" data-no-i18n>${l.icon ? pbIconHtml(l.icon) : ''}${x(pbLinkLabel(l, r))}</div>
            ${r.dangling ? `<div class="pb-sum-kind">${t('pbLinkMissing')}</div>` : ''}</div></div>`;
      return `<div class="pc-lc${r.dangling ? ' pb-link-dangling' : ''}" role="link" tabindex="0"${r.key && !r.dangling ? ` data-sum="${x(r.key)}"` : ''}
        onclick="${go}" onkeydown="if(event.key==='Enter'){event.preventDefault();${go}}">${inner}</div>`;
    }).join('')}</div>`;
  },
  // internal cards fill in their cover and fields once they are known
  mount: (c) => {
    c.root.querySelectorAll('.pc-lc[data-sum]').forEach(async (el) => {
      const s = await pbEntitySummary(el.dataset.sum);
      if (!s || !el.isConnected) return;
      const label = el.querySelector('.pb-sum-name')?.textContent || s.name;
      el.innerHTML = pbSummaryHtml({ ...s, name: label, icon: null });
      if (typeof watchPageCovers === 'function') watchPageCovers();
    });
  },
});

// ── Hatnote: "Main article: …" / "For more, see …" / "Not to be confused
// with …" over typed links; a page written before the link model keeps
// its free line, still editable in place.
registerComponent('core.hatnote', {
  kind: 'core', labelKey: 'pcHatnote', once: true,
  options: () => [
    { key: 'kind', type: 'select', label: 'pcOptHatKind', choices: ['main', 'about', 'distinguish'], default: 'main', choiceKey: (v) => `pcHat${pbCap(v)}` },
    { key: 'links', type: 'links', label: 'pbLinks' },
  ],
  render: (c) => {
    const links = pbLinksOf(c);
    if (!links.length) {
      return `<div class="pc-hatnote" contenteditable="true" data-ph="${x(t('pcHatnotePh'))}"
        onblur="pcCalloutSave(${xj(c.iid)},this)">${x(c.block.content || '')}</div>`;
    }
    pbWarmWikiIndex();
    const parts = links.map((l, i) => pbLinkHtml(c, ['links', i], l));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${t('pcHatAnd')} ${parts[parts.length - 1]}` : parts[0];
    return `<div class="pc-hatnote pc-hatnote-links"><span>${t(`pcHat${pbCap(pbOpt(c, 'kind'))}`)}</span> ${list}</div>`;
  },
});

// ── See also: the links chosen here; while arranging, the pages this one
// links to and is linked from are offered, one click each.
registerComponent('core.seealso', {
  kind: 'core', labelKey: 'pcSeeAlso', once: true,
  options: () => [
    { key: 'links', type: 'links', label: 'pbLinks' },
    { key: 'suggest', type: 'toggle', label: 'pcOptSuggest', default: true },
    { key: 'count', type: 'number', label: 'pcOptCount', min: 1, max: 20, default: 5 },
  ],
  render: (c) => {
    pbWarmWikiIndex();
    const links = pbLinksOf(c);
    const lk = c.page.props?.links || {};
    const out = (lk.outgoing || []).filter((l) => l.key);
    // no links chosen yet: where the page links to, as before §7
    const list = links.length
      ? links.map((l, i) => `<li>${pbLinkHtml(c, ['links', i], l)}</li>`).join('')
      : out.map((l) => `<li><a class="wikilink" data-key="${x(l.key)}" data-no-i18n>${x(l.name)}</a></li>`).join('');
    let sugg = '';
    if (pbArranging(c.page) && pbOpt(c, 'suggest')) {
      const have = new Set(links.map((l) => pbLinkResolve(l).key).filter(Boolean));
      const self = c.page.itemKey || `module_${c.page.moduleId}`;
      const pool = [...(lk.backlinks || []), ...(links.length ? out : [])]
        .filter((l) => l.key && l.key !== self && !have.has(l.key))
        .filter((l, i, a) => a.findIndex((o) => o.key === l.key) === i).slice(0, pbOpt(c, 'count'));
      if (pool.length) sugg = `<div class="pc-sugg"><span class="pc-sugg-k">${t('pcSuggested')}</span>${pool.map((l) =>
        `<button class="btn btn-s btn-sm" onclick="pcSeeAlsoAdd(${xj(c.iid)},${xj(l.key)})">${I.plus} <span data-no-i18n>${x(l.name || l.key)}</span></button>`).join('')}</div>`;
    }
    return `<div class="pc pc-seealso"><div class="pc-head">${t('pcSeeAlso')}</div>${list ? `<ul>${list}</ul>` : pcEmpty(t('pcSeeAlsoEmpty'))}${sugg}</div>`;
  },
});
function pcSeeAlsoAdd(iid, key) {
  const to = /^module_\d+$/.test(key) ? `module:${key.slice(7)}` : `item:${key}`;
  const list = pbLinksRaw(iid, 'links');
  if (list.some((l) => l.to === to)) return;
  list.push({ to });
  return pbOptSet(iid, 'links', list);
}

// ── References: every footnote on the page, numbered as the text is ─────
registerComponent('core.references', {
  kind: 'core', labelKey: 'pcReferences', once: true,
  render: (c) => {
    const f = pbFootnoteCtx(c.page);
    const ids = [...f.order.filter((id) => f.notes.has(id)), ...[...f.notes.keys()].filter((id) => !f.order.includes(id))];
    if (!ids.length) return `<div class="pc pc-refs">${pcEmpty(t('pcReferencesEmpty'))}</div>`;
    return `<div class="pc pc-refs"><div class="pc-head">${t('pcReferences')}</div><ol>${ids.map((id) =>
      `<li data-fn="${x(id)}" value="${Number(f.num(id)) || ''}">${_mdInline(f.notes.get(id), resolveWikiNameCached)}</li>`).join('')}</ol></div>`;
  },
});

// A raised number leads to its note in References, when the page has one.
document.addEventListener('click', (e) => {
  const sup = e.target.closest?.('#main-inner .fn-ref');
  if (!sup) return;
  const li = sup.closest('.page-blocks')?.querySelector(`.pc-refs li[data-fn="${CSS.escape(sup.dataset.fn)}"]`);
  if (!li) return;
  li.scrollIntoView({ behavior: 'smooth', block: 'center' });
  li.classList.remove('flash');
  void li.offsetWidth;
  li.classList.add('flash');
});
