'use strict';
// ═══ Per-kind page components, part 2 (Procress 14, TEMPLATES.md §2.2) ═══
// Wanderer, Designer, Sketcher, Manager, Diviner, Scribe, Drafter.

// ── Wanderer ───────────────────────────────────────────────────────────
// Journey: the pins in the order of their time — where, then what happened.
// A Wanderer's map is its page, so this one is not borrowed (§2.2).
registerFilled('wanderer.journey', { kind: 'wanderer', labelKey: 'pcJourney' }, async (c) => {
  const pins = ((await api.wanderer.list(c.source.id)) || [])
    .sort((a, b) => ((a.s_years ?? 1e9) - (b.s_years ?? 1e9)) || ((a.s_month ?? 0) - (b.s_month ?? 0)) || ((a.s_day ?? 0) - (b.s_day ?? 0)));
  if (!pins.length) return pcEmpty(t('wandererPlaceHint'));
  return `<ol class="pc-journey">${pins.map((p) => `<li${p.event_ref ? ` ${pcOpen(`tlev_${p.event_ref}`)}` : ''}>
    <span class="pc-dot"${p.event_color_code ? ` style="background:${x(p.event_color_code)}"` : ''}></span>
    <span class="pc-li-main">${x(p.label || p.event_name || '—')}</span>
    ${p.event_name && p.label ? `<span class="pc-li-sub">${x(p.event_name)}</span>` : ''}
    <span class="pc-li-side" data-no-i18n>${pcDate(p)}</span></li>`).join('')}</ol>`;
});

// ── Designer ───────────────────────────────────────────────────────────
// Strip: the panels in reading order, as a row of thumbnails.
registerFilled('designer.strip', { kind: 'designer', labelKey: 'pcStrip', borrow: true }, async (c) => {
  const nodes = (await api.designer.getNodes(c.source.id)) || [];
  const ordered = nodes.filter((n) => n.read_order != null).sort((a, b) => a.read_order - b.read_order);
  const list = (ordered.length ? ordered : nodes).slice(0, 24);
  if (!list.length) return pcEmpty(t('pcNoPanels'));
  return `<div class="pc-strip">${list.map((n, i) => `<div class="pc-strip-cell" ${pcOpenModule(c.source.id)}${n.color ? ` style="border-color:${x(n.color)}"` : ''}>
    <span class="pc-strip-no" data-no-i18n>${n.read_order ?? i + 1}</span><span class="pc-strip-text">${x(n.node_text || '')}</span></div>`).join('')}</div>`;
});

// ── Sketcher ───────────────────────────────────────────────────────────
// Featured: one sketch page up front (config.page: its id, else the first).
registerFilled('sketcher.featured', { kind: 'sketcher', labelKey: 'pcFeatured', borrow: true }, async (c) => {
  const pages = (await api.sketcher.getPages(c.source.id)) || [];
  if (!pages.length) return pcEmpty(t('pcNoSketches'));
  const p = pages.find((x2) => x2.id === Number(c.config.page)) || pages[0];
  return `<div class="pc-featured" ${pcOpenModule(c.source.id)}>
    <div class="pc-featured-art">${I.sketcher || ''}</div>
    <div><div class="pc-spot-kicker">${t('pcFeatured')}</div><div class="pc-spot-name">${x(p.name)}</div>
      <div class="pc-li-sub">${pages.length} · ${p.stroke_count || 0}</div></div>
  </div>`;
});

// ── Manager ────────────────────────────────────────────────────────────
// The Manager's selection, the same rows its view shows (mod/manager.js).
async function pcManagerRows(m) {
  if (!MGR.M[m.id]) await loadManagerData(m);
  return MGR.M[m.id]?.rows || [];
}

// Dashboard: a tile per selected module — icon, name, how much it holds.
registerFilled('manager.dashboard', { kind: 'manager', labelKey: 'pcDashboard', once: true }, async (c) => {
  const rows = (await pcManagerRows(c.source)).slice(0, 12);
  if (!rows.length) return pcEmpty(t('managerEmpty'));
  return `<div class="pc-dash">${rows.map((r) => `<div class="pc-dash-tile" role="button" tabindex="0" ${pcOpenModule(r.id)}>
    <span class="kicon" style="color:${x(KIND_COLOR[r.ownKind] || 'var(--accent)')}">${I[KIND_ICON[r.ownKind]] || ''}</span>
    <span class="pc-dash-name">${x(r.name)}</span><span class="pc-dash-n">${managerElementCount(r.id)}</span></div>`).join('')}</div>`;
});

// Recent: what in the project was changed last.
registerFilled('manager.recent', { kind: 'manager', labelKey: 'pcRecent', once: true }, async (c) => {
  const rows = (await pcManagerRows(c.source)).map((r) => ({ r, at: findModuleNode(r.id)?.update_at || '' }))
    .filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);
  if (!rows.length) return pcEmpty(t('managerEmpty'));
  return `<div class="pc-head">${t('pcRecent')}</div><ul class="pc-list">${rows.map(({ r, at }) => `<li ${pcOpenModule(r.id)}>
    <span class="kicon">${I[KIND_ICON[r.ownKind]] || ''}</span><span class="pc-li-main">${x(r.name)}</span>
    <span class="pc-li-side" data-no-i18n>${x(String(at).slice(0, 10))}</span></li>`).join('')}</ul>`;
});

// ── Diviner ────────────────────────────────────────────────────────────
// Quick roll: pick a table, roll, see the last five.
registerFilled('diviner.quickroll', { kind: 'diviner', labelKey: 'pcQuickroll', borrow: true }, async (c) => {
  const tables = (await api.diviner.getTables(c.source.id)) || [];
  if (!tables.length) return pcEmpty(t('divNoEntries'));
  const cur = tables.find((tb) => tb.id === Number(c.state.table)) || tables[0];
  const rolls = (await api.diviner.getRolls(cur.id)) || [];
  return `<div class="pc-roll">
    <div class="pc-roll-bar">
      <select onchange="pcRollPick(${xj(c.iid)},this.value)">${tables.map((tb) => `<option value="${tb.id}"${tb.id === cur.id ? ' selected' : ''}>${x(tb.name)}</option>`).join('')}</select>
      <button class="btn btn-p btn-sm" onclick="pcRollNow(${xj(c.iid)},${cur.id})">${I.plus || ''} ${t('pcRoll')}</button>
    </div>
    <ul class="pc-list">${rolls.slice(0, 5).map((r) => `<li><span class="pc-li-main">${x(r.result_text || r.dice_result || '')}</span></li>`).join('') || `<li class="ghost">${t('pcNoRolls')}</li>`}</ul>
  </div>`;
});
function pcRollPick(iid, tableId) {
  pbState(iid).table = Number(tableId);
  rerenderPageBlocks((inst) => inst === pbInst(iid));
}
async function pcRollNow(iid, tableId) {
  const r = await api.diviner.roll(tableId);
  if (r?.ok) toast(r.text || '—', 'ok');
  rerenderPageBlocks((inst) => inst === pbInst(iid));
}

// ── Scribe ─────────────────────────────────────────────────────────────
// Pinned: messages that start with 📌 — a pin is part of the text, so it
// travels with a copy or an export.
registerFilled('scribe.pinned', { kind: 'scribe', labelKey: 'pcPinned', borrow: true }, async (c) => {
  const sessions = (await api.chatscribe.getSessions(c.source.id)) || [];
  const msgs = (await Promise.all(sessions.map((s) => api.chatscribe.getMessages(s.id)))).flat();
  const pinned = msgs.filter((m) => /^\s*📌/u.test(m.message || '')).slice(-8);
  if (!pinned.length) return pcEmpty(t('pcNoPinned'));
  return `<div class="pc-head">${t('pcPinned')}</div><ul class="pc-list">${pinned.map((m) =>
    `<li><span class="pc-li-main">${x(String(m.message).replace(/^\s*📌\s*/u, ''))}</span></li>`).join('')}</ul>`;
});

// ── Inspector ──────────────────────────────────────────────────────────
// Facts: the note's `key: value` lines as a fact box (config.count: how
// many at most).
registerFilled('inspector.facts', {
  kind: 'inspector', labelKey: 'pcFacts', borrow: true,
  options: () => [{ key: 'count', type: 'number', label: 'pcOptCount', min: 1, max: 30, default: 12 }],
}, async (c) => {
  const m = await api.module.get(c.source.id);
  const facts = pcFactsOf(m?.description, pbOpt(c, 'count') || 12);
  if (!facts.length) return pcEmpty(t('pcNoFacts'));
  return `<dl class="pc-facts">${facts.map((f) => `<dt>${x(f.k)}</dt><dd>${x(f.v)}</dd>`).join('')}</dl>`;
});

// ── Drafter ────────────────────────────────────────────────────────────
// Tasks: every "- [ ]" line in the notes, done ones struck through.
registerFilled('drafter.tasks', { kind: 'drafter', labelKey: 'pcTasks', borrow: true }, async (c) => {
  const m = await api.module.get(c.source.id);
  const lines = String(m?.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '').split('\n');
  const tasks = lines.map((l) => /^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/.exec(l)).filter(Boolean).map((m2) => ({ done: m2[1] !== ' ', text: m2[2] }));
  if (!tasks.length) return pcEmpty(t('pcNoTasks'));
  const open = tasks.filter((k) => !k.done).length;
  return `<div class="pc-head">${t('pcTasks')} · ${open}/${tasks.length}</div><ul class="pc-tasks">${tasks.map((k) =>
    `<li class="${k.done ? 'done' : ''}"><span class="pc-check">${k.done ? '✓' : ''}</span>${x(k.text)}</li>`).join('')}</ul>`;
});
