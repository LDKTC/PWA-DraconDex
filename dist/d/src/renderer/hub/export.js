'use strict';
// ═══ One "Export…" window (Procress 14, APP docs/EXPORT-DECOR.md E8) ════
// Every way out of the app for this page, as cards: PDF, Word, EPUB, Excel,
// CSV, the HTML site, Markdown and the .mddx module file. A card that cannot do
// anything for this kind is shown dimmed with the reason, not hidden — so
// the user learns where CSV lives instead of wondering where it went.
//
// PDF and the site draw pages the same way (hub/html-export.js hxRenderAll);
// the others are read from the vault in main (db/table-export.js,
// docx-export.js, epub-export.js, md-export.js). The
// last choices are remembered per module in module_ui 'exportPrefs'.

const DOC_KINDS = ['author', 'classifier', 'chronicler', 'drafter', 'inspector'];
const EXPORT_FORMATS = [
  { id: 'pdf', icon: 'document', title: 'exportPdf', desc: 'exportPdfD' },
  { id: 'docx', icon: 'writer', title: 'exportDocx', desc: 'exportDocxD', kinds: DOC_KINDS, why: 'exportOnlyDocs' },
  { id: 'epub', icon: 'book', title: 'exportEpub', desc: 'exportEpubD', kinds: ['author'], why: 'exportOnlyBooks' },
  { id: 'view', icon: 'relation', title: 'exportView', desc: 'exportViewD', kinds: ['exhibitor', 'chronicler', 'designer', 'narrator', 'locator', 'wanderer', 'sketcher'], why: 'exportOnlyViews' },
  { id: 'xlsx', icon: 'table', title: 'exportXlsx', desc: 'exportXlsxD', kinds: ['classifier', 'chronicler'] },
  { id: 'csv', icon: 'list', title: 'exportCsv', desc: 'exportCsvD', kinds: ['classifier', 'chronicler'] },
  { id: 'html', icon: 'globe', title: 'htmlExport', desc: 'exportHtmlD' },
  { id: 'md', icon: 'edit', title: 'exportMarkdown', desc: 'exportMdAnyD' },
  { id: 'mddx', icon: 'export', title: 'settingDbExportModule', desc: 'exportMddxD' },
];
const EXPORT_PREF_DEFAULT = { fmt: 'pdf', scope: 'page', mdScope: 'module', paper: 'A4', orientation: 'portrait', theme: 'print', headerFooter: true, toc: true };
let _ex = null; // { moduleId, itemKey, kind, prefs }

// Why a format cannot run here — null when it can.
function exportBlocked(f, kind) {
  if (kind === 'collector' && ['pdf', 'html'].includes(f.id)) return t('exportNoPage');
  if (f.kinds && !f.kinds.includes(kind)) return t(f.why || 'exportOnlyTables');
  if (f.id === 'view' && _ex?.itemKey) return t('exportNoView');
  return null;
}

async function openExportModal(moduleId, itemKey = null) {
  const m = findModuleNode(moduleId);
  if (!m || !S.nexus) return;
  let saved = {};
  try { saved = JSON.parse((await api.module.getUi(moduleId))?.exportPrefs || '{}') || {}; } catch (_) {}
  _ex = { moduleId, itemKey, kind: m.kind, prefs: { ...EXPORT_PREF_DEFAULT, ...saved } };
  if (itemKey) _ex.prefs.scope = 'page';
  const cur = EXPORT_FORMATS.find((f) => f.id === _ex.prefs.fmt);
  if (!cur || exportBlocked(cur, m.kind)) _ex.prefs.fmt = EXPORT_FORMATS.find((f) => !exportBlocked(f, m.kind)).id;
  const name = itemKey ? (S.activeItemNode?.item?.name || m.name) : m.name;
  openModal(`${t('exportTitle')} — ${name}`, `
    <div class="ex-grid" role="radiogroup">${EXPORT_FORMATS.map((f) => {
      const why = exportBlocked(f, m.kind);
      const act = why ? 'aria-disabled="true"' : `tabindex="0" onclick="exportPick('${f.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();exportPick('${f.id}')}"`;
      return `<div class="ex-card${why ? ' ex-off' : ''}" role="radio" data-ex="${f.id}" ${act}>
        <span class="ex-card-head"><span class="kicon">${I[f.icon] || ''}</span><b>${t(f.title)}</b></span>
        <span class="ex-card-d">${why ? x(why) : t(f.desc)}</span></div>`;
    }).join('')}</div>
    <div id="ex-opts" class="ex-opts"></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" id="ex-go" onclick="runExport()">${t('exportGo')}</button>
    </div>`);
  exportPick(_ex.prefs.fmt);
}

function exportPick(fmt) {
  if (!_ex) return;
  _ex.prefs.fmt = fmt;
  document.querySelectorAll('.ex-card').forEach((el) => {
    const on = el.dataset.ex === fmt;
    el.classList.toggle('active', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const el = q('#ex-opts');
  if (el) el.innerHTML = exportOptsHtml(fmt);
}

function exportOptsHtml(fmt) {
  const p = _ex.prefs;
  const sel = (id, key, opts) => `<select id="${id}" onchange="_ex.prefs.${key}=this.value">${opts.map(([v, label]) =>
    `<option value="${v}"${p[key] === v ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
  const chk = (id, key, label) => `<label class="fv-useimg"><input type="checkbox" id="${id}"${p[key] ? ' checked' : ''} onchange="_ex.prefs.${key}=this.checked"> ${label}</label>`;
  if (fmt === 'pdf') {
    const scopes = [['page', t('exportScopePage')]];
    if (!_ex.itemKey) scopes.push(['module', t('exportScopeModule')]);
    return `<div class="ex-row">
        <div class="fg"><label>${t('exportScope')}</label>${sel('ex-scope', 'scope', scopes)}</div>
        <div class="fg"><label>${t('exportPaper')}</label>${sel('ex-paper', 'paper', [['A4', 'A4'], ['Letter', 'Letter'], ['A5', 'A5']])}</div>
        <div class="fg"><label>${t('exportOrientation')}</label>${sel('ex-orient', 'orientation', [['portrait', t('exportPortrait')], ['landscape', t('exportLandscape')]])}</div>
        <div class="fg"><label>${t('exportTheme')}</label>${sel('ex-theme', 'theme', [['print', t('exportThemePrint')], ['current', t('exportThemeCurrent')]])}</div>
      </div>
      <div class="ex-checks">${chk('ex-hf', 'headerFooter', t('exportHeaderFooter'))}${chk('ex-toc', 'toc', t('exportToc'))}</div>`;
  }
  if (fmt === 'md') {
    return `<div class="ex-row"><div class="fg"><label>${t('exportScope')}</label>${sel('ex-mdscope', 'mdScope',
      [['module', t('exportScopeInside')], ['nexus', t('exportScopeNexus')]])}</div></div><p class="drafter-hint">${t('exportMdAnyHint')}</p>`;
  }
  const hint = { csv: 'exportCsvHint', xlsx: 'exportXlsxHint', html: 'exportHtmlHint', mddx: 'exportMddxHint', docx: 'exportDocxHint', epub: 'exportEpubHint', view: 'exportViewHint' }[fmt];
  return `<p class="drafter-hint">${t(hint)}</p>`;
}

// The pages a PDF holds: this page, or the module's page and every element.
async function exportPdfPages() {
  const { moduleId, itemKey, prefs } = _ex;
  const m = findModuleNode(moduleId);
  if (itemKey) return [{ key: itemKey, name: S.activeItemNode?.item?.name || itemKey, moduleId }];
  const self = { key: `module_${moduleId}`, name: m.name, moduleId };
  if (prefs.scope !== 'module') return [self];
  const all = (await api.nexus.htmlCollect(S.nexus.id, self.key, 1)) || [];
  return [self, ...all.filter((p) => p.key !== self.key && p.moduleId === moduleId && !p.key.startsWith('module_'))];
}

async function runExport() {
  if (!_ex) return;
  const { moduleId, itemKey, prefs } = _ex;
  try { await api.module.setUi(moduleId, 'exportPrefs', JSON.stringify(prefs)); } catch (_) {}
  if (prefs.fmt === 'html') { closeModal(); openHtmlExportModal(S.nexus.id); return; }
  if (prefs.fmt === 'md' && prefs.mdScope === 'nexus') { closeModal(); nexusExportMarkdown(S.nexus.id); return; }
  if (prefs.fmt === 'view') { closeModal(); await exportViewNow(moduleId); return; }
  if (['docx', 'epub', 'md'].includes(prefs.fmt)) { closeModal(); await exportDocNow(moduleId, prefs.fmt); return; }
  if (prefs.fmt === 'mddx') { closeModal(); ctxExportModule(moduleId); return; }
  if (prefs.fmt === 'csv' || prefs.fmt === 'xlsx') { closeModal(); await exportTableNow(moduleId, prefs.fmt); return; }
  await exportPdfNow(moduleId, itemKey, prefs);
}

async function exportTableNow(moduleId, fmt) {
  const r = await api.nexus.exportTable(moduleId, fmt);
  if (r?.canceled) return;
  if (!r?.ok) { toast(t('driveErrServer'), 'error'); return; }
  toast(`${t('saved')} · ${r.rows} ${t('exportRows')}`, 'ok');
  const notes = [];
  if (r.skipped?.length) notes.push(t('exportFormulaSkipped').replace('{names}', r.skipped.join(', ')));
  if (r.more) notes.push(t('exportMoreTimelines').replace('{n}', r.more));
  if (notes.length) setTimeout(() => toast(notes.join(' · '), 'warn'), 1600);
}

// Word, EPUB, Markdown of this module — built in main from the vault.
async function exportDocNow(moduleId, fmt) {
  const r = await api.nexus.exportDoc(moduleId, fmt, { lang: S.settings?.language || 'en' });
  if (r?.canceled) return;
  if (!r?.ok) { toast(t(r?.code === 'empty' ? 'exportMarkdownEmpty' : 'driveErrServer'), 'error'); return; }
  const n = fmt === 'epub' ? r.chapters : fmt === 'md' ? r.files : r.sections;
  toast(`${t('saved')}${n != null ? ` · ${n}` : ''}${r.pictures ? ` · ${r.pictures} ${t('exportPictures')}` : ''}`, 'ok');
  if (r.missing) setTimeout(() => toast(t('exportMediaMissing').replace('{n}', r.missing), 'warn'), 1600);
}

async function exportPdfNow(moduleId, itemKey, prefs) {
  const go = q('#ex-go');
  if (go) { go.disabled = true; go.textContent = t('exportWorking'); }
  const back = itemKey && S.activeItemNode ? { kind: S.activeItemNode.itemKind, id: S.activeItemNode.id } : null;
  const pages = await exportPdfPages();
  const title = pages[0]?.name || '';
  const css = hxSiteCss({ print: prefs.theme === 'print' });
  const drawn = await hxRenderAll(pages);
  closeModal();
  const r = await api.nexus.exportPdf(S.nexus.id, { title, css, theme: prefs.theme, toc: prefs.toc, ...drawn },
    { paper: prefs.paper, orientation: prefs.orientation, headerFooter: prefs.headerFooter });
  // The export drew its pages through the open page's data; draw it again.
  if (back) await openItemNode(back.kind, moduleId, back.id); else await openModuleNode(moduleId);
  if (r?.canceled) return;
  if (!r?.ok) { toast(t(r?.code === 'print_failed' ? 'exportPrintFailed' : 'driveErrServer'), 'error'); return; }
  toast(`${t('saved')} · ${r.pages} ${t('htmlExportPages')}`, 'ok');
  if (r.missing) setTimeout(() => toast(t('exportMediaMissing').replace('{n}', r.missing), 'warn'), 1600);
}
