'use strict';
// ═══ The address row (v5 Part 8, APP docs/V5.md §12.10) ═════════════════
// The sticky strip every page opens with, in place of the page navbar's
// sticky title (hub/page-head.js draws it above the title):
//   ◀ ▶      the pane's own history (builderBack / builderForward) — they
//            were on the pane's tab strip before
//   ↑        up one page: an element page to its module. A module's
//            parents are collectors (V5.md §8.8), which have no page, so a
//            module page has nowhere up to go
//   crumbs   the collectors a module sits in, the module, the element.
//            Every segment's ▾ lists its siblings. A COLLECTOR segment is
//            that list and nothing else — clicking it never navigates,
//            because a folder has no page (user decision, Part 8)
//   edit     click the empty part of the row to type: a path's last
//            segment or `@handle`, matched loosely against the vault index;
//            Enter opens the best match
//   acts     the page's own buttons (Arrange, history, plugin panels)
//
// o.addr says which page this is: { moduleId, itemName } for a module or
// element page, { label } for the pages that are neither (a file, the Sage
// Hut). The pane comes from withRenderPane (page/page.js), so a static copy
// of a page in an unfocused pane navigates its own history.

function addrChain(moduleId) {
  const out = [];
  let m = findModuleNode(moduleId);
  const seen = new Set();
  while (m && !seen.has(m.id)) { seen.add(m.id); out.unshift(m); m = m.parent_id != null ? findModuleNode(m.parent_id) : null; }
  return out;
}

function addressRowHtml(addr = {}, acts = '') {
  const pane = builderState().panes[_pbPane];
  const canBack = !!pane && pane.hIdx > 0, canFwd = !!pane && pane.hIdx < pane.history.length - 1;
  const upTo = addr.itemName != null ? addr.moduleId : null;
  const p = _pbPane;
  const nav = `<button class="btn btn-g btn-i bnav" ${canBack ? '' : 'disabled'} onclick="builderFocusPane(${p}).then(builderBack)" title="${t('navBack')}">${I.chevronLeft}</button>
    <button class="btn btn-g btn-i bnav" ${canFwd ? '' : 'disabled'} onclick="builderFocusPane(${p}).then(builderForward)" title="${t('navForward')}">${I.chevronRight}</button>
    <button class="btn btn-g btn-i bnav" ${upTo != null ? `onclick="builderFocusPane(${p}).then(()=>openModuleNode(${upTo}))"` : 'disabled'} title="${t('addrUp')}">${I.chevronUp}</button>`;
  const segs = [];
  if (addr.moduleId != null) {
    const chain = addrChain(addr.moduleId);
    chain.forEach((m, i) => {
      const last = i === chain.length - 1 && addr.itemName == null;
      if (m.kind === 'collector') {
        segs.push(`<span class="addr-seg is-folder" onclick="openAddrMenu(event,${m.id})" data-no-i18n>${x(m.name)}<span class="addr-caret">▾</span></span>`);
      } else {
        segs.push(`<span class="addr-seg${last ? ' cur' : ''}"><span class="addr-name" onclick="builderFocusPane(${p}).then(()=>openModuleNode(${m.id}))" data-no-i18n>${x(m.name)}</span><span class="addr-caret" onclick="openAddrMenu(event,${m.parent_id ?? 'null'},${m.id})">▾</span></span>`);
      }
    });
    if (addr.itemName != null) {
      segs.push(`<span class="addr-seg cur"><span class="addr-name" data-no-i18n>${x(addr.itemName)}</span><span class="addr-caret" onclick="openAddrItemMenu(event,${addr.moduleId})">▾</span></span>`);
    }
  } else if (addr.label) {
    segs.push(`<span class="addr-seg cur" data-no-i18n>${x(addr.label)}</span>`);
  }
  const sep = '<span class="addr-sep">/</span>';
  return `<div class="addr-row">
    <span class="addr-nav">${nav}</span>
    <div class="addr-path" onclick="if(event.target===this)startAddrEdit(this)" title="${x(t('addrEditHint'))}">${segs.join(sep)}</div>
    ${acts ? `<span class="navbar-acts">${acts}</span>` : ''}
  </div>`;
}

// ── dropdowns ───────────────────────────────────────────────────────────
// A collector's children, or a module's siblings. A collector in the list
// opens as a submenu — it has no page to go to.
function addrMenuItems(parentId, curId) {
  const kids = parentId == null ? S.moduleTree : (findModuleNode(parentId)?.children || []);
  return kids.map((m) => (m.kind === 'collector'
    ? { label: m.name, icon: 'folder', sub: addrMenuItems(m.id, curId) }
    : { label: m.name, checked: m.id === curId, onClick: () => openModuleNode(m.id) }));
}
function openAddrMenu(ev, parentId, curId = null) {
  ev.stopPropagation();
  const items = addrMenuItems(parentId, curId);
  if (items.length) ctxMenu(ev, items, { anchor: ev.currentTarget });
}
// An element's siblings: the module's other elements, from the Nest's cache.
function openAddrItemMenu(ev, moduleId) {
  ev.stopPropagation();
  const m = findModuleNode(moduleId);
  const reg = m && ITEM_KIND[m.kind];
  const items = reg && Array.isArray(S.nestItems.get(moduleId)) ? S.nestItems.get(moduleId) : [];
  if (!items.length) return;
  const cur = S.activeItemNode?.id;
  ctxMenu(ev, items.map((it) => ({ label: reg.nameOf(it), checked: it.id === cur, onClick: () => openItemNode(m.kind, moduleId, it.id) })),
    { anchor: ev.currentTarget });
}

// ── typing an address ───────────────────────────────────────────────────
let _addrIndex = null;
async function startAddrEdit(pathEl) {
  const cur = [...pathEl.querySelectorAll('.addr-name, .addr-seg.is-folder, .addr-seg.cur')].map((e) => e.textContent.replace('▾', '').trim()).filter(Boolean);
  pathEl.innerHTML = `<input class="addr-input" value="${x([...new Set(cur)].join(' / '))}" spellcheck="false">
    <div class="addr-sugg" hidden></div>`;
  const inp = pathEl.querySelector('.addr-input');
  inp.focus(); inp.select();
  _addrIndex = S.nexus ? await api.viewer.index(S.nexus.id) : [];
  inp.addEventListener('input', () => paintAddrSuggestions(pathEl));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); renderNexusHome(); }
    if (e.key === 'Enter') { e.preventDefault(); const hit = addrMatches(inp.value)[0]; if (hit) openAddrHit(hit); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) renderNexusHome(); }, 150));
}

// Loose match: every typed character in order. `@x` matches handles only;
// otherwise the last path segment matches names. A prefix match ranks first.
function addrMatches(raw) {
  const text = String(raw || '').trim();
  const handle = text.startsWith('@');
  const needle = (handle ? text.slice(1) : text.split('/').pop()).trim().toLowerCase();
  if (!needle) return [];
  const loose = (hay) => { let i = 0; for (const ch of hay) if (ch === needle[i]) i++; return i === needle.length; };
  const out = [];
  for (const it of _addrIndex || []) {
    const hay = String((handle ? it.handle : it.name) || '').toLowerCase();
    if (!hay || !loose(hay)) continue;
    out.push({ it, rank: hay.startsWith(needle) ? 0 : hay.includes(needle) ? 1 : 2 });
  }
  return out.sort((a, b) => a.rank - b.rank || a.it.name.length - b.it.name.length).slice(0, 12).map((r) => r.it);
}

function paintAddrSuggestions(pathEl) {
  const box = pathEl.querySelector('.addr-sugg');
  const hits = addrMatches(pathEl.querySelector('.addr-input').value);
  box.hidden = !hits.length;
  // Fixed, under the row: the path clips its overflow.
  const r = pathEl.getBoundingClientRect();
  Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, width: `${r.width}px` });
  box.innerHTML = hits.map((it, i) => `<div class="kind-list-item" data-i="${i}">
    <span class="kli-name" data-no-i18n>${x(it.name)}</span>
    <span class="kli-hint" data-no-i18n>${it.handle ? `@${x(it.handle)} · ` : ''}${x(it.moduleName || kindLabel(it.ownKind || it.kind))}</span></div>`).join('');
  box.querySelectorAll('[data-i]').forEach((row) => row.addEventListener('mousedown', (e) => {
    e.preventDefault();
    openAddrHit(hits[Number(row.dataset.i)]);
  }));
}

// A module opens its page; an element with a page opens its page; anything
// else goes where its [[link]] would.
async function openAddrHit(it) {
  const key = String(it.key || '');
  const m = /^module_(\d+)$/.exec(key);
  if (m) { await openModuleNode(Number(m[1])); return; }
  // Any family whose owning kind gives its elements pages (ITEM_KIND with a
  // keyOf) — derived, so a new family is not a second list to keep in step.
  const item = /^([a-z]+)_(\d+)$/.exec(key);
  const owner = it.moduleId != null ? findModuleNode(it.moduleId) : null;
  const reg = owner && ITEM_KIND[owner.kind];
  if (item && reg?.keyOf && reg.keyOf({ id: Number(item[2]) }) === key) { await openItemNode(owner.kind, owner.id, Number(item[2])); return; }
  await openEntityByKey(key);
}
