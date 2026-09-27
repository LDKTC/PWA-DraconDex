'use strict';
// ═══ Canvas frame (v5 Part 8, APP docs/V5.md §12.3 decision 10) ═════════
// A canvas component (a map, a board, a scene) on a page that scrolls:
//   - a fixed height, changed by dragging its bottom edge (stored in the
//     block's config.height, so each instance keeps its own)
//   - the wheel scrolls the PAGE until the canvas is clicked or Ctrl is
//     held — an embedded web map's rule, so scrolling past a map never
//     traps the reader inside it
//   - a full-screen button that gives the canvas the whole pane
// The kind draws its canvas as before; it only asks canvasWheelTakes()
// before handling a wheel event, and gets `onResize` after a size change.

const CANVAS_MIN_H = 200;

// The frame's height for this instance.
const canvasFrameHeight = (c, dflt) => Math.max(CANVAS_MIN_H, Number(c.config?.height) || dflt);

// The grip and the full-screen button, inside the board element.
function canvasFrameChromeHtml(c) {
  return `<button class="btn btn-g btn-i cf-full" onclick="toggleCanvasFull(${xj(c.iid)})" title="${t('cfFullScreen')}">${I.panelRight}</button>
    <div class="cf-grip" title="${t('cfResize')}"></div>`;
}

// Wire one board: engagement for the wheel, the grip, and a resize hook.
// Engagement alone, for a canvas without the frame's chrome (a timeline
// strip): pressing on it lets the wheel zoom it until the pointer leaves.
function canvasEngage(board) {
  if (!board || board._cfEngage) return;
  board._cfEngage = true;
  board.addEventListener('pointerdown', () => board.classList.add('cf-engaged'));
  board.addEventListener('pointerleave', () => board.classList.remove('cf-engaged'));
}

function mountCanvasFrame(c, board, onResize) {
  if (!board || board.dataset.cf) return;
  board.dataset.cf = '1';
  canvasEngage(board);
  const grip = board.querySelector('.cf-grip');
  grip?.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    try { grip.setPointerCapture(ev.pointerId); } catch (_) {}
    const y0 = ev.clientY, h0 = board.offsetHeight;
    const mv = (e) => { board.style.height = `${Math.max(CANVAS_MIN_H, h0 + e.clientY - y0)}px`; };
    const up = async () => {
      grip.removeEventListener('pointermove', mv);
      grip.removeEventListener('pointerup', up);
      const h = board.offsetHeight;
      c.block.config = { ...(c.block.config || {}), height: h };
      await api.block.update(c.block.id, { config: c.block.config });
      onResize?.();
    };
    grip.addEventListener('pointermove', mv);
    grip.addEventListener('pointerup', up);
  });
  CF_RESIZE[c.iid] = onResize;
}
const CF_RESIZE = {};

// May this wheel event zoom the canvas? Otherwise the page scrolls.
const canvasWheelTakes = (board, evt) => !!(evt?.ctrlKey || board?.classList.contains('cf-engaged') || board?.closest('.pb-canvas-full'));

function toggleCanvasFull(iid) {
  const root = pbRoot(iid);
  if (!root) return;
  const on = !root.classList.contains('pb-canvas-full');
  root.classList.toggle('pb-canvas-full', on);
  CF_RESIZE[iid]?.();
}
