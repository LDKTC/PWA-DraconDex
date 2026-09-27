'use strict';
// ═══ Tabs on the title bar (v5 Part 8, APP docs/V5.md §12.11) ═══════════
// A pane whose top edge is the top of the builder grid shows its tab group
// ON the title bar, over the part of it that sits above the pane's column;
// a pane lower down (the bottom half of a stacked split) keeps its own 38px
// strip. The group stays in the pane's DOM — .bpane-head, where every
// tab-drag, reorder and pop-out handler (builder.js) already looks for it —
// and is only LIFTED there: position:fixed over the column, measured here.
//
// Each column keeps a strip of title bar at its right end to drag the
// window by (TB_DRAG_GAP): the group gives up that width, and its tabs
// compact (syncTabBarCompact) before the gap would shrink. The title bar's
// own controls — the brand on the left, layout / settings / window buttons
// on the right — bound every group.
//
// Pop-outs lift their tabs the same way (user decision, Part 8): the tab
// bar was hidden in popup mode before.

const TB_DRAG_GAP = 48;

function titlebarBounds() {
  const bar = q('#title-tab-bar');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  let left = r.left, right = r.right;
  const lz = q('#title-left-zone');
  if (lz && lz.offsetParent !== null) left = Math.max(left, lz.getBoundingClientRect().right);
  // The first visible control after the drag strip.
  let el = q('#title-tab-bar .title-drag')?.nextElementSibling;
  for (; el; el = el.nextElementSibling) {
    const cr = el.getBoundingClientRect();
    if (cr.width > 0) { right = Math.min(right, cr.left); break; }
  }
  return { left, right, top: r.top, height: r.height };
}

function syncTitlebarTabs() {
  const main = q('#main-inner');
  const bounds = titlebarBounds();
  if (!main || !bounds) return;
  const top = main.getBoundingClientRect().top;
  // Rects are on-screen pixels; a fixed element's left/top are CSS pixels of
  // the body, which the UI-scale setting zooms (applyUiSettings).
  const z = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const px = (v) => `${v / z}px`;
  main.querySelectorAll('.bpane[data-pane]').forEach((paneEl) => {
    const head = paneEl.querySelector(':scope > .bpane-head');
    if (!head) return;
    const r = paneEl.getBoundingClientRect();
    const onTop = r.width > 0 && Math.abs(r.top - top) < 2;
    const left = Math.max(r.left, bounds.left);
    const width = Math.min(r.right - TB_DRAG_GAP, bounds.right) - left;
    if (onTop && width > 60) {
      head.classList.add('tb-tabgroup');
      Object.assign(head.style, { left: px(left), width: px(width), top: px(bounds.top), height: px(bounds.height) });
    } else {
      head.classList.remove('tb-tabgroup');
      head.style.left = head.style.width = head.style.top = head.style.height = '';
    }
    syncTabBarCompact(head.querySelector('.bpane-tabs'));
  });
}

// Remeasure on anything that moves a column: a split drag or a panel
// collapse resizes #main-inner or a pane (the observers), the window
// resizes (the listener). rAF-coalesced — a split drag fires many.
let _tbSyncQueued = false;
function queueTitlebarTabsSync() {
  if (_tbSyncQueued) return;
  _tbSyncQueued = true;
  requestAnimationFrame(() => { _tbSyncQueued = false; syncTitlebarTabs(); });
}
const _tbObserver = new ResizeObserver(queueTitlebarTabsSync);
function observeTitlebarTabs(el) { if (el && !el._tbObserved) { el._tbObserved = true; _tbObserver.observe(el); } }
window.addEventListener('resize', queueTitlebarTabsSync);
