'use strict';
// ═══ Page components — shared bits (Procress 14, APP docs/TEMPLATES.md §2) ══
// The components a page template names (SDB templates/components.json) draw
// in two steps: render() leaves a shell, mount() fetches through the
// existing api.* calls and fills it. So a borrowed block (c.source is
// another module) and a block on its own module read the same way, and a
// slow read never holds up the rest of the page.

function pcShell(cls = '') {
  const k = cls ? `pc ${cls}` : 'pc';
  return `<div class="${k}" data-r="pc"><div class="pc-loading">${t('loading')}</div></div>`;
}

// Fill the shell with what fn() resolves to. A read that fails leaves a
// quiet line instead of a broken block.
async function pcFill(c, fn) {
  const el = c.root?.querySelector('[data-r="pc"]');
  if (!el) return;
  let html;
  try { html = await fn(); } catch (_) { html = pcEmpty(t('pcLoadFailed')); }
  if (el.isConnected) el.innerHTML = html;
}

const pcEmpty = (text) => `<div class="pc-empty">${x(text)}</div>`;

// A Classifier field by its key (Procress 14: a template's config.field) —
// the key rides in the field's options — or, for an older field, its name.
function pcFieldKeyOf(tpl) {
  try { return JSON.parse(tpl?.options || '{}')?.key || null; } catch (_) { return null; }
}
const pcFindField = (templates, key) => (templates || []).find((tp) => pcFieldKeyOf(tp) === key)
  || (templates || []).find((tp) => tp.description === key) || null;

const pcObjectId = (itemKey) => (/^cobj_\d+$/.test(itemKey || '') ? Number(itemKey.slice(5)) : null);
const pcPad = (n) => String(n ?? 0).padStart(2, '0');
const pcDate = (r, p = 's_') => (r?.[`${p}years`] == null ? '' : `${r[`${p}years`]}.${pcPad(r[`${p}month`])}.${pcPad(r[`${p}day`])}`);
const pcWords = (html) => String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
const pcOpen = (key) => `onclick="openEntityByKey(${xj(key)})"`;
const pcOpenModule = (id) => `onclick="openModuleNode(${Number(id)})"`;

// A labelled bar row, for counts (breakdown, eras, progress).
function pcBarsHtml(rows, max = null) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.n));
  return `<div class="pc-bars">${rows.map((r) => `<div class="pc-bar-row"${r.attrs ? ` ${r.attrs}` : ''}>
    <span class="pc-bar-label">${x(r.label)}</span>
    <span class="pc-bar"><span class="pc-bar-fill" style="width:${Math.round((r.n / top) * 100)}%${r.color ? `;background:${x(r.color)}` : ''}"></span></span>
    <span class="pc-bar-n">${r.n}</span></div>`).join('')}</div>`;
}

// Facts (inspector.facts): the `key: value` lines of a note, markdown or
// the editor's HTML. A key is 1–40 characters with a letter in it and the
// colon needs a space after it, so "https://…" and "10:30" never count
// (nor a bare scheme as the key);
// headings, fenced code and task lines are skipped.
function pcFactsOf(text, max = 12) {
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
  const lines = String(text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ent[k]).split('\n');
  const out = [];
  let fence = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence || !l || l.startsWith('#') || /^[-*]\s*\[( |x|X)\]/.test(l)) continue;
    const m = /^(?:[-*]\s+)?\**([^:*]{1,40}?)\**\s*:\s+\**\s*(.+?)\s*$/u.exec(l);
    if (!m || !/\p{L}/u.test(m[1]) || /^(https?|ftp|mailto|file|data|javascript)$/i.test(m[1].trim()) || !m[2].replace(/\*+$/, '').trim()) continue;
    out.push({ k: m[1].trim(), v: m[2].replace(/\*+$/, '').trim() });
    if (out.length >= max) break;
  }
  return out;
}

// Place card (locator.placecard): which area, and the crop around it. A
// map has no picture of its own — the crop is the areas' outlines, fitted
// to the chosen area's box with 40% around it. `borders` are the areas
// whose boxes touch the chosen one's.
function pcPickArea(areas, want) {
  const w = String(want || '').trim().toLowerCase();
  return (w && areas.find((a) => String(a.area_name || '').trim().toLowerCase() === w)) || areas[0] || null;
}
function pcBoxOf(points) {
  if (!points?.length) return null;
  const xs = points.map((p) => Number(p.x)); const ys = points.map((p) => Number(p.y));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function pcPlaceGeom(areas, chosen) {
  const boxes = new Map(areas.map((a) => [a.id, pcBoxOf(a.points)]));
  const all = [...boxes.values()].filter(Boolean);
  const own = boxes.get(chosen.id);
  const b = own || (all.length ? { x0: Math.min(...all.map((q) => q.x0)), y0: Math.min(...all.map((q) => q.y0)), x1: Math.max(...all.map((q) => q.x1)), y1: Math.max(...all.map((q) => q.y1)) } : null);
  const borders = own ? areas.filter((a) => a.id !== chosen.id && boxes.get(a.id)
    && boxes.get(a.id).x0 <= own.x1 && boxes.get(a.id).x1 >= own.x0 && boxes.get(a.id).y0 <= own.y1 && boxes.get(a.id).y1 >= own.y0) : [];
  if (!b) return { view: null, borders };
  const w = Math.max(b.x1 - b.x0, 20); const h = Math.max(b.y1 - b.y0, 20);
  const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2;
  const side = Math.max(w, h) * 1.4;
  return { view: [cx - side / 2, cy - side / 2, side, side].map((v) => Math.round(v * 10) / 10), borders };
}

// registerComponent for a component that fills itself after mount.
function registerFilled(id, spec, fill) {
  registerComponent(id, {
    ...spec,
    render: () => pcShell(spec.cls || ''),
    mount: (c) => {
      if (spec.needsSource !== false && !c.source) return;
      pcFill(c, () => fill(c));
    },
  });
}
