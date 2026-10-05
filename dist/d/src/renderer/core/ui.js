// UI primitives every module builds on: q()/x() DOM+escape helpers, toast(),
// setBusy(), the shared modal, the modeless floating panel, uiConfirm/uiPrompt
// (this app never uses native alert/confirm), and the panel resize/collapse
// handling. Anything here is fair game for any renderer file to call.
const q = (s) => document.querySelector(s);
// Text and attribute-value contexts. `'` is escaped too (matching _mdEsc in
// markdown.js) so single-quoted attributes are safe as well as double-quoted.
const x = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// `esc` is an alias for `x` used by the Writer/Sage modules.
const esc = x;
// JS-ARGUMENT context — for values passed into an inline handler:
//
//   onclick="openThing(${xj(name)})"      <-- correct, note: NO quotes around it
//   onclick="openThing('${x(name)}')"     <-- WRONG, injectable
//
// The second form cannot be fixed by escaping `'`: the HTML parser decodes
// entities BEFORE the JS is parsed, so `&#39;` turns back into `'` and closes
// the string literal anyway. The only fix is to emit a complete JS literal.
// JSON.stringify escapes the quotes and backslashes, x() then makes it safe as
// attribute text, and the parser hands well-formed JS to the handler.
const xj = (v) => x(JSON.stringify(String(v ?? '')));
const fmtDate = (d,m,y,hh,mm) => {
  if(d==null) return '?';
  const ts = (hh||mm) ? ` ${String(hh||0).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}` : '';
  return `${d}/${m}/${y}${ts}`;
};
// The graph axis's hover tooltip. Takes a calendar ordinal, not a JS
// timestamp — reading it back through `new Date()` reported real-world dates
// for a fictional calendar (and, for years under 100, dates 1900 years off).
const fmtTimelinePoint = (ts) => {
  const p = calFromOrdinal(timelineCalendarSpec(), ts);
  return `${p.d}/${p.m}/${p.y} ${String(p.h).padStart(2,'0')}:${String(p.mi).padStart(2,'0')}`;
};

let _tt;
// `type` accepts the CSS variants ('ok' | 'err') plus the long-form aliases
// 'success' | 'error'. ~20 call sites across the renderer pass 'error', which
// matched no rule in style.css — those toasts rendered neutral gray and were
// indistinguishable from a success message. Aliasing here fixes all of them at
// once and keeps future call sites from having to remember which spelling wins.
const TOAST_CLS = { error: 'err', success: 'ok' };
// Procress 18 part 4: what a screen reader should hear when the screen
// already shows it (a rename that took, a move) — no toast for those.
function announce(msg) {
  const el = document.getElementById('sr-live');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}

function toast(msg,type='') {
  const el=q('#toast'); el.textContent=tr(msg); el.className=`show ${TOAST_CLS[type] || type}`;
  clearTimeout(_tt); _tt=setTimeout(()=>el.classList.remove('show'),2600);
}
// v5 Part 7 (APP docs/V5.md §11.4): a toast that offers to take the action
// back — "Moved to trash · Undo". NN/g: when an action is easy to reverse, a
// confirm dialog is redundant, so deleting a module asks nothing and says
// this instead. Stays longer than a plain toast so there is time to click.
function toastAction(msg, actionLabel, onAction, type='ok', ms=7000) {
  const el=q('#toast');
  el.textContent='';
  const span=document.createElement('span'); span.textContent=tr(msg);
  const btn=document.createElement('button'); btn.className='btn btn-g btn-sm toast-act'; btn.textContent=actionLabel;
  btn.onclick=()=>{ clearTimeout(_tt); el.classList.remove('show','has-action'); onAction(); };
  el.append(span, btn);
  el.className=`show has-action ${TOAST_CLS[type] || type}`;
  clearTimeout(_tt); _tt=setTimeout(()=>el.classList.remove('show','has-action'),ms);
}

// Minimal busy indicator for awaits long enough to look like a dead click.
// Overlays the given element (or the whole window when `el` is omitted) with a
// spinner; call setBusy(el, false) in a finally block to clear it. Kept
// deliberately small — the app has no skeleton/loading vocabulary and this is
// not the pass to invent one.
function setBusy(el, on = true) {
  const host = (typeof el === 'string' ? q(el) : el) || document.body;
  const existing = host.querySelector(':scope > .busy-veil');
  if (!on) { existing?.remove(); host.removeAttribute('aria-busy'); return; }
  if (existing) return;
  // The veil is absolutely positioned, so the host needs a positioning context.
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const veil = document.createElement('div');
  veil.className = 'busy-veil';
  veil.innerHTML = `<span class="busy-spin"></span><span class="busy-text">${x(t('loading'))}</span>`;
  host.appendChild(veil);
  host.setAttribute('aria-busy', 'true');
}

// opts.size: 'xl' for a two-pane dialog (the Artisan gallery, Export…,
// Use template…). Reset on every open, so a normal modal after a wide one
// is normal again. opts.focus: a selector to focus instead of the first
// field — a checkbox at the bottom of a scrolling pane would otherwise pull
// the pane down past its heading.
function openModal(title,body,opts={}) {
  q('#modal-title').textContent=tr(title);
  q('#modal-body').innerHTML=body;
  const m=q('#modal'); if(m){ if(opts.size) m.dataset.size=opts.size; else delete m.dataset.size; }
  // Reset the ✕ (openWelcomeModal hides it for the required-choice first-run modal).
  const closeBtn = q('#modal-close'); if(closeBtn) closeBtn.style.display='';
  const overlay = q('#modal-overlay');
  overlay.classList.remove('hidden');
  // make modal focusable and move focus to it so inputs inside become interactive.
  // Prefer the first real field so the user can start typing immediately — the
  // ~15 call sites that re-focus a specific field on their own still win, they
  // just no longer have to for the common "focus the first input" case.
  const modalEl = q('#modal');
  if(modalEl){
    modalEl.tabIndex = -1;
    setTimeout(()=>{
      try{
        const first = (opts.focus && q(opts.focus)) || q('#modal-body input:not([type="hidden"]):not([disabled]), #modal-body textarea:not([disabled]), #modal-body select:not([disabled])');
        (first || modalEl).focus();
      }catch(e){}
    }, 30);
  }
}
function closeModal() { q('#modal-overlay').classList.add('hidden'); }

// The main modal was the only overlay in the app with no Escape handler
// (uiConfirm, the quick switcher and the guide all have one). Bound in the
// bubble phase on purpose: those three listen in the capture phase and stop
// their own event, so whichever of them is stacked on top handles Escape first
// and this never fires beneath them. The extra guards cover the case where they
// don't stop propagation, plus the first-run welcome modal — which hides its ✕
// (see openWelcomeModal) because picking one of its options is required.
function bindModalEscape() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (q('#modal-overlay')?.classList.contains('hidden')) return;
    if (q('#confirm-overlay') || q('#qs-overlay') || q('#guide-overlay')) return;
    if (q('#modal-close')?.style.display === 'none') return; // required-choice modal
    e.preventDefault();
    closeModal();
  });
}

// ═══ FLOATING (MODELESS) PANEL ══════════════════════════════════════════
// Like openModal/closeModal but with no full-viewport backdrop/click-catcher
// — the background app stays interactive while the panel is open (Plan
// part3 setting#2 "modeless window"). Used by the Preferences panel and the
// custom-theme editor.
function openFloatingPanel(id, title, bodyHtml, {width=880, height=600, onClose} = {}) {
  closeFloatingPanel(id); // idempotent re-open
  const el = document.createElement('div');
  el.className = 'floating-panel';
  el.id = id;
  el.style.width = width+'px';
  el.style.height = height+'px';
  el.innerHTML = `
    <div class="fp-head"><span data-no-i18n>${title}</span>
      <button class="fp-close" onclick="closeFloatingPanel('${id}')">${I.close}</button></div>
    <div class="fp-body">${bodyHtml}</div>`;
  document.body.appendChild(el);
  if (onClose) el._onClose = onClose;
}
function closeFloatingPanel(id) {
  const el = q(`#${id}`);
  if (el) { el._onClose?.(); el.remove(); }
}

// Custom in-app confirm dialog. Replaces native window.confirm(), which on
// Electron leaves the renderer unable to receive mouse input until the window
// is re-focused (or DevTools is opened) — the long-standing "UI frozen after
// delete" bug. Returns a Promise<boolean>; call sites use `await uiConfirm(...)`.
function uiConfirm(message, opts = {}) {
  const { okText = 'OK', cancelText = 'Cancel', danger = true } = opts;
  return new Promise(resolve => {
    document.getElementById('confirm-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'confirm-overlay';
    const box = document.createElement('div');
    box.id = 'confirm-box';
    const msg = document.createElement('div');
    msg.className = 'confirm-msg';
    msg.textContent = tr(message);
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-s';
    cancelBtn.textContent = tr(cancelText);
    const okBtn = document.createElement('button');
    okBtn.className = 'btn ' + (danger ? 'btn-d' : 'btn-p');
    okBtn.textContent = tr(okText);
    actions.append(cancelBtn, okBtn);
    box.append(msg, actions);
    ov.append(box);
    document.body.append(ov);
    const finish = (val) => {
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      resolve(val);
    };
    // stopPropagation matters as much as preventDefault here: finish() removes
    // the overlay synchronously, so without it the same Escape keeps travelling
    // and bindModalEscape() — whose "is a confirm on top?" guard now sees an
    // already-detached overlay — closes the modal underneath too. guide.js and
    // quickswitch.js already stop their own keys; this was the odd one out.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
    };
    okBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) finish(false); });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { try { okBtn.focus(); } catch (e) {} }, 20);
  });
}

// Text-entry sibling of uiConfirm, replacing native prompt() for the same
// reason (see the uiConfirm comment above). Resolves to the entered string, or
// null when cancelled. Deliberately built on the #confirm-overlay chrome rather
// than openModal: #modal-overlay is z-index 100 but .floating-panel is 150, so a
// prompt raised from the custom-theme editor would render *behind* it, while
// #confirm-overlay sits at 1000 and clears every other layer.
function uiPrompt(message, opts = {}) {
  const { okText = 'OK', cancelText = 'Cancel', placeholder = '', value = '' } = opts;
  return new Promise(resolve => {
    document.getElementById('confirm-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'confirm-overlay';
    const box = document.createElement('div');
    box.id = 'confirm-box';
    box.className = 'wide';
    const msg = document.createElement('div');
    msg.className = 'confirm-msg';
    msg.textContent = tr(message);
    const field = document.createElement('div');
    field.className = 'fg';
    const ta = document.createElement('textarea');
    ta.placeholder = placeholder;
    ta.value = value;
    ta.spellcheck = false;
    field.append(ta);
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-s';
    cancelBtn.textContent = tr(cancelText);
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-p';
    okBtn.textContent = tr(okText);
    actions.append(cancelBtn, okBtn);
    box.append(msg, field, actions);
    ov.append(box);
    document.body.append(ov);
    const finish = (val) => {
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      resolve(val);
    };
    // Enter alone inserts a newline (the field is multi-line for pasted JSON);
    // Ctrl/Cmd+Enter submits, matching the editor conventions elsewhere.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); finish(ta.value); }
    };
    okBtn.addEventListener('click', () => finish(ta.value));
    cancelBtn.addEventListener('click', () => finish(null));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) finish(null); });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { try { ta.focus(); } catch (e) {} }, 20);
  });
}

function applyLeftPanelState(){
  q('#app')?.classList.toggle('left-panel-collapsed', S.leftPanelCollapsed);
  // #title-left-zone mirrors #nav-sidebar + #left-panel's width so the builder tab
  // strip that follows it in the title bar stays aligned with #main-area below.
  q('#title-tab-bar')?.classList.toggle('left-panel-collapsed', S.leftPanelCollapsed);
  // process2 part1 #3: keep #nav-logo-btn's logo/expand-hub swap in sync on
  // every path that reaches this function (toggle click, boot, workspace switch).
  updateTopNavButton();
}

function setLeftPanelCollapsed(collapsed){
  S.leftPanelCollapsed = !!collapsed;
  localStorage.setItem(LEFT_PANEL_COLLAPSED_KEY, S.leftPanelCollapsed ? '1' : '0');
  applyLeftPanelState();
}

// ═══ Left panel resize (Plan part4 #1) ═════════════════════════════════
// --sidebar is already a CSS custom property (style.css), not a hardcoded
// width — #title-left-zone's calc(var(--nav) + var(--sidebar)) stays in
// sync for free by driving resize through the same var. The collapse
// toggle above wins regardless of the stored width since
// #app.left-panel-collapsed #left-panel{width:0} is more specific than
// #left-panel{width:var(--sidebar)}.
function applyLeftPanelWidth() {
  document.documentElement.style.setProperty('--sidebar', S.leftPanelWidth + 'px');
}

let leftPanelResizeState = null;
function startLeftPanelResize(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  leftPanelResizeState = { startX: ev.clientX, startWidth: q('#left-panel').getBoundingClientRect().width };
  q('#left-panel-resize')?.classList.add('is-resizing');
  q('#left-panel')?.classList.add('panel-resizing');
  document.body.classList.add('resize-drag-active');
}
document.addEventListener('mousemove', (ev) => {
  if (!leftPanelResizeState) return;
  S.leftPanelWidth = Math.max(200, Math.min(560, leftPanelResizeState.startWidth + (ev.clientX - leftPanelResizeState.startX)));
  applyLeftPanelWidth();
});
document.addEventListener('mouseup', () => {
  if (!leftPanelResizeState) return;
  leftPanelResizeState = null;
  q('#left-panel-resize')?.classList.remove('is-resizing');
  q('#left-panel')?.classList.remove('panel-resizing');
  document.body.classList.remove('resize-drag-active');
  localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(S.leftPanelWidth));
});

// Plan part1 #2: resizable nav rail, same drag pattern as startLeftPanelResize
// above driving --nav instead of --sidebar. Clamp floor (34px) keeps the
// fixed 20px .nav-btn .icon SVGs from clipping; ceiling (220px, raised from
// 80px for process2 part1 #2) leaves room for the icon+label row below the
// NAV_LABEL_THRESHOLD breakpoint.
const NAV_LABEL_THRESHOLD = 110;
function applyNavRailWidth() {
  document.documentElement.style.setProperty('--nav', S.navRailWidth + 'px');
  const alwaysLabel = !!S.settings?.navVerticalAlwaysLabel;
  q('#nav-sidebar')?.classList.toggle('nav-expanded', alwaysLabel || S.navRailWidth >= NAV_LABEL_THRESHOLD);
}
let navRailResizeState = null;
function startNavRailResize(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  navRailResizeState = { startX: ev.clientX, startWidth: q('#nav-sidebar').getBoundingClientRect().width };
  q('#nav-sidebar-resize')?.classList.add('is-resizing');
}
document.addEventListener('mousemove', (ev) => {
  if (!navRailResizeState) return;
  S.navRailWidth = Math.max(34, Math.min(220, navRailResizeState.startWidth + (ev.clientX - navRailResizeState.startX)));
  applyNavRailWidth();
});
document.addEventListener('mouseup', () => {
  if (!navRailResizeState) return;
  navRailResizeState = null;
  q('#nav-sidebar-resize')?.classList.remove('is-resizing');
  localStorage.setItem(NAV_RAIL_WIDTH_KEY, String(S.navRailWidth));
});

// Process 6 part 1: horizontal nav orientation's own resize handle
// (#nav-toolbar-h-resize) — same drag pattern as startNavRailResize above,
// dragging height (--navh) instead of width since the bar is a row under
// the title bar rather than a column down the side. Floor/ceiling keep the
// 32px .nav-btn (workspace.css horizontal override) from clipping while
// still leaving room to grow toward the vertical rail's own icon+label look.
function applyNavHorizontalHeight() {
  document.documentElement.style.setProperty('--navh', S.navHorizontalHeight + 'px');
}
let navHResizeState = null;
function startNavHorizontalResize(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  navHResizeState = { startY: ev.clientY, startHeight: q('#nav-toolbar-h').getBoundingClientRect().height };
  q('#nav-toolbar-h-resize')?.classList.add('is-resizing');
}
document.addEventListener('mousemove', (ev) => {
  if (!navHResizeState) return;
  S.navHorizontalHeight = Math.max(36, Math.min(120, navHResizeState.startHeight + (ev.clientY - navHResizeState.startY)));
  applyNavHorizontalHeight();
});
document.addEventListener('mouseup', () => {
  if (!navHResizeState) return;
  navHResizeState = null;
  q('#nav-toolbar-h-resize')?.classList.remove('is-resizing');
  localStorage.setItem(NAV_H_HEIGHT_KEY, String(S.navHorizontalHeight));
});

// Plan part1 #2: resizable page view for Hub pages that have no other
// resize lever (Sage Hut / Import Dock file preview / Kind Browser) — same
// mousedown/document-mousemove/document-mouseup + localStorage-persist
// pattern as startLeftPanelResize above. Clamped at a
// 480px floor (full page content needs more room than the inspector dock's
// 220px) and the live pane width as the ceiling, so dragging past full
// width is simply a no-op instead of overflowing.
let pageViewResizeState = null;
function startPageViewResize(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  // The handle's own page: a split can show two page views at once.
  const shell = ev.target?.closest?.('.page-view-shell');
  const el = shell?.querySelector('.page-view');
  if (!el) return;
  pageViewResizeState = { startX: ev.clientX, startWidth: el.getBoundingClientRect().width, shell, grip: ev.target };
  ev.target.classList.add('is-resizing');
}
document.addEventListener('mousemove', (ev) => {
  if (!pageViewResizeState) return;
  const { shell } = pageViewResizeState;
  const shellW = shell.getBoundingClientRect().width || 99999;
  S.pageViewWidth = Math.max(480, Math.min(shellW, pageViewResizeState.startWidth + (ev.clientX - pageViewResizeState.startX)));
  const el = shell.querySelector('.page-view');
  if (el) { el.style.flex = `0 0 ${S.pageViewWidth}px`; el.style.maxWidth = S.pageViewWidth + 'px'; }
});
document.addEventListener('mouseup', () => {
  if (!pageViewResizeState) return;
  pageViewResizeState.grip.classList.remove('is-resizing');
  pageViewResizeState = null;
  localStorage.setItem(PAGE_VIEW_WIDTH_KEY, String(S.pageViewWidth));
});

// Vertical drag-resize between adjacent OPEN Hub accordion sections (Plan
// part1 #2.1) — same mousedown/document-mousemove/document-mouseup +
// localStorage-persist shape as startLeftPanelResize/startPageViewResize
// above, height instead of width. The [80, total-80] clamp matches the
// existing CSS min-height:80px floor on .acc-body.
let hubSectionResizeState = null;
function startHubSectionResize(ev, topKey, bottomKey) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const topEl = q(`.acc-body[data-key="${topKey}"]`);
  const bottomEl = q(`.acc-body[data-key="${bottomKey}"]`);
  if (!topEl || !bottomEl) return;
  hubSectionResizeState = {
    startY: ev.clientY, topKey, bottomKey,
    topStart: topEl.getBoundingClientRect().height,
    bottomStart: bottomEl.getBoundingClientRect().height,
  };
  ev.currentTarget.classList.add('is-resizing');
}
document.addEventListener('mousemove', (ev) => {
  const st = hubSectionResizeState;
  if (!st) return;
  const total = st.topStart + st.bottomStart;
  const top = Math.max(80, Math.min(total - 80, st.topStart + (ev.clientY - st.startY)));
  if (!S.hubSectionHeights) S.hubSectionHeights = {};
  S.hubSectionHeights[st.topKey] = Math.round(top);
  S.hubSectionHeights[st.bottomKey] = Math.round(total - top);
  const topEl = q(`.acc-body[data-key="${st.topKey}"]`);
  const bottomEl = q(`.acc-body[data-key="${st.bottomKey}"]`);
  if (topEl) topEl.style.flex = `0 0 ${top}px`;
  if (bottomEl) bottomEl.style.flex = `0 0 ${total - top}px`;
});
document.addEventListener('mouseup', () => {
  if (!hubSectionResizeState) return;
  hubSectionResizeState = null;
  document.querySelectorAll('.panel-resize-handle-v.is-resizing').forEach(h => h.classList.remove('is-resizing'));
  localStorage.setItem(HUB_SECTION_HEIGHTS_KEY, JSON.stringify(S.hubSectionHeights || {}));
});

// ═══ Toggle animations (Process 7 part 1) ═══════════════════════════════
// Every screen here is a full innerHTML rebuild (no vdom diffing), so a
// plain CSS `transition` on a toggled element never fires — the "before"
// node is destroyed and a fresh one takes its place before the browser gets
// a chance to interpolate anything. A CSS `animation` doesn't have that
// problem for the OPENING half (it plays from its own `from` keyframe
// regardless of when the class lands on the node, even a node created this
// same tick) — but the CLOSING half still needs the outgoing node animated
// BEFORE the state flip/re-render removes it, since there's nothing left to
// animate once it's gone. Both helpers below are the shared choke point for
// all 3 Plan.md targets (hub accordion, nest module-list expand/collapse,
// module inspector) so the on/off + speed setting only has to be honored
// once.
function animToggleEnabled() { return S.settings.animationsEnabled !== false; }

// Call right after a fresh render has created `el` in its "opened" state.
function animateToggleOpen(el) {
  if (!el || !animToggleEnabled()) return;
  el.classList.add('anim-toggle-in');
  el.addEventListener('animationend', () => el.classList.remove('anim-toggle-in'), { once: true });
}

// Call BEFORE flipping the state that will hide/remove `el` on re-render —
// plays the exit animation on the still-live node, then runs `commit` (the
// actual state flip + renderNexusHome()). Skips straight to commit() if
// animations are off or the node isn't live (e.g. hidden by a collapsed
// ancestor) — same escape hatch every caller needs regardless.
function animateToggleCloseThenCommit(el, commit) {
  if (!el || !animToggleEnabled()) { commit(); return; }
  el.classList.add('anim-toggle-out');
  let done = false;
  const finish = () => { if (done) return; done = true; commit(); };
  el.addEventListener('animationend', finish, { once: true });
  const ms = ANIM_SPEED_MS[S.settings.animationSpeed] || ANIM_SPEED_MS.normal;
  setTimeout(finish, ms + 60); // safety net if animationend never fires
}
