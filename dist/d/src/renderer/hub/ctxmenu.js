'use strict';
// ═══ Context-menu engine (v5 Part 3, APP docs/V5.md §7.2) ════════════════
// Built on the popup plumbing in hub/popups.js (closeAllPopups,
// positionPopupNear, positionSubmenuNear, ctxAnchor, the submenu grace
// timer) rather than beside it. Adds:
//   ctxMenu(ev, items)      a whole menu from data — [{label, icon, onClick,
//                           danger, disabled, checked, hint, sub, subHtml,
//                           sep}] — (subHtml: a hand-built flyout, e.g. the
//                           grouped kind list) —
//                           instead of another hand-built .kind-popup
//   openCtxSubmenu(ev, html) the one hover-flyout opener the four copies in
//                           popups.js / builder.js now call
//   CTX_PROVIDERS           surface id -> (ctx) => items, looked up by
//                           openCtx(surface, ev, ctx) — the registry §7.2 asks
//                           for, keyed like KIND_PAGE
//   keyboard + ARIA         for EVERY menu in the app, including the ones
//                           still built by hand: role=menu/menuitem are
//                           stamped on as popups appear, arrows move, Enter
//                           runs, → / ← open and close a submenu, and Escape
//                           closes the top menu in the capture phase with
//                           stopPropagation — so it never reaches the modal
//                           underneath (the uiConfirm / quickswitch idiom).

const CTX_PROVIDERS = {};
let _ctxActions = [];

function openCtx(surface, ev, ctx) {
  const provider = CTX_PROVIDERS[surface];
  if (!provider) return;
  const items = provider(ctx || {});
  if (items && items.length) ctxMenu(ev, items);
  else { ev?.preventDefault?.(); }
}

function ctxItemsHtml(items) {
  return (items || []).filter(Boolean).map((it) => {
    if (it.sep) return '<div class="ctx-sep" role="separator"></div>';
    const i = _ctxActions.push(it) - 1;
    const icon = it.icon && I[it.icon] ? `<span class="kicon">${I[it.icon]}</span>` : '';
    const hasSub = !!(it.sub || it.subHtml);
    const cls = ['kind-list-item', hasSub ? 'kli-submenu-parent' : '', it.danger ? 'kli-danger' : '', it.disabled ? 'kli-disabled' : '']
      .filter(Boolean).join(' ');
    return `<div class="${cls}" role="menuitem" tabindex="-1" data-ci="${i}"${hasSub ? ' aria-haspopup="menu"' : ''}${it.disabled ? ' aria-disabled="true"' : ''}>
      ${icon}<span class="kli-name">${x(it.label)}</span>
      ${it.hint ? `<span class="kli-hint" data-no-i18n>${x(it.hint)}</span>` : ''}
      ${it.checked ? `<span class="ctx-check">${I.check}</span>` : ''}
      ${hasSub ? `<span class="kli-arrow">${I.chevronRight || '›'}</span>` : ''}
    </div>`;
  }).join('');
}

// Rows carry an index into _ctxActions; one delegated listener per popup
// runs them, so an item's onClick can be a real closure instead of an
// inline-onclick string.
function wireCtxItems(pop) {
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const row = e.target.closest('[data-ci]');
    if (!row) return;
    const it = _ctxActions[Number(row.dataset.ci)];
    if (!it || it.disabled) return;
    if (it.sub || it.subHtml) { openCtxItemSubmenu(row, it); return; }
    closeAllPopups();
    if (typeof it.onClick === 'function') it.onClick();
  });
  pop.addEventListener('mouseover', (e) => {
    const row = e.target.closest('[data-ci]');
    if (!row) return;
    const it = _ctxActions[Number(row.dataset.ci)];
    if (it?.sub || it?.subHtml) openCtxItemSubmenu(row, it);
    else if (!pop.classList.contains('ctx-submenu')) scheduleCtxSubmenuClose();
  });
}

function ctxMenu(ev, items, opts = {}) {
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
  closeAllPopups();
  if (ev && ev.clientX != null) S.ctxMenuPos = { x: ev.clientX, y: ev.clientY };
  _ctxActions = [];
  const pop = document.createElement('div');
  pop.className = 'kind-popup context-menu-popup';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = ctxItemsHtml(items);
  document.body.appendChild(pop);
  wireCtxItems(pop);
  positionPopupNear(pop, (opts.anchor || ctxAnchor(ev)).getBoundingClientRect());
  // Opened from the keyboard (Shift+F10 / the Menu key) → start on item 1.
  if (ev && ev.type === 'keydown') ctxFocusItem(pop, 0);
  return pop;
}

function openCtxItemSubmenu(row, it) {
  const existing = document.querySelector('.ctx-submenu');
  if (existing && existing._ctxOwner === row) { cancelCtxSubmenuClose(); return existing; }
  existing?.remove();
  // A hand-built flyout wires its own inline onclicks — no ctx-item wiring.
  if (it.subHtml) return openCtxSubmenu({ currentTarget: row }, it.subHtml());
  const sub = typeof it.sub === 'function' ? it.sub() : it.sub;
  const pop = openCtxSubmenu({ currentTarget: row }, ctxItemsHtml(sub));
  if (pop) wireCtxItems(pop);
  return pop;
}

// The single flyout opener (§7.2) — create / move-to / pane-direction /
// builder-separate / asset-move all used to carry their own copy of these
// ten lines.
function openCtxSubmenu(ev, html) {
  cancelCtxSubmenuClose();
  const owner = ev?.currentTarget || null;
  const existing = document.querySelector('.ctx-submenu');
  if (existing) {
    if (existing._ctxOwner === owner) return existing;
    existing.remove();
  }
  const pop = document.createElement('div');
  pop.className = 'kind-popup kind-list-popup ctx-submenu';
  pop.setAttribute('role', 'menu');
  pop._ctxOwner = owner;
  pop.innerHTML = html;
  document.body.appendChild(pop);
  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('mouseenter', cancelCtxSubmenuClose);
  pop.addEventListener('mouseleave', scheduleCtxSubmenuClose);
  if (owner) positionSubmenuNear(pop, owner.getBoundingClientRect());
  return pop;
}

// ── Keyboard + ARIA for every menu ──────────────────────────────────────
const CTX_MENU_SEL = '.context-menu-popup, .kind-list-popup, [role="menu"]';
const ctxMenuItems = (pop) => [...pop.querySelectorAll('.kind-list-item')]
  .filter((el) => el.offsetParent !== null && el.getAttribute('aria-disabled') !== 'true');
const ctxTopMenu = () => {
  const menus = [...document.querySelectorAll(CTX_MENU_SEL)].filter((el) => el.classList.contains('kind-popup'));
  return menus[menus.length - 1] || null;
};

function ctxFocusItem(pop, idx) {
  const items = ctxMenuItems(pop);
  if (!items.length) return;
  const i = (idx + items.length) % items.length;
  items[i].focus();
}

// Stamp roles onto hand-built menus as they are appended, so the older 20
// .kind-popup sites get the same semantics without each being rewritten.
function ariaStampMenu(el) {
  if (!el.classList?.contains('kind-popup') || !el.matches(CTX_MENU_SEL.replace(', [role="menu"]', ''))) return;
  if (!el.getAttribute('role')) el.setAttribute('role', 'menu');
  el.querySelectorAll('.kind-list-item').forEach((row) => {
    if (!row.getAttribute('role')) row.setAttribute('role', 'menuitem');
    if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1');
  });
  el.querySelectorAll('.ctx-sep').forEach((sep) => sep.setAttribute('role', 'separator'));
}

function initCtxMenuEngine() {
  if (window.__ctxMenuEngine) return;
  window.__ctxMenuEngine = true;
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) ariaStampMenu(n);
  }).observe(document.body, { childList: true });

  // Capture phase + stopPropagation: the top popup owns Escape and the
  // arrows, so a modal or the builder underneath never sees them.
  document.addEventListener('keydown', (e) => {
    const popups = document.querySelectorAll('.kind-popup');
    if (!popups.length) return;
    const top = popups[popups.length - 1];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const owner = top._ctxOwner;
      top.remove();
      if (owner && document.body.contains(owner)) owner.focus?.();
      return;
    }
    const menu = ctxTopMenu();
    if (!menu) return;
    // A text field inside a popup (a search box, a filter value) keeps its keys.
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') && !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = ctxMenuItems(menu);
    const cur = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      ctxFocusItem(menu, cur < 0 ? (e.key === 'ArrowDown' ? 0 : -1) : cur + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      ctxFocusItem(menu, e.key === 'Home' ? 0 : -1);
    } else if ((e.key === 'Enter' || e.key === ' ') && cur >= 0) {
      e.preventDefault();
      e.stopPropagation();
      items[cur].click();
    } else if (e.key === 'ArrowRight' && cur >= 0 && items[cur].classList.contains('kli-submenu-parent')) {
      e.preventDefault();
      e.stopPropagation();
      items[cur].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      items[cur].dispatchEvent(new MouseEvent('mouseenter'));
      const sub = document.querySelector('.ctx-submenu');
      if (sub) ctxFocusItem(sub, 0);
    } else if (e.key === 'ArrowLeft' && menu.classList.contains('ctx-submenu')) {
      e.preventDefault();
      e.stopPropagation();
      const owner = menu._ctxOwner;
      menu.remove();
      owner?.focus?.();
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCtxMenuEngine);
else initCtxMenuEngine();

// ── Canvas right-click (V5.md §7.2 "the 8 empty canvases") ──────────────
// Every board in the app pans on right-drag, so contextmenu fires at the
// end of a pan too. A menu opens only when the right button did not travel —
// a pan stays a pan. Replaces the bare `contextmenu -> preventDefault()`
// each board had, which suppressed the native menu and put nothing there.
function bindCanvasCtx(el, surface, getCtx, listenerOpts) {
  if (!el) return;
  let down = null;
  el.addEventListener('mousedown', (e) => { if (e.button === 2) down = { x: e.clientX, y: e.clientY }; }, listenerOpts);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const moved = down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4;
    down = null;
    if (moved) return;
    openCtx(surface, e, typeof getCtx === 'function' ? getCtx(e) : (getCtx || {}));
  }, listenerOpts);
}
