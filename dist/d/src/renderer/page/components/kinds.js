'use strict';
// ═══ Per-kind page components, part 1 (Procress 14, TEMPLATES.md §2.2) ═══
// Classifier, Chronicler, Locator, Author, Narrator, Exhibitor. Each reads
// its source module (the page's own, or a borrowed one) through api.* and
// can be borrowed onto another page.

// ── Classifier ─────────────────────────────────────────────────────────
// Spotlight: one element in large — a different one each day.
registerFilled('classifier.spotlight', { kind: 'classifier', labelKey: 'pcSpotlight', borrow: true }, async (c) => {
  const { objects = [], templates = [] } = (await api.classifier.getObjectsFull(c.source.id)) || {};
  if (!objects.length) return pcEmpty(t('pcNoElements'));
  const day = Math.floor(Date.now() / 86400000);
  const o = objects[day % objects.length];
  const facts = templates.filter((tp) => tp.attribute_type !== 'relation' && (o.attrMap?.[tp.id] ?? '') !== '').slice(0, 3);
  return `<div class="pc-spotlight" ${pcOpen(`cobj_${o.id}`)}>
    <div class="pc-avatar pc-avatar-lg"${o.color_code ? ` style="background:${x(o.color_code)}"` : ''}>${x((o.name || '?').slice(0, 1))}</div>
    <div class="pc-spot-body"><div class="pc-spot-kicker">${t('pcSpotlight')}</div><div class="pc-spot-name">${x(o.name)}</div>
      ${facts.map((tp) => `<div class="pc-spot-fact"><span>${x(tp.description)}</span> ${x(o.attrMap[tp.id])}</div>`).join('')}</div>
  </div>`;
});

// Roster: every element as a portrait.
registerFilled('classifier.roster', { kind: 'classifier', labelKey: 'pcRoster', borrow: true }, async (c) => {
  const { objects = [] } = (await api.classifier.getObjectsFull(c.source.id)) || {};
  if (!objects.length) return pcEmpty(t('pcNoElements'));
  return `<div class="pc-roster">${objects.slice(0, 60).map((o) => `<div class="pc-roster-card" role="button" tabindex="0" ${pcOpen(`cobj_${o.id}`)}>
    <span class="pc-avatar"${o.color_code ? ` style="background:${x(o.color_code)}"` : ''}>${x((o.name || '?').slice(0, 1))}</span>
    <span class="pc-roster-name">${x(o.name)}</span></div>`).join('')}</div>`;
});

// Breakdown: how many elements per value of one field (config.field, by key).
registerFilled('classifier.breakdown', {
  kind: 'classifier', labelKey: 'pcBreakdown', borrow: true,
  options: () => [{ key: 'field', type: 'fields', single: true, label: 'pcOptField' }],
}, async (c) => {
  const { objects = [], templates = [] } = (await api.classifier.getObjectsFull(c.source.id)) || {};
  const field = pbOpt(c, 'field');
  const tp = (field && pcFindField(templates, field))
    || templates.find((x2) => x2.attribute_type === 'select') || templates.find((x2) => x2.attribute_type !== 'relation');
  if (!tp || !objects.length) return pcEmpty(t('pcBreakdownEmpty'));
  const counts = new Map();
  for (const o of objects) {
    const v = String(o.attrMap?.[tp.id] ?? '').trim() || t('pcNoValue');
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, n]) => ({ label, n }));
  return `<div class="pc-head">${x(tp.description)}</div>${pcBarsHtml(rows)}`;
});

// ── Chronicler ─────────────────────────────────────────────────────────
async function pcEvents(moduleId) {
  const lines = (await api.timeline.getModuleTimelines(moduleId)) || [];
  const all = (await Promise.all(lines.map((l) => api.timeline.getEvents(l.id)))).flat();
  return all.filter((e) => e.s_years != null).sort((a, b) => (a.s_years - b.s_years) || (a.s_month - b.s_month) || (a.s_day - b.s_day));
}

// Eras: the timeline split into up to six spans, with how much happens in each.
registerFilled('chronicler.eras', { kind: 'chronicler', labelKey: 'pcEras', borrow: true }, async (c) => {
  const evs = await pcEvents(c.source.id);
  if (!evs.length) return pcEmpty(t('noEventsYet'));
  const first = evs[0].s_years, last = evs[evs.length - 1].s_years;
  const n = Math.min(6, Math.max(1, last - first + 1));
  const span = Math.max(1, Math.ceil((last - first + 1) / n));
  const eras = Array.from({ length: n }, (_, i) => ({ from: first + i * span, to: Math.min(last, first + (i + 1) * span - 1), evs: [] }));
  for (const e of evs) eras[Math.min(n - 1, Math.floor((e.s_years - first) / span))].evs.push(e);
  // Each era reads as its span and the first thing that happens in it.
  return `<div class="pc-eras">${eras.map((e) => `<div class="pc-era" style="flex:${Math.max(1, e.evs.length)}"${e.evs[0] ? ` ${pcOpen(`tlev_${e.evs[0].id}`)}` : ''}>
    <span class="pc-era-range" data-no-i18n>${e.from === e.to ? e.from : `${e.from}–${e.to}`}</span>
    <span class="pc-era-n">${e.evs[0] ? x(e.evs[0].event_name) : '—'}${e.evs.length > 1 ? ` <span class="pc-era-more">+${e.evs.length - 1}</span>` : ''}</span></div>`).join('')}</div>`;
});

// Upcoming: the next events from a point in the story (config.from: a year),
// or the first ones.
registerFilled('chronicler.upcoming', {
  kind: 'chronicler', labelKey: 'pcUpcoming', borrow: true,
  options: () => [{ key: 'from', type: 'number', label: 'pcOptFrom' }],
}, async (c) => {
  const evs = await pcEvents(c.source.id);
  const from = pbOpt(c, 'from');
  const list = (typeof from === 'number' ? evs.filter((e) => e.s_years >= from) : evs).slice(0, 5);
  if (!list.length) return pcEmpty(t('noEventsYet'));
  return `<div class="pc-head">${t('pcUpcoming')}</div><ul class="pc-list">${list.map((e) => `<li ${pcOpen(`tlev_${e.id}`)}>
    <span class="pc-dot"${e.color_code ? ` style="background:${x(e.color_code)}"` : ''}></span><span class="pc-li-main">${x(e.event_name)}</span>
    <span class="pc-li-side" data-no-i18n>${pcDate(e)}</span></li>`).join('')}</ul>`;
});

// ── Locator ────────────────────────────────────────────────────────────
// Pin list: the map's areas, each opening the map.
registerFilled('locator.pinlist', { kind: 'locator', labelKey: 'pcPinlist', borrow: true }, async (c) => {
  const map = await api.map.getModuleMap(c.source.id);
  const areas = map ? ((await api.map.getAreas(map.id)) || []) : [];
  if (!areas.length) return pcEmpty(t('mapNoAreas'));
  return `<ul class="pc-list">${areas.map((a) => `<li ${pcOpenModule(c.source.id)}>
    <span class="pc-dot"${a.color_code ? ` style="background:${x(a.color_code)}"` : ''}></span><span class="pc-li-main">${x(a.area_name || '—')}</span></li>`).join('')}</ul>`;
});

// Place card: one area of the map — its outline among its neighbours', its
// name, where it comes from and what it borders. Which area: config.area
// by name, else the one named like this page, else the first.
registerFilled('locator.placecard', {
  kind: 'locator', labelKey: 'pcPlacecard', borrow: true,
  options: () => [{ key: 'area', type: 'text', label: 'pcOptArea', max: 80 }],
}, async (c) => {
  const map = await api.map.getModuleMap(c.source.id);
  const rows = map ? ((await api.map.getAreas(map.id)) || []) : [];
  if (!rows.length) return pcEmpty(t('mapNoAreas'));
  const pts = await Promise.all(rows.map((a) => api.map.getPoints(a.id)));
  const areas = rows.map((a, i) => ({ ...a, points: pts[i] || [] }));
  const here = c.itemKey ? S.activeItemNode?.item?.name : findModuleNode(c.page.moduleId)?.name;
  const area = pcPickArea(areas, pbOpt(c, 'area') || here);
  const { view, borders } = pcPlaceGeom(areas, area);
  const hex = (v) => (/^#[0-9a-f]{3,8}$/i.test(v || '') ? v : null);
  const poly = (a) => a.points.length < 3 ? '' : `<polygon points="${a.points.map((p) => `${Number(p.x)},${Number(p.y)}`).join(' ')}" class="${a.id === area.id ? 'on' : ''}"${a.id === area.id && hex(a.color_code) ? ` style="fill:${hex(a.color_code)};stroke:${hex(a.color_code)}"` : ''}/>`;
  const mini = view ? `<svg class="pc-place-map" viewBox="${view.join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${areas.filter((a) => a.id !== area.id).map(poly).join('')}${poly(area)}</svg>` : '';
  return `<div class="pc-place${mini ? '' : ' no-map'}" ${pcOpenModule(c.source.id)}>${mini}
    <div class="pc-place-info"><div class="pc-ib-title">${x(area.area_name || '—')}</div>
      <div class="pc-place-from">↪ ${x(c.source.name || '')}</div>
      ${borders.length ? `<div class="pc-ib-row"><span class="pc-ib-k">${t('pcBorders')}</span><span class="pc-ib-v pc-place-chips">${borders.map((b) => `<span class="pc-chip">${x(b.area_name || '—')}</span>`).join('')}</span></div>` : ''}
    </div></div>`;
});

// ── Author ─────────────────────────────────────────────────────────────
// Progress: words so far, per chapter and in all (config.goal: a target).
registerFilled('author.progress', {
  kind: 'author', labelKey: 'pcProgress', borrow: true,
  options: () => [{ key: 'goal', type: 'number', label: 'pcOptGoal', min: 0, max: 10000000 }],
}, async (c) => {
  const chs = (await api.author.getChapters(c.source.id)) || [];
  if (!chs.length) return pcEmpty(t('pcNoChapters'));
  const rows = chs.map((ch) => ({ label: ch.chapter_label ? `${ch.chapter_label} · ${ch.name}` : ch.name, n: pcWords(ch.chapter_content) }));
  const total = rows.reduce((s, r) => s + r.n, 0);
  const goal = pbOpt(c, 'goal') || 0;
  return `<div class="pc-progress-top"><span class="pc-stat-v">${total.toLocaleString()}</span> <span class="pc-stat-k">${t('pcWords')}</span>
    ${goal ? `<span class="pc-goal">${Math.min(100, Math.round((total / goal) * 100))}% · ${goal.toLocaleString()}</span>` : ''}</div>${pcBarsHtml(rows)}`;
});

// Chapters: the contents, each chapter with its status stamp.
registerFilled('author.chapters', { kind: 'author', labelKey: 'pcChapters', borrow: true }, async (c) => {
  const chs = (await api.author.getChapters(c.source.id)) || [];
  if (!chs.length) return pcEmpty(t('pcNoChapters'));
  return `<ol class="pc-chapters">${chs.map((ch) => `<li ${pcOpen(`bchp_${ch.id}`)}>
    <span class="pc-li-main">${ch.chapter_label ? `<span class="pc-ch-label" data-no-i18n>${x(ch.chapter_label)}</span> ` : ''}${x(ch.name)}</span>
    ${ch.status ? `<span class="pc-stamp" data-status="${x(ch.status)}">${AUTHOR_STATUS_KEY[ch.status] ? t(AUTHOR_STATUS_KEY[ch.status]) : x(ch.status)}</span>` : ''}</li>`).join('')}</ol>`;
});

// ── Narrator ───────────────────────────────────────────────────────────
// Endings: the scenes no route leaves.
registerFilled('narrator.endings', { kind: 'narrator', labelKey: 'pcEndings', borrow: true }, async (c) => {
  const [ds, es] = await Promise.all([api.narrator.getDialogues(c.source.id), api.narrator.getEdges(c.source.id)]);
  const from = new Set((es || []).map((e) => e.from_ref));
  const ends = (ds || []).filter((d) => !from.has(d.id));
  if (!ends.length) return pcEmpty(t('pcNoEndings'));
  return `<div class="pc-head">${t('pcEndings')}</div><ul class="pc-list">${ends.map((d) => `<li ${pcOpen(`sdlg_${d.id}`)}>
    <span class="pc-dot"${d.color_code ? ` style="background:${x(d.color_code)}"` : ''}></span><span class="pc-li-main">${x(d.name)}</span></li>`).join('')}</ul>`;
});

// Variables: the story's variables and where they start.
registerFilled('narrator.variables', { kind: 'narrator', labelKey: 'pcVariables', borrow: true }, async () => {
  const vars = (await api.narrator.variables(S.nexus.id)) || [];
  if (!vars.length) return pcEmpty(t('pcNoVariables'));
  return `<div class="pc-head">${t('pcVariables')}</div><div class="pc-vars">${vars.slice(0, 30).map((v) => `<div class="pc-var" ${pcOpen(v.key)}>
    <span class="pc-var-name">${x(v.name)}</span><code data-no-i18n>${x(String(v.initial ?? ''))}</code></div>`).join('')}</div>`;
});

// ── Exhibitor ──────────────────────────────────────────────────────────
async function pcRelations() {
  const [rels, index] = await Promise.all([api.viewer.getRelations(S.nexus.id), api.viewer.index(S.nexus.id)]);
  const name = new Map((index || []).filter((r) => r.key).map((r) => [r.key, r.name]));
  return { rels: rels || [], name };
}

// Focus: one element and what it is tied to (config.center: a key, or the
// most connected one).
registerFilled('exhibitor.focus', { kind: 'exhibitor', labelKey: 'pcFocus', borrow: true }, async (c) => {
  const { rels, name } = await pcRelations();
  if (!rels.length) return pcEmpty(t('pcNoRelations'));
  const deg = new Map();
  for (const r of rels) for (const k of [r.from_key, r.to_key]) deg.set(k, (deg.get(k) || 0) + 1);
  const center = c.config.center && deg.has(c.config.center) ? c.config.center : [...deg].sort((a, b) => b[1] - a[1])[0][0];
  const ties = rels.filter((r) => r.from_key === center || r.to_key === center).slice(0, 16);
  return `<div class="pc-focus"><div class="pc-focus-center" ${pcOpen(center)}>${x(name.get(center) || center)}</div>
    <ul class="pc-list">${ties.map((r) => {
      const other = r.from_key === center ? r.to_key : r.from_key;
      return `<li ${pcOpen(other)}><span class="pc-dot"${r.color_code ? ` style="background:${x(r.color_code)}"` : ''}></span>
        <span class="pc-li-main">${x(name.get(other) || other)}</span><span class="pc-li-side">${x(r.label || '')}</span></li>`;
    }).join('')}</ul></div>`;
});

// Legend: the kinds of tie, their colour and how many.
registerFilled('exhibitor.legend', { kind: 'exhibitor', labelKey: 'pcLegend', borrow: true }, async () => {
  const { rels } = await pcRelations();
  if (!rels.length) return pcEmpty(t('pcNoRelations'));
  const by = new Map();
  for (const r of rels) {
    const k = r.label || t('pcUnlabelled');
    const e = by.get(k) || { label: k, n: 0, color: r.color_code };
    e.n++;
    by.set(k, e);
  }
  return `<div class="pc-head">${t('pcLegend')}</div>${pcBarsHtml([...by.values()].sort((a, b) => b.n - a.n).slice(0, 12))}`;
});
