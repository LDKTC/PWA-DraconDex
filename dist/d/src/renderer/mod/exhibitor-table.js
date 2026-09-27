'use strict';
// ═══ Exhibitor list views (v5 Part 2) ═══════════════════════════════════
// Table · Cards · Board — carried over unchanged from the pre-v5 Viewer
// (mockups 14 / 32 / 33) — and Edges, the old Connector's edge list, now
// with rel_type and direction. Shared state and the relation form live in
// mod/exhibitor.js.

// ── Table view (mockup 14) ──────────────────────────────────────────────
function buildViewerTableHtml(d) {
  const rows = d.items.map(it => `
    <tr onclick="openViewerItem(${xj(it.key)},${it.moduleId})">
      <td><span class="dot" style="background:${x(it.color || 'var(--accent)')}"></span> ${x(it.name)}</td>
      <td>${x(it.moduleName)}</td>
      <td data-no-i18n>${VIEWER_KIND_LABEL[it.kind] || it.kind}</td>
      <td data-no-i18n>${x(viewerTimeText(it))}</td>
      <td>${(it.tags || []).map(tg => `<span class="htag">#${x(tg)}</span>`).join(' ')}</td>
    </tr>`).join('');
  return `<table class="vw-table">
    <thead><tr><th>${t('name')}</th><th data-no-i18n>Module</th><th>${t('moduleKind')}</th><th>${t('timeLabel')}</th><th data-no-i18n>Tags</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Cards view (mockup 32) ──────────────────────────────────────────────
function buildViewerCardsHtml(d) {
  return `<div class="vw-cards">${d.items.map(it => `
    <div class="vw-card" style="border-top:3px solid ${x(it.color || 'var(--accent)')}" onclick="openViewerItem(${xj(it.key)},${it.moduleId})">
      <div class="vw-card-head"><span class="vw-card-name">${x(it.name)}</span>
        <span class="vw-card-kind" data-no-i18n>${VIEWER_KIND_LABEL[it.kind] || it.kind}</span></div>
      <div class="vw-card-src" data-no-i18n>Module: ${x(it.moduleName)}</div>
      ${viewerTimeText(it) ? `<div class="vw-card-time" data-no-i18n>${x(viewerTimeText(it))}</div>` : ''}
      ${(it.tags || []).length ? `<div class="vw-card-tags">${it.tags.map(tg => `<span class="htag">#${x(tg)}</span>`).join(' ')}</div>` : ''}
    </div>`).join('')}</div>`;
}

// ── Board view (mockup 33): grouped columns ─────────────────────────────
function buildViewerBoardHtml(d) {
  const groups = new Map();
  for (const it of d.items) {
    let gk, gl;
    if (d.groupBy === 'kind') { gk = it.kind; gl = VIEWER_KIND_LABEL[it.kind] || it.kind; }
    else if (d.groupBy === 'tag') { gk = (it.tags || [])[0] || '—'; gl = gk === '—' ? '—' : `#${gk}`; }
    else { gk = `m${it.moduleId}`; gl = `${it.moduleName} (${kindLabel(it.moduleKind)})`; }
    if (!groups.has(gk)) groups.set(gk, { label: gl, items: [] });
    groups.get(gk).items.push(it);
  }
  const cols = [...groups.values()].map(g => `
    <div class="vw-col">
      <div class="vw-col-head" data-no-i18n><span>${x(g.label)}</span><span class="cnt">${g.items.length}</span></div>
      ${g.items.map(it => `
        <div class="vw-col-card" style="border-left:3px solid ${x(it.color || 'var(--accent)')}" onclick="openViewerItem(${xj(it.key)},${it.moduleId})">
          <div class="vw-card-name">${x(it.name)}</div>
          <div class="vw-card-src" data-no-i18n>${VIEWER_KIND_LABEL[it.kind] || it.kind}${viewerTimeText(it) ? ` · ${x(viewerTimeText(it))}` : ''}</div>
        </div>`).join('')}
    </div>`).join('');
  return `<div class="vw-board">${cols}</div>
    <div class="drafter-hint">${t('groupBy')}:
      <select class="vw-groupby" onchange="setExhibitorGroupBy(this.value)" data-no-i18n>
        ${['module', 'kind', 'tag'].map(g => `<option value="${g}" ${d.groupBy === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></div>`;
}


// ── Edges view (the old Connector edge list + v5 columns) ───────────────
function buildExhibitorEdgesHtml(d) {
  const keys = new Set(d.items.map(it => it.key));
  const rows = exhibitorEdgesAmong(keys).map(e2 => `
    <tr>
      <td>${x(exhNameOf(e2.from))}</td>
      <td>${e2.wiki ? `<span class="htag" data-no-i18n>[[wiki]]</span>` : x(e2.label || '—')}</td>
      <td>${x(e2.relType || '')}${e2.span ? `<div class="drafter-hint" data-no-i18n>${x(e2.span)}</div>` : ''}</td>
      <td data-no-i18n>${e2.wiki ? '┄' : e2.directed ? '→' : '—'}</td>
      <td>${x(exhNameOf(e2.to))}</td>
      <td>${e2.id ? `<span class="acts">
        <button class="btn btn-g btn-i" onclick="openExhibitorRelationModal(${e2.id})" title="${t('edit')}">${I.edit}</button>
        <button class="btn btn-g btn-i" onclick="deleteExhibitorRelation(${e2.id})" title="${t('delete')}">${I.delete}</button>
      </span>` : ''}</td>
    </tr>`).join('');
  return `<table class="vw-table">
    <thead><tr><th>${t('relFrom')}</th><th>${t('relationLabel')}</th><th>${t('relationType')}</th><th></th><th>${t('relTo')}</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="ghost">—</td></tr>`}</tbody>
  </table>`;
}
