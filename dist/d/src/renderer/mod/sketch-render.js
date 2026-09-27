'use strict';
// ═══ Sketcher stroke renderer (v5 Part 7, APP docs/V5.md §11.6) ═════════
// Split out of mod/sketcher.js so a Designer comic panel can show a Sketcher
// page without the Sketcher being open: the §11.6 Framer decision ("images
// come from Sketcher") had this as its hidden cost. Loaded before both.
//
//   renderSketchStrokes(ctx, strokes, fallbackColor)   draw onto a 2D context
//   sketchPageFitDataUrl(pageId, w, h)                 a page fitted to w×h
//                                                      (its drawn area, not
//                                                      the whole board)

function renderSketchStrokes(ctx, strokes, fallbackColor = SK_COLORS[0]) { // SK_COLORS: mod/sketcher.js, read at call time
  ctx.lineJoin = ctx.lineCap = 'round';
  for (const s of strokes) {
    const pts = typeof s.points === 'string' ? JSON.parse(s.points) : s.points;
    if (!pts || pts.length < 4) continue;
    ctx.strokeStyle = s.color || fallbackColor;
    ctx.lineWidth = s.width || 3;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
}

// The bounding box of every point, padded by the widest stroke.
function sketchStrokesBounds(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, pad = 0;
  for (const s of strokes) {
    const pts = typeof s.points === 'string' ? JSON.parse(s.points) : s.points;
    for (let i = 0; i + 1 < (pts || []).length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    }
    pad = Math.max(pad, s.width || 3);
  }
  return x0 === Infinity ? null : { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

// Cached per page and size for one render pass — a page shown in three
// panels is fetched and drawn once. The cache is dropped with the page's data.
const _sketchFitCache = new Map();
async function sketchPageFitDataUrl(pageId, w, h) {
  const k = `${pageId}:${Math.round(w)}x${Math.round(h)}`;
  if (_sketchFitCache.has(k)) return _sketchFitCache.get(k);
  const strokes = await api.sketcher.getStrokes(pageId);
  const b = sketchStrokesBounds(strokes);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext('2d');
  if (b) {
    const s = Math.min(w / b.w, h / b.h) * dpr;
    ctx.translate((c.width - b.w * s) / 2, (c.height - b.h * s) / 2);
    ctx.scale(s, s);
    ctx.translate(-b.x, -b.y);
    renderSketchStrokes(ctx, strokes);
  }
  const url = c.toDataURL('image/png');
  _sketchFitCache.set(k, url);
  return url;
}
const dropSketchFitCache = () => _sketchFitCache.clear();
