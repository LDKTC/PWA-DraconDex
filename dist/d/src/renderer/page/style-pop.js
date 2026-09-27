'use strict';
// ═══ The ⚙ popover (Procress 14, APP docs/TEMPLATES.md §6.3) ════════════
// While arranging, every block's bar has a ⚙ beside its grip. It opens one
// floating panel with two tabs — Style (the shared set, page/style.js) and
// Options (what the component declares with options()) — and every change
// is saved at once and drawn on the page behind it, so the block itself is
// the preview. Reset, apply-to-every-block-of-this-kind and copy/paste of a
// style sit at the foot. The panel lives on <body>, outside the page, so a
// page re-render after a save leaves it open.

let _pbPop = null;      // { iid, tab, fields }
let _pbStyleClip = null; // a copied style, for this session

const pbBlockOf = (iid) => {
  const i = pbInst(iid);
  return i ? pageOf(i.moduleId, i.itemKey)?.blocks.find((bb) => bb.id === i.blockId) || null : null;
};

function openPbStyle(iid) {
  if (_pbPop?.iid === iid) { closePbStyle(); return; }
  _pbPop = { iid, tab: 'style', fields: null };
  let el = q('#pb-pop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pb-pop';
    el.className = 'pb-pop';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
  }
  pbPopRender();
}

function closePbStyle() {
  _pbPop = null;
  q('#pb-pop')?.remove();
  document.querySelectorAll('.pb-gear.active').forEach((g) => g.classList.remove('active'));
}

// Beside the block's ⚙, inside the window.
function pbPopPlace() {
  const el = q('#pb-pop');
  const gear = _pbPop && pbRoot(_pbPop.iid)?.querySelector(':scope > .pb-bar .pb-gear');
  if (!el || !gear) { closePbStyle(); return; }
  document.querySelectorAll('.pb-gear.active').forEach((g) => g.classList.toggle('active', g === gear));
  gear.classList.add('active');
  const r = gear.getBoundingClientRect();
  const w = el.offsetWidth || 320;
  const h = el.offsetHeight || 400;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, r.bottom + 6))}px`;
}

function pbPopTab(tab) { if (_pbPop) { _pbPop.tab = tab; pbPopRender(); } }

function pbPopRender() {
  const el = q('#pb-pop');
  const b = _pbPop && pbBlockOf(_pbPop.iid);
  if (!el || !b) { closePbStyle(); return; }
  const iid = _pbPop.iid;
  const tab = _pbPop.tab;
  const tabBtn = (id, key) => `<button class="btn${tab === id ? ' on' : ''}" role="tab" aria-selected="${tab === id}" onclick="pbPopTab('${id}')">${t(key)}</button>`;
  el.setAttribute('aria-label', `${t('pbBlockSettings')} — ${pbBlockName(b)}`);
  el.innerHTML = `<div class="pb-pop-top"><b data-no-i18n>${x(pbBlockName(b))}</b>
      <button class="btn btn-g btn-i" onclick="closePbStyle()" title="${t('close')}" aria-label="${t('close')}">${I.close}</button></div>
    <div class="pb-seg pb-tabs2" role="tablist">${tabBtn('style', 'pbStyle')}${tabBtn('opts', 'pbOptions')}</div>
    <div data-r="pop-body">${tab === 'style' ? pbPopStyleHtml(iid, b) : pbPopOptsHtml(iid, b)}</div>
    <div class="pb-pop-foot">
      <button class="btn btn-s btn-sm" onclick="pbStyleReset(${xj(iid)})">${t('pbStyleReset')}</button>
      ${tab === 'style' ? `<button class="btn btn-s btn-sm" onclick="pbStyleCopy(${xj(iid)})">${t('pbStyleCopy')}</button>
      <button class="btn btn-s btn-sm" onclick="pbStylePaste(${xj(iid)})"${_pbStyleClip ? '' : ' disabled'}>${t('pbStylePaste')}</button>
      <button class="btn btn-s btn-sm" onclick="pbStyleApplyAll(${xj(iid)})">${t('pbStyleApplyAll')}</button>` : ''}
    </div>`;
  pbPopPlace();
  if (tab === 'opts' && _pbPop.fields === null && pbOptionDefs(b).some((d) => d.type === 'fields')) pbPopLoadFields(b);
}

// A row of choices, one of them on.
function pbSegHtml(iid, key, vals, cur, labelOf, onSet = 'pbStyleSet') {
  return `<div class="pb-seg" role="radiogroup">${vals.map((v) => {
    const on = v === cur;
    const text = labelOf(v);
    return `<button class="btn${on ? ' on' : ''}" role="radio" aria-checked="${on}" onclick="${onSet}(${xj(iid)},${xj(key)},${xv(v)})">${text}</button>`;
  }).join('')}</div>`;
}

const PB_ALIGN_SYM = { left: '⇤', center: '↔', right: '⇥' };

function pbPopStyleHtml(iid, b) {
  const st = blockStyleOf(b.config);
  const k = (prefix) => (v) => t(`${prefix}${pbCap(v)}`);
  const sw = PB_STYLE.accent.map((a) => {
    const on = a === st.accent;
    const name = t(`pbAcc${pbCap(a)}`);
    return `<button class="btn ${pbAccClass(a)}${on ? ' on' : ''}" role="radio" aria-checked="${on}" title="${x(name)}" aria-label="${x(name)}" onclick="pbStyleSet(${xj(iid)},'accent',${xj(a)})"></button>`;
  }).join('');
  const hideVals = b.component === 'item.body' ? ['none'] : PB_STYLE.hideOn;
  return `<h6>${t('pbStyleVariant')}</h6>${pbSegHtml(iid, 'variant', PB_STYLE.variant, st.variant, k('pbVariant'))}
    <h6>${t('pbStyleAccent')}</h6><div class="pb-sw" role="radiogroup">${sw}</div>
    <h6>${t('pbStyleWidth')}</h6>${pbSegHtml(iid, 'width', PB_STYLE.width, st.width, k('pbWidth'))}
    <div class="pb-row2">
      <div><h6>${t('pbStyleAlign')}</h6>${pbSegHtml(iid, 'align', PB_STYLE.align, st.align, (v) => `<span title="${x(t(`align${pbCap(v)}`))}" data-no-i18n>${PB_ALIGN_SYM[v]}</span>`)}</div>
      <div><h6>${t('pbStyleDensity')}</h6>${pbSegHtml(iid, 'density', PB_STYLE.density, st.density, k('pbDensity'))}</div>
    </div>
    <h6>${t('pbStyleHeader')}</h6>
    <div class="pb-row2"><label class="fv-useimg"><input type="checkbox"${st.header.show ? ' checked' : ''} onchange="pbStyleHeader(${xj(iid)},{show:this.checked})"> ${t('pbHeaderShow')}</label>
      <button class="btn btn-s btn-sm pb-ipk-open" onclick="pbHeaderIcon(${xj(iid)},this)">${pbIconHtml(st.header.icon) || ''} ${t('pbChooseIcon')}</button></div>
    <input type="text" value="${x(st.header.title)}" placeholder="${x(pbBlockName(b))}" maxlength="80" aria-label="${x(t('pbHeaderTitle'))}"
      onchange="pbStyleHeader(${xj(iid)},{title:this.value.trim()})">
    <h6>${t('pbStyleCollapsible')}</h6>${pbSegHtml(iid, 'collapsible', PB_STYLE.collapsible, st.collapsible, k('pbColl'))}
    <div class="pb-row2">
      <div><h6>${t('pbStyleAnchor')}</h6><input type="text" value="${x(st.anchor)}" placeholder="b${b.id}" maxlength="40" data-no-i18n
        aria-label="${x(t('pbStyleAnchor'))}" onchange="pbStyleSet(${xj(iid)},'anchor',this.value)"></div>
      <div><h6>${t('pbStyleHideOn')}</h6>${pbSegHtml(iid, 'hideOn', hideVals, st.hideOn, k('pbHide'))}</div>
    </div>`;
}

// ── the Options tab: preset, columns, then options() ────────────────────
function pbPopOptsHtml(iid, b) {
  const comp = componentOf(b);
  const cfg = b.config || {};
  const parts = [];
  const presets = comp?.presets ? comp.presets() : [];
  if (presets.length > 1) {
    parts.push(`<h6>${t('pbPreset')}</h6><select onchange="pbSetPreset(${xj(iid)},this.value).then(pbPopRender)">${presets.map((p) =>
      `<option value="${x(p)}"${(cfg.preset || presets[0]) === p ? ' selected' : ''}>${x(comp.presetLabel ? comp.presetLabel(p) : p)}</option>`).join('')}</select>`);
  }
  if (b.block_type === 'columns') parts.push(`<h6>${t('pbColumns')}</h6>${pbSegHtml(iid, 'n', ['2', '3'], String(Number(cfg.n) || 2), (v) => `${v} ▥`, 'pbColsSet')}`);
  const c = { block: b, config: cfg };
  for (const d of pbOptionDefs(b)) {
    const html = pbOptFieldHtml(iid, d, pbOpt(c, d.key));
    if (html) parts.push(`${d.type === 'toggle' ? '' : `<h6>${t(d.label)}</h6>`}${html}`);
  }
  return parts.length ? parts.join('') : `<p class="drafter-hint">${t('pbNoOptions')}</p>`;
}

function pbOptFieldHtml(iid, d, v) {
  const set = (expr) => `pbOptSet(${xj(iid)},${xj(d.key)},${expr})`;
  switch (d.type) {
    case 'select': return pbSegHtml(iid, d.key, d.choices, v, (ch) => (d.choiceKey ? t(d.choiceKey(ch)) : x(ch)), 'pbOptSet');
    case 'toggle': return `<label class="fv-useimg"><input type="checkbox"${v ? ' checked' : ''} onchange="${set('this.checked')}"> ${t(d.label)}</label>`;
    case 'number': return `<input type="number" value="${v ?? ''}"${d.min != null ? ` min="${d.min}"` : ''}${d.max != null ? ` max="${d.max}"` : ''}
      aria-label="${x(t(d.label))}" onchange="${set("this.value===''?null:Number(this.value)")}">`;
    case 'text': return `<input type="text" value="${x(v ?? '')}" maxlength="${d.max || 200}" aria-label="${x(t(d.label))}" onchange="${set('this.value')}">`;
    case 'module': {
      const mods = flattenModuleTree(S.moduleTree, 0).map((r) => r.m).filter((m) => !d.kinds || d.kinds.includes(m.kind));
      return `<select onchange="${set('this.value?Number(this.value):null')}"><option value="">—</option>${mods.map((m) =>
        `<option value="${m.id}"${Number(v) === m.id ? ' selected' : ''}>${x(m.name)}</option>`).join('')}</select>`;
    }
    case 'fields': return pbOptFieldsHtml(iid, d, v);
    case 'links': return typeof pbLinksEditorHtml === 'function' ? pbLinksEditorHtml(iid, d, v) : '';
    case 'icon': return `<button class="btn btn-s btn-sm pb-ipk-open" onclick="pbOptIcon(${xj(iid)},${xj(d.key)},this)">${pbIconHtml(v) || ''} ${t('pbChooseIcon')}</button>
      ${v ? `<button class="btn btn-g btn-sm" onclick="pbOptSet(${xj(iid)},${xj(d.key)},null)">${t('pbNoIcon')}</button>` : ''}`;
    case 'image': {
      const id = pbFileId(v);
      return `<div class="pb-opt-img">${id ? `<img src="${displayImageUrl(id)}?proxy=1" alt="" onerror="queueDisplayImageFallback(this,${id})">` : ''}
        <button class="btn btn-s btn-sm" onclick="pbOptImage(${xj(iid)},${xj(d.key)},false,${xj(d.cls || 'image')})">${t(d.cls && d.cls !== 'image' ? 'pbChooseFile' : 'pbChooseImage')}</button>
        ${id ? `<button class="btn btn-g btn-sm" onclick="pbOptSet(${xj(iid)},${xj(d.key)},null)">${t('pbClear')}</button>` : ''}</div>`;
    }
    case 'focus': {
      // the block's picture: its image option, or a plain image block's own
      const b = pbBlockOf(iid);
      const id = b && (pbFileId(pbOpt({ block: b, config: b.config || {} }, 'image')) || pbFileId(b.source_key));
      return id ? `<button class="btn btn-s btn-sm" onclick="pbOptFocus(${xj(iid)},${xj(d.key)},${id})">${t('pbFocusSet')}</button>` : '';
    }
    case 'images': {
      const ids = (Array.isArray(v) ? v : []).map(pbFileId).filter(Boolean);
      return `<div class="pb-opt-imgs">${ids.slice(0, 8).map((id) => `<img src="${displayImageUrl(id)}?proxy=1" alt="" onerror="queueDisplayImageFallback(this,${id})">`).join('')}${ids.length > 8 ? `<span>+${ids.length - 8}</span>` : ''}</div>
        <button class="btn btn-s btn-sm" onclick="pbOptImage(${xj(iid)},${xj(d.key)},true)">${t('pbChooseImages')} (${ids.length})</button>
        ${ids.length ? `<button class="btn btn-g btn-sm" onclick="pbOptSet(${xj(iid)},${xj(d.key)},null)">${t('pbClear')}</button>` : ''}`;
    }
    case 'iconitems': {
      const list = Array.isArray(v) ? v : [];
      return `<div class="pb-le">${list.map((it, i) => `<div class="pb-le-row pb-ii-row">
          <button class="btn btn-s btn-i pb-ipk-open" onclick="pbItemIcon(${xj(iid)},${xj(d.key)},${i},this)" title="${t('pbChooseIcon')}" aria-label="${t('pbChooseIcon')}">${pbIconHtml(it.icon) || '＋'}</button>
          <input type="text" value="${x(it.label)}" maxlength="60" aria-label="${x(t('pbLinkLabel'))}" onchange="pbItemEdit(${xj(iid)},${xj(d.key)},${i},{label:this.value})">
          <span class="pb-le-acts"><button class="btn btn-g btn-i" onclick="pbItemEdit(${xj(iid)},${xj(d.key)},${i},null)" title="${t('delete')}">${I.close}</button></span></div>`).join('')}
        ${list.length < 24 ? `<button class="btn btn-s btn-sm" onclick="pbItemEdit(${xj(iid)},${xj(d.key)},${list.length},{label:''})">${I.plus} ${t('pbListAdd')}</button>` : ''}</div>`;
    }
    case 'list': {
      const list = Array.isArray(v) && v.length ? v : [];
      return `<div class="pb-le">${list.map((s, i) => `<div class="pb-le-row"><input type="text" value="${x(s)}" maxlength="40" aria-label="${x(t(d.label))} ${i + 1}"
          onchange="pbListEdit(${xj(iid)},${xj(d.key)},${i},this.value)"><span class="pb-le-acts">
          <button class="btn btn-g btn-i" onclick="pbListEdit(${xj(iid)},${xj(d.key)},${i},null)" title="${t('delete')}">${I.close}</button></span></div>`).join('')}
        ${list.length < (d.max || 12) ? `<button class="btn btn-s btn-sm" onclick="pbListEdit(${xj(iid)},${xj(d.key)},${list.length},'')">${I.plus} ${t('pbListAdd')}</button>` : ''}</div>`;
    }
    default: return '';
  }
}

// The fields of the module the block reads, ticked in the order chosen.
function pbOptFieldsHtml(iid, d, v) {
  const list = _pbPop?.fields;
  if (list === null) return `<p class="drafter-hint">${t('loading')}</p>`;
  if (!list.length) return `<p class="drafter-hint">${t('pbNoFields')}</p>`;
  if (d.single) {
    return `<select onchange="pbOptSet(${xj(iid)},${xj(d.key)},this.value||null)"><option value="">${t('pbAuto')}</option>${list.map((f) =>
      `<option value="${x(f.key)}"${v === f.key ? ' selected' : ''}>${x(f.name)}</option>`).join('')}</select>`;
  }
  const on = Array.isArray(v) ? v : [];
  return `<div class="pb-pop-fields">${list.map((f) => `<label class="fv-useimg"><input type="checkbox"${on.includes(f.key) ? ' checked' : ''}
    onchange="pbOptField(${xj(iid)},${xj(d.key)},${xj(f.key)},this.checked)"> <span data-no-i18n>${x(f.name)}</span></label>`).join('')}</div>
    <p class="drafter-hint">${t('pbFieldsHint')}</p>`;
}

async function pbPopLoadFields(b) {
  const i = pbInst(_pbPop.iid);
  // a field list may belong to the module another option names (navbox)
  const of = pbOptionDefs(b).find((d) => d.type === 'fields' && d.of)?.of;
  const picked = of ? Number(pbOpt({ block: b, config: b.config || {} }, of)) : null;
  const src = findModuleNode(picked || (i?.sourceId ?? i?.moduleId));
  let list = [];
  try {
    if (src?.kind === 'classifier') {
      const tpls = (await api.classifier.getTemplates(src.id)) || [];
      list = tpls.filter((tp) => tp.attribute_type !== 'relation').map((tp) => ({ key: pcFieldKeyOf(tp) || tp.description, name: tp.description }));
    }
  } catch (_) { /* no fields to offer */ }
  if (!_pbPop || pbBlockOf(_pbPop.iid) !== b) return;
  _pbPop.fields = list;
  pbPopRender();
}

// ── saving ──────────────────────────────────────────────────────────────
async function pbSaveStyle(iid, style) {
  await pbSetConfig(iid, { style: Object.keys(style).length ? style : undefined });
  pbPopRender();
}

function pbStyleSet(iid, key, value) {
  const b = pbBlockOf(iid);
  if (!b) return;
  const style = { ...(b.config?.style || {}) };
  if (key === 'anchor') {
    let a = pbAnchorClean(value);
    const page = pageOf(pbInst(iid).moduleId, pbInst(iid).itemKey);
    const taken = new Set(page.blocks.filter((o) => o.id !== b.id).map(pbAnchorOf));
    for (let n = 2; a && taken.has(a); n++) a = `${pbAnchorClean(value)}-${n}`;
    if (a) style.anchor = a; else delete style.anchor;
  } else if (PB_STYLE[key]?.includes(value)) {
    if (value === PB_STYLE_DEFAULT[key]) delete style[key]; else style[key] = value;
  } else return;
  return pbSaveStyle(iid, style);
}

function pbStyleHeader(iid, patch) {
  const b = pbBlockOf(iid);
  if (!b) return;
  const style = { ...(b.config?.style || {}) };
  const header = { ...(style.header || {}), ...patch };
  if (!header.show && !header.title && !header.icon) delete style.header; else style.header = header;
  return pbSaveStyle(iid, style);
}

async function pbOptSet(iid, key, value) {
  const b = pbBlockOf(iid);
  if (!b) return;
  const opts = { ...(b.config?.opts || {}) };
  if (value === null || value === undefined || value === '') delete opts[key]; else opts[key] = value;
  await pbSetConfig(iid, { opts: Object.keys(opts).length ? opts : undefined });
  if (_pbPop && pbOptionDefs(b).some((d) => d.of === key)) _pbPop.fields = null;
  pbPopRender();
}

function pbOptField(iid, key, field, on) {
  const b = pbBlockOf(iid);
  const cur = b ? pbOpt({ block: b, config: b.config || {} }, key) : [];
  const list = (Array.isArray(cur) ? cur : []).filter((k) => k !== field);
  if (on) list.push(field);
  return pbOptSet(iid, key, list.length ? list : null);
}

// A list option (tab names): edit, remove (null) or append ('') one entry.
// An empty list starts from what the component shows by default.
function pbListEdit(iid, key, i, value) {
  const b = pbBlockOf(iid);
  if (!b) return;
  const comp = componentOf(b);
  let list = pbOpt({ block: b, config: b.config || {} }, key);
  if (!Array.isArray(list) || !list.length) list = key === 'tabs' && typeof pcTabNames === 'function' ? pcTabNames({ block: b, config: b.config || {} }) : [];
  list = [...list];
  if (value === null) list.splice(i, 1);
  else if (i >= list.length) list.push(value || `${t(comp?.options?.().find((d) => d.key === key)?.placeholder || 'pbListAdd')} ${list.length + 1}`);
  else list[i] = String(value).trim().slice(0, 40) || list[i];
  return pbOptSet(iid, key, list.length ? list : null);
}

// ── icons and pictures in options (EXPORT-DECOR D1/D4) ────────────────
function pbOptIcon(iid, key, btn) { openPbIconPick(btn, (ref) => pbOptSet(iid, key, ref || null)); }
function pbOptImage(iid, key, multi, cls = 'image') {
  const b = pbBlockOf(iid);
  if (!b) return;
  const cur = pbOpt({ block: b, config: b.config || {} }, key);
  const selected = (multi ? (Array.isArray(cur) ? cur : []) : [cur]).map(pbFileId).filter(Boolean);
  openPbImagePicker({ multi, cls, selected, moduleId: pbInst(iid)?.moduleId, onPick: (ids) => pbOptSet(iid, key, multi ? ids.map((i) => `file_${i}`) : (ids[0] ? `file_${ids[0]}` : null)) });
}
function pbOptFocus(iid, key, fileId) {
  const b = pbBlockOf(iid);
  if (!b || !fileId) return;
  pbFocusPicker(fileId, pbOpt({ block: b, config: b.config || {} }, key), (f) => pbOptSet(iid, key, f));
}
const pbItemsRaw = (iid, key) => { const b = pbBlockOf(iid); const v = b ? pbOpt({ block: b, config: b.config || {} }, key) : null; return (Array.isArray(v) ? v : []).map((it) => ({ ...it })); };
function pbItemEdit(iid, key, i, patch) {
  const list = pbItemsRaw(iid, key);
  if (patch === null) list.splice(i, 1);
  else list[i] = { ...(list[i] || { icon: '', label: '' }), ...patch };
  return pbOptSet(iid, key, list.length ? list : null);
}
function pbItemIcon(iid, key, i, btn) { openPbIconPick(btn, (ref) => pbItemEdit(iid, key, i, { icon: ref || '' })); }
function pbHeaderIcon(iid, btn) { openPbIconPick(btn, (ref) => pbStyleHeader(iid, { icon: ref || '' })); }

async function pbColsSet(iid, _key, n) { await pbSetConfig(iid, { n: Number(n) }); pbPopRender(); }

// Reset: the Style tab clears the style; the Options tab clears the
// options, and the older top-level keys the same options were kept in.
async function pbStyleReset(iid) {
  const b = pbBlockOf(iid);
  if (!b || !_pbPop) return;
  if (_pbPop.tab === 'style') { await pbSaveStyle(iid, {}); return; }
  const patch = { opts: undefined };
  for (const d of pbOptionDefs(b)) patch[d.key] = undefined;
  await pbSetConfig(iid, patch);
  pbPopRender();
}

// A style without what names ONE block: its anchor and its header's title
// are content, not look.
const pbStyleSansAnchor = (b) => {
  const s = { ...(b.config?.style || {}) };
  delete s.anchor;
  if (s.header) { s.header = { ...s.header }; delete s.header.title; }
  return s;
};
// ...and the target's own anchor and title put back.
function pbStyleOnto(o, style) {
  const s = JSON.parse(JSON.stringify(style));
  const own = o.config?.style || {};
  if (own.anchor) s.anchor = own.anchor;
  if (own.header?.title) s.header = { ...(s.header || {}), title: own.header.title };
  if (o.component === 'item.body') delete s.hideOn;
  return s;
}

function pbStyleCopy(iid) {
  const b = pbBlockOf(iid);
  if (!b) return;
  _pbStyleClip = JSON.parse(JSON.stringify(pbStyleSansAnchor(b)));
  toast(t('copied'), 'ok');
  pbPopRender();
}

function pbStylePaste(iid) {
  const b = pbBlockOf(iid);
  if (!b || !_pbStyleClip) return;
  return pbSaveStyle(iid, pbStyleOnto(b, _pbStyleClip));
}

// This block's style onto every block of the same kind on this page.
async function pbStyleApplyAll(iid) {
  const b = pbBlockOf(iid);
  const i = pbInst(iid);
  const page = i && pageOf(i.moduleId, i.itemKey);
  if (!b || !page) return;
  const style = pbStyleSansAnchor(b);
  const same = page.blocks.filter((o) => o.id !== b.id && o.block_type === b.block_type && (o.component || null) === (b.component || null));
  for (const o of same) {
    const s = pbStyleOnto(o, style);
    o.config = { ...(o.config || {}), style: Object.keys(s).length ? s : undefined };
    await api.block.update(o.id, { config: o.config });
  }
  renderNexusHome();
  pbPopRender();
  toast(t('pbStyleApplied').replace('{n}', same.length), 'ok');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _pbPop) closePbStyle(); });
document.addEventListener('pointerdown', (e) => {
  if (!_pbPop) return;
  if (e.target.closest?.('#pb-pop, .pb-gear, #pb-ipk, #modal-overlay')) return;
  closePbStyle();
}, true);
window.addEventListener('resize', () => { if (_pbPop) pbPopPlace(); });
document.addEventListener('scroll', () => { if (_pbPop) pbPopPlace(); }, true);
