'use strict';
// ═══ Export as an HTML website — the renderer half (v5 Part 8, §12.13) ══
// The modal: pick the index page (it becomes the site's menu), the depth,
// then untick what should not go. db/html-export.js walks the vault for the
// list and writes the zip; here every ticked page is RENDERED — through the
// same components the app draws, in a hidden pane, so a page looks in the
// browser the way it looks here:
//   - canvases (maps, boards, graphs) are drawn, then saved as PNG images
//   - in-app navigation (openModuleNode(…), openItemNode(…), [[links]])
//     becomes <a data-key>, which the main side keeps as a link when that
//     page was exported and turns into plain text when it was not
//   - buttons, inputs and inline handlers go: the site is read-only
// The theme's tokens, read from the running app, head the site's style.css.

const HX_PANE = 9999;
const HX_ITEM_PREFIX = { classifier: 'cobj', chronicler: 'tlev', author: 'bchp', scribe: 'chss', narrator: 'sdlg', diviner: 'divt', sketcher: 'skpg', wanderer: 'mevt' };
const HX_KIND_OF = Object.fromEntries(Object.entries(HX_ITEM_PREFIX).map(([k, p]) => [p, k]));
let _hx = null; // { nexusId, pages: [{key, name, depth, moduleId}], ticked: Set }

// Procress 16 part 6 — the publish profile: what goes out (index, depth,
// the ticks), how it looks (title, theme, icon, menu, site CSS) and where
// it lands (a .zip or a folder). Kept per Nexus, in this browser.
const HX_PROFILE_KEY = (nx) => `dracondex-publish-${nx}`;
const hxProfile = (nx) => { try { return JSON.parse(localStorage.getItem(HX_PROFILE_KEY(nx)) || '{}') || {}; } catch (_) { return {}; } };
const HX_THEMES = ['midnight', 'moonlight', 'daylight'];

async function openHtmlExportModal(nexusId = S.nexus?.id) {
  if (!nexusId) return;
  const prof = hxProfile(nexusId);
  const cur = S.activeItemNode?.itemKey || (S.activeModuleNode ? `module_${S.activeModuleNode.id}` : null) || prof.index || null;
  const mods = flattenModuleTree(S.moduleTree, 0).map((r) => r.m).filter((m) => m.kind !== 'collector');
  if (!mods.length) { toast(t('exportMarkdownEmpty'), 'error'); return; }
  if (typeof loadImportFiles === 'function') await loadImportFiles().catch(() => {});
  _hx = { nexusId, pages: [], ticked: new Set() };
  const opts = mods.map((m) => `<option value="module_${m.id}"${cur === `module_${m.id}` ? ' selected' : ''}>${x(m.name)}</option>`).join('');
  const item = cur && !cur.startsWith('module_') ? `<option value="${x(cur)}" selected>${x(S.activeItemNode?.item?.name || cur)}</option>` : '';
  const depth = Number.isFinite(prof.depth) ? prof.depth : 2;
  const pics = (S.importFiles || []).filter((f) => /\.(png|jpe?g|gif|webp|ico|svg)$/i.test(f.file_name || ''));
  openModal(t('htmlExport'), `
    <p class="drafter-hint">${t('htmlExportHint')}</p>
    <div class="fg"><label for="hx-index">${t('htmlExportIndex')}</label><select id="hx-index" onchange="hxCollect()">${item}${opts}</select></div>
    <div class="fg"><label for="hx-depth">${t('htmlExportDepth')} <span id="hx-depth-val" data-no-i18n>${depth}</span></label>
      <input id="hx-depth" type="range" min="0" max="6" value="${depth}" oninput="q('#hx-depth-val').textContent=this.value" onchange="hxCollect()"></div>
    <div class="hx-list" id="hx-list"></div>
    <p class="drafter-hint">${t('hxDrafts')}</p>
    <div class="fg"><label for="hx-title">${t('hxTitle')}</label><input id="hx-title" value="${x(prof.title || '')}" placeholder="${x(t('htmlExportIndex'))}"></div>
    <div class="hx-row2">
      <div class="fg"><label for="hx-theme">${t('hxTheme')}</label><select id="hx-theme"><option value="">${t('hxThemeNow')}</option>${HX_THEMES.map((th) =>
        `<option value="${th}"${prof.theme === th ? ' selected' : ''} data-no-i18n>${th[0].toUpperCase()}${th.slice(1)}</option>`).join('')}</select></div>
      <div class="fg"><label for="hx-favicon">${t('hxFavicon')}</label><select id="hx-favicon"><option value="">${t('hxNone')}</option>${pics.map((f) =>
        `<option value="${f.id}"${Number(prof.favicon) === f.id ? ' selected' : ''} data-no-i18n>${x(f.file_name)}</option>`).join('')}</select></div>
    </div>
    <label class="fv-useimg"><input type="checkbox" id="hx-nest"${prof.nestMenu === false ? '' : ' checked'}> ${t('hxNestMenu')}</label>
    <div class="fg"><label for="hx-css">${t('hxCss')}</label><textarea id="hx-css" rows="4" spellcheck="false" aria-describedby="hx-css-hint"
      oninput="hxCssPreview(this.value)" onblur="hxCssPreview('')">${x(prof.css || '')}</textarea>
      <p id="hx-css-hint" class="drafter-hint">${t('hxCssHint')}</p></div>
    <div class="fg"><label for="hx-target">${t('hxTarget')}</label><select id="hx-target">
      <option value="zip">${t('hxZip')}</option>${typeof globalThis.__ddx === 'undefined' /* the browser build (DraconDex-PWA) has no folder to write into */
        ? `<option value="folder"${prof.target === 'folder' ? ' selected' : ''}>${t('hxFolder')}</option>` : ''}</select></div>
    <p class="hx-warn">${t('htmlExportWarn')}</p>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" id="hx-go" onclick="runHtmlExport()">${t('htmlExportGo')}</button>
    </div>`);
  hxCollect();
}

// Procress 16 part 6: a page's own CSS, for the published page (World
// Anvil's article CSS). Previewed on the page while typed; in the app it
// is not applied otherwise, so a stray rule never breaks the app itself.
async function openPageCssModal(moduleId) {
  const ui = await api.module.getUi(moduleId).catch(() => ({}));
  openModal(t('pageCss').replace('…', ''), `
    <textarea id="page-css" rows="10" spellcheck="false" aria-label="${x(t('pageCss'))}" aria-describedby="page-css-hint"
      oninput="hxCssPreview(this.value,'page-css-preview')" onblur="hxCssPreview('','page-css-preview')">${x(ui?.pageCss || '')}</textarea>
    <p id="page-css-hint" class="drafter-hint">${t('hxCssHint')}</p>
    <div class="mfoot"><button class="btn btn-s" onclick="hxCssPreview('','page-css-preview');closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="savePageCss(${moduleId})">${t('save')}</button></div>`);
}
async function savePageCss(moduleId) {
  const css = q('#page-css')?.value || '';
  hxCssPreview('', 'page-css-preview');
  await api.module.setUi(moduleId, 'pageCss', css);
  closeModal();
  toast(t('saved'), 'ok');
}

// What the browser will refuse anyway, refused here too — the preview
// shows the CSS the site will carry (the main side has the same filter).
function hxCleanCss(css) {
  return String(css || '').slice(0, 50000).replace(/<[^>]*>?/g, '').replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (all, qq, u) => (/^(media|img)\/[\w.-]+$/.test(u.trim()) ? all : 'none'))
    .replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, '');
}
// Live preview: the CSS on the open page while it is being typed
function hxCssPreview(css, id = 'hx-css-preview') {
  let el = document.getElementById(id);
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  el.textContent = hxCleanCss(css);
}

// The menu: the Nest's shape, the pages that go out (and their folders)
function hxNav(pages) {
  const byModule = new Map();
  for (const p of pages) if (!p.key.startsWith('module_')) (byModule.get(p.moduleId) || byModule.set(p.moduleId, []).get(p.moduleId)).push(p);
  const walk = (list) => (list || []).map((m) => ({
    key: m.kind === 'collector' ? `folder_${m.id}` : `module_${m.id}`, name: m.name,
    children: [...walk(m.children), ...(byModule.get(m.id) || []).map((p) => ({ key: p.key, name: p.name, children: [] }))],
  }));
  return walk(S.moduleTree);
}

async function hxCollect() {
  if (!_hx) return;
  const key = q('#hx-index')?.value;
  const depth = Number(q('#hx-depth')?.value) || 0;
  _hx.pages = key ? await api.nexus.htmlCollect(_hx.nexusId, key, depth) : [];
  // Procress 16 part 6: a page labelled #draft (or anything of its module) stays out
  const drafts = new Set((await api.module.tagIndex(_hx.nexusId).catch(() => [])).filter((r) => String(r.tag).toLowerCase() === 'draft').map((r) => r.moduleId));
  _hx.pages = _hx.pages.filter((p, i) => i === 0 || !drafts.has(p.moduleId));
  _hx.ticked = new Set(_hx.pages.map((p) => p.key));
  const list = q('#hx-list');
  if (!list) return;
  list.innerHTML = _hx.pages.map((p, i) => `<label class="fv-useimg hx-row" style="padding-left:${p.depth * 14}px">
      <input type="checkbox" checked ${i === 0 ? 'disabled' : ''} onchange="hxTick(${xj(p.key)},this.checked)">
      <span data-no-i18n>${x(p.name)}</span></label>`).join('')
    || `<p class="cls-lv-empty">${t('htmlExportNone')}</p>`;
}
function hxTick(key, on) { if (on) _hx.ticked.add(key); else _hx.ticked.delete(key); }

// ── render one page, hidden ─────────────────────────────────────────────
function hxHost() {
  let host = q(`#main-inner [data-pane="${HX_PANE}"]`);
  if (!host) {
    host = document.createElement('div');
    host.className = 'bpane hx-host';
    host.dataset.pane = HX_PANE;
    q('#main-inner').appendChild(host);
  }
  return host;
}

async function hxRenderPage(p) {
  const [prefix, idStr] = p.key.split('_');
  const m = findModuleNode(p.moduleId);
  if (!m) return null;
  const host = hxHost();
  let html = '';
  if (prefix === 'module') {
    await loadModulePage(m);
    html = withRenderPane(HX_PANE, () => pageBlocksHtml(m.id));
  } else {
    const kind = HX_KIND_OF[prefix];
    const reg = ITEM_KIND[kind];
    const item = reg && (await reg.list(m.id)).find((it) => it.id === Number(idStr));
    if (!item) return null;
    await loadModulePage(m, p.key);
    // The element's editor block reads the open element (page/item-page.js).
    const body = kind === 'author' ? `<div class="md-preview">${mdRender(item.chapter_content || '')}</div>` : await reg.renderBody(item, m);
    const prev = S.activeItemNode;
    S.activeItemNode = { itemKind: kind, moduleId: m.id, id: item.id, item, m, bodyHtml: body, itemKey: p.key };
    // Kept through the mount: an element page's components (infobox, stats)
    // fill themselves after it and read the open element.
    try {
      html = withRenderPane(HX_PANE, () => pageBlocksHtml(m.id, p.key));
      return await hxMountInto(host, p, html);
    } finally { S.activeItemNode = prev; }
  }
  return hxMountInto(host, p, html);
}

async function hxMountInto(host, p, html) {
  host.innerHTML = `<div class="bpane-body"><div class="module-page"><h1 class="site-title">${x(p.name)}</h1>${html}</div></div>`;
  try { mountPageBlocks(HX_PANE); } catch (e) { console.error('html export mount:', e); }
  await new Promise((r) => setTimeout(r, 250)); // Konva, the SVG boards and the page components fill on the next frames
  return host.querySelector('.module-page');
}

// The rendered page as static HTML: canvases → PNG files, navigation →
// <a data-key>, controls and handlers gone.
function hxStaticHtml(root, images) {
  root.querySelectorAll('.pblock[data-secret]').forEach((el) => el.remove()); // Procress 16 part 6: never published
  root.querySelectorAll('canvas').forEach((cv) => {
    try {
      const name = `img/${images.length + 1}.png`;
      images.push({ name, base64: cv.toDataURL('image/png').split(',')[1] });
      const img = document.createElement('img');
      img.src = name;
      img.style.maxWidth = '100%';
      cv.replaceWith(img);
    } catch (_) { cv.remove(); }
  });
  // A Markdown editor open for editing shows its text rendered, like its
  // preview; an empty one (a description never written) goes entirely.
  root.querySelectorAll('.mded-cols').forEach((cols) => {
    const ta = cols.querySelector('.mded-text');
    if (!ta) return;
    const text = ta.value || '';
    const editor = cols.parentElement;
    if (!text.trim()) { editor.remove(); return; }
    cols.querySelector('.mded-body').innerHTML = `<div class="md-preview">${mdRender(text)}</div>`;
  });
  root.querySelectorAll('button, .pb-bar, .viewbar, .cf-grip, input[type=file], .addr-bar, .mded-fmtbar, .mded-save-state, .mded-linkspanel, .pb-desc:empty').forEach((el) => el.remove());
  root.querySelectorAll('.pb-props, .pb-desc').forEach((el) => { if (!el.children.length && !el.textContent.trim()) el.remove(); });
  root.querySelectorAll('input, textarea, select').forEach((el) => {
    if (el.closest('.pc-search')) { el.removeAttribute('value'); return; } // the site's search box (site.js runs it)
    const span = document.createElement('span');
    span.className = 'xv';
    span.textContent = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent || '') : el.type === 'checkbox' ? (el.checked ? '☑' : '☐') : el.value;
    el.replaceWith(span);
  });
  root.querySelectorAll('*').forEach((el) => {
    const key = hxKeyOfHandler(el.getAttribute('onclick') || '');
    if (key && el.tagName !== 'A') {
      const a = document.createElement('a');
      a.dataset.key = key;
      el.replaceWith(a);
      a.appendChild(el);
    } else if (key) el.dataset.key = key;
    for (const at of [...el.attributes]) if (/^on/i.test(at.name) || at.name === 'contenteditable' || at.name === 'draggable') el.removeAttribute(at.name);
  });
  return root.innerHTML;
}

function hxKeyOfHandler(js) {
  let m = /openModuleNode\((\d+)\)/.exec(js);
  if (m) return `module_${m[1]}`;
  m = /openItemNode\('(\w+)',\s*(\d+),\s*(\d+)\)/.exec(js);
  if (m && HX_ITEM_PREFIX[m[1]]) return `${HX_ITEM_PREFIX[m[1]]}_${m[3]}`;
  m = /openEntityByKey\((?:&quot;|["'])([a-z]+_\d+)/.exec(js);
  return m ? m[1] : null;
}

// The app's own styles, headed by the running theme's tokens, so the site
// looks like the app did when it was exported. print: daylight's tokens
// instead (a PDF on paper) — read by putting daylight on <body> for the
// one synchronous read, a custom or installed theme's inline tokens set
// aside, then put back before anything paints.
function hxSiteCss({ print = false, theme = null } = {}) {
  const want = print ? 'daylight' : theme;
  const names = new Set();
  const rules = [];
  const daylight = new Set();
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch (_) { continue; }
    for (const r of list) {
      rules.push(r.cssText);
      const st = r.style;
      if (st) for (let i = 0; i < st.length; i++) if (st[i].startsWith('--')) names.add(st[i]);
      if (st && r.selectorText === 'body[data-theme="daylight"]') for (let i = 0; i < st.length; i++) daylight.add(st[i]);
    }
  }
  const body = document.body;
  const saved = { theme: body.getAttribute('data-theme'), style: body.getAttribute('style') };
  const swap = !!want && want !== saved.theme;
  if (swap) {
    body.setAttribute('data-theme', want);
    // a custom or package theme's inline tokens would win over the one asked for
    for (const n of [...body.style].filter((p) => p.startsWith('--'))) body.style.removeProperty(n);
    for (const n of daylight) if (want === 'daylight') body.style.removeProperty(n);
  }
  let tokens;
  try {
    const cs = getComputedStyle(body);
    tokens = [...names].map((n) => `${n}:${cs.getPropertyValue(n).trim()}`).filter((s) => !s.endsWith(':')).join(';');
  } finally {
    if (swap) {
      if (saved.theme == null) body.removeAttribute('data-theme'); else body.setAttribute('data-theme', saved.theme);
      if (saved.style == null) body.removeAttribute('style'); else body.setAttribute('style', saved.style);
    }
  }
  return `:root,body{${tokens}}
body.ddx-site{margin:0;overflow:auto;height:auto;background:var(--bg);color:var(--t1)}
.site-head{padding:12px 24px;border-bottom:1px solid var(--border);font-weight:700}
.site-head a{color:inherit;text-decoration:none}
.site-menu{padding:8px 24px;border-bottom:1px solid var(--border)}
.site-menu ul{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;padding:0;list-style:none}
.site-menu a{color:var(--t2);text-decoration:none} .site-menu a:hover{color:var(--t1)}
.site-page{max-width:1100px;margin:0 auto;padding:16px 24px 64px}
.site-title{font-size:1.5em;margin:8px 0 16px}
a.xl{color:var(--accentH);text-decoration:none;cursor:pointer} a.xl:hover{text-decoration:underline}
${rules.join('\n')}
body.ddx-site{${tokens}}`;
}

// Every page drawn, then made static — shared by the site and the PDF
// (hub/export.js). → { pages: [{key, name, html}], images: [{name, base64}] }
async function hxRenderAll(pages) {
  const images = [];
  const out = [];
  try {
    for (const p of pages) {
      const root = await hxRenderPage(p);
      if (root) out.push({ key: p.key, name: p.name, html: hxStaticHtml(root, images) });
    }
  } finally {
    q(`#main-inner [data-pane="${HX_PANE}"]`)?.remove();
    pbPruneInstances();
  }
  return { pages: out, images };
}

async function runHtmlExport() {
  if (!_hx) return;
  const pages = _hx.pages.filter((p) => _hx.ticked.has(p.key));
  const index = pages[0];
  if (!index) return;
  const go = q('#hx-go');
  if (go) { go.disabled = true; go.textContent = t('htmlExportWorking'); }
  const prof = {
    index: index.key, depth: Number(q('#hx-depth')?.value) || 0, title: q('#hx-title')?.value.trim() || '',
    theme: q('#hx-theme')?.value || '', favicon: q('#hx-favicon')?.value ? Number(q('#hx-favicon').value) : null,
    nestMenu: !!q('#hx-nest')?.checked, css: q('#hx-css')?.value || '', target: q('#hx-target')?.value || 'zip',
  };
  try { localStorage.setItem(HX_PROFILE_KEY(_hx.nexusId), JSON.stringify(prof)); } catch (_) {}
  hxCssPreview('');
  const drawn = await hxRenderAll(pages);
  closeModal();
  // a module page's own CSS (page ⋯ → Page CSS…)
  const pageCss = {};
  for (const p of pages) if (p.key.startsWith('module_')) { const ui = await api.module.getUi(p.moduleId).catch(() => null); if (ui?.pageCss) pageCss[p.key] = ui.pageCss; }
  const r = await api.nexus.exportHtml(_hx.nexusId, {
    indexKey: index.key, title: prof.title || index.name, css: hxSiteCss({ theme: prof.theme || null }), ...drawn,
    siteCss: prof.css, pageCss, favicon: prof.favicon, nav: prof.nestMenu ? hxNav(pages) : null,
    search: drawn.pages.some((p) => p.html.includes('pc-search')), target: prof.target,
  });
  renderNexusHome(); // the open page's data was reloaded for the export's own renders
  if (r?.canceled) return;
  if (!r?.ok) { toast(t(r?.code === 'too_many' ? 'nexusZipTooLarge' : 'driveErrServer'), 'error'); return; }
  const done = `${t('nexusExported')} · ${r.pages} ${t('htmlExportPages')}${r.media ? ` · ${r.media} ${t('exportPictures')}` : ''}`;
  if (r.folder) toastAction(done, t('hxOpen'), () => api.nexus.openSite(r.out));
  else toast(done, 'ok');
  if (r.missing) toast(t('exportMediaMissing').replace('{n}', r.missing), 'warn');
}
