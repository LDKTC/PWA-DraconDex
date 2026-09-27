'use strict';
// ═══ VERSION HISTORY PANEL (progress.md Phase 21) ══════════════════════
// Opens in the side panel (v5 Part 8, page/side-panel.js) (mockup 26):
// `v{seq} — {action}` rows with a detail line, relative time, the latest
// tagged as current, and ↩ Restore per row. Restore re-applies the
// recorded before-state through db/versions.js and lands as a NEW
// version — history is never overwritten. Retention (default 50/module)
// is a Settings number input (Phase 22) stored in app_setting.

// Action code -> localized label (codes are stored in the DB; labels
// resolve at render time so history follows the UI language).
const VERSION_ACTION_KEY = {
  attr: 'vActAttr', attrDel: 'vActAttrDel', object: 'vActObject',
  objectDel: 'vActObjectDel', objectEdit: 'vActObjectEdit',
  template: 'vActTemplate', note: 'vActNote', tags: 'vActTags',
  chapter: 'vActChapter', chapterName: 'vActChapterName', restore: 'vActRestore',
  block: 'vActBlock', blockDel: 'vActBlockDel',
};
const versionActionLabel = (a) => t(VERSION_ACTION_KEY[a] || '') || a;

function versionRelTime(createAt) {
  const dt = new Date(String(createAt).replace(' ', 'T') + 'Z');
  if (isNaN(dt)) return '';
  const mins = Math.max(0, Math.round((Date.now() - dt.getTime()) / 60000));
  if (mins < 60) return `${mins} ${t('vMinAgo')}`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} ${t('vHourAgo')}`;
  return dt.toLocaleDateString();
}

// v5 Part 8 (§12.8): opens in the side panel (page/side-panel.js), which
// follows the page — switching modules shows the new module's history.
async function openVersionPanel(moduleId) {
  const [rows, limitRaw] = await Promise.all([
    api.versions.list(moduleId),
    api.setting.get('versionLimit'),
  ]);
  const limit = Number(limitRaw) >= 1 ? Number(limitRaw) : 50;
  openSidePanel({ kind: 'versions', moduleId, rows, limit });
}

function toggleVersionPanel(moduleId) {
  if (sidePanelOpen('versions')) closeSidePanel(); else openVersionPanel(moduleId);
}

const closeVersionPanel = () => closeSidePanel();

function buildVersionListHtml(d) {
  const rows = d.rows.map((v, i) => `
    <div class="vh-row${i === 0 ? ' vh-latest' : ''}">
      <div class="vh-head">
        <span class="vh-title" data-no-i18n>v${v.seq} — ${x(versionActionLabel(v.action))}</span>
        ${i === 0 ? `<span class="vh-current">${t('vCurrent')}</span>`
          : `<button class="btn btn-s btn-sm" onclick="restoreVersionRow(${v.id})" data-no-i18n>↩ Restore</button>`}
      </div>
      ${v.detail ? `<div class="vh-detail" data-no-i18n>${x(v.detail)}</div>` : ''}
      <div class="vh-time" data-no-i18n>${x(versionRelTime(v.create_at))}</div>
    </div>`).join('');
  return `<div class="vh-list">${rows || `<div class="empty" style="padding:24px 10px"><p>${t('vEmpty')}</p></div>`}</div>
    <div class="vh-foot">${t('vFootNote')}</div>`;
}

async function restoreVersionRow(id) {
  const d = S.side;
  if (d?.kind !== 'versions') return;
  const res = await api.versions.restore(id);
  if (!res?.ok) { toast(t('vRestoreFailed'), 'error'); return; }
  toast(t('vRestored'), 'ok');
  // reload module data + refreshed history
  await openModuleNode(d.moduleId);
  await openVersionPanel(d.moduleId);
}
