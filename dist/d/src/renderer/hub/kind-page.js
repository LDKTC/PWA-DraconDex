'use strict';
// ═══ KIND_PAGE — what each kind's page offers to begin with ═════════════
// v5 Part 3 (V5.md §7.3) made this the one registry for a kind's page:
// load, main, mount. v5 Part 8 (§12) moved all three onto the kind's page
// component (page/registry.js registerComponent, one per mod/*.js), so what
// is left is `start` — v5 Part 6 (§10.4): the command (core/commands.js) a
// kind's empty page offers as its ONE primary button, drawn by
// kindEmptyStateHtml() below with "what this kind is for".
// Inspector and Drafter are always an editor, so they have no empty page.
// Collector has no page (it only expands), so it has no entry.
//
// Also here: viewBarHtml(), the one builder for the view-chip bar that was
// copy-pasted into eleven kinds' toolbars.

const KIND_PAGE = {
  classifier: { start: 'classifier.quickStart' },
  manager: { start: 'manager.pick' },
  inspector: {},
  locator: { start: 'locator.addArea' },
  chronicler: { start: 'chronicler.addLine' },
  wanderer: { start: 'wanderer.place' },
  narrator: { start: 'narrator.addDialogue' },
  author: { start: 'author.newChapter' },
  scribe: { start: 'scribe.newSession' },
  drafter: {},
  exhibitor: { start: 'exhibitor.editFilter' },
  sketcher: { start: 'sketcher.newPage' },
  designer: { start: 'designer.addShape' },
  diviner: { start: 'diviner.newTable' },
};

// The view-chip bar every kind's toolbar carried its own copy of.
//   views   the view ids, in order
//   active  the current one
//   onclick (v) => the inline onclick JS for that chip
//   label   (v) => the chip's text (already translated or locale-invariant)
//   opts.noI18n  mark the labels as locale-invariant for the i18n sweep
function viewBarHtml(views, active, onclick, label, opts = {}) {
  return `<div class="viewbar">
    ${views.map(v => `<span class="vitem${v === active ? ' act' : ''}" onclick="${onclick(v)}"${opts.noI18n ? ' data-no-i18n' : ''}>${label(v)}</span>`).join('')}
  </div>`;
}

// A kind's empty page (§10.4): icon, what the kind is for (its KIND_DESC_KEY
// sentence — the same line the kind picker shows), then ONE primary button,
// the kind's `start` command. Presets for the kind (hub/presets.js) follow as
// chips — "start from a shape" beside "start empty".
//   o.note   a line about THIS page's state (a filter that matched nothing)
//   o.extra  HTML after the button
//   o.attrs  attributes for the wrapper (a right-click menu)
//   o.start  false to leave the button out (the page's own controls are the way in)
function kindEmptyStateHtml(m, o = {}) {
  const col = m.icon_color_code || m.color_code || KIND_COLOR[m.kind] || 'var(--accent)';
  const start = o.start === false ? null : KIND_PAGE[m.kind]?.start;
  const presets = typeof presetChipsHtml === 'function' ? presetChipsHtml(m) : '';
  return `<div class="empty kind-empty"${o.attrs ? ` ${o.attrs}` : ''}>
    <div class="ei" style="color:${x(col)}">${moduleIconHtml(m)}</div>
    <h3>${x(m.name)}</h3>
    <p>${t(KIND_DESC_KEY[m.kind])}</p>
    ${o.note ? `<p class="drafter-hint">${o.note}</p>` : ''}
    ${start ? cmdBtn(start, { moduleId: m.id }, { cls: 'btn-p' }) : ''}
    ${o.extra || ''}
    ${presets}
  </div>`;
}

