'use strict';
// ═══ Long lists that grow as they scroll (Procress 17 P1) ════════════════
// A 3,000-object Classifier opened as 51,000 DOM nodes in ~2 s. lazyRows()
// renders the first `step` rows plus a sentinel; when the sentinel scrolls
// near view the next `step` are appended in place. `state` is the view
// instance's own state, so the count survives the app's whole-page re-renders
// (a click on row 2,500 keeps rows 1–2,550 on screen) — pass `keep` = the
// index that must be shown (the selected row).
// ponytail: grows and never recycles — a list scrolled to the end holds every
// row again. Recycle rows (true windowing) if 10k-row lists turn up.
const _lazy = new Map(); // sentinel id -> { items, rowHtml, state, step, more }
let _lazySeq = 0;
function lazyRows(items, rowHtml, state, { step = 100, keep = -1, more = (id) => `<div class="lazy-more" data-lazy="${id}"></div>` } = {}) {
  for (const k of _lazy.keys()) if (!document.querySelector(`[data-lazy="${k}"]`)) _lazy.delete(k);
  const shown = Math.min(items.length, Math.max(step, state.shown || 0, keep + 1 + step / 2));
  state.shown = shown;
  const head = items.slice(0, shown).map(rowHtml).join('');
  if (shown >= items.length) return head;
  const id = `lz${++_lazySeq}`;
  _lazy.set(id, { items, rowHtml, state, step });
  return head + more(id);
}
function lazyGrow(el) {
  const L = _lazy.get(el.dataset.lazy);
  if (!L) return;
  const from = L.state.shown, to = Math.min(L.items.length, from + L.step);
  el.insertAdjacentHTML('beforebegin', L.items.slice(from, to).map(L.rowHtml).join(''));
  L.state.shown = to;
  if (to >= L.items.length) { _lazy.delete(el.dataset.lazy); el.remove(); }
  if (typeof hydrateDisplayImages === 'function') hydrateDisplayImages(); // grid thumbnails in the new rows
}
const _lazyObs = new IntersectionObserver((ents) => {
  for (const e of ents) if (e.isIntersecting) { lazyGrow(e.target); if (e.target.isConnected) { _lazyObs.unobserve(e.target); _lazyObs.observe(e.target); } }
}, { rootMargin: '800px' });
new MutationObserver(() => {
  for (const el of document.querySelectorAll('[data-lazy]:not([data-lazy-on])')) { el.dataset.lazyOn = '1'; _lazyObs.observe(el); }
}).observe(document.documentElement, { childList: true, subtree: true });
