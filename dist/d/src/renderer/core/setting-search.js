'use strict';
// ═══ Search in the Setting window (Procress 13 part 4, APP docs/REDESIGN.md
// A6 G5) ════════════════════════════════════════════════════════════════
// The Setting window has 13 pages under 4 groups and nothing to search them
// by — you had to know where a setting lived.
//
// The index is built from the page renderers' SOURCE, not by rendering them:
// a page renderer may start an async load when called (Packages fetches the
// catalog over the network, Extensions lists a GitHub org, Versions and Cloud
// Storage call main), so rendering 13 pages on every keystroke — or even
// once — would fire all of that. Instead each renderer, and the setting…Html
// helpers it calls, is read with Function#toString and every literal-key t() call
// in it becomes a searchable label of that page. Labels built from a map
// (t(SOME_KEY[x])) are not seen; the page's own title always is.

let SETTING_SEARCH_INDEX = null;

// A page renderer and the helpers it calls, as source text. Only global
// function declarations are followed (classic scripts put those on window),
// and only ones named like HTML builders, a few levels deep.
function settingSearchSources(fn, seen = new Set(), depth = 0) {
  if (typeof fn !== 'function' || seen.has(fn) || depth > 3) return [];
  seen.add(fn);
  const src = Function.prototype.toString.call(fn);
  const out = [src];
  for (const [, name] of src.matchAll(/\b([A-Za-z_$][\w$]*Html)\s*\(/g)) {
    const next = window[name];
    if (typeof next === 'function') out.push(...settingSearchSources(next, seen, depth + 1));
  }
  return out;
}

function buildSettingSearchIndex() {
  const index = [];
  for (const [group, pages] of Object.entries(SETTING_GROUPS)) {
    for (const host of pages) {
      const keys = new Set([SETTING_PAGE_LABEL_KEY[host]]);
      for (const part of SETTING_PAGE_MERGE[host] || [host]) {
        if (part !== host && SETTING_PAGE_LABEL_KEY[part]) keys.add(SETTING_PAGE_LABEL_KEY[part]);
        for (const src of settingSearchSources(SETTING_PAGE_RENDERERS[`${group}.${part}`])) {
          for (const [, k] of src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'\s*\)/g)) keys.add(k);
        }
      }
      for (const k of keys) if (k) index.push({ group, page: host, key: k });
    }
  }
  return index;
}

// Matches in the UI language, and in English as well — someone who has the
// app in Thai may still think of a setting by its English name.
function settingSearchResults(query) {
  const nq = String(query || '').trim().toLowerCase();
  if (!nq) return [];
  SETTING_SEARCH_INDEX ||= buildSettingSearchIndex();
  const visible = new Set(Object.keys(SETTING_GROUPS).flatMap((g) => settingGroupPages(g).map((p) => `${g}.${p}`)));
  const seen = new Set();
  const hits = [];
  for (const e of SETTING_SEARCH_INDEX) {
    if (!visible.has(`${e.group}.${e.page}`)) continue;
    const label = t(e.key);
    if (!label || label === e.key) continue;
    const en = L.en?.[e.key] || '';
    if (!label.toLowerCase().includes(nq) && !en.toLowerCase().includes(nq)) continue;
    const id = `${e.page}|${label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    hits.push({ ...e, label });
  }
  // Within a page, short labels first: those are the headings ("Theme"),
  // the long ones are hints and tooltips that happen to contain the word.
  return hits.sort((a, b) => (a.group === b.group && a.page === b.page ? a.label.length - b.label.length : 0));
}

function settingSearchResultsHtml(query) {
  const hits = settingSearchResults(query);
  if (!hits.length) return `<div class="empty"><p>${t('settingSearchNone')}</p></div>`;
  const byPage = new Map();
  for (const h of hits) {
    const k = `${h.group}.${h.page}`;
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k).push(h);
  }
  return [...byPage.entries()].slice(0, 12).map(([k, list]) => {
    const [g, p] = k.split('.');
    const rows = list.slice(0, 6).map((h) =>
      `<button type="button" class="btn btn-g setting-hit-row" onclick="openSettingSearchHit('${g}','${p}',${xj(h.label)})">${x(h.label.length > 90 ? `${h.label.slice(0, 90)}…` : h.label)}</button>`).join('');
    return `<div class="setting-hit-group">
      <div class="settings-label" data-no-i18n>${x(t(SETTING_GROUP_LABEL_KEY[g]))} › ${x(t(SETTING_PAGE_LABEL_KEY[p]))}</div>${rows}
    </div>`;
  }).join('');
}

// Typing re-draws only the content column, so the input keeps its focus.
function onSettingSearch(value) {
  S.settingQuery = value;
  const content = q('#setting-window .setting-content');
  if (!content) return;
  content.innerHTML = String(value || '').trim()
    ? settingSearchResultsHtml(value)
    : ((SETTING_PAGE_MERGE[S.settingPage] || [S.settingPage])
      .map((p) => SETTING_PAGE_RENDERERS[`${S.settingGroup}.${p}`]).filter(Boolean)
      .map((fn) => fn()).join('<div class="setting-merge-sep"></div>'));
}

// Open the page, then point at the label: the closest element whose own
// text is the label, scrolled into view and briefly highlighted.
function openSettingSearchHit(group, page, label) {
  S.settingQuery = '';
  selectSettingPage(group, page);
  const content = q('#setting-window .setting-content');
  if (!content) return;
  const el = [...content.querySelectorAll('.settings-label, .settings-label-row span, label, button, span, div')]
    .find((n) => n.children.length === 0 && n.textContent.trim() === label)
    || [...content.querySelectorAll('.settings-label, label, span')].find((n) => n.textContent.includes(label))
    || [...content.querySelectorAll('[title]')].find((n) => n.getAttribute('title') === label); // a tooltip-only label
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('setting-hit');
  setTimeout(() => el.classList.remove('setting-hit'), 1600);
}
