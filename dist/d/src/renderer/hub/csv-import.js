'use strict';
// ═══ CSV → Classifier (v5 Part 7, APP docs/V5.md §11.10) ═════════════════
// Pick → preview → create. main reads and decodes the file and guesses each
// column's type (db/csv-import.js); this preview lets every guess be
// changed — or a column left out — before anything is written. The
// Classifier is then made in one transaction through bundle:create
// (folder:false: just the one module, at the top of the Nest).

const CSV_TYPES = ['text', 'textarea', 'number', 'date', 'checkbox', 'skip'];
let _csv = null; // { name, header, rows, types, encoding }

async function openCsvImport() {
  if (!S.nexus) return;
  const r = await api.tools.csvPick();
  if (r?.canceled) return;
  if (!r?.ok) { toast(t(r?.code === 'too_large' ? 'nexusZipTooLarge' : r?.code === 'empty' ? 'csvEmpty' : 'driveErrServer'), 'err'); return; }
  _csv = r;
  const typeSel = (i) => i === 0 ? `<span class="drafter-hint">${t('csvNameColumn')}</span>`
    : `<select data-csv-type="${i}">${CSV_TYPES.map(ty => `<option value="${ty}"${r.types[i] === ty ? ' selected' : ''}>${ty === 'skip' ? t('csvSkip') : t(CLASSIFIER_DISPTYPE_KEY[ty])}</option>`).join('')}</select>`;
  openModal(t('csvImport'), `
    <div class="fg"><label>${t('name')} *</label><input id="csv-name" value="${x(r.name || '')}"></div>
    <p class="drafter-hint">${t('csvHint').replace('{n}', r.rows.length)} · <span data-no-i18n>${x(r.encoding)}</span>${r.truncated ? ` · ${t('csvTruncated')}` : ''}</p>
    <div class="csv-preview"><table>
      <thead><tr>${r.header.map((h, i) => `<th><div data-no-i18n>${x(h)}</div>${typeSel(i)}</th>`).join('')}</tr></thead>
      <tbody>${r.rows.slice(0, 8).map(row => `<tr>${row.map(v => `<td data-no-i18n>${x(String(v).slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitCsvImport()">${t('csvCreate')}</button>
    </div>`);
}

// A cell as the field type stores it.
function csvCellValue(type, v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (type === 'number') return s.replace(/,/g, '');
  // The Thai true words are \u escapes — no Thai literals in renderer source.
  if (type === 'checkbox') return /^(true|yes|y|\u0e08\u0e23\u0e34\u0e07|\u0e43\u0e0a\u0e48|\u2713|1)$/i.test(s);
  if (type === 'date') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    return m && typeof fmtDate === 'function' ? fmtDate(Number(m[3]), Number(m[2]), Number(m[1])) : s;
  }
  return s;
}

async function submitCsvImport() {
  const c = _csv;
  const name = q('#csv-name')?.value.trim();
  if (!c || !name) { toast(t('nameRequired'), 'err'); return; }
  const types = c.header.map((_, i) => (i === 0 ? 'name' : q(`[data-csv-type="${i}"]`)?.value || 'text'));
  const cols = c.header.map((h, i) => ({ i, name: h, type: types[i] })).filter(col => col.i > 0 && col.type !== 'skip');
  // Two columns with one name would be one field — number the repeats.
  const seen = new Map();
  for (const col of cols) { const n = (seen.get(col.name) || 0) + 1; seen.set(col.name, n); if (n > 1) col.name = `${col.name} (${n})`; }
  const objects = c.rows.filter(row => String(row[0] ?? '').trim()).map(row => ({
    name: String(row[0]).trim(),
    values: Object.fromEntries(cols.map(col => [col.name, csvCellValue(col.type, row[col.i])]).filter(([, v]) => v != null)),
  }));
  const r = await api.bundle.create(S.nexus.id, null, { name, folder: false, modules: [
    { kind: 'classifier', name, fields: cols.map(col => ({ name: col.name, type: col.type })), objects },
  ] });
  if (!r?.ok) { toast(t('driveErrServer'), 'err'); return; }
  _csv = null;
  closeModal();
  await reloadModuleTree();
  await openModuleNode(r.moduleIds[0]);
  toast(`${t('created')} · ${objects.length}`, 'ok');
}
