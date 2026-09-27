'use strict';
// ═══ Problems panel (v5 Part 7, APP docs/V5.md §11.10) ═══════════════════
// Shown inside the Activity Bar's Tools destination (hub/activity.js). The
// list comes from db/problems.js; the one thing only this renderer knows —
// what the last import / pull could not bring across (S.lastImportDrops,
// set by toastSnapshotResult) — heads the list. Every row opens its place.

const PROBLEM_TYPE_KEY = { link: 'probLink', empty: 'probEmpty', relation: 'probRelation' };
const PROBLEM_TYPE_ICON = { link: 'relation', empty: 'folder', relation: 'delete' };

function problemsPanelHtml() {
  return leftPanelHead(t('probTitle'), `
      <button class="btn btn-g btn-i" onclick="loadProblemsPanel()" title="${t('probRefresh')}">${I.return}</button>
      <button class="btn btn-g btn-i" onclick="closeProblemsPanel()" title="${t('guideBack')}">${I.close}</button>`)
    + `<div class="left-dest-body" id="left-problems"><p class="drafter-hint">${t('syncWorking')}</p></div>`;
}

function closeProblemsPanel() {
  S.leftTool = null;
  renderLeftPanel();
}

async function loadProblemsPanel() {
  const box = q('#left-problems');
  if (!box || !S.nexus) return;
  const rows = await api.tools.problems(S.nexus.id);
  const drops = S.lastImportDrops;
  const dropN = drops ? (drops.relations || 0) + (drops.pins || 0) : 0;
  let html = dropN ? `<div class="prob-row prob-drops"><span class="kicon">${I.import}</span>
      <span class="name">${t('probDrops').replace('{n}', dropN)}<small class="chs-snippet" data-no-i18n>${x(String(drops.at || '').slice(0, 16).replace('T', ' '))}</small></span></div>` : '';
  if (!rows.length && !dropN) html = `<div class="empty"><p>${t('probNone')}</p></div>`;
  for (const type of ['link', 'relation', 'empty']) {
    const list = rows.filter(r => r.type === type);
    if (!list.length) continue;
    html += `<div class="kind-list-head">${t(PROBLEM_TYPE_KEY[type])} <span class="cnt" data-no-i18n>${list.length}</span></div>`
      + list.map(r => `<div class="li prob-row"${r.key ? ` onclick="openEntityByKey(${x(xj(r.key))})"` : ''}>
          <span class="kicon">${I[PROBLEM_TYPE_ICON[type]]}</span>
          <span class="name" data-no-i18n>${x(r.name)}<small class="chs-snippet">${x(type === 'empty' ? kindLabel(r.detail) : r.detail)}</small></span>
        </div>`).join('');
  }
  box.innerHTML = html;
}

function openProblemsPanel() {
  S.leftTool = 'problems';
  showLeftDest('tools');
}
