'use strict';
// ═══ Properties panel (Procress 18 part 2, APP docs/UX-LAYOUT.md §6.4) ═══
// What the open page IS — kind, handle, where it lives, links, assets, when
// it was made — beside the page instead of above it, plus the module's own
// settings. It uses #side-panel, the dock version history and plugin panels
// use (page/side-panel.js renders it when nothing else holds the dock).
// Closed until asked for; once open it follows you from page to page and
// between sessions until closed — the state is the user's, not the module's.
// Toggle: the identity row's button, Ctrl+Alt+B, ⋯ → Properties.

const PROPS_KEY = 'dracondex-props-open';
const propsPinned = () => { try { return localStorage.getItem(PROPS_KEY) === '1'; } catch (_) { return false; } };
// Procress 18 part 5 reflow: in a window under PROPS_NARROW px the panel is
// the first thing to fold — it starts closed even when pinned, and opening
// it by hand (this session, until the window widens) floats it over the
// page (css/layout.css) without un-pinning it for wide windows.
const PROPS_NARROW = 1100;
let _propsNarrowOpen = false;
const propsNarrow = () => window.innerWidth <= PROPS_NARROW;
const propsOpen = () => (propsNarrow() ? _propsNarrowOpen : propsPinned());
const propsPanelWanted = () => propsOpen() && !!(S.activeModuleNode || S.activeItemNode);
let _propsWasNarrow = propsNarrow();
window.addEventListener('resize', () => {
  if (propsNarrow() === _propsWasNarrow) return;
  _propsWasNarrow = propsNarrow();
  _propsNarrowOpen = false;
  if (!S.side && typeof renderSidePanel === 'function') renderSidePanel();
});

function togglePropsPanel(force) {
  const on = typeof force === 'boolean' ? force : !propsOpen();
  if (propsNarrow()) _propsNarrowOpen = on;
  else try { localStorage.setItem(PROPS_KEY, on ? '1' : '0'); } catch (_) {}
  if (on && S.side) closeSidePanel(); // one panel at a time — Properties takes the dock
  renderSidePanel();
  renderNexusHome(); // the toggle's aria-expanded
}

// The identity row's toggle (hub/open.js puts it before ⋯).
function propsToggleHtml() {
  const on = propsOpen();
  return `<button class="btn btn-g btn-i${on ? ' active' : ''}" onclick="event.stopPropagation();togglePropsPanel()" aria-controls="side-panel" aria-expanded="${on}"
    title="${x(t('pbProperties'))} (Ctrl+Alt+B)" aria-label="${x(t('pbProperties'))}">${I.panelRight || I.fields}</button>`;
}

function renderPropsPanel(head, body) {
  const m = S.activeModuleNode || findModuleNode(S.activeItemNode?.moduleId);
  head.innerHTML = `${I.fields}<span class="sp-title">${t('pbProperties')}</span>
    <button class="btn btn-g btn-i" onclick="togglePropsPanel(false)" title="${t('cancel')}" aria-label="${t('cancel')}">&times;</button>`;
  let box = body.querySelector('.sp-props');
  if (!box) { box = document.createElement('div'); box.className = 'sp-props'; body.appendChild(box); }
  box.classList.remove('hidden');
  if (!m) { box.innerHTML = ''; return; }
  const item = S.activeItemNode;
  const row = (k, v) => `<div class="props-row"><span class="props-k">${t(k)}</span><span class="props-v">${v}</span></div>`;
  const where = addrChain(m.id).slice(0, -1).map((p) => x(p.name)).join(' › ') || '—';
  // Procress 16 B12: the description, tags and properties the page used to
  // open with — edited here; the page keeps one "Properties ›" row.
  const editor = pbPropsEditorHtml(m.id, item ? item.itemKey : null, 'fullside');
  box.innerHTML = `
    ${editor ? `<section class="props-sec props-editor">${editor}</section>` : ''}
    <section class="props-sec">
      ${item ? row('tplItemPage', `<span data-no-i18n>${x(ITEM_KIND[item.itemKind]?.nameOf(item.item) || '')}</span>`) : ''}
      ${row('pbAccKind', `<span class="kicon" aria-hidden="true" style="color:${x(m.color_code || KIND_COLOR[m.kind] || 'var(--accent)')}">${moduleIconHtml(m)}</span> <span data-no-i18n>${x(kindLabelBoth(m.kind))}</span>`)}
      ${row('moduleHandle', moduleHandleHtml(m))}
      ${row('propsWhere', `<span data-no-i18n>${where}</span>`)}
      ${m.create_at ? row('created', `<span data-no-i18n>${x(String(m.create_at).slice(0, 16))}</span>`) : ''}
      ${m.update_at ? row('propsUpdated', `<span data-no-i18n>${x(String(m.update_at).slice(0, 16))}</span>`) : ''}
    </section>
    <section class="props-sec"><h4>${t('pbLinks')}</h4><div id="props-links" class="props-links"><p class="drafter-hint">${t('syncWorking')}</p></div></section>
    <section class="props-sec">${typeof buildModuleAssetsStripHtml === 'function' ? buildModuleAssetsStripHtml(m) : ''}</section>
    <section class="props-sec props-acts">
      <button class="btn btn-s" onclick="openModuleIconPopup(${m.id},this)">${I.colors || ''} ${t('clsColorIcon')}</button>
      ${cmdBtn('page.history')}
    </section>`;
  box.querySelectorAll('.pblock[data-iid]').forEach(pbMountRoot);
  // Procress 16 part 7: the selected block's own settings, above the page's
  if (typeof _pbPop !== 'undefined' && _pbPop?.docked && pbBlockOf(_pbPop.iid)) {
    const sec = document.createElement('section');
    sec.className = 'props-sec pb-pop pb-pop-docked';
    sec.id = 'pb-pop';
    sec.setAttribute('role', 'region');
    box.prepend(sec);
    pbPopRender();
  }
  fillPropsLinks(m.id);
}

// The page's "Properties ›" row: open the panel (it stays open from then on)
// and bring the editor into view.
function openPageProperties() {
  if (!propsOpen() || S.side) togglePropsPanel(true);
  const ed = q('#side-panel .props-editor');
  ed?.scrollIntoView({ block: 'start' });
  ed?.querySelector('input,textarea,button,[contenteditable]')?.focus();
}

async function fillPropsLinks(moduleId) {
  const { outgoing = [], backlinks = [] } = await api.module.getLinks(moduleId).catch(() => ({}));
  const box = q('#props-links');
  if (!box || (S.activeModuleNode || findModuleNode(S.activeItemNode?.moduleId))?.id !== moduleId) return;
  const li = (e) => (e.key
    ? `<div class="li" onclick="openEntityByKey(${xj(e.key)})"><span class="name" data-no-i18n>${x(e.name)}</span></div>`
    : `<div class="li props-unresolved"><span class="name" data-no-i18n>[[${x(e.name)}]]</span></div>`);
  box.innerHTML = (outgoing.length || backlinks.length)
    ? `${outgoing.length ? `<div class="props-k">${t('propsLinksOut')} <span class="cnt" data-no-i18n>${outgoing.length}</span></div>${outgoing.map(li).join('')}` : ''}
       ${backlinks.length ? `<div class="props-k">${t('backlinks')} <span class="cnt" data-no-i18n>${backlinks.length}</span></div>${backlinks.map(li).join('')}` : ''}`
    : `<p class="drafter-hint">${t('propsNoLinks')}</p>`;
}

// Ctrl+Alt+B (VS Code's secondary side bar)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey && e.altKey && e.key.toLowerCase() === 'b') || !S.nexus) return;
  e.preventDefault();
  togglePropsPanel();
});

// Esc folds the panel while it floats over the page (a narrow window)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !propsNarrow() || !_propsNarrowOpen || e.defaultPrevented) return;
  if (document.querySelector('.modal-overlay:not(.hidden), #qs-overlay, .kind-popup, #pb-pop')) return;
  togglePropsPanel(false);
});
