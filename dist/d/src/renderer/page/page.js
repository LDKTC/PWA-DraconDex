'use strict';
// ═══ The page (v5 Part 8, APP docs/V5.md §12.2) ═════════════════════════
// A module page and an element page are the same thing: page chrome, then
// the page's blocks top to bottom, each in its own
//   <section class="pblock" data-iid="<pane>.<block id>">
// The iid is the INSTANCE: a block on a page in a pane. It is stable across
// re-renders (the same page in the same pane gets the same iid), so an
// instance can keep state between them (pbState), and it is unique on
// screen even when one page is open in two panes. A handler finds its
// instance through its iid — never through a window-global element id.
//
// Blocks are fetched before the page paints (loadModulePage, awaited by
// openModuleNode like every kind's own loader); rendering is synchronous
// from the cache, S.pages.

// A JSON value (null, an object) as an inline-handler argument. xj() is
// for strings only: it stringifies, so null would arrive as "".
const xv = (v) => x(JSON.stringify(v ?? null));

const pageKey = (moduleId, itemKey = null) => `${moduleId}|${itemKey ?? ''}`;
const pageOf = (moduleId, itemKey = null) => S.pages?.[pageKey(moduleId, itemKey)] || null;

// Which pane is being drawn — set by the builder around each pane body.
let _pbPane = 0;
function withRenderPane(idx, fn) {
  const prev = _pbPane;
  _pbPane = idx;
  try { return fn(); } finally { _pbPane = prev; }
}

// iid -> { iid, pane, blockId, moduleId, itemKey, component }
const PB_INST = {};
const pbInst = (iid) => PB_INST[iid] || null;
// Per-instance state that outlives a re-render (a selection, a scroll).
const PB_STATE = {};
const pbState = (iid) => (PB_STATE[iid] ||= {});
function pbRoot(iid) {
  const i = pbInst(iid);
  const pane = i ? q(`#main-inner [data-pane="${i.pane}"]`) : null;
  return (pane || document).querySelector(`.pblock[data-iid="${CSS.escape(iid)}"]`);
}

// ── The current instance ────────────────────────────────────────────────
// A kind whose code reads its state from one place (Chronicler's, with a
// hundred readers) keeps that shape: its state object is per instance, and
// "the" one is whichever instance is current. Current means: the one being
// rendered or mounted, else the last one the user pointed at, focused or
// typed in (a capture listener below — so inline handlers, bound listeners,
// context menus and the palette all see the instance they act on).
let PB_CUR = null;
const pbCurrent = () => PB_CUR;
function pbUse(iid) { if (iid) PB_CUR = iid; return iid; }
// An element of the current instance, by selector — a kind that still names
// its elements by id looks them up here, never in the whole window.
function pbQ(sel) {
  const r = PB_CUR ? pbRoot(PB_CUR) : null;
  return r ? r.querySelector(sel) : null;
}
// The same, falling back to the window — for markup that is drawn both on
// a page and in a modal or on an element page (a date row, an inspector).
const pbQOr = (sel) => pbQ(sel) || q(sel);
for (const ev of ['pointerdown', 'contextmenu', 'focusin', 'keydown', 'wheel']) {
  document.addEventListener(ev, (e) => {
    const s = e.target?.closest?.('.pblock[data-iid]');
    if (s) PB_CUR = s.dataset.iid;
  }, true);
}
// The first live instance of a component for a module — the target of a
// command run from the palette when no instance of it is current.
const pbFirstInstance = (component, moduleId) => Object.values(PB_INST)
  .find((i) => i.component === component && (i.sourceId ?? i.moduleId) === moduleId)?.iid || null;

// ── load ────────────────────────────────────────────────────────────────
async function loadModulePage(m, itemKey = null) {
  if (!m || m.kind === 'collector') return null;
  const props = await api.module.getProps(m.id, itemKey);
  if (itemKey == null) {
    // Kinds read (and patch) S.inspectorData.ui/tags/links; kept under the
    // old name so none of them had to change for the dock to go.
    S.inspectorData = { moduleId: m.id, ...props };
    await api.block.ensure(m.id, null, defaultPageLayout(m, props.ui));
  } else if (typeof itemPageLayout === 'function') {
    await api.block.ensure(m.id, '*', itemPageLayout(m));
  }
  const r = await api.block.list(m.id, itemKey);
  S.pages ||= {};
  const page = { moduleId: m.id, itemKey, blocks: r.blocks, from: r.from, props };
  S.pages[pageKey(m.id, itemKey)] = page;
  await loadPageSources(page);
  return page;
}

// Every scoped component on the page loads the data of what it shows —
// its own module, or a borrowed one — once per (component, source).
async function loadPageSources(page) {
  const seen = new Set();
  const jobs = [];
  for (const b of page.blocks) {
    const comp = componentOf(b);
    if (!comp?.load) continue;
    const m = /^module_(\d+)$/.exec(b.source_key || '');
    const src = findModuleNode(m ? Number(m[1]) : page.moduleId);
    const k = `${b.component}|${src?.id}`;
    if (!src || seen.has(k)) continue;
    seen.add(k);
    jobs.push(Promise.resolve(comp.load(src)).catch((e) => console.error('component load error:', b.component, e)));
  }
  await Promise.all(jobs);
}

// Fresh blocks and properties for the open page, then a repaint.
async function reloadModulePage(moduleId, itemKey = null) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  await loadModulePage(m, itemKey);
  renderNexusHome();
}

// ── render ──────────────────────────────────────────────────────────────
// The instance record for one block on one page.
function pbCtx(page, b) {
  const iid = `${_pbPane}.${b.id}`;
  let source = findModuleNode(page.moduleId);
  const m = /^module_(\d+)$/.exec(b.source_key || '');
  if (m) source = findModuleNode(Number(m[1])) || null;
  PB_INST[iid] = { iid, pane: _pbPane, blockId: b.id, moduleId: page.moduleId, itemKey: page.itemKey, component: b.component, sourceId: source?.id ?? null };
  return { iid, block: b, page, source, config: b.config || {}, state: pbState(iid), itemKey: page.itemKey };
}

function pageBlocksHtml(moduleId, itemKey = null) {
  const page = pageOf(moduleId, itemKey);
  if (!page) return `<div class="pb-loading"></div>`;
  const arranging = pbArranging(page);
  const top = page.blocks.filter((b) => b.parent_id == null);
  const seen = new Set();
  const body = top.map((b) => pbBlockHtml(page, b, seen)).join('');
  const empty = !top.length && !arranging ? `<p class="drafter-hint pb-empty">${t('pbPageEmpty')}</p>` : '';
  return `<div class="page-blocks${arranging ? ' arranging' : ''}" data-page="${x(pageKey(moduleId, itemKey))}">
    ${body}${empty}${arranging ? pbAddBarHtml(page, null) : ''}
  </div>`;
}

function pbBlockHtml(page, b, seen) {
  const c = pbCtx(page, b);
  let inner;
  try { inner = pbInnerHtml(c, seen); }
  catch (e) { console.error('page block render error:', b, e); inner = `<p class="drafter-hint">${t('pbBlockError')}</p>`; }
  const arranging = pbArranging(page);
  // pb-<type> and pbc-<component> hook css/page.css per block kind; the
  // style's classes (page/style.js, §6) hook css/page-style.css.
  const st = pbStyleAttrs(c);
  const cls = ['pblock', `pb-${b.block_type}`, b.component ? `pbc-${b.component.replace('.', '-')}` : '', ...st.cls].filter(Boolean).join(' ');
  return `<section class="${x(cls)}"
      data-iid="${x(c.iid)}" data-block="${b.id}"${st.attrs}${arranging ? ` draggable="true" ondragstart="pbDragStart(event,${b.id})"
      ondragover="pbDragOver(event,this)" ondragleave="this.classList.remove('drop-before','drop-after')" ondrop="pbDrop(event,${b.id})"` : ''}>
    ${arranging ? pbArrangeBarHtml(c) : pbSourceCaptionHtml(c)}${pbStyledInner(c, inner)}
  </section>`;
}

// A borrowed view (§12.12) says whose it is, and leads there.
function pbSourceCaptionHtml(c) {
  const src = c.source;
  if (!c.block.source_key || !src || src.id === c.page.moduleId) return '';
  return `<div class="pb-src-cap" onclick="openModuleNode(${src.id})"><span class="kicon">${moduleIconHtml(src)}</span><span data-no-i18n>${x(src.name)}</span>↗</div>`;
}

function pbInnerHtml(c, seen) {
  const b = c.block;
  if (b.block_type === 'component') {
    const comp = componentOf(b);
    if (!comp) return `<p class="drafter-hint">${t('pbUnknownComponent')} <code data-no-i18n>${x(b.component || '')}</code></p>`;
    if (comp.once) {
      const k = `${b.component}|${c.source?.id ?? ''}`;
      if (seen.has(k)) return `<p class="drafter-hint">${t('pbOnlyOnce')}</p>`;
      seen.add(k);
    }
    if (comp.kind !== 'core' && !c.source) return `<p class="drafter-hint">${t('pbSourceGone')}</p>`;
    pbUse(c.iid);
    return comp.render(c);
  }
  return typeof pbBasicHtml === 'function' ? pbBasicHtml(c, seen) : '';
}

// The blocks inside a container — a column of `columns`, a tab of
// core.tabs, the body of core.toggle — by parent_id and config.col. A child
// whose col is past the last one (a tab removed) shows in the last, so
// removing a tab never hides what was in it.
function pbChildrenHtml(c, col, count, seen) {
  const mine = c.page.blocks.filter((k) => k.parent_id === c.block.id
    && Math.min(count - 1, Math.max(0, Number(k.config?.col) || 0)) === col);
  return `${mine.map((k) => pbBlockHtml(c.page, k, seen)).join('')}${pbArranging(c.page) ? pbAddBarHtml(c.page, { parentId: c.block.id, col }) : ''}`;
}
const pbIsContainer = (b) => b?.block_type === 'columns' || !!componentOf(b)?.container;

// ── mount ───────────────────────────────────────────────────────────────
// After the pane body is in the document. Mounts only what this render
// drew (the iids of this pane).
function mountPageBlocks(paneIdx) {
  const pane = q(`#main-inner [data-pane="${paneIdx}"]`) || document;
  pane.querySelectorAll('.pblock[data-iid]').forEach((root) => {
    const inst = pbInst(root.dataset.iid);
    if (!inst) return;
    const page = pageOf(inst.moduleId, inst.itemKey);
    const b = page?.blocks.find((bb) => bb.id === inst.blockId);
    if (!b) return;
    const c = withRenderPane(inst.pane, () => pbCtx(page, b));
    c.root = root;
    pbUse(c.iid);
    try {
      if (b.block_type === 'component') { const comp = componentOf(b); if (comp?.mount && (comp.kind === 'core' || c.source)) comp.mount(c); }
      else if (typeof pbBasicMount === 'function') pbBasicMount(c);
    } catch (e) { console.error('page block mount error:', b, e); }
  });
  pbPruneInstances();
}

// Instances whose section left the document (a closed tab, a re-render).
// A component that holds something beyond its DOM (a Konva stage) pushes a
// disposer here.
const PB_DISPOSERS = [];
function pbPruneInstances() {
  const live = new Set([...document.querySelectorAll('.pblock[data-iid]')].map((el) => el.dataset.iid));
  for (const iid of Object.keys(PB_INST)) {
    if (live.has(iid)) continue;
    delete PB_INST[iid];
    for (const fn of PB_DISPOSERS) { try { fn(iid); } catch (_) {} }
  }
}

// Re-render the instances matching `pred(inst, block)` in place — for a save
// that changed what one component shows (the links after an edit) without
// rebuilding the whole page and losing a caret.
function rerenderPageBlocks(pred) {
  document.querySelectorAll('.pblock[data-iid]').forEach((root) => {
    const inst = pbInst(root.dataset.iid);
    const page = inst && pageOf(inst.moduleId, inst.itemKey);
    const b = page?.blocks.find((bb) => bb.id === inst.blockId);
    if (!b || !pred(inst, b)) return;
    const c = withRenderPane(inst.pane, () => pbCtx(page, b));
    const bar = root.querySelector(':scope > .pb-bar');
    root.innerHTML = (bar ? bar.outerHTML : '') + pbStyledInner(c, pbInnerHtml(c, new Set()));
    c.root = root;
    const comp = componentOf(b);
    if (comp?.mount) comp.mount(c); else if (b.block_type !== 'component' && typeof pbBasicMount === 'function') pbBasicMount(c);
  });
}

// A write changed a module's data: repaint wherever it shows. On its own
// page this is the old openModuleNode; shown elsewhere (borrowed onto another
// page, §12.12) it reloads that module's data and repaints in place, instead
// of navigating away from the page the user is on.
async function reloadSource(moduleId) {
  const m = findModuleNode(moduleId);
  if (!m) return;
  if (S.activeModuleNode?.id === moduleId && !S.activeItemNode) { await openModuleNode(moduleId); return; }
  const comp = COMPONENTS[`${m.kind}.view`];
  if (comp?.load) await comp.load(m);
  renderNexusHome();
}

// The page's properties changed on disk (a tag, a link): refetch just those.
async function refreshPageProps(moduleId, itemKey = null) {
  const page = pageOf(moduleId, itemKey);
  if (!page) return;
  page.props = await api.module.getProps(moduleId, itemKey);
  if (itemKey == null) S.inspectorData = { moduleId, ...page.props };
  rerenderPageBlocks((i, b) => i.moduleId === moduleId && (i.itemKey ?? null) === (itemKey ?? null)
    && (b.component === 'core.properties' || b.component === 'core.related'));
}
