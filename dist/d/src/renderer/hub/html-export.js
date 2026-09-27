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

function openHtmlExportModal(nexusId = S.nexus?.id) {
  if (!nexusId) return;
  const cur = S.activeItemNode?.itemKey || (S.activeModuleNode ? `module_${S.activeModuleNode.id}` : null);
  const mods = flattenModuleTree(S.moduleTree, 0).map((r) => r.m).filter((m) => m.kind !== 'collector');
  if (!mods.length) { toast(t('exportMarkdownEmpty'), 'error'); return; }
  _hx = { nexusId, pages: [], ticked: new Set() };
  const opts = mods.map((m) => `<option value="module_${m.id}"${cur === `module_${m.id}` ? ' selected' : ''}>${x(m.name)}</option>`).join('');
  const item = cur && !cur.startsWith('module_') ? `<option value="${x(cur)}" selected>${x(S.activeItemNode?.item?.name || cur)}</option>` : '';
  openModal(t('htmlExport'), `
    <p class="drafter-hint">${t('htmlExportHint')}</p>
    <div class="fg"><label>${t('htmlExportIndex')}</label><select id="hx-index" onchange="hxCollect()">${item}${opts}</select></div>
    <div class="fg"><label>${t('htmlExportDepth')} <span id="hx-depth-val" data-no-i18n>2</span></label>
      <input id="hx-depth" type="range" min="0" max="6" value="2" oninput="q('#hx-depth-val').textContent=this.value" onchange="hxCollect()"></div>
    <div class="hx-list" id="hx-list"></div>
    <p class="hx-warn">${t('htmlExportWarn')}</p>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" id="hx-go" onclick="runHtmlExport()">${t('htmlExportGo')}</button>
    </div>`);
  hxCollect();
}

async function hxCollect() {
  if (!_hx) return;
  const key = q('#hx-index')?.value;
  const depth = Number(q('#hx-depth')?.value) || 0;
  _hx.pages = key ? await api.nexus.htmlCollect(_hx.nexusId, key, depth) : [];
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
function hxSiteCss({ print = false } = {}) {
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
  if (print) {
    body.setAttribute('data-theme', 'daylight');
    for (const n of daylight) body.style.removeProperty(n);
  }
  let tokens;
  try {
    const cs = getComputedStyle(body);
    tokens = [...names].map((n) => `${n}:${cs.getPropertyValue(n).trim()}`).filter((s) => !s.endsWith(':')).join(';');
  } finally {
    if (print) {
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
  const drawn = await hxRenderAll(pages);
  closeModal();
  const r = await api.nexus.exportHtml(_hx.nexusId, { indexKey: index.key, title: index.name, css: hxSiteCss(), ...drawn });
  renderNexusHome(); // the open page's data was reloaded for the export's own renders
  if (r?.canceled) return;
  if (!r?.ok) { toast(t(r?.code === 'too_many' ? 'nexusZipTooLarge' : 'driveErrServer'), 'error'); return; }
  toast(`${t('nexusExported')} · ${r.pages} ${t('htmlExportPages')}${r.media ? ` · ${r.media} ${t('exportPictures')}` : ''}`, 'ok');
  if (r.missing) toast(t('exportMediaMissing').replace('{n}', r.missing), 'warn');
}
