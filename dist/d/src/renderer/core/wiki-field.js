'use strict';
// ═══ [[wikilinks]] in plain text fields (v5 Part 4, APP docs/V5.md §8.4) ═
// The markdown editor (mdeditor.js) has had [[ autocomplete since v2.8; the
// other free-text fields — Classifier values, event stories, dialogue
// descriptions, Exhibitor notes, chat messages — were plain <input>,
// <textarea> and contenteditable cells with none. Any of them opts in with a
// `data-wiki` attribute; one delegated listener set serves them all, so a
// field is a one-attribute change in its template.
//
// Two ways to make a link, per the requirement:
//   type [[        a suggestion list of the vault's names (the same
//                  quickIndex cache mdeditor uses — refreshWikiCache)
//   select → right-click → "Connect link"   wraps the selection in [[ ]]
// Both only edit the TEXT. wiki_link rows are still written by the db layer
// when the field saves (§8.11.3 — this is a typing shortcut, not a second
// authoring surface), and only for fields registered in db/wiki-sources.js.

const WIKI_FIELD_SEL = '[data-wiki]';
const WIKI_AC_MAX = 8;
let _wikiAc = null; // { el, items, idx, pop }

// Text before the caret, and a writer that replaces [start, caret) — the
// same two operations for a form control and a plain-text contenteditable.
function wikiFieldCaret(el) {
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    return { text: el.textContent, pos: r.toString().length };
  }
  return { text: el.value, pos: el.selectionStart };
}

function wikiFieldWrite(el, text, caret) {
  if (el.isContentEditable) {
    el.textContent = text;
    const node = el.firstChild || el;
    const r = document.createRange();
    r.setStart(node, Math.min(caret, node.textContent.length));
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } else {
    el.value = text;
    el.selectionStart = el.selectionEnd = caret;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // Form controls save on change; a scripted value change does not fire it,
  // so fire it here — the insert is the user's edit.
  if (!el.isContentEditable) el.dispatchEvent(new Event('change', { bubbles: true }));
}

// The name list is mdeditor.js's quickIndex cache. Refreshed on the first
// [[ in a field after 15s or a Nexus switch, so a name created a moment ago
// is offered without a quickIndex round trip on every keystroke.
let _wikiFieldCacheAt = { nexus: null, at: 0 };
async function warmWikiFieldCache() {
  const nx = S.nexus?.id ?? null;
  if (_wikiCacheList.length && _wikiFieldCacheAt.nexus === nx && Date.now() - _wikiFieldCacheAt.at < 15000) return;
  await refreshWikiCache();
  _wikiFieldCacheAt = { nexus: nx, at: Date.now() };
}

function hideWikiAc() {
  _wikiAc?.pop.remove();
  _wikiAc = null;
}

function paintWikiAc() {
  const a = _wikiAc;
  a.pop.innerHTML = a.items.map((it, i) => `
    <div class="mded-ac-item ${i === a.idx ? 'active' : ''}" data-i="${i}">
      <span class="dot" style="background:${x(it.color || 'var(--accent)')}"></span>
      <span class="name" data-no-i18n>${x(it.name)}</span><span class="mded-linktype" data-no-i18n>${x(it.type)}</span>
    </div>`).join('');
}

async function updateWikiAc(el) {
  const c = wikiFieldCaret(el);
  const m = c && c.text.slice(0, c.pos).match(/\[\[([^\[\]\n]*)$/);
  if (!m) { hideWikiAc(); return; }
  await warmWikiFieldCache();
  const frag = m[1].toLowerCase();
  const items = _wikiCacheList.filter(e => e.name.toLowerCase().includes(frag)).slice(0, WIKI_AC_MAX);
  if (!items.length) { hideWikiAc(); return; }
  if (!_wikiAc || _wikiAc.el !== el) {
    hideWikiAc();
    const pop = document.createElement('div');
    pop.className = 'mded-ac wiki-field-ac';
    pop.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus (and the caret) in the field
      const row = e.target.closest('.mded-ac-item');
      if (row && _wikiAc) { _wikiAc.idx = Number(row.dataset.i); acceptWikiAc(); }
    });
    document.body.appendChild(pop);
    _wikiAc = { el, items, idx: 0, pop };
  }
  _wikiAc.items = items;
  _wikiAc.idx = Math.min(_wikiAc.idx, items.length - 1);
  paintWikiAc();
  const r = el.getBoundingClientRect();
  _wikiAc.pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 260))}px`;
  _wikiAc.pop.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 40)}px`;
}

function acceptWikiAc() {
  const a = _wikiAc;
  const it = a?.items[a.idx];
  if (!it) return;
  const c = wikiFieldCaret(a.el);
  const m = c && c.text.slice(0, c.pos).match(/\[\[([^\[\]\n]*)$/);
  hideWikiAc();
  if (!m) return;
  const start = c.pos - m[1].length;
  const after = c.text.slice(c.pos);
  const closing = after.startsWith(']]') ? '' : ']]';
  wikiFieldWrite(a.el, c.text.slice(0, start) + it.name + closing + after, start + it.name.length + 2);
}

// "Connect link": wrap the selected words in [[ ]].
function wrapWikiSelection(el) {
  if (el.isContentEditable) {
    const sel = window.getSelection();
    const picked = sel.toString();
    if (!picked.trim() || !el.contains(sel.anchorNode)) return;
    const c = wikiFieldCaret(el);
    const r = sel.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    const s = r.toString().length;
    wikiFieldWrite(el, `${c.text.slice(0, s)}[[${picked}]]${c.text.slice(s + picked.length)}`, s + picked.length + 4);
    return;
  }
  const s = el.selectionStart, e = el.selectionEnd;
  const picked = el.value.slice(s, e);
  if (!picked.trim()) return;
  wikiFieldWrite(el, `${el.value.slice(0, s)}[[${picked}]]${el.value.slice(e)}`, e + 4);
}

const wikiFieldHasSelection = (el) => (el.isContentEditable
  ? !!window.getSelection().toString().trim()
  : el.selectionEnd > el.selectionStart);

function initWikiFields() {
  if (window.__wikiFields) return;
  window.__wikiFields = true;
  document.addEventListener('input', (e) => {
    const el = e.target.closest?.(WIKI_FIELD_SEL);
    if (el) updateWikiAc(el);
  });
  // Capture phase: the list owns the arrows / Enter / Tab / Escape while it
  // is open, before the field's own onkeydown (Enter-to-blur) sees them.
  document.addEventListener('keydown', (e) => {
    if (!_wikiAc || e.target !== _wikiAc.el) return;
    const a = _wikiAc;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      a.idx = (a.idx + (e.key === 'ArrowDown' ? 1 : -1) + a.items.length) % a.items.length;
      paintWikiAc();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      acceptWikiAc();
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      hideWikiAc();
    }
  }, true);
  document.addEventListener('focusout', (e) => {
    if (_wikiAc && e.target === _wikiAc.el) setTimeout(hideWikiAc, 150);
  });
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest?.(WIKI_FIELD_SEL);
    if (!el) return;
    const pop = ctxMenu(e, [cmdItem('text.wikiLink', { el, always: true })]);
    // Keep the field focused while the menu is used: a blur would run the
    // field's own save-and-re-render and take the selection (and the
    // element) away before the wrap lands.
    pop?.addEventListener('mousedown', (ev) => ev.preventDefault());
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWikiFields);
else initWikiFields();
