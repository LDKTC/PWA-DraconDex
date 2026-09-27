'use strict';
// ═══ FIRST-RUN COACH-MARKS GUIDE ═════════════════════════════════════════
// Lazy-loaded (loadModule) and started for a first-time user right after their
// first Nexus is created — by createNexusSubmit() when the vault was created
// from inside an app window, or by init() (boot.js) picking up
// NEXUS_PENDING_GUIDE_KEY when it was created from the Welcome window, whose
// renderer closes before the tour could run — so the real vault-home UI
// (module rail, hub sections, backup buttons, switch control) already exists to
// point at. A dimmed spotlight highlights each target while a popover explains
// it; Back/Next/Skip drive the tour, Esc/←/→ on the keyboard. Steps whose target
// is absent are skipped so it never points at nothing.

// { sel, title, text } — title/text are i18n keys resolved with t().
const GUIDE_STEPS = [
  // Plan process1 part4 #2: the nav rail's own "+ create module" tool was
  // removed (duplicate of the Nexus Nest section's own create button), so
  // this step now points at that section header's create action instead.
  { sel: '.acc-head[onclick*="nest"] button[onclick*="openMainModuleModal"]', title: 'guideModuleTitle', text: 'guideModuleText' },
  { sel: '.acc-head[onclick*="nest"]',       title: 'guideNestTitle',   text: 'guideNestText' },
  // v5 Part 7 (§11.9): Sage Hut is an Activity Bar destination now. The old
  // backup step pointed at the rail's Import DB button, which moved to
  // Setting ▸ Data — a tour step cannot point into a closed window, so it went.
  { sel: '.module-rail-tool[data-cmd="app.sageHut"]', title: 'guideSageTitle', text: 'guideSageText' },
  // Plan process1 part3 #2: the separate "switch nexus" ⇄ button was
  // removed (duplicate of clicking the nexus name), so this step now
  // points at the nexus name itself.
  { sel: '.nexus-vault-name', title: 'guideSwitchTitle', text: 'guideSwitchText' },
];

let _gSteps = [];
let _gIdx = 0;

function startNexusGuide() {
  // Resolve targets now; drop steps with no element on screen.
  _gSteps = GUIDE_STEPS
    .map(s => ({ ...s, el: document.querySelector(s.sel) }))
    .filter(s => s.el);
  if (!_gSteps.length) return;
  _gIdx = 0;
  document.getElementById('guide-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'guide-overlay';
  ov.innerHTML = `
    <div class="guide-catch"></div>
    <div class="guide-spotlight"></div>
    <div class="guide-pop">
      <div class="guide-pop-title" id="guide-title"></div>
      <div class="guide-pop-text" id="guide-text"></div>
      <div class="guide-pop-foot">
        <span class="guide-step" id="guide-count" data-no-i18n></span>
        <span style="flex:1"></span>
        <button class="btn btn-g btn-sm" id="guide-skip" onclick="endNexusGuide()">${t('guideSkip')}</button>
        <button class="btn btn-s btn-sm" id="guide-back" onclick="guidePrev()">${t('guideBack')}</button>
        <button class="btn btn-p btn-sm" id="guide-next" onclick="guideNext()"></button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  document.addEventListener('keydown', _guideKey, true);
  window.addEventListener('resize', _guidePaint);
  _guidePaint();
}

function endNexusGuide() {
  document.removeEventListener('keydown', _guideKey, true);
  window.removeEventListener('resize', _guidePaint);
  document.getElementById('guide-overlay')?.remove();
}

function guideNext() {
  if (_gIdx >= _gSteps.length - 1) { endNexusGuide(); return; }
  _gIdx++; _guidePaint();
}
function guidePrev() {
  if (_gIdx <= 0) return;
  _gIdx--; _guidePaint();
}

function _guideKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endNexusGuide(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); guideNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); guidePrev(); }
}

function _guidePaint() {
  const ov = document.getElementById('guide-overlay');
  if (!ov) return;
  const step = _gSteps[_gIdx];
  // Re-resolve in case the DOM re-rendered between steps.
  const el = document.querySelector(step.sel) || step.el;
  const r = el.getBoundingClientRect();
  const pad = 6;
  const spot = ov.querySelector('.guide-spotlight');
  spot.style.left = `${r.left - pad}px`;
  spot.style.top = `${r.top - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;

  ov.querySelector('#guide-title').textContent = t(step.title);
  ov.querySelector('#guide-text').textContent = t(step.text);
  ov.querySelector('#guide-count').textContent = `${_gIdx + 1} / ${_gSteps.length}`;
  ov.querySelector('#guide-back').style.visibility = _gIdx === 0 ? 'hidden' : 'visible';
  ov.querySelector('#guide-next').textContent = _gIdx === _gSteps.length - 1 ? t('guideDone') : t('guideNext');

  // Place the popover: prefer below the target, flip above if it would overflow,
  // then clamp horizontally into the viewport.
  const pop = ov.querySelector('.guide-pop');
  const pw = pop.offsetWidth || 280;
  const ph = pop.offsetHeight || 140;
  const gap = 12;
  let top = r.bottom + gap;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - gap);
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
