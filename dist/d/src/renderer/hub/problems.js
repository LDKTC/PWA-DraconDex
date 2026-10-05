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
  let html = dropN ? `<div class="prob-row prob-drops"><span class="kicon" aria-hidden="true">${I.import}</span>
      <span class="name">${t('probDrops').replace('{n}', dropN)}<small class="chs-snippet" data-no-i18n>${x(String(drops.at || '').slice(0, 16).replace('T', ' '))}</small></span></div>` : '';
  if (!rows.length && !dropN) html = `<div class="empty"><p>${t('probNone')}</p></div>`;
  for (const type of ['link', 'relation', 'empty']) {
    const list = rows.filter(r => r.type === type);
    if (!list.length) continue;
    html += `<div class="kind-list-head">${t(PROBLEM_TYPE_KEY[type])} <span class="cnt" data-no-i18n>${list.length}</span></div>`
      + list.map(r => `<div class="li prob-row"${r.key ? ` onclick="openEntityByKey(${xj(r.key)})"` : ''}>
          <span class="kicon" aria-hidden="true">${I[PROBLEM_TYPE_ICON[type]]}</span>
          <span class="name" data-no-i18n>${x(r.name)}<small class="chs-snippet">${x(type === 'empty' ? kindLabel(r.detail) : r.detail)}</small></span>
        </div>`).join('');
  }
  // Procress 16 B6: files whose source is gone — was the Import Dock's job.
  // Opening Problems is an explicit check, so stat the files again (a file
  // moved away mid-session) — straight to the list, no re-render loop.
  try { await api.importdock.sweep(S.nexus.id); } catch (_) { /* stale flags at worst */ }
  if (typeof loadImportFiles === 'function') await loadImportFiles();
  const missing = (S.importFiles || []).filter(f => f.missing);
  if (missing.length) {
    if (html.includes('class="empty"')) html = '';
    html += `<div class="kind-list-head">${t('probMissing')} <span class="cnt" data-no-i18n>${missing.length}</span></div>`
      + missing.map(f => `<div class="li prob-row" onclick="relinkImportFile(${f.id})" title="${x(t('assetRelink'))}">
          <span class="kicon" aria-hidden="true">${I.folder || ''}</span><span class="name" data-no-i18n>${x(f.file_name)}<small class="chs-snippet">${x(f.file_path || '')}</small></span>
        </div>`).join('')
      + `<div class="li prob-row" data-cmd="dock.relinkFolder" onclick="runCommand('dock.relinkFolder')"><span class="kicon" aria-hidden="true">${I.folder || ''}</span><span class="name">${t('assetRelinkFolder')}</span></div>`;
  }
  box.innerHTML = html;
}

function openProblemsPanel() {
  S.leftTool = 'problems';
  showLeftDest('tools');
}
