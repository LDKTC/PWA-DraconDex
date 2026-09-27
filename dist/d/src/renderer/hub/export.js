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
// ext: the badge and the file it saves. Each badge's colour is in
// css/page.css (.ex-fi[data-f]) — mockup 11-export's hues, darkened where
// white text on them fell short of 4.5:1.
const EXPORT_FORMATS = [
  { id: 'pdf', ext: 'pdf', title: 'exportPdf', desc: 'exportPdfD' },
  { id: 'docx', ext: 'docx', title: 'exportDocx', desc: 'exportDocxD', kinds: DOC_KINDS, why: 'exportOnlyDocs' },
  { id: 'epub', ext: 'epub', title: 'exportEpub', desc: 'exportEpubD', kinds: ['author'], why: 'exportOnlyBooks' },
  { id: 'view', ext: 'svg', title: 'exportView', desc: 'exportViewD', kinds: ['exhibitor', 'chronicler', 'designer', 'narrator', 'locator', 'wanderer', 'sketcher'], why: 'exportOnlyViews' },
  { id: 'xlsx', ext: 'xlsx', title: 'exportXlsx', desc: 'exportXlsxD', kinds: ['classifier', 'chronicler'] },
  { id: 'csv', ext: 'csv', title: 'exportCsv', desc: 'exportCsvD', kinds: ['classifier', 'chronicler'] },
  { id: 'html', ext: 'html', title: 'htmlExport', desc: 'exportHtmlD' },
  { id: 'md', ext: 'md', title: 'exportMarkdown', desc: 'exportMdAnyD' },
  { id: 'mddx', ext: 'mddx', title: 'settingDbExportModule', desc: 'exportMddxD' },
];
const EXPORT_PREF_DEFAULT = { fmt: 'pdf', scope: 'page', mdScope: 'module', paper: 'A4', orientation: 'portrait', theme: 'print', headerFooter: true, toc: true };
let _ex = null; // { moduleId, itemKey, kind, name, pages, prefs }

// Why a format cannot run here — null when it can.
function exportBlocked(f, kind) {
  if (kind === 'collector' && ['pdf', 'html'].includes(f.id)) return t('exportNoPage');
  if (f.kinds && !f.kinds.includes(kind)) return t(f.why || 'exportOnlyTables');
  if (f.id === 'view' && _ex?.itemKey) return t('exportNoView');
  return null;
}

// Two panes (mockup 11-export): formats, scope and options on the left; on
// the right a sketch of what the file will look like, drawn from this
// module's real names and redrawn as the options change.
async function openExportModal(moduleId, itemKey = null) {
  const m = findModuleNode(moduleId);
  if (!m || !S.nexus) return;
  let saved = {};
  try { saved = JSON.parse((await api.module.getUi(moduleId))?.exportPrefs || '{}') || {}; } catch (_) {}
  const name = itemKey ? (S.activeItemNode?.item?.name || m.name) : m.name;
  _ex = { moduleId, itemKey, kind: m.kind, name, pages: [], prefs: { ...EXPORT_PREF_DEFAULT, ...saved } };
  if (itemKey) _ex.prefs.scope = 'page';
  const cur = EXPORT_FORMATS.find((f) => f.id === _ex.prefs.fmt);
  if (!cur || exportBlocked(cur, m.kind)) _ex.prefs.fmt = EXPORT_FORMATS.find((f) => !exportBlocked(f, m.kind)).id;
  openModal(`${t('exportTitle')} — ${x(name)}`, `
    <div class="exd">
      <div class="exd-left">
        <h6 class="exd-h">${t('exportFormat')}</h6>
        <div class="ex-grid" role="radiogroup" aria-label="${t('exportFormat')}">${EXPORT_FORMATS.map((f) => {
          const why = exportBlocked(f, m.kind);
          const act = why ? 'aria-disabled="true"' : `tabindex="0" onclick="exportPick('${f.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();exportPick('${f.id}')}"`;
          return `<div class="ex-card${why ? ' ex-off' : ''}" role="radio" data-ex="${f.id}" ${act}>
            <span class="ex-fi" data-f="${f.id}">${f.ext.toUpperCase()}</span>
            <b>${t(f.title)}</b>
            <span class="ex-card-d${why ? ' ex-why' : ''}">${why ? x(why) : t(f.desc)}</span></div>`;
        }).join('')}</div>
        <div id="ex-scope"></div>
        <div id="ex-opts" class="ex-opts"></div>
      </div>
      <div class="exd-prev" aria-label="${t('exportPreview')}">
        <p class="exd-cap"><b>${t('exportPreview')}</b> · ${t('exportPreviewNote')}</p>
        <div id="ex-prev" class="exd-stage"></div>
      </div>
    </div>
    <div class="mfoot">
      <span class="exd-file" id="ex-file"></span>
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" id="ex-go" onclick="runExport()">${t('exportGo')}</button>
    </div>`, { size: 'xl', focus: '.ex-card.active' });
  exportPick(_ex.prefs.fmt);
  // The element names the preview lists — the same walk a module PDF takes.
  try {
    // A book's are its chapters — they are not pages of their own.
    const names = m.kind === 'author'
      ? ((await api.author.getChapters(moduleId)) || []).map((c) => c.name)
      : ((await api.nexus.htmlCollect(S.nexus.id, `module_${moduleId}`, 1)) || [])
        .filter((p) => p.moduleId === moduleId && !p.key.startsWith('module_')).map((p) => p.name);
    if (_ex?.moduleId === moduleId) {
      _ex.pages = names;
      exportRedraw();
    }
  } catch (_) {}
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
  exportRedraw();
}

// Set one option and redraw what depends on it.
function exportSet(key, value) {
  if (!_ex) return;
  _ex.prefs[key] = value;
  if (key === 'scope' || key === 'mdScope') { const el = q('#ex-opts'); if (el) el.innerHTML = exportOptsHtml(_ex.prefs.fmt); }
  exportRedraw();
}

// The scope segment, the preview and the footer — everything that follows
// the format and its options.
function exportRedraw() {
  if (!_ex) return;
  const { fmt } = _ex.prefs;
  const sc = q('#ex-scope');
  if (sc) sc.innerHTML = exportScopeHtml(fmt);
  const pv = q('#ex-prev');
  if (pv) pv.innerHTML = exportPreviewHtml(fmt);
  const f = EXPORT_FORMATS.find((e) => e.id === fmt);
  const file = q('#ex-file');
  if (file && f) file.textContent = exportFileName(f);
  const go = q('#ex-go');
  if (go && f) go.textContent = `${t('exportGo')} · ${f.ext.toUpperCase()}`;
}

// The segmented scope row — only formats that have a choice show one.
function exportScopeHtml(fmt) {
  const p = _ex.prefs;
  let key = null, opts = [];
  if (fmt === 'pdf') { key = 'scope'; opts = [['page', t('exportScopePage')]]; if (!_ex.itemKey) opts.push(['module', t('exportScopeModule')]); }
  if (fmt === 'md') { key = 'mdScope'; opts = [['module', t('exportScopeInside')], ['nexus', t('exportScopeNexus')]]; }
  if (!key || opts.length < 2) return '';
  return `<h6 class="exd-h">${t('exportScope')}</h6><div class="pb-seg exd-seg" role="radiogroup" aria-label="${t('exportScope')}">${opts.map(([v, label]) =>
    `<button class="btn${p[key] === v ? ' on' : ''}" role="radio" aria-checked="${p[key] === v}" onclick="exportSet('${key}','${v}')">${label}</button>`).join('')}</div>`;
}

function exportOptsHtml(fmt) {
  const p = _ex.prefs;
  const sel = (id, key, opts) => `<select id="${id}" onchange="exportSet('${key}',this.value)">${opts.map(([v, label]) =>
    `<option value="${v}"${p[key] === v ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
  const chk = (id, key, label) => `<label class="fv-useimg"><input type="checkbox" id="${id}"${p[key] ? ' checked' : ''} onchange="exportSet('${key}',this.checked)"> ${label}</label>`;
  if (fmt === 'pdf') {
    return `<div class="ex-row">
        <div class="fg"><label>${t('exportPaper')}</label>${sel('ex-paper', 'paper', [['A4', 'A4'], ['Letter', 'Letter'], ['A5', 'A5']])}</div>
        <div class="fg"><label>${t('exportOrientation')}</label>${sel('ex-orient', 'orientation', [['portrait', t('exportPortrait')], ['landscape', t('exportLandscape')]])}</div>
        <div class="fg"><label>${t('exportTheme')}</label>${sel('ex-theme', 'theme', [['print', t('exportThemePrint')], ['current', t('exportThemeCurrent')]])}</div>
      </div>
      <div class="ex-checks">${chk('ex-hf', 'headerFooter', t('exportHeaderFooter'))}${chk('ex-toc', 'toc', t('exportToc'))}</div>`;
  }
  if (fmt === 'md') return `<p class="drafter-hint">${t('exportMdAnyHint')}</p>`;
  const hint = { csv: 'exportCsvHint', xlsx: 'exportXlsxHint', html: 'exportHtmlHint', mddx: 'exportMddxHint', docx: 'exportDocxHint', epub: 'exportEpubHint', view: 'exportViewHint' }[fmt];
  return `<p class="drafter-hint">${t(hint)}</p>`;
}

// What the save dialog will propose — the footer's "→ name.ext".
function exportFileName(f) {
  const base = String((f.id === 'md' && _ex.prefs.mdScope === 'nexus') || f.id === 'html' ? S.nexus?.name || _ex.name : _ex.name)
    .replace(/[\\/:*?"<>|]/g, '_');
  const ext = ['md', 'html'].includes(f.id) ? 'zip' : f.ext;
  return `→ ${base}.${ext}`;
}

// The preview: a sketch in the file's own shape (a paper page, a Word page
// with its Navigation pane, a book, a sheet, a file tree), named from the
// module — grey bars stand in for body text.
function exportPreviewHtml(fmt) {
  const p = _ex.prefs;
  const names = (_ex.pages.length ? _ex.pages : [_ex.name]).slice(0, 6);
  const more = _ex.pages.length > 6 ? `<div class="exd-more">+${_ex.pages.length - 6}</div>` : '';
  const bars = (n) => Array.from({ length: n }, (_, i) => `<i class="exd-bar" style="width:${[96, 88, 92, 70, 84, 60][i % 6]}%"></i>`).join('');
  const kind = x(kindLabel(_ex.kind));
  const title = x(_ex.name);
  const nexus = x(S.nexus?.name || '');
  if (fmt === 'pdf' || fmt === 'docx') {
    const word = fmt === 'docx';
    const land = !word && p.orientation === 'landscape';
    const ratio = { A4: '210/297', Letter: '216/279', A5: '148/210' }[word ? 'A4' : p.paper] || '210/297';
    const [w, h] = ratio.split('/');
    const theme = !word && p.theme === 'current' ? ' exd-paper-cur' : '';
    const hf = !word && p.headerFooter;
    const toc = !word && p.toc && p.scope === 'module' && !_ex.itemKey;
    const page = `<div class="exd-paper${word ? ' exd-word' : ''}${theme}" style="aspect-ratio:${land ? `${h}/${w}` : `${w}/${h}`}">
      ${hf ? `<div class="exd-ph"><span>${nexus}</span><span>${title}</span></div>` : ''}
      <h1>${title}</h1><div class="exd-sub">${kind}</div>${bars(4)}<h2></h2>${bars(3)}
      ${hf ? '<div class="exd-pf"><span>DraconDex</span><span>1</span></div>' : ''}</div>`;
    const tocPage = toc ? `<div class="exd-paper exd-toc${theme}" style="aspect-ratio:${land ? `${h}/${w}` : `${w}/${h}`}"><h1>${title}</h1>${names.map((n, i) => `<div class="exd-tocr"><span>${x(n)}</span><span>${i + 2}</span></div>`).join('')}${more}</div>` : '';
    const nav = word ? `<div class="exd-nav"><b>Navigation</b>${names.map((n) => `<div>${x(n)}</div>`).join('')}</div>` : '';
    return `<div class="exd-pages">${nav}${tocPage}${page}</div>`;
  }
  if (fmt === 'epub') {
    return `<div class="exd-book"><div class="exd-cov"><b>${title}</b><small>${nexus}</small></div>
      <ol>${names.map((n) => `<li>${x(n)}</li>`).join('')}</ol></div>${more}`;
  }
  if (fmt === 'xlsx' || fmt === 'csv') {
    if (fmt === 'csv') return `<div class="exd-tree">${[t('name'), ...names.map(x)].join('\n')}</div>`;
    return `<table class="exd-sheet"><tr><th></th><th>A</th><th>B</th><th>C</th></tr>
      <tr class="hdr"><td>1</td><td>${x(t('name'))}</td><td></td><td></td></tr>
      ${names.map((n, i) => `<tr><td>${i + 2}</td><td>${x(n)}</td><td><i class="exd-bar"></i></td><td><i class="exd-bar" style="width:60%"></i></td></tr>`).join('')}</table>
      <div class="exd-tabs"><span>${title}</span></div>`;
  }
  if (fmt === 'view') {
    const pts = names.map((n, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / names.length; return [n, 160 + 110 * Math.cos(a), 100 + 62 * Math.sin(a)]; });
    return `<svg class="exd-svg" viewBox="0 0 320 200" role="img" aria-label="${title}">
      <g class="exd-edge">${pts.map(([, px, py]) => `<line x1="160" y1="100" x2="${px}" y2="${py}"/>`).join('')}</g>
      <circle cx="160" cy="100" r="22" style="fill:${KIND_COLOR[_ex.kind] || 'var(--accent)'}"/>
      <g class="exd-lbl" font-size="10" text-anchor="middle">${pts.map(([n, px, py]) => `<circle cx="${px}" cy="${py}" r="12" class="exd-node"/><text x="${px}" y="${py + 24}">${x(String(n).slice(0, 14))}</text>`).join('')}</g></svg>`;
  }
  const tree = (root, files) => `<div class="exd-tree">${x(root)}\n${files.map((f, i) => `${i === files.length - 1 ? '└─' : '├─'} ${x(f)}`).join('\n')}</div>`;
  if (fmt === 'html') return tree(`${S.nexus?.name || _ex.name}.zip`, ['index.html', 'style.css', ...names.map((n) => `${n}.html`), 'img/']);
  if (fmt === 'md') {
    const root = p.mdScope === 'nexus' ? `${S.nexus?.name || ''}.zip` : `${_ex.name}.zip`;
    return tree(root, [...names.map((n) => `${n}.md`), 'assets/']);
  }
  return tree(`${_ex.name}.mddx`, [kindLabel(_ex.kind), ...names]);
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
