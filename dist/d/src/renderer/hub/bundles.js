'use strict';
// ═══ Genre bundles — Artisan as the one template system (v5 Part 7, §11.7) ═
// A bundle makes a whole project in one click: a folder named after it, the
// modules a genre needs inside, and a Manager giving the overview (§8.10).
// These four replace the legacy director / navigator / hero / writer recipes
// as the thing a new user starts from. ARTISAN_TARGETS (hub/kinds.js) is left
// alone because Legacy Import's MIGRATE_TARGETS is built from it.
//
// A bundle is DATA (db/bundle.js has the shape). Since Procress 12 part 0
// the four live in DraconDex-SDB (templates/), vendored to
// electron/templates/bundles.json — the phone makes the same projects from
// the same file. The main side resolves every name in the UI language
// (db/bundle-catalog.js), so the rows become the user's own, in their
// language. "Adjust first" is the old step wizard folded into one form: tick
// modules, rename them, rename or drop fields — then the same single create
// call.

// [{ id, icon, name, description, spec }] in the UI language, fetched once
// per language.
let _bundleCat = null;
async function bundleCatalog() {
  const loc = S.settings?.language || 'en';
  if (!_bundleCat || _bundleCat.loc !== loc) _bundleCat = { loc, list: (await api.bundle.catalog(loc)) || [] };
  return _bundleCat.list;
}
const bundleById = async (id) => (await bundleCatalog()).find((b) => b.id === id) || null;

// The user's own bundles ("Save as Artisan bundle…" on a folder — db/
// bundle-capture.js), as catalog entries with a `u:` id.
async function mineBundles() {
  if (!S.nexus) return [];
  const rows = (await api.bundle.listMine(S.nexus.id)) || [];
  S._mineBundles = rows.map((r) => ({ id: `u:${r.id}`, group: 'mine', icon: r.spec.icon || 'folder', name: r.name, description: '', spec: r.spec }));
  return S._mineBundles;
}
const bundleOrMine = async (id) => (String(id).startsWith('u:') ? (S._mineBundles || []).find((b) => b.id === id) : bundleById(id)) || null;

const BUNDLE_TABS = ['classic', 'genre', 'mine'];
const BUNDLE_SAMPLE_COLS = ['objects', 'events', 'chapters', 'dialogues', 'sessions'];
const bundleSamplesOf = (m) => BUNDLE_SAMPLE_COLS
  .reduce((k, c) => k + (m.samples ? (m[c] || []).length : (m[c] || []).filter((o) => o?.sample).length), 0);

// A bundle's shape, for the detail pane (mockup 08-artisan.html): its folders
// and modules as a tree, the links between modules — a relation field, a
// view's selection, a Wanderer's map or time (solid); a page block borrowing
// another module (dashed) — and how many examples it carries.
function bundleShape(spec) {
  const mods = spec.modules || [];
  const refs = new Set(mods.map((m) => m.ref).filter(Boolean));
  const links = [];
  const add = (from, to, borrow = false) => {
    if (from && to && from !== to && refs.has(to) && !links.some((l) => l.from === from && l.to === to)) links.push({ from, to, borrow });
  };
  const walk = (blocks, from) => (Array.isArray(blocks) ? blocks : []).forEach((bl) => {
    if (typeof bl?.borrow === 'string') add(from, bl.borrow, true);
    (bl?.children || []).forEach((c) => walk(c, from));
  });
  for (const m of mods) {
    (m.fields || []).forEach((f) => add(m.ref, f.relTo));
    (m.selects || []).forEach((r) => add(m.ref, r));
    (m.uses || []).forEach((r) => add(m.ref, r));
    walk(m.page, m.ref); walk(m.itemPage, m.ref);
  }
  const folders = spec.folders?.length ? spec.folders : [{ ref: 'root', name: spec.name }];
  const rows = [];
  const seen = new Set();
  const visit = (f, depth) => {
    rows.push({ depth, folder: f });
    for (const m of mods.filter((mm) => (mm.folder || 'root') === f.ref)) { seen.add(m); rows.push({ depth: depth + 1, mod: m, samples: bundleSamplesOf(m) }); }
    for (const c of folders.filter((ff) => ff.parent === f.ref)) visit(c, depth + 1);
  };
  folders.filter((f) => !f.parent).forEach((f) => visit(f, 0));
  mods.filter((m) => !seen.has(m)).forEach((m) => rows.push({ depth: 1, mod: m, samples: bundleSamplesOf(m) }));
  return { rows, mods, folders: folders.length, links, samples: mods.reduce((n, m) => n + bundleSamplesOf(m), 0) };
}

// The bundle's colours: its first two kinds, under a scrim so white text
// holds 4.5:1 over the lightest kind colour (lime, yellow).
function bundleGradient(spec) {
  const kinds = [...new Set((spec.modules || []).map((m) => m.kind).filter((k) => KIND_COLOR[k]))];
  const a = KIND_COLOR[kinds[0]] || KIND_COLOR.collector, b = KIND_COLOR[kinds[1]] || a;
  return `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.5)),linear-gradient(135deg,${a},${b})`;
}

// Modules on an ellipse, joined by their links. Nodes are drawn in the
// theme's own colours with the kind as a stripe, so a light kind colour
// never carries text.
function bundleLinksSvg(shape) {
  const mods = shape.mods.filter((m) => m.ref);
  if (mods.length < 2) return '';
  const W = 400, H = 190, cx = W / 2, cy = H / 2, rx = 150, ry = 70;
  const pos = {};
  mods.forEach((m, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / mods.length; pos[m.ref] = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  const f1 = (n) => Math.round(n * 10) / 10;
  const lines = shape.links.map((l) => `<line class="${l.borrow ? 'b' : ''}" x1="${f1(pos[l.from][0])}" y1="${f1(pos[l.from][1])}" x2="${f1(pos[l.to][0])}" y2="${f1(pos[l.to][1])}"/>`).join('');
  const nodes = mods.map((m) => {
    const [x0, y0] = pos[m.ref];
    const name = String(m.name || '');
    const lab = name.length > 10 ? `${name.slice(0, 9)}…` : name;
    return `<g class="art-node"><rect x="${f1(x0 - 40)}" y="${f1(y0 - 11)}" width="80" height="22" rx="6"/>
      <rect class="k" x="${f1(x0 - 40)}" y="${f1(y0 - 11)}" width="4" height="22" style="fill:${KIND_COLOR[m.kind] || KIND_COLOR.collector}"/>
      <text x="${f1(x0 + 2)}" y="${f1(y0 + 4)}">${x(lab)}</text></g>`;
  }).join('');
  return `<svg class="art-links" viewBox="0 0 ${W} ${H}" role="img" aria-label="${x(t('artLinks'))}">${lines}${nodes}</svg>`;
}

// Procress 14 (TEMPLATES.md §4, mockup 08-artisan.html): three shelves —
// the four Classic projects (the old Director/Navigator/Hero/Writer), the
// genres, and the user's own — as cards, and beside them what the selected
// one will build. The shelf is a per-viewer convenience.
async function openBundlePicker(parentId = null, tab = null, sel = null) {
  closeAllPopups();
  let cur = tab;
  if (!cur) { try { cur = localStorage.getItem('ddx.bundleTab'); } catch (_) {} }
  if (!BUNDLE_TABS.includes(cur)) cur = 'genre';
  try { localStorage.setItem('ddx.bundleTab', cur); } catch (_) {}
  const all = cur === 'mine' ? await mineBundles() : (await bundleCatalog()).filter((b) => (b.group || 'genre') === cur);
  // Procress 16 part 7: the templates for what this app is used for, first
  const pref = (typeof purposeOf === 'function' && purposeOf()?.bundles) || [];
  if (pref.length) all.sort((a, b) => (pref.includes(a.id) ? pref.indexOf(a.id) : 99) - (pref.includes(b.id) ? pref.indexOf(b.id) : 99));
  const pid = parentId ?? 'null';
  const pick = all.find((b) => b.id === sel) || all[0] || null;
  const tabs = viewBarHtml(BUNDLE_TABS, cur, (v) => `openBundlePicker(${pid},'${v}')`,
    (v) => t({ classic: 'bundleTabClassic', genre: 'bundleTabGenre', mine: 'bundleTabMine' }[v]));
  const cards = all.map((b) => {
    const kinds = [...new Set((b.spec.modules || []).map((m) => m.kind))];
    return `<div class="art-card${b === pick ? ' on' : ''}" role="button" tabindex="0" aria-pressed="${b === pick}"
      onclick="openBundlePicker(${pid},'${cur}','${b.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
      <span class="art-cover" style="background-image:${bundleGradient(b.spec)}">${I[b.icon] || I.folder}</span>
      <span class="art-cbody"><b>${x(b.name)}</b>${b.description ? `<span>${x(b.description)}</span>` : ''}
        <span class="art-chips">${kinds.map((k) => `<i style="background:${KIND_COLOR[k] || KIND_COLOR.collector}" title="${x(kindLabel(k))}"></i>`).join('')}</span></span>
    </div>`;
  }).join('');
  const guide = cur !== 'genre' ? '' : `<div class="art-card art-note">
      <span class="art-cbody"><b>${I.info} ${t('guideBundle')}</b><span>${t('guideBundleD')}</span>
      <span class="bundle-acts">${cmdBtn('app.createGuide', {}, { cls: 'btn-s btn-sm' })}</span></span></div>`;
  // Mine with nothing saved yet: how to save one, where the detail would be.
  const empty = `<div class="art-db"><p class="drafter-hint">${t('bundleMineEmpty')}</p></div>`;
  openModal(t('bundleTitle'), `<div class="art">
      <div class="art-left"><div class="bundle-tabs">${tabs}</div><div class="art-grid">${cards}${guide}</div></div>
      <aside class="art-detail">${pick ? bundleDetailHtml(pick, pid) : empty}</aside>
    </div>`, { size: 'xl', focus: '.art-card.on' });
}

// What the selected bundle will build: the tree, the links, and the one
// choice that is not "Adjust first" — whether its examples come along.
function bundleDetailHtml(b, pid) {
  const sh = bundleShape(b.spec);
  const counts = t('artCounts').replace('{f}', sh.folders).replace('{m}', sh.mods.length).replace('{l}', sh.links.length).replace('{s}', sh.samples);
  const tree = sh.rows.map((r) => r.folder
    ? `<div class="art-row" style="--d:${r.depth}">${I.folder}<span>${x(r.folder.name || '')}</span></div>`
    : `<div class="art-row" style="--d:${r.depth}"><i class="k" style="background:${KIND_COLOR[r.mod.kind] || KIND_COLOR.collector}"></i><span>${x(r.mod.name || '')}</span>
        <span class="art-kind">${x(kindLabel(r.mod.kind))}</span>${r.samples ? `<span class="art-smp">+${r.samples}</span>` : ''}</div>`).join('');
  const svg = bundleLinksSvg(sh);
  return `<div class="art-dh" style="background-image:${bundleGradient(b.spec)}"><h3>${I[b.icon] || I.folder}<span>${x(b.name)}</span></h3>
      ${b.description ? `<p>${x(b.description)}</p>` : ''}<p class="art-counts">${counts}</p></div>
    <div class="art-db">
      <h4>${t('artStructure')}</h4><div class="art-tree">${tree}</div>
      ${svg ? `<h4>${t('artLinks')}</h4>${svg}<div class="art-legend"><span><i></i>${t('artLinkRel')}</span><span><i class="b"></i>${t('artLinkBorrow')}</span></div>` : ''}
      ${sh.samples ? `<h4>${t('artBefore')}</h4><label class="art-check"><input type="checkbox" id="art-samples" checked> ${t('bundleIncludeSamples')} · ${sh.samples}</label>` : ''}
      <div class="bundle-acts">
        <button class="btn btn-s btn-sm" onclick="openBundleAdjust('${b.id}',${pid})">${t('bundleAdjust')}</button>
        <button class="btn btn-p btn-sm" onclick="createBundleFromPicker('${b.id}',${pid})">${t('bundleCreate')}</button>
      </div>
    </div>`;
}

async function createBundleFromPicker(id, parentId) {
  const b = await bundleOrMine(id);
  if (!b) return;
  const box = q('#art-samples');
  const spec = { ...b.spec, name: b.name, icon: b.icon, ...(box && !box.checked ? { includeSamples: false } : {}) };
  await createBundleNow(id, parentId, spec);
}

async function createBundleNow(id, parentId, spec = null) {
  const b = await bundleOrMine(id);
  if (!b || !S.nexus) return;
  const full = spec || { ...b.spec, name: b.name, icon: b.icon };
  const r = await api.bundle.create(S.nexus.id, parentId, full);
  if (!r?.ok) { toast(t(r?.code === 'name_required' ? 'nameRequired' : 'driveErrServer'), 'err'); return; }
  closeModal();
  await reloadModuleTree();
  await openModuleNode(r.homeId || r.managerId || r.folderId);
  toast(`${t('bundleCreated')} · ${r.modules}`, 'ok');
}

// ── The in-app guide (§11.8) ────────────────────────────────────────────
// Made in the open Nexus, at the top level, in the UI language — or in
// English when this language has no guide yet, saying where to get one.
// Never rewritten afterwards: making it again makes a second folder.
async function createGuideBundle({ quiet = false } = {}) {
  if (!S.nexus) return null;
  const g = await api.bundle.guide(S.settings?.language || 'en');
  if (!g?.ok) { if (!quiet) toast(t('driveErrServer'), 'err'); return null; }
  const r = await api.bundle.create(S.nexus.id, null, g.spec);
  if (!r?.ok) { if (!quiet) toast(t('driveErrServer'), 'err'); return null; }
  closeModal();
  await reloadModuleTree();
  if (!quiet) {
    const start = (findModuleNode(r.folderId)?.children || []).find(m => m.kind === 'drafter');
    await openModuleNode(start?.id || r.folderId);
  }
  toast(g.fallback ? t('guideFallback') : t('guideCreated'), g.fallback ? 'warn' : 'ok');
  return r;
}

// ── Adjust first ────────────────────────────────────────────────────────
async function openBundleAdjust(id, parentId) {
  const b = await bundleOrMine(id);
  if (!b) return;
  const mods = b.spec.modules || [];
  const hasSamples = mods.some((m) => m.samples || ['objects', 'events', 'chapters', 'dialogues', 'sessions'].some((c) => (m[c] || []).some((o) => o?.sample)));
  openModal(`${x(b.name)} · ${t('bundleAdjust')}`, `
    <div class="fg"><label>${t('bundleProjectName')} *</label><input id="bd-name" value="${x(b.name)}"></div>
    ${hasSamples ? `<label class="bundle-adj-samples"><input type="checkbox" id="bd-samples" checked> ${t('bundleIncludeSamples')}</label>` : ''}
    <div class="fg"><label>${t('bundleIncludes')}</label>
      ${mods.map((m, i) => `<div class="bundle-adj-row">
        <label class="bundle-adj-mod"><input type="checkbox" data-bd-on="${i}" checked> ${I[KIND_ICON[m.kind]] || ''}</label>
        <input data-bd-name="${i}" value="${x(m.name)}">
        ${m.fields?.length ? `<details class="bundle-adj-fields"><summary>${t('bundleFields')} (${m.fields.length})</summary>
          ${m.fields.map((f, k) => `<input data-bd-field="${i}:${k}" value="${x(f.name)}">`).join('')}
        </details>` : ''}
      </div>`).join('')}
    </div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="openBundlePicker(${parentId ?? 'null'})">${t('guideBack')}</button>
      <button class="btn btn-p" onclick="submitBundleAdjust('${id}',${parentId ?? 'null'})">${t('bundleCreate')}</button>
    </div>`);
}

// Blocks that borrow a module the user left out have nothing to show.
function keepBorrows(blocks, kept) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.filter((bl) => typeof bl?.borrow !== 'string' || kept.has(bl.borrow))
    .map((bl) => (Array.isArray(bl.children) ? { ...bl, children: bl.children.map((c) => keepBorrows(c, kept)) } : bl));
}

async function submitBundleAdjust(id, parentId) {
  const b = await bundleOrMine(id);
  const name = q('#bd-name')?.value.trim();
  if (!b || !name) { toast(t('nameRequired'), 'err'); return; }
  const mods = b.spec.modules || [];
  const kept = new Set();
  const out = [];
  mods.forEach((m, i) => {
    if (!q(`[data-bd-on="${i}"]`)?.checked) return;
    const nm = q(`[data-bd-name="${i}"]`)?.value.trim() || m.name;
    const fields = (m.fields || []).map((f, k) => ({ ...f, name: q(`[data-bd-field="${i}:${k}"]`)?.value.trim() ?? f.name }))
      .filter(f => f.name);
    if (m.ref) kept.add(m.ref);
    out.push({ ...m, name: nm, ...(m.fields ? { fields } : {}) });
  });
  const folderRefs = new Set((b.spec.folders || []).map((f) => f.ref));
  // Anything pointing at a module the user left out has nothing to point at:
  // a relation field, a selection, a Wanderer's map/time, a borrowed block.
  for (const m of out) {
    if (m.fields) m.fields = m.fields.map(f => (f.relTo && !kept.has(f.relTo) ? { ...f, relTo: undefined } : f));
    if (m.selects) m.selects = m.selects.filter((r) => kept.has(r) || folderRefs.has(r));
    if (m.uses) m.uses = m.uses.filter((r) => kept.has(r));
    if (Array.isArray(m.page)) m.page = keepBorrows(m.page, kept);
    if (Array.isArray(m.itemPage)) m.itemPage = keepBorrows(m.itemPage, kept);
  }
  const spec = { ...b.spec, name, icon: b.icon, modules: out };
  if (spec.home && !kept.has(spec.home)) delete spec.home;
  if (q('#bd-samples') && !q('#bd-samples').checked) spec.includeSamples = false;
  await createBundleNow(id, parentId, spec);
}

// ── Save as Artisan bundle (§4.4) ───────────────────────────────────────
function openSaveBundleModal(folderId) {
  const m = findModuleNode(folderId);
  if (!m) return;
  openModal(t('bundleSaveMine'), `
    <div class="fg"><label>${t('name')} *</label><input id="bds-name" value="${x(m.name)}"
      onkeydown="if(event.key==='Enter'){event.preventDefault();submitSaveBundle(${folderId})}"></div>
    <div class="fg"><label>${t('bundleSaveData')}</label>
      <select id="bds-data"><option value="none">${t('bundleDataNone')}</option><option value="samples">${t('bundleDataSamples')}</option></select></div>
    <div class="sync-hint">${t('bundleSaveHint')}</div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitSaveBundle(${folderId})">${t('save')}</button>
    </div>`);
  setTimeout(() => { const el = q('#bds-name'); el?.focus(); el?.select(); }, 60);
}

async function submitSaveBundle(folderId) {
  const name = q('#bds-name')?.value.trim();
  if (!name) { toast(t('nameRequired'), 'err'); q('#bds-name')?.focus(); return; }
  let r;
  try { r = await api.bundle.saveMine(S.nexus.id, folderId, name, { data: q('#bds-data')?.value || 'none' }); }
  catch (_) { toast(t('driveErrServer'), 'err'); return; }
  closeModal();
  toast(`${t('bundleSaved')} · ${r?.modules ?? 0}`, 'ok');
}
