'use strict';
// ═══ Decoration (Procress 14, APP docs/EXPORT-DECOR.md D2) ═════════════
// Pictures and icons from the Nexus on any page: a banner, a gallery, a
// divider, a row of icons and a figure. The plain `divider` and `image`
// blocks draw through the same code (PB_BASIC_OPTIONS), so an old page
// looks the same until its options are changed.
//
// Text over a picture sits on a scrim (css/page-decor.css) that reaches
// the darkness white text needs BEFORE the text starts — checked against a
// pure-white picture, the worst case (test/decor.test.mjs).

const pcImgSrc = (id, proxy = false) => `${displayImageUrl(id)}${proxy ? '?proxy=1' : ''}`;
const pcImgTag = (id, cls = '', style = '', alt = '') =>
  `<img class="${cls}" src="${pcImgSrc(id)}" alt="${x(alt)}" loading="lazy"${style ? ` style="${style}"` : ''} onerror="queueDisplayImageFallback(this,${id})">`;
const pcPickHint = (c, key) => pcEmpty(t(pbArranging(c.page) ? 'pcDecorPickArrange' : key));

// ── Banner: one picture across the page, a title and a line over it ─────
registerComponent('core.banner', {
  kind: 'core', labelKey: 'pcBanner',
  options: () => [
    { key: 'image', type: 'image', label: 'pbImage' },
    { key: 'title', type: 'text', label: 'pbHeaderTitle', max: 80 },
    { key: 'sub', type: 'text', label: 'pcOptSubtitle', max: 160 },
    { key: 'height', type: 'select', label: 'pcOptHeight', choices: ['s', 'm', 'l'], default: 'm', choiceKey: (v) => `pcSize${pbCap(v)}` },
    { key: 'scrim', type: 'select', label: 'pcOptScrim', choices: ['soft', 'strong'], default: 'soft', choiceKey: (v) => `pcScrim${pbCap(v)}` },
    { key: 'align', type: 'select', label: 'pbStyleAlign', choices: ['left', 'center'], default: 'left', choiceKey: (v) => `align${pbCap(v)}` },
    { key: 'focus', type: 'focus', label: 'pbFocusTitle' },
  ],
  render: (c) => {
    const id = pbFileId(pbOpt(c, 'image'));
    if (!id) return pcPickHint(c, 'pcBannerEmpty');
    const title = pbOpt(c, 'title') || '';
    const sub = pbOpt(c, 'sub') || '';
    return `<div class="pc-banner" data-h="${pbOpt(c, 'height')}" data-align="${pbOpt(c, 'align')}">
      ${pcImgTag(id, 'pc-banner-img', `object-position:${pbFocusCss(pbOpt(c, 'focus'))}`)}
      ${title || sub ? `<div class="pc-banner-text" data-scrim="${pbOpt(c, 'scrim')}">${title ? `<div class="pc-banner-t" data-no-i18n>${x(title)}</div>` : ''}${sub ? `<div class="pc-banner-s" data-no-i18n>${x(sub)}</div>` : ''}</div>` : ''}
    </div>`;
  },
});

// ── Gallery: pictures chosen here, or every picture filed under this
// page's module; grid / masonry / strip; a click opens the lightbox.
async function pcGalleryIds(c) {
  if (pbOpt(c, 'fromModule')) {
    const rows = (await api.importdock.moduleAssets(c.page.moduleId)) || [];
    return rows.filter((r) => r.source_kind === 'file' && pbFileClass(r.file_type) === 'image').map((r) => ({ id: r.id, name: r.file_name }));
  }
  return (pbOpt(c, 'images') || []).map(pbFileId).filter(Boolean).map((id) => ({ id, name: '' }));
}
registerFilled('core.gallery', {
  kind: 'core', labelKey: 'pcGallery', needsSource: false,
  options: () => [
    { key: 'images', type: 'images', label: 'pbImages' },
    { key: 'fromModule', type: 'toggle', label: 'pcOptFromModule', default: false },
    { key: 'layout', type: 'select', label: 'pcOptLayout', choices: ['grid', 'masonry', 'strip'], default: 'grid', choiceKey: (v) => `pcGal${pbCap(v)}` },
    { key: 'cols', type: 'select', label: 'pbColumns', choices: ['2', '3', '4', '5', '6'], default: '3' },
    { key: 'captions', type: 'toggle', label: 'pcOptCaptions', default: false },
  ],
}, async (c) => {
  const list = await pcGalleryIds(c);
  if (!list.length) return pcPickHint(c, 'pcGalleryEmpty');
  const ids = list.map((p) => p.id);
  const layout = pbOpt(c, 'layout');
  const caps = pbOpt(c, 'captions');
  return `<div class="pc-gallery" data-layout="${layout}" style="--cols:${Number(pbOpt(c, 'cols'))}">${list.map((p, i) => `<figure class="pc-gal-item"
      role="button" tabindex="0" onclick="pbLightbox(${xv(ids)},${i})" onkeydown="if(event.key==='Enter'){event.preventDefault();pbLightbox(${xv(ids)},${i})}">
      ${pcImgTag(p.id, '', '', p.name)}${caps && p.name ? `<figcaption data-no-i18n>${x(p.name)}</figcaption>` : ''}</figure>`).join('')}</div>`;
});

// The lightbox: one picture at a time over the window, arrows and Escape.
let _pbLb = null;
function pbLightbox(ids, i) {
  _pbLb = { ids, i };
  let el = q('#pb-lightbox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pb-lightbox';
    el.className = 'pb-lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.addEventListener('click', (e) => { if (e.target === el) pbLightboxClose(); });
    document.body.appendChild(el);
  }
  pbLightboxDraw();
  el.querySelector('.pb-lb-close')?.focus();
}
function pbLightboxDraw() {
  const el = q('#pb-lightbox');
  if (!el || !_pbLb) return;
  const { ids, i } = _pbLb;
  const many = ids.length > 1;
  el.innerHTML = `${pcImgTag(ids[i], 'pb-lb-img')}
    <button class="btn btn-g btn-i pb-lb-close" onclick="pbLightboxClose()" title="${t('close')}" aria-label="${t('close')}">${I.close}</button>
    ${many ? `<button class="btn btn-g btn-i pb-lb-prev" onclick="pbLightboxStep(-1)" aria-label="${t('pbPrev')}">${I.chevronLeft}</button>
      <button class="btn btn-g btn-i pb-lb-next" onclick="pbLightboxStep(1)" aria-label="${t('pbNext')}">${I.chevronRight}</button>
      <span class="pb-lb-n" data-no-i18n>${i + 1} / ${ids.length}</span>` : ''}`;
}
function pbLightboxStep(d) {
  if (!_pbLb) return;
  if (_pbLb.pdf) { pcPdfFullStep(d); return; } // a PDF's pages (components/media.js)
  if (!_pbLb.ids.length) return;
  _pbLb.i = (_pbLb.i + d + _pbLb.ids.length) % _pbLb.ids.length;
  pbLightboxDraw();
}
function pbLightboxClose() {
  _pbLb = null;
  q('#pb-lightbox')?.remove();
  // a model shown in the box lets its WebGL context go (components/media-3d.js)
  if (typeof PC3D !== 'undefined') for (const k of [...PC3D.keys()]) if (String(k).startsWith('lb-')) pc3dStop(k);
}
document.addEventListener('keydown', (e) => {
  if (!_pbLb) return;
  if (e.key === 'Escape') { e.stopPropagation(); pbLightboxClose(); } else if (e.key === 'ArrowLeft') pbLightboxStep(-1); else if (e.key === 'ArrowRight') pbLightboxStep(1);
}, true);

// ── Divider: a line, two, dots, an ornament, or a thin band of picture ──
const PC_DIVIDER_OPTIONS = () => [
  { key: 'look', type: 'select', label: 'pcOptLook', choices: ['line', 'double', 'dots', 'ornament', 'image'], default: 'line', choiceKey: (v) => `pcDiv${pbCap(v)}` },
  { key: 'icon', type: 'icon', label: 'pbChooseIcon' },
  { key: 'image', type: 'image', label: 'pbImage' },
  { key: 'focus', type: 'focus', label: 'pbFocusTitle' },
];
function pcDividerHtml(c) {
  const look = pbOpt(c, 'look');
  if (look === 'ornament') return `<div class="pc-div pc-div-orn" role="separator"><span>${pbIconHtml(pbOpt(c, 'icon')) || '<span class="pb-ico" data-no-i18n>✦</span>'}</span></div>`;
  if (look === 'image') {
    const id = pbFileId(pbOpt(c, 'image'));
    if (id) return `<div class="pc-div pc-div-img" role="separator">${pcImgTag(id, '', `object-position:${pbFocusCss(pbOpt(c, 'focus'))}`)}</div>`;
  }
  return look === 'line' || look === 'image' ? '<hr class="pb-hr">' : `<hr class="pb-hr" data-look="${look}">`;
}
PB_BASIC_OPTIONS.divider = PC_DIVIDER_OPTIONS;
registerComponent('core.divider', { kind: 'core', labelKey: 'pcDivider', options: PC_DIVIDER_OPTIONS, render: pcDividerHtml });

// ── Icon row: icon + word chips (traits, elements, states) ──────────────
registerComponent('core.iconrow', {
  kind: 'core', labelKey: 'pcIconrow',
  options: () => [
    { key: 'items', type: 'iconitems', label: 'pcOptItems' },
    { key: 'look', type: 'select', label: 'pcOptLook', choices: ['chip', 'big'], default: 'chip', choiceKey: (v) => `pcIr${pbCap(v)}` },
    { key: 'size', type: 'select', label: 'pcOptSize', choices: ['s', 'm', 'l'], default: 'm', choiceKey: (v) => `pcSize${pbCap(v)}` },
  ],
  render: (c) => {
    const items = (pbOpt(c, 'items') || []).filter((it) => it.icon || it.label);
    if (!items.length) return pcPickHint(c, 'pcIconrowEmpty');
    return `<div class="pc-iconrow" data-look="${pbOpt(c, 'look')}" data-size="${pbOpt(c, 'size')}">${items.map((it) =>
      `<span class="pc-ir">${pbIconHtml(it.icon)}${it.label ? `<span class="pc-ir-t" data-no-i18n>${x(it.label)}</span>` : ''}</span>`).join('')}</div>`;
  },
});

// ── Figure: a picture sized, fitted, rounded, floated, captioned, linked.
// The plain `image` block is a figure whose picture is its source_key.
const PC_FIGURE_OPTIONS = (withImage) => () => [
  ...(withImage ? [{ key: 'image', type: 'image', label: 'pbImage' }] : []),
  { key: 'size', type: 'select', label: 'pcOptSize', choices: ['s', 'm', 'l', 'full'], default: 'full', choiceKey: (v) => `pcSize${pbCap(v)}` },
  { key: 'fit', type: 'select', label: 'pcOptFit', choices: ['contain', 'cover'], default: 'contain', choiceKey: (v) => `pcFit${pbCap(v)}` },
  { key: 'float', type: 'select', label: 'pcOptFloat', choices: ['none', 'left', 'right'], default: 'none', choiceKey: (v) => `pcFloat${pbCap(v)}` },
  { key: 'round', type: 'toggle', label: 'pcOptRound', default: true },
  { key: 'caption', type: 'text', label: 'pcOptCaption', max: 200 },
  { key: 'links', type: 'links', label: 'pbLinks' },
  { key: 'focus', type: 'focus', label: 'pbFocusTitle' },
];
function pcFigureHtml(c, fileId, caption) {
  const id = fileId || pbFileId(pbOpt(c, 'image'));
  if (!id) return null;
  const fit = pbOpt(c, 'fit');
  const cap = pbOpt(c, 'caption') || caption || '';
  const link = pbLinksOf(c)[0];
  const img = pcImgTag(id, '', `object-fit:${fit};object-position:${pbFocusCss(pbOpt(c, 'focus'))}`);
  const go = link ? `pbLinkGo(${xj(c.iid)},${xv(['links', 0])})` : `pbLightbox([${id}],0)`;
  return `<figure class="pb-img pc-fig" data-size="${pbOpt(c, 'size')}" data-float="${pbOpt(c, 'float')}" data-fit="${fit}"${pbOpt(c, 'round') ? ' data-round' : ''}>
    <div class="pc-fig-frame" role="${link ? 'link' : 'button'}" tabindex="0" onclick="${go}" onkeydown="if(event.key==='Enter'){event.preventDefault();${go}}">${img}</div>
    ${cap ? `<figcaption data-no-i18n>${x(cap)}</figcaption>` : ''}</figure>`;
}
PB_BASIC_OPTIONS.image = PC_FIGURE_OPTIONS(false);
registerComponent('core.figure', {
  kind: 'core', labelKey: 'pcFigure', options: PC_FIGURE_OPTIONS(true),
  render: (c) => pcFigureHtml(c) || pcPickHint(c, 'pcFigureEmpty'),
});
