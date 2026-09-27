'use strict';
// ═══ Choosing an icon on a page (Procress 14, APP docs/EXPORT-DECOR.md D1) ═
// A small popover over the page — Icons (the whole catalog, by category and
// word), Emoji, Symbols — for a block's header, an icon row, a divider's
// ornament. It hands back a reference in the shapes the app already stores
// (svg:<key>, sym:<glyph>) and leaves the ⚙ popover under it open.

let _pbIpk = null; // { onPick, tab, cat, query, symbols }

async function openPbIconPick(anchor, onPick) {
  closePbIconPick();
  _pbIpk = { onPick, tab: 'icons', cat: '', query: '', symbols: null };
  const el = document.createElement('div');
  el.id = 'pb-ipk';
  el.className = 'pb-pop pb-ipk';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('pbChooseIcon'));
  document.body.appendChild(el);
  pbIpkRender();
  const r = anchor?.getBoundingClientRect?.() || { left: 80, bottom: 80 };
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left))}px`;
  el.style.top = `${Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, r.bottom + 6))}px`;
  el.querySelector('input')?.focus();
  try { _pbIpk.symbols = await api.color.getSymbolCollection(); } catch (_) { _pbIpk.symbols = []; }
}

function closePbIconPick() { _pbIpk = null; q('#pb-ipk')?.remove(); }

function pbIpkSet(patch) { if (_pbIpk) { Object.assign(_pbIpk, patch); pbIpkRender(); } }

function pbIpkRender() {
  const el = q('#pb-ipk');
  if (!el || !_pbIpk) return;
  const s = _pbIpk;
  const tab = (id, key) => `<button class="btn${s.tab === id ? ' on' : ''}" role="tab" aria-selected="${s.tab === id}" onclick="pbIpkSet({tab:'${id}'})">${t(key)}</button>`;
  const cell = (ref, inner, title = '') => `<button class="btn btn-g pb-ipk-cell" onclick="pbIpkPick(${xj(ref)})" title="${x(title)}" aria-label="${x(title || ref)}">${inner}</button>`;
  let body = '';
  if (s.tab === 'icons') {
    const cats = Object.keys(ICON_CATS);
    const keys = iconCatalogKeys().filter((k) => (!s.cat || k.cat === s.cat) && iconMatches(k.key, s.query));
    body = `<div class="pb-seg pb-ipk-cats">${['', ...cats].map((c) => `<button class="btn${s.cat === c ? ' on' : ''}" onclick="pbIpkSet({cat:'${c}'})">${t(c ? `iconCat${pbCap(c)}` : 'iconCatAll')}</button>`).join('')}</div>
      <div class="pb-ipk-grid">${keys.map((k) => cell(`svg:${k.key}`, I[k.key], k.key)).join('') || `<p class="drafter-hint">${t('pbNoMatch')}</p>`}</div>`;
  } else if (s.tab === 'emoji') {
    body = `<div class="pb-seg pb-ipk-cats">${Object.keys(EMOJI_CATS).map((c) => `<button class="btn${s.cat === c ? ' on' : ''}" onclick="pbIpkSet({cat:'${c}'})">${t(`emojiCat${pbCap(c)}`)}</button>`).join('')}</div>
      <div class="pb-ipk-grid pb-ipk-emoji">${emojiList(EMOJI_CATS[s.cat] ? s.cat : '').map((e) => cell(`sym:${e}`, `<span data-no-i18n>${e}</span>`)).join('')}</div>`;
  } else {
    const syms = s.symbols || [];
    body = `<div class="pb-ipk-grid pb-ipk-emoji">${syms.map((g) => cell(`sym:${g.glyph}`, `<span data-no-i18n>${x(g.glyph)}</span>`, g.label || '')).join('') || `<p class="drafter-hint">${t('loading')}</p>`}</div>`;
  }
  const recent = iconRecent();
  el.innerHTML = `<div class="pb-pop-top"><b>${t('pbChooseIcon')}</b>
      <button class="btn btn-g btn-sm" onclick="pbIpkPick('')">${t('pbNoIcon')}</button>
      <button class="btn btn-g btn-i" onclick="closePbIconPick()" title="${t('close')}" aria-label="${t('close')}">${I.close}</button></div>
    <div class="pb-seg pb-tabs2" role="tablist">${tab('icons', 'iconTabIcons')}${tab('emoji', 'iconTabEmoji')}${tab('symbols', 'iconTabSymbols')}</div>
    ${s.tab === 'icons' ? `<input type="search" class="pb-ipk-q" value="${x(s.query)}" placeholder="${x(t('iconSearchPh'))}" aria-label="${x(t('iconSearchPh'))}"
      oninput="_pbIpk.query=this.value;clearTimeout(this._t);this._t=setTimeout(()=>{pbIpkRender();const i=q('#pb-ipk .pb-ipk-q');i.focus();i.setSelectionRange(i.value.length,i.value.length)},120)">` : ''}
    ${recent.length ? `<h6>${t('iconRecent')}</h6><div class="pb-ipk-grid">${recent.map((r) => cell(r, pbIconHtml(r))).join('')}</div>` : ''}
    ${body}`;
}

function pbIpkPick(ref) {
  const cb = _pbIpk?.onPick;
  if (ref) iconRecentPush(ref);
  closePbIconPick();
  if (cb) cb(ref);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _pbIpk) { e.stopPropagation(); closePbIconPick(); } }, true);
document.addEventListener('pointerdown', (e) => {
  if (_pbIpk && !e.target.closest?.('#pb-ipk, .pb-ipk-open')) closePbIconPick();
}, true);
