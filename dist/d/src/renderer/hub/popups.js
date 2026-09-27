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
let _ctxSubmenuCloseTimer = null;
function cancelCtxSubmenuClose() {
  clearTimeout(_ctxSubmenuCloseTimer);
}
function scheduleCtxSubmenuClose() {
  clearTimeout(_ctxSubmenuCloseTimer);
  _ctxSubmenuCloseTimer = setTimeout(() => document.querySelector('.ctx-submenu')?.remove(), 200);
}
// The module menu's "Create" flyout (COMMANDS['module.create'].subHtml).
// Plan part1 #7 / process3 part2: Collector gets its own "create folder"
// row at the top, and is excluded from the generic kind list below so it
// doesn't also show up alphabetically as "Collector". The major/minor-module
// "+" popups (openKindPopup) stay unfiltered and list every kind.
function createSubmenuHtml(parentId) {
  return `
    <div class="kind-list-item" onclick="closeAllPopups();quickCreateModule('collector',${parentId})">
      <span class="kicon" style="color:${x(KIND_COLOR.collector)}">${I[KIND_ICON.collector]}</span>
      <span class="kli-text"><span class="kli-name">${x(t('createFolder'))}</span><span class="kli-desc">${t(KIND_DESC_KEY.collector)}</span></span>
    </div>
    <div class="ctx-sep"></div>` + buildKindListHtml(parentId, true);
}

// Cursor-anchored popup helper — inline onclick= attributes can't close over
// a live event object once the popup's own click handler runs later, so the
// last right-click point is stashed on S and read back here.
function ctxAnchor(ev) {
  const x = ev ? ev.clientX : (S.ctxMenuPos?.x ?? 0);
  const y = ev ? ev.clientY : (S.ctxMenuPos?.y ?? 0);
  return { getBoundingClientRect: () => ({ left: x, top: y, bottom: y, right: x }) };
}

