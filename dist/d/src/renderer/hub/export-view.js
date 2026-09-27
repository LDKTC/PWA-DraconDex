'use strict';
// ═══ The open view as a picture (Procress 14, EXPORT-DECOR.md E6) ═══════
// Each view is drawn one of four ways, and each leaves as what it is:
//   svg     the Chronicler timelines — the SVG itself, the theme's colours
//           written onto every element (a file has no stylesheet or tokens)
//   board   Exhibitor graph, Designer, Narrator — HTML nodes over an SVG
//           edge layer: redrawn as ONE SVG, the edges copied, every node a
//           box with its text and icons, so Inkscape / Figma can edit it
//   konva   Locator map, Exhibitor scene and cards, Wanderer — the stage as
//           a PNG at twice the screen's resolution
//   canvas  the Sketcher page — its canvas as a PNG
// Main (db/view-export.js) checks the result before writing it.

const EV_BOARDS = '#cn-graph, #dg-stage, #nar-graph';
const EV_SVGS = '#timeline-graph-svg, #chr-downline-svg';
const EV_SVG_NS = 'http://www.w3.org/2000/svg';
const EV_STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'visibility'];

const evVisible = (el) => !!el && el.offsetParent !== null && !el.closest('.hx-host');
const evEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// What the open page shows: the first visible view, in the order above.
function exportViewTarget() {
  const pick = (sel) => [...document.querySelectorAll(sel)].find(evVisible);
  let el;
  if ((el = pick(EV_BOARDS))) return { how: 'board', el };
  if ((el = pick(EV_SVGS))) return { how: 'svg', el };
  const stageBox = pick('.konvajs-content');
  if (stageBox && typeof Konva !== 'undefined') {
    const stage = Konva.stages.find((s) => s.content === stageBox || s.container()?.contains(stageBox));
    if (stage) return { how: 'konva', stage };
  }
  const canvases = [...document.querySelectorAll('#main-inner canvas')].filter(evVisible);
  if (canvases.length) return { how: 'canvas', el: canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0] };
  return null;
}

// Every element of a cloned SVG gets the computed style of its original —
// var(--accent), classes and currentColor mean nothing once it is a file.
function evInlineStyles(src, dst) {
  const a = [src, ...src.querySelectorAll('*')];
  const b = [dst, ...dst.querySelectorAll('*')];
  a.forEach((el, i) => {
    const out = b[i];
    if (!out || !(el instanceof SVGElement)) return;
    const cs = getComputedStyle(el);
    const style = EV_STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p)]).filter(([, v]) => v && v !== 'normal' && v !== 'auto')
      .map(([p, v]) => `${p}:${v}`).join(';');
    out.removeAttribute('class');
    if (style) out.setAttribute('style', style);
  });
}

// A <foreignObject> holding plain text (an edge label) becomes <text>; any
// other one (an HTML icon) goes — no editor renders it.
function evFlattenForeign(svg) {
  svg.querySelectorAll('foreignObject').forEach((fo) => {
    const text = fo.textContent.trim();
    if (text) {
      const t = document.createElementNS(EV_SVG_NS, 'text');
      const x = Number(fo.getAttribute('x') || 0) + Number(fo.getAttribute('width') || 0) / 2;
      const y = Number(fo.getAttribute('y') || 0) + Number(fo.getAttribute('height') || 0) / 2;
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('style', `font-size:11px;font-family:sans-serif;fill:${getComputedStyle(document.body).getPropertyValue('--t2').trim() || '#555'}`);
      t.textContent = text;
      fo.replaceWith(t);
    } else fo.remove();
  });
}

function evSvgOf(el) {
  const clone = el.cloneNode(true);
  evInlineStyles(el, clone);
  evFlattenForeign(clone);
  const box = el.getBoundingClientRect();
  clone.setAttribute('xmlns', EV_SVG_NS);
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);
  clone.setAttribute('width', Math.round(box.width));
  clone.setAttribute('height', Math.round(box.height));
  clone.removeAttribute('id');
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  if (bg) {
    const r = document.createElementNS(EV_SVG_NS, 'rect');
    r.setAttribute('x', '-100000'); r.setAttribute('y', '-100000'); r.setAttribute('width', '200000'); r.setAttribute('height', '200000');
    r.setAttribute('fill', bg);
    clone.insertBefore(r, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

// ── board → one SVG ──────────────────────────────────────────────────
const evPx = (v) => parseFloat(v) || 0;
const evPaint = (c) => (!c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) ? null : c);

function evBoardSvg(board) {
  const origin = board.getBoundingClientRect();
  const scale = origin.width && board.offsetWidth ? origin.width / board.offsetWidth : 1;
  const at = (r) => ({ x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale });
  const parts = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (b) => { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); };

  // the edge layer(s): copied whole, styles written in
  board.querySelectorAll(':scope > svg').forEach((edges) => {
    const clone = edges.cloneNode(true);
    evInlineStyles(edges, clone);
    evFlattenForeign(clone);
    const b = at(edges.getBoundingClientRect());
    parts.push(`<g transform="translate(${b.x},${b.y})">${[...clone.childNodes].map((n) => new XMLSerializer().serializeToString(n)).join('')}</g>`);
    edges.querySelectorAll('path, line, polyline, text').forEach((p) => {
      if (p.closest('defs, marker')) return; // an arrowhead's template, not a drawn edge
      const r = p.getBoundingClientRect();
      if (r.width || r.height) grow(at(r));
    });
  });

  // the nodes: every visible box, text run and icon inside them
  const nodes = [...board.children].filter((c) => c.tagName !== 'svg' && c instanceof HTMLElement && c.offsetParent !== null);
  for (const node of nodes) {
    grow(at(node.getBoundingClientRect()));
    for (const el of [node, ...node.querySelectorAll('*')]) {
      if (el instanceof SVGElement) {
        if (el.tagName === 'svg' && !el.parentElement?.closest('svg')) { // an icon, not a shape inside one
          const b = at(el.getBoundingClientRect());
          const icon = el.cloneNode(true);
          const color = getComputedStyle(el).color;
          icon.setAttribute('x', b.x); icon.setAttribute('y', b.y); icon.setAttribute('width', b.w); icon.setAttribute('height', b.h);
          icon.removeAttribute('class');
          parts.push(new XMLSerializer().serializeToString(icon).replace(/currentColor/g, color));
        }
        continue;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const fill = evPaint(cs.backgroundColor);
      const bw = evPx(cs.borderTopWidth);
      const stroke = bw ? evPaint(cs.borderTopColor) : null;
      if (fill || stroke) {
        const b = at(el.getBoundingClientRect());
        const rx = Math.min(evPx(cs.borderTopLeftRadius), b.w / 2, b.h / 2);
        parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${bw}"` : ''}/>`);
      }
      for (const tn of el.childNodes) {
        if (tn.nodeType !== 3 || !tn.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(tn);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        const b = at(r);
        parts.push(`<text x="${b.x}" y="${b.y + b.h * 0.78}" style="font-family:${evEsc(cs.fontFamily)};font-size:${cs.fontSize};font-weight:${cs.fontWeight};fill:${cs.color}">${evEsc(tn.textContent.trim())}</text>`);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  const pad = 24;
  const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2].map((n) => Math.round(n));
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#ffffff';
  return `<svg xmlns="${EV_SVG_NS}" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">
<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${bg}"/>
${parts.join('\n')}
</svg>`;
}

// The colour a view is drawn over: the first painted background around it
// (a Konva stage is transparent — its board's dark comes from CSS).
function evBackground(el) {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const c = evPaint(getComputedStyle(e).backgroundColor);
    if (c) return c;
  }
  return getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#ffffff';
}

// A canvas laid over that background, as a PNG data URL.
function evFlatPng(src, bg) {
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out.toDataURL('image/png');
}

// → { svg } | { png } | null
function exportViewPicture() {
  const tg = exportViewTarget();
  if (!tg) return null;
  if (tg.how === 'svg') return { svg: evSvgOf(tg.el) };
  if (tg.how === 'board') { const svg = evBoardSvg(tg.el); return svg ? { svg } : null; }
  if (tg.how === 'konva') return { png: evFlatPng(tg.stage.toCanvas({ pixelRatio: 2 }), evBackground(tg.stage.container())) };
  try { return { png: evFlatPng(tg.el, evBackground(tg.el)) }; } catch (_) { return null; }
}

async function exportViewNow(moduleId) {
  const m = findModuleNode(moduleId);
  const pic = exportViewPicture();
  if (!pic) { toast(t('exportNoView'), 'error'); return; }
  const r = await api.nexus.exportImage(m?.name || 'view', pic);
  if (r?.canceled) return;
  if (!r?.ok) { toast(t('driveErrServer'), 'error'); return; }
  toast(`${t('saved')} · ${pic.svg ? 'SVG' : 'PNG'}`, 'ok');
}
