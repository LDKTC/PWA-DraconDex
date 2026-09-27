// The Welcome screen (v4.6.0) — its own Electron window, not an overlay.
//
// Before, this was a 480px modal shown on top of the vault picker, and only
// when the database held zero vaults. Now main.js opens a dedicated window
// (index.html?welcome=1, createWelcomeWindow) on every launch, boot.js no
// longer restores the last vault, and this screen is the only way into one.
// It reuses the app's own shell — left panel + main area, chrome hidden by
// body.welcome-mode (css/welcome.css) — so modals, the color picker, toasts,
// i18n and theming all come for free.
//
// Picking a vault hands off to a real app window and closes this one
// (window:openNexusReplace), so nothing here ever renders the hub.
//
// On a database with no vaults at all, this window opens on the first-run
// setup wizard instead (S.welcomeStep, set in boot.js) — see the wizard block
// at the bottom of this file.

function renderWelcomeWindow() {
  // One switch for both directions: the wizard runs without a left panel, the
  // vault list needs it back. Toggling here rather than inside the two render
  // functions is what stops "finish the wizard" leaving the panel hidden.
  document.body.classList.toggle('welcome-wizard-mode', S.welcomeStep != null);
  if (S.welcomeStep != null) return renderWelcomeWizard();
  const recent = recentNexuses(3, null);
  const hasVaults = S.nexuses.length > 0;
  // Left panel: every vault, most-recently-opened first so the list matches
  // the order of the cards on the right, then the rest in the alphabetical
  // order getNexuses() returns.
  const ordered = [...recentNexuses(S.nexuses.length, null)];
  q('#left-panel-inner').innerHTML = `
    <div class="ph"><h4>${t('nexus')}</h4>
      <button class="btn btn-p btn-sm" onclick="welcomeCreateNexus()">+ ${t('nexusNew')}</button>
    </div>
    ${ordered.map(n => `
      <div class="module-item nexus-item" onclick="welcomeOpenNexus(${n.id})" title="${t('wmOpenNexus')}">
        <span class="nexus-vault-dot" style="${n.color_code ? `background:${x(n.color_code)}` : ''}"></span>
        <span class="module-name">${x(n.name)}</span>
        <span class="nexus-count">${n.project_count}</span>
        ${nexusRowButtonsHtml(n)}
      </div>`).join('')}
    ${hasVaults ? '' : `<div class="welcome-side-empty">${t('nexusEmpty')}</div>`}`;
  q('#left-panel-foot').innerHTML = '';
  q('#main-inner').innerHTML = `
    <div class="welcome-hero">
      <div class="ei"><img src="../src/assets/brand/DraconDex_WhiteOut.png" class="brand-img" alt="DraconDex" style="height:72px;width:72px;opacity:.4"></div>
      <h2 class="welcome-title">${t('wmTitle')}</h2>
      <p class="welcome-text">${hasVaults ? t('nexusSelect') : t('wmText')}</p>
      ${recent.length ? `
        <div class="welcome-recent">
          <div class="welcome-recent-label">${t('wmRecent')}</div>
          <div class="welcome-recent-row">
            ${recent.map(n => `
              <div class="welcome-recent-card" onclick="welcomeOpenNexus(${n.id})" title="${t('wmOpenNexus')}">
                <span class="nexus-vault-dot" style="${n.color_code ? `background:${x(n.color_code)}` : ''}"></span>
                <span class="welcome-recent-name">${x(n.name)}</span>
                <span class="nexus-count">${n.project_count}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      <div class="welcome-actions">
        <button class="btn btn-p" onclick="welcomeCreateNexus()">${t('wmCreateNew')}</button>
        <button class="btn btn-s" onclick="importDatabaseFile()">${t('wmImport')}</button>
      </div>
    </div>`;
}

// Hand the chosen vault to a real app window; main.js closes this one once
// that window exists. The MRU is written first — this renderer is about to go
// away, and the new window reads the list at boot.
async function welcomeOpenNexus(id) {
  pushRecentNexus(id);
  await api.window.openNexusReplace(id);
}

// "Create new Nexus" opens the standard vault form with the optional tour
// checkbox. createNexusSubmit (nexus.js) reads it after the vault is created
// and, in this window, defers the tour to the app window it opens.
async function welcomeCreateNexus() {
  openNexusModal(null, { showGuideChoice: true });
}

// ═══ FIRST-RUN SETUP WIZARD ════════════════════════════
// Everything that decides how the whole app looks — language, theme, module
// naming — plus the optional Drive sign-in, surfaced once on a
// brand-new install instead of staying buried in the Setting window. Every
// step drives the SAME setting the Setting window drives, so there is no
// parallel state: whatever is picked here can be changed there later, and
// vice versa.
//
// Step bodies are pure `() => html` and are read from this one table, so adding
// a step means adding a row here. `skippable` marks the steps a newcomer can
// wave past and live with the default. Language is the one that always asks.
//
// v5 Part 6 (APP docs/V5.md §10.7): the workspace-style step is gone — it
// asked someone who had not seen the app yet to pick between three layouts
// of it. Drake is the default; Setting ▸ Workspace style still has all three,
// and a teach tip (core/teach.js) offers it once there is enough to judge by.
// The names step became skippable now that Classic is the right default
// (§10.5); removing it outright is §10.7's open proposal, not a decision.
const WELCOME_STEPS = [
  { key:'lang',    labelKey:'language',                  body:welcomeStepLangHtml },
  { key:'theme',   labelKey:'theme',                     body:welcomeStepThemeHtml,   skippable:true },
  { key:'names',   labelKey:'moduleNameMode',            body:welcomeStepNamesHtml,   skippable:true },
  { key:'account', labelKey:'settingPageAccount',        body:welcomeStepAccountHtml, skippable:true },
];

// No left panel here (body.welcome-wizard-mode hides it): a five-item step list
// down the side drew the eye away from the one choice each step is asking for.
// Progress is a row of dots under the heading instead, and everything is one
// centered column.
function renderWelcomeWizard() {
  const idx = Math.max(0, Math.min(WELCOME_STEPS.length - 1, S.welcomeStep));
  const step = WELCOME_STEPS[idx];
  const last = idx === WELCOME_STEPS.length - 1;
  const next = last ? 'welcomeWizardFinish()' : `welcomeWizardGo(${idx + 1})`;
  q('#left-panel-inner').innerHTML = '';
  q('#left-panel-foot').innerHTML = '';
  q('#main-inner').innerHTML = `
    <div class="welcome-wizard">
      <div class="welcome-wizard-head">
        <h2 class="welcome-title">${t(step.labelKey)}</h2>
        <div class="welcome-wizard-note">${t('wzIntro')}</div>
        <div class="welcome-wizard-dots">
          ${WELCOME_STEPS.map((s, i) => `
            <span class="welcome-dot${i === idx ? ' active' : ''}${i < idx ? ' done' : ''}" onclick="welcomeWizardGo(${i})" title="${t(s.labelKey)}"></span>`).join('')}
        </div>
      </div>
      <div class="welcome-wizard-body">${step.body()}</div>
      <div class="welcome-wizard-foot">
        ${idx ? `<button class="btn btn-s" onclick="welcomeWizardGo(${idx - 1})">${t('guideBack')}</button>` : ''}
        ${step.skippable ? `<button class="btn btn-g" onclick="${next}">${t('guideSkip')}</button>` : ''}
        <button class="btn btn-p" onclick="${next}">${last ? t('guideDone') : t('guideNext')}</button>
      </div>
    </div>`;
  // Drive status is a real IPC (and, when connected, a network) round-trip, so
  // the sign-in step paints its shell first and fills itself in after — same
  // split as settingRefreshAccountSection() in core/account.js.
  if (step.key === 'account') welcomeRefreshLogin();
}

function welcomeWizardGo(n) {
  S.welcomeStep = Math.max(0, Math.min(WELCOME_STEPS.length - 1, n));
  renderWelcomeWindow();
}

// Leaving the wizard just clears the step — nothing is persisted, so a fresh
// launch with still-zero vaults shows it again (boot.js).
function welcomeWizardFinish() {
  S.welcomeStep = null;
  renderWelcomeWindow();
}

// setUiSetting() re-renders different things per key (a theme change only
// calls applyUiSettings(), so the ✓ would not move). Re-rendering here means
// the wizard never depends on which branch it happened to take.
function welcomeSetUi(key, value) {
  setUiSetting(key, value);
  renderWelcomeWindow();
}

// ── Step 1: language ──
function welcomeStepLangHtml() {
  const rows = UI_LANGUAGE_OPTIONS.map(lang => `
    <div class="lang-item${S.settings.language === lang ? ' active' : ''}" onmouseenter="settingPreviewLang('${lang}')" onclick="welcomeSetUi('language','${lang}')">
      <span data-no-i18n>${x(LANGUAGE_LABELS[lang] || lang)}</span>${S.settings.language === lang ? `<span class="theme-check">${I.check}</span>` : ''}
    </div>`).join('');
  return `<div class="prefs-lang-shell">
    <div class="lang-list">${rows}</div>
    <div class="prefs-lang-preview">${settingLangPreviewHtml(S.settingPreviewLang || S.settings.language)}</div>
  </div>`;
}

// ── Step 2: theme ──
// The Setting window's own card mockup, unchanged, in a box three rows tall
// so the step stays the same height as every other one. Procress 10 part 2:
// the built-ins and installed themes, then the catalog's not-yet-downloaded
// ones as locked cells with a Download button — the same cells the Setting
// window's expanded Theme section shows.
function welcomeStepThemeHtml() {
  const palettes = getThemePalettes();
  const cells = UI_THEME_OPTIONS.map(key => settingThemeGridCellHtml(key, themeOptionLabel(key), palettes[key] || {}, {
    active: S.settings.theme === key,
    tools: false,
    onclick: `welcomeSetUi('theme','${key}')`,
  })).join('');
  const locked = pkgCatalogGap('theme', UI_THEME_OPTIONS_BUILTIN).map(settingThemeCatalogCellHtml).join('');
  return `<div class="welcome-theme-scroll"><div class="prefs-theme-grid">${cells}${locked}</div></div>`;
}

// ── Step 3: module names (nameMode) ──
// Two lists side by side, every kind in both, so the choice is read as a
// straight comparison rather than a sample. KIND_CLASSIC_KEY's own key order is
// the single source for both columns — one list means the rows cannot drift
// out of alignment the way two hand-written lists would.
function welcomeStepNamesHtml() {
  const kinds = Object.keys(KIND_CLASSIC_KEY);
  const uniqueName = k => (typeof KIND_LABEL !== 'undefined' && KIND_LABEL[k]) || k;
  const classic = S.settings.nameMode === 'classic';
  const box = (mode, id, label, nameOf) => `
    <div class="welcome-name-box${(mode === 'classic') === classic ? ' active' : ''}" onclick="welcomeSetUi('nameMode','${mode}')">
      <div class="welcome-name-head" data-no-i18n>${label}${(mode === 'classic') === classic ? ' ✓' : ''}</div>
      <div class="welcome-name-list" id="${id}" onscroll="welcomeSyncNameScroll(this)">
        ${kinds.map(k => `<div class="welcome-name-row" data-no-i18n>${x(nameOf(k))}</div>`).join('')}
      </div>
    </div>`;
  return `<div class="welcome-name-cols">
      ${box('unique', 'wz-names-unique', 'Unique', uniqueName)}
      ${box('classic', 'wz-names-classic', 'Classic', k => t(KIND_CLASSIC_KEY[k]))}
    </div>
    <div class="settings-hint" style="margin-top:10px">${t('moduleNameModeHint')}</div>`;
}

// Keep the two lists on the same row while either one scrolls. Comparing
// before writing is what ends the loop: assigning scrollTop fires this handler
// again on the other element, and that second pass finds the values already
// equal and stops — no guard flag waiting to be cleared on a later frame.
// Finds its sibling by DOM position (not hardcoded ids) so the same handler
// works for both the wizard's picker and the Setting window's read-only
// compare list (nameModeCompareListHtml, core/settings.js).
function welcomeSyncNameScroll(el) {
  const cols = el.closest('.welcome-name-cols');
  const other = cols && [...cols.querySelectorAll('.welcome-name-list')].find(n => n !== el);
  if (other && other.scrollTop !== el.scrollTop) other.scrollTop = el.scrollTop;
}

// ── Step 4: sign in (optional) ──
function welcomeStepAccountHtml() {
  return `<p class="welcome-text">${t('wzAccountHint')}</p>
    <div id="welcome-login-body" class="welcome-login-body"></div>`;
}

async function welcomeRefreshLogin() {
  const st = await api.drive.status().catch(() => null);
  // The user can step away while that round-trip is in flight.
  const el = q('#welcome-login-body');
  if (el) el.innerHTML = welcomeLoginBodyHtml(st);
}

function welcomeLoginBodyHtml(st) {
  // No client id/secret baked into this build — sign-in cannot start at all,
  // so point at where the credentials go instead of a button that would fail.
  if (!st?.ok || !st.configured) return `<div class="settings-hint">${t('driveNotConnected')}</div>`;
  if (!st.connected) return `<button class="btn btn-p" id="welcome-login-btn" onclick="welcomeLoginClick()">☁ ${t('driveConnect')}</button>`;
  return `<div class="sync-status-row"><span>${t('settingAccountLoggedInAs')}</span><b data-no-i18n>${x(st.email || '')}</b></div>`;
}

async function welcomeLoginClick() {
  const btn = q('#welcome-login-btn');
  if (btn) btn.disabled = true;
  const r = await api.drive.connect().catch(() => null);
  if (btn) btn.disabled = false;
  if (!r?.ok) { if (typeof driveErrToast === 'function') driveErrToast(r); return; }
  toast(t('driveConnected'), 'ok');
  welcomeRefreshLogin();
}
