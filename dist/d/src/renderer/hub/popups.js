// Popup plumbing shared by every hub menu: close-all, position-near-anchor,
// submenu positioning and the hover-close timers. The create/edit modal entry
// points sit here too because they are what the popups open.
// ═══ Create (instant, via kind-popup) / delete — editing is inline (§8.3)
// Plan process3 part1: renamed from openMajorModuleModal — "Major module"
// used to mean top-level-only; the new top-level-only concept is "Main
// module" (Major now means any module, at any depth — see CLAUDE.md/
// Plan.md's Process 3 for the full terminology split).
async function openMainModuleModal(anchor) {
  if (!S.nexus) return;
  openKindPopup(null, anchor);
}
async function openMinorModuleModal(parentId, anchor) {
  if (!S.nexus) return;
  openKindPopup(parentId, anchor);
}

// ═══ Popup plumbing shared by the kind-picker and the icon/color popup ═
// Closed globally on any outside click — see the `.kind-popup` sweep next
// to the `.np-dropdown` one in core.js's init().
function closeAllPopups() {
  document.querySelectorAll('.kind-popup').forEach(el => el.remove());
}
// Place a freshly-appended popup below its anchor button, flipping above
// and clamping horizontally if it would overflow the viewport — same idea
// as guide.js's _guidePaint popover placement, generalized for reuse here.
function positionPopupNear(el, rect) {
  const pw = el.offsetWidth, ph = el.offsetHeight, gap = 6;
  let top = rect.bottom + gap;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - gap);
  let left = rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// Place a submenu flyout to the right of its parent row (native context-menu
// convention), flipping to the left when it would overflow the right edge —
// vertically aligned with the row itself rather than below it, like
// positionPopupNear.
function positionSubmenuNear(el, rect) {
  const pw = el.offsetWidth, ph = el.offsetHeight, gap = 2;
  let left = rect.right + gap;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, rect.left - pw - gap);
  let top = rect.top;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// The Major-module context menu's "Create" row (buildModuleContextMenuHtml)
// reveals the kind list as a hover submenu instead of inlining it — a second
// `.kind-popup` appended next to the first, closed on mouseleave with a short
// grace period so crossing the gap between the row and the flyout doesn't
// close it prematurely.
// Procress 16 B4: a flyout the pointer is over never closes (rows inside it
// used to schedule their own close), and rows crossed on the diagonal way to
// it neither close nor replace it — the "safe triangle" of Amazon's mega-menu.
let _ctxSubmenuCloseTimer = null, _ctxIntentTimer = null;
let _ptr = null, _ptrPrev = null, _ptrChecked = null;
document.addEventListener('mousemove', (e) => { _ptrPrev = _ptr; _ptr = { x: e.clientX, y: e.clientY }; }, { passive: true });

// True while the last pointer move points into the open flyout's near edge.
// A pointer that hasn't moved since the previous check isn't aiming anywhere.
function aimingAtCtxSubmenu() {
  const sub = document.querySelector('.ctx-submenu');
  const moved = _ptr && _ptr !== _ptrChecked;
  _ptrChecked = _ptr;
  if (!sub || !moved || !_ptrPrev) return false;
  const r = sub.getBoundingClientRect();
  const toLeft = r.right <= _ptr.x;                    // flyout flipped to the left
  const dx = (p) => Math.max(1e-3, toLeft ? p.x - r.right : r.left - p.x);
  if (dx(_ptr) <= 1e-3) return false;
  const slope = (p, cy) => (cy - p.y) / dx(p);
  // closer to the flyout and the angle to both corners widened = heading inside
  return slope(_ptr, r.top) < slope(_ptrPrev, r.top) && slope(_ptr, r.bottom) > slope(_ptrPrev, r.bottom);
}
// Run fn now, or once the pointer stops heading for the open flyout.
function ctxHoverIntent(fn) {
  clearTimeout(_ctxIntentTimer);
  if (aimingAtCtxSubmenu()) _ctxIntentTimer = setTimeout(() => ctxHoverIntent(fn), 100);
  else fn();
}
function cancelCtxSubmenuClose() {
  clearTimeout(_ctxSubmenuCloseTimer);
  clearTimeout(_ctxIntentTimer);
}
function scheduleCtxSubmenuClose() {
  clearTimeout(_ctxSubmenuCloseTimer);
  _ctxSubmenuCloseTimer = setTimeout(() => ctxHoverIntent(() => document.querySelector('.ctx-submenu:not(:hover)')?.remove()), 300);
}

// Cursor-anchored popup helper — inline onclick= attributes can't close over
// a live event object once the popup's own click handler runs later, so the
// last right-click point is stashed on S and read back here.
function ctxAnchor(ev) {
  const x = ev ? ev.clientX : (S.ctxMenuPos?.x ?? 0);
  const y = ev ? ev.clientY : (S.ctxMenuPos?.y ?? 0);
  return { getBoundingClientRect: () => ({ left: x, top: y, bottom: y, right: x }) };
}

