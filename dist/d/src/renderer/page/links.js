'use strict';
// ═══ Page links (Procress 14, APP docs/TEMPLATES.md §7.2) ═══════════════
// Every wiki component (linkbar, linkcard, hatnote, navbox, see also) keeps
// its links in one shape, in config.opts:
//   { to: 'module:12' | 'item:cobj_3' | 'item:cobj_3#bio' | 'anchor:bio'
//         | 'url:https://…' | 'wiki:Name', label, icon, group }
// 'wiki:Name' is a [[Name]] that named nothing when it was typed — it
// resolves by name every time it is drawn, so creating the page later
// mends the link, as a [[wikilink]] does.
//
// Inside the app a link goes through the router; to the web it goes through
// main (block:openUrl), which reads the URL out of the block's STORED config
// by its path — the renderer never hands a URL over. http/https only, when
// saved and again when opened; the domain always shows (no preview, no
// favicon: the CSP fetches nothing).

const PB_LINK_TO = /^(module:\d+|item:[a-z]+_\d+(#[a-z0-9-]{1,40})?|anchor:[a-z0-9-]{1,40}|url:https?:\/\/\S+|wiki:[^\n]{1,120})$/;

const pbWebUrl = (s) => {
  try { const u = new URL(String(s)); return u.protocol === 'http:' || u.protocol === 'https:' ? u : null; } catch (_) { return null; }
};
const pbWikiLoaded = () => typeof _wikiCache !== 'undefined' && _wikiCache !== null;
const pbWikiEntry = (key) => (pbWikiLoaded() ? _wikiCacheList.find((e) => e.key === key) : null);

// → { kind, name, key?, id?, anchor?, host?, dangling }
function pbLinkResolve(l) {
  const to = String(l?.to || '');
  let m;
  if ((m = /^wiki:(.+)$/.exec(to))) {
    const key = typeof resolveWikiNameCached === 'function' ? resolveWikiNameCached(m[1]) : null;
    if (!key) return { kind: 'item', name: m[1], dangling: true, want: m[1] };
    return pbLinkResolve({ to: /^module_\d+$/.test(key) ? `module:${key.slice(7)}` : `item:${key}` });
  }
  if ((m = /^module:(\d+)$/.exec(to))) {
    const node = findModuleNode(Number(m[1]));
    return { kind: 'module', id: Number(m[1]), key: `module_${m[1]}`, name: node?.name || '', dangling: !node, node };
  }
  if ((m = /^item:([a-z]+_\d+)(?:#([a-z0-9-]+))?$/.exec(to))) {
    const e = pbWikiEntry(m[1]);
    // no index yet (first paint) is not "gone": only a loaded index can say so
    return { kind: 'item', key: m[1], anchor: m[2] || null, name: e?.name || '', dangling: pbWikiLoaded() && !e };
  }
  if ((m = /^anchor:([a-z0-9-]+)$/.exec(to))) return { kind: 'anchor', anchor: m[1], name: '' };
  if (to.startsWith('url:')) {
    const u = pbWebUrl(to.slice(4));
    return u ? { kind: 'url', host: u.hostname.replace(/^www\./, ''), name: '' } : { kind: 'bad', name: '', dangling: true };
  }
  return { kind: 'bad', name: '', dangling: true };
}

const pbLinkLabel = (l, r = pbLinkResolve(l)) =>
  String(l?.label || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, n, a) => a || n).trim() || r.name || r.host || (r.anchor ? `#${r.anchor}` : '—');

// The links an option holds, cleaned: a link whose `to` is not one of the
// shapes above is dropped (a newer template's kind, a hand-edited row).
const pbLinksOf = (c, key = 'links') => {
  const v = pbOpt(c, key);
  return (Array.isArray(v) ? v : []).filter((l) => l && typeof l === 'object' && PB_LINK_TO.test(String(l.to || ''))).slice(0, 60);
};

// One link as markup. `path` is where main finds it: [optionKey, index].
function pbLinkHtml(c, path, l, cls = '') {
  const r = pbLinkResolve(l);
  const label = pbLinkLabel(l, r);
  const here = (r.kind === 'module' && r.id === c.page.moduleId && !c.page.itemKey) || (r.kind === 'item' && r.key && r.key === c.page.itemKey);
  const k = ['pb-link', cls, r.dangling ? 'pb-link-dangling' : '', here ? 'on' : '', `pb-link-${r.kind}`].filter(Boolean).join(' ');
  const go = `pbLinkGo(${xj(c.iid)},${xv(path)})`;
  const icon = l.icon ? pbIconHtml(l.icon) : '';
  const ext = r.kind === 'url' ? `<span class="pb-ext" data-no-i18n>${x(r.host)} ↗</span>` : '';
  const title = r.kind === 'url' ? ` title="${x(r.host)}"` : r.dangling ? ` title="${x(t('pbLinkMissing'))}"` : '';
  const data = r.key && !r.dangling ? ` data-key="${x(r.key)}"` : '';
  return `<a class="${k}" role="link" tabindex="0"${data}${title}${here ? ' aria-current="page"' : ''} onclick="${go}"
    onkeydown="if(event.key==='Enter'){event.preventDefault();${go}}">${icon}<span class="pb-link-t" data-no-i18n>${x(label)}</span>${ext}</a>`;
}

// ── follow ──────────────────────────────────────────────────────────────
async function pbLinkGo(iid, path) {
  const b = typeof pbBlockOf === 'function' ? pbBlockOf(iid) : null;
  if (!b) return;
  const c = { block: b, config: b.config || {} };
  const [key, idx] = path;
  const l = pbLinksOf(c, key)[idx];
  if (!l) return;
  const r = pbLinkResolve(l);
  if (r.kind === 'anchor') { if (!pbScrollToAnchor(r.anchor)) toast(t('pbLinkMissing'), 'warn'); return; }
  if (r.kind === 'url') { const ok = await api.block.openUrl(b.id, path); if (!ok) toast(t('pbLinkBadUrl'), 'error'); return; }
  if (r.dangling) { await pbLinkCreate(r.want || pbLinkLabel(l, r)); return; }
  if (r.kind === 'module') { await openModuleNode(r.id); return; }
  if (r.kind === 'item') {
    await openEntityByKey(r.key);
    if (r.anchor) setTimeout(() => pbScrollToAnchor(r.anchor), 250);
  }
}

// A link to a page that is not there offers to make it — a [[wikilink]]'s
// rule (core/router.js bindWikilinkClicks).
async function pbLinkCreate(name) {
  if (!name || !S.nexus) return;
  if (!await uiConfirm(`${t('createNoteFromLink')} "${name}"?`, { danger: false })) return;
  const id = await api.module.create({ nexus_ref: S.nexus.id, parent_id: null, name, kind: 'drafter' });
  await reloadModuleTree();
  if (typeof refreshWikiCache === 'function') await refreshWikiCache();
  await openModuleNode(id);
}

// The index a label or a wiki: link resolves through. Loaded once; a page
// that shows links repaints its link blocks when it arrives.
let _pbWikiWarm = null;
function pbWarmWikiIndex() {
  if (pbWikiLoaded()) return;
  if (_pbWikiWarm || typeof refreshWikiCache !== 'function' || !S.nexus) return;
  _pbWikiWarm = refreshWikiCache().finally(() => {
    _pbWikiWarm = null;
    rerenderPageBlocks((i, b) => /^core\.(linkbar|linkcard|hatnote|navbox|seealso)$/.test(b.component || ''));
  });
}

// ── the `links` option editor (§6.2, in the ⚙ popover) ──────────────────
// One row per link: its label, and where it goes typed the way it reads —
// [[Name]], #anchor, https://… — parsed when it is saved.
function pbLinkInputOf(l) {
  const r = pbLinkResolve(l);
  const to = String(l.to || '');
  if (to.startsWith('wiki:')) return `[[${to.slice(5)}]]`;
  if (r.kind === 'anchor') return `#${r.anchor}`;
  if (r.kind === 'url') return to.slice(4);
  if (r.kind === 'module' || r.kind === 'item') return `[[${r.name || r.key || ''}]]${r.anchor ? `#${r.anchor}` : ''}`;
  return to;
}

// What the user typed → a `to`, or null when it is not a link at all.
function pbLinkParseInput(raw) {
  const s = String(raw || '').trim();
  let m;
  if (!s) return null;
  if ((m = /^#([A-Za-z0-9 _-]{1,40})$/.exec(s))) return `anchor:${pbAnchorClean(m[1])}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^(module|item|anchor|wiki):/.test(s)) {
    const u = pbWebUrl(s);
    return u ? `url:${u.toString()}` : null; // file:, javascript:, data: … refused
  }
  if ((m = /^\[\[([^\]|#]+)(?:\|[^\]]*)?\]\](?:#([A-Za-z0-9_-]{1,40}))?$/.exec(s)) || (m = /^([^[\]#:]{1,120})$/.exec(s))) {
    const name = m[1].trim();
    const key = typeof resolveWikiNameCached === 'function' ? resolveWikiNameCached(name) : null;
    if (!key) return `wiki:${name}`;
    if (/^module_\d+$/.test(key)) return `module:${key.slice(7)}`;
    return `item:${key}${m[2] ? `#${pbAnchorClean(m[2])}` : ''}`;
  }
  return PB_LINK_TO.test(s) ? s : null;
}

function pbLinksEditorHtml(iid, d, v) {
  pbWarmWikiIndex();
  const list = Array.isArray(v) ? v : [];
  const k = xj(d.key);
  const rows = list.map((l, i) => `<div class="pb-le-row">
      <input type="text" value="${x(l.label || '')}" placeholder="${x(t('pbLinkLabel'))}" maxlength="80" aria-label="${x(t('pbLinkLabel'))}"
        onchange="pbLinkEdit(${xj(iid)},${k},${i},{label:this.value})">
      <input type="text" value="${x(pbLinkInputOf(l))}" placeholder="[[…]] · #… · https://" maxlength="400" aria-label="${x(t('pbLinkTo'))}" data-no-i18n
        onchange="pbLinkEdit(${xj(iid)},${k},${i},{to:this.value})">
      ${d.grouped ? `<input type="text" value="${x(l.group || '')}" placeholder="${x(t('pbLinkGroup'))}" maxlength="40" aria-label="${x(t('pbLinkGroup'))}"
        onchange="pbLinkEdit(${xj(iid)},${k},${i},{group:this.value})">` : ''}
      <span class="pb-le-acts">
        <button class="btn btn-g btn-i" onclick="pbLinkMove(${xj(iid)},${k},${i},-1)" title="${t('pbLinkUp')}"${i ? '' : ' disabled'}>▲</button>
        <button class="btn btn-g btn-i" onclick="pbLinkMove(${xj(iid)},${k},${i},1)" title="${t('pbLinkDown')}"${i < list.length - 1 ? '' : ' disabled'}>▼</button>
        <button class="btn btn-g btn-i" onclick="pbLinkMove(${xj(iid)},${k},${i},0)" title="${t('delete')}">${I.close}</button>
      </span></div>`).join('');
  return `<div class="pb-le">${rows}
    <div class="pb-le-row pb-le-new"><input type="text" placeholder="${x(t('pbLinkAddPh'))}" maxlength="400" data-no-i18n aria-label="${x(t('pbLinkAdd'))}"
      onkeydown="if(event.key==='Enter'){event.preventDefault();pbLinkAdd(${xj(iid)},${k},this.value)}">
      <button class="btn btn-s btn-sm" onclick="pbLinkAdd(${xj(iid)},${k},this.previousElementSibling.value)">${I.plus}</button></div>
    <p class="drafter-hint">${t('pbLinkHint')}</p></div>`;
}

const pbLinksRaw = (iid, key) => {
  const b = pbBlockOf(iid);
  const v = b ? pbOpt({ block: b, config: b.config || {} }, key) : null;
  return (Array.isArray(v) ? v : []).map((l) => ({ ...l }));
};

function pbLinkAdd(iid, key, raw) {
  const to = pbLinkParseInput(raw);
  if (!to) { toast(t('pbLinkBadUrl'), 'error'); return; }
  const list = pbLinksRaw(iid, key);
  if (list.length >= 60) return;
  const label = /^\[\[|^#|^https?:/i.test(String(raw).trim()) ? '' : String(raw).trim();
  list.push(to.startsWith('wiki:') || label === '' ? { to } : { to, label });
  return pbOptSet(iid, key, list);
}

function pbLinkEdit(iid, key, i, patch) {
  const list = pbLinksRaw(iid, key);
  if (!list[i]) return;
  if ('to' in patch) {
    const to = pbLinkParseInput(patch.to);
    if (!to) { toast(t('pbLinkBadUrl'), 'error'); pbPopRender(); return; }
    list[i].to = to;
  }
  for (const f of ['label', 'group']) if (f in patch) { const v = String(patch[f]).trim().slice(0, f === 'label' ? 80 : 40); if (v) list[i][f] = v; else delete list[i][f]; }
  return pbOptSet(iid, key, list);
}

function pbLinkMove(iid, key, i, dir) {
  const list = pbLinksRaw(iid, key);
  if (!list[i]) return;
  if (dir === 0) list.splice(i, 1);
  else {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  }
  return pbOptSet(iid, key, list.length ? list : null);
}

// ── what a page is, in a few lines (link cards, hover previews) ─────────
const _pbSummary = new Map(); // key → Promise<summary|null>, per session
function pbEntitySummary(key) {
  if (!key) return Promise.resolve(null);
  if (_pbSummary.has(key)) return _pbSummary.get(key);
  const p = (async () => {
    const path = await api.wiki.entityPath(key);
    if (!path?.moduleId) return null;
    const m = findModuleNode(path.moduleId);
    const itemKey = path.kind === 'module' ? null : key;
    const props = await api.module.getProps(path.moduleId, itemKey);
    let lay = null;
    try { lay = JSON.parse(props?.ui?.[itemKey ? `pageHead:${itemKey}` : 'pageHead'] || 'null'); } catch (_) {}
    const fields = (props?.props || []).filter((pr) => String(pr.content ?? '').trim()).slice(0, 2)
      .map((pr) => ({ name: pr.prop_name, value: String(pr.content).slice(0, 80) }));
    const e = pbWikiEntry(key);
    const first = String((itemKey ? '' : m?.description) || '').split('\n').find((ln) => ln.trim()) || '';
    return { name: e?.name || m?.name || key, kindLabel: m ? kindLabel(m.kind) : '', cover: /^([a-f0-9]{64}|file_\d+)$/.test(lay?.cover || '') ? lay.cover : null,
      icon: lay?.icon || null, fields, first: first.replace(/[#*_`>[\]]/g, '').slice(0, 160) };
  })().catch(() => null);
  _pbSummary.set(key, p);
  setTimeout(() => _pbSummary.delete(key), 60000);
  return p;
}

function pbSummaryHtml(s, cls = 'pb-sum') {
  if (!s) return '';
  return `<div class="${cls}">${s.cover ? `<div class="ph-cover pb-sum-cover" data-cover-sha="${x(s.cover)}"></div>` : ''}
    <div class="pb-sum-body"><div class="pb-sum-name" data-no-i18n>${s.icon ? `${x(s.icon)} ` : ''}${x(s.name)}</div>
    ${s.kindLabel ? `<div class="pb-sum-kind">${x(s.kindLabel)}</div>` : ''}
    ${s.fields.map((f) => `<div class="pb-sum-f"><span data-no-i18n>${x(f.name)}</span><b data-no-i18n>${x(f.value)}</b></div>`).join('')}
    ${s.first ? `<div class="pb-sum-first" data-no-i18n>${x(s.first)}</div>` : ''}</div></div>`;
}

// ── hover preview (§7.3) ────────────────────────────────────────────────
// A [[link]] or a page link held for 400 ms shows what it leads to. Off in
// Settings → Workspace → Pages (S.settings.linkPreview).
let _pbHover = null; // { el, timer, hide }
function pbHoverCard() {
  let el = q('#pb-hover');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pb-hover';
    el.className = 'pb-hover';
    el.setAttribute('role', 'tooltip');
    el.addEventListener('mouseenter', () => clearTimeout(_pbHover?.hide));
    el.addEventListener('mouseleave', () => pbHoverHide());
    document.body.appendChild(el);
  }
  return el;
}
function pbHoverHide(now = false) {
  if (!_pbHover) return;
  clearTimeout(_pbHover.timer);
  clearTimeout(_pbHover.hide);
  const go = () => { q('#pb-hover')?.classList.remove('on'); _pbHover = null; };
  if (now) go(); else _pbHover.hide = setTimeout(go, 160);
}
function pbHoverAt(el, html) {
  const card = pbHoverCard();
  card.innerHTML = html;
  const r = el.getBoundingClientRect();
  card.classList.add('on');
  const w = card.offsetWidth, h = card.offsetHeight;
  const below = r.bottom + 8 + h < window.innerHeight;
  card.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
  card.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  if (typeof watchPageCovers === 'function') watchPageCovers();
}
document.addEventListener('mouseover', (e) => {
  if (S.settings?.linkPreview === false) return;
  const el = e.target.closest?.('#main-inner .wikilink[data-key], #main-inner .pb-link[data-key], #main-inner .fn-ref');
  if (!el || _pbHover?.el === el) return;
  pbHoverHide(true);
  const state = { el };
  _pbHover = state;
  state.timer = setTimeout(async () => {
    if (_pbHover !== state) return;
    if (el.classList.contains('fn-ref')) {
      const note = el.dataset.note;
      pbHoverAt(el, `<div class="pb-sum"><div class="pb-sum-body"><div class="pb-fn-note">${note ? _mdInline(note, resolveWikiNameCached) : x(t('pbFootnoteMissing'))}</div></div></div>`);
      return;
    }
    const s = await pbEntitySummary(el.dataset.key);
    if (_pbHover === state && s) pbHoverAt(el, pbSummaryHtml(s));
  }, 400);
  el.addEventListener('mouseleave', () => { if (_pbHover === state) pbHoverHide(); }, { once: true });
});
document.addEventListener('pointerdown', () => pbHoverHide(true), true);
