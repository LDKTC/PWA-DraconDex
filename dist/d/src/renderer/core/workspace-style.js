'use strict';
// Workspace → Workspace Style page (Plan.md part2 #New Workspace's "setting
// page add workspace") — the picker that makes Drake/Wyvern/Dragon actually
// selectable; before this only the `?workspace=` query param existed. Same
// one-page-per-file convention as tool-toggle.js/account.js even though it
// shares the pre-existing `workspace` Setting group (theme/text&size/tool
// toggle already live there — this is one more thing that's a "workspace"
// concern).

const WORKSPACE_STYLE_DESC_KEY = {
  drake: 'workspaceStyleDrakeDesc',
  wyvern: 'workspaceStyleWyvernDesc',
  dragon: 'workspaceStyleDragonDesc',
};

// CSS-drawn wireframe mockup per style (css/workspace.css's .wsp-* rules) —
// no image asset, same "draw it with CSS" idiom as the Theme page's mini
// preview above it in this same Setting window.
function workspaceStylePreviewHtml(style) {
  if (style === 'wyvern') return `<div class="wsp-cell-preview">
    <i class="wsp-blk" style="width:10px;background:var(--surface)"></i>
    <i class="wsp-blk" style="flex:1;background:var(--raised);opacity:.5"></i>
  </div>`;
  if (style === 'dragon') return `<div class="wsp-cell-preview">
    <i class="wsp-blk" style="width:8px;background:var(--surface)"></i>
    <div class="wsp-erp-mini">
      <div class="wsp-erp-kpis"><i></i><i></i><i></i></div>
      <div class="wsp-erp-tiles"><i></i><i></i><i></i><i></i></div>
    </div>
  </div>`;
  return `<div class="wsp-cell-preview">
    <i class="wsp-blk" style="width:8px;background:var(--surface)"></i>
    <i class="wsp-blk" style="width:26px;background:var(--raised)"></i>
    <i class="wsp-blk" style="flex:1;background:var(--raised);opacity:.5"></i>
  </div>`;
}
function workspaceStyleCellHtml(style) {
  const pending = S.settingPendingWorkspace || S.settings.workspaceStyle;
  const active = pending === style;
  const label = style.charAt(0).toUpperCase() + style.slice(1);
  return `<div class="prefs-theme-cell${active ? ' active' : ''}" onclick="selectPendingWorkspaceStyle('${style}')">
    ${workspaceStylePreviewHtml(style)}
    <div class="prefs-theme-name" data-no-i18n>${label}</div>
    <div class="settings-hint">${t(WORKSPACE_STYLE_DESC_KEY[style])}</div>
    ${active ? `<span class="prefs-theme-check">${I.check}</span>` : ''}
  </div>`;
}
function settingWorkspaceStylePageHtml() {
  const pending = S.settingPendingWorkspace || S.settings.workspaceStyle;
  const dirty = pending !== S.settings.workspaceStyle;
  const cells = WORKSPACE_STYLE_OPTIONS.map(workspaceStyleCellHtml).join('');
  // Layout controls apply to the CURRENTLY ACTIVE style (not a still-pending,
  // unsaved pick) — hidden while a style switch is staged so it's never
  // ambiguous which style's orientation the two rows below are for.
  return `<div class="settings-label">${t('settingPageWorkspaceStyle')}</div>
    <div class="prefs-theme-grid">${cells}</div>
    ${dirty ? `<button class="btn btn-p" style="margin-top:14px" onclick="applyWorkspaceStyleChoice()">${t('settingWorkspaceApply')}</button>` : settingWorkspaceLayoutHtml() + settingWorkspaceUiSizeHtml() + settingWorkspaceAnimationHtml()}`;
}

// Process 7 part 2 — "UI size" (--ui-scale, overall zoom) moved here from the
// Text & Size page: it's a layout/UI concern, not a text one. Reuses the same
// UI-size-only slider the quick popup uses (settings.js's uiSizeOnlySliderHtml).
function settingWorkspaceUiSizeHtml() {
  return `<div class="settings-label" style="margin-top:18px">${t('uiSize')}</div>
    <div class="settings-group">
      ${uiSizeOnlySliderHtml()}
    </div>`;
}

// Process 5 part1 — nav orientation + (when horizontal) button display mode
// for the currently active workspace style. Both apply live via
// applyNavOrientation() (core/boot.js), no restart needed — unlike switching
// the style itself above, which still requires Apply & Restart.
function settingWorkspaceLayoutHtml() {
  const style = S.settings.workspaceStyle;
  const orient = (S.settings.navOrientation || {})[style] || NAV_ORIENTATION_DEFAULT[style] || 'vertical';
  const display = S.settings.navHorizontalDisplay || 'both';
  return `<div class="settings-label" style="margin-top:18px">${t('settingWorkspaceLayout')}</div>
    <div class="settings-group">
      <div class="settings-label-row"><span>${t('settingNavOrientation')}</span></div>
      <div class="settings-options" style="grid-template-columns:repeat(2,1fr)">
        <button class="settings-option${orient === 'vertical' ? ' active' : ''}" onclick="setNavOrientation('vertical')">${t('navOrientationVertical')}</button>
        <button class="settings-option${orient === 'horizontal' ? ' active' : ''}" onclick="setNavOrientation('horizontal')">${t('navOrientationHorizontal')}</button>
      </div>
      ${orient === 'horizontal' ? `
      <div class="settings-label-row" style="margin-top:10px"><span>${t('settingNavDisplay')}</span></div>
      <div class="settings-options">
        <button class="settings-option${display === 'icon' ? ' active' : ''}" onclick="setNavHorizontalDisplay('icon')">${t('navDisplayIcon')}</button>
        <button class="settings-option${display === 'label' ? ' active' : ''}" onclick="setNavHorizontalDisplay('label')">${t('navDisplayLabel')}</button>
        <button class="settings-option${display === 'both' ? ' active' : ''}" onclick="setNavHorizontalDisplay('both')">${t('navDisplayBoth')}</button>
      </div>` : `
      <div class="togglerow" style="margin-top:10px" onclick="toggleNavVerticalAlwaysLabel()"><span class="tg${S.settings.navVerticalAlwaysLabel ? ' on' : ''}"></span>${t('settingNavVerticalAlwaysLabel')}</div>`}
    </div>`;
}
// Process 7 part 1 — enable/disable the Hub accordion / Nest module-list /
// Module Inspector toggle animations (core/ui.js's animateToggleOpen()/
// animateToggleCloseThenCommit()), default ON, plus an "advanced" speed
// preset only shown while enabled (same "reveal only when relevant" idiom
// as Layout's own horizontal-only display-mode row above).
function settingWorkspaceAnimationHtml() {
  const on = S.settings.animationsEnabled !== false;
  const speed = S.settings.animationSpeed || 'normal';
  return `<div class="settings-label" style="margin-top:18px">${t('settingWorkspaceAnimation')}</div>
    <div class="settings-group">
      <div class="togglerow" onclick="toggleAnimationsEnabled()"><span class="tg${on ? ' on' : ''}"></span>${t('settingAnimShow')}</div>
      ${on ? `
      <div class="settings-label-row" style="margin-top:10px"><span>${t('settingAnimSpeedAdvanced')}</span></div>
      <div class="settings-options" style="grid-template-columns:repeat(3,1fr)">
        <button class="settings-option${speed === 'fast' ? ' active' : ''}" onclick="setAnimationSpeed('fast')">${t('animSpeedFast')}</button>
        <button class="settings-option${speed === 'normal' ? ' active' : ''}" onclick="setAnimationSpeed('normal')">${t('animSpeedNormal')}</button>
        <button class="settings-option${speed === 'slow' ? ' active' : ''}" onclick="setAnimationSpeed('slow')">${t('animSpeedSlow')}</button>
      </div>` : ''}
    </div>
    <div class="settings-label" style="margin-top:18px">${t('settingPages')}</div>
    <div class="settings-group">
      <div class="togglerow" onclick="toggleAutoCollapseLeft()"><span class="tg${S.settings.autoCollapseLeft !== false ? ' on' : ''}"></span>${t('settingAutoCollapseLeft')}</div>
      <div class="togglerow" onclick="toggleLinkPreview()"><span class="tg${S.settings.linkPreview !== false ? ' on' : ''}"></span>${t('settingLinkPreview')}</div>
    </div>`;
}
// Procress 14 (TEMPLATES §7.3): hovering a [[link]] shows what it leads to
// (page/links.js). On unless turned off here.
function toggleLinkPreview() {
  S.settings.linkPreview = S.settings.linkPreview === false;
  saveUiSettings();
  renderSettingWindow();
}
function toggleAnimationsEnabled() {
  S.settings.animationsEnabled = !(S.settings.animationsEnabled !== false);
  saveUiSettings();
  renderSettingWindow();
}
function setAnimationSpeed(speed) {
  if (!['fast', 'normal', 'slow'].includes(speed)) return;
  S.settings.animationSpeed = speed;
  saveUiSettings();
  applyUiSettings();
  renderSettingWindow();
}

// Process 6 part 1: vertical-only advanced customization — normally the
// icon+label row only turns on once the user drags the rail past
// NAV_LABEL_THRESHOLD (core/ui.js); this pins it on regardless of the
// dragged width, without affecting horizontal mode's own display setting.
function toggleNavVerticalAlwaysLabel() {
  S.settings.navVerticalAlwaysLabel = !S.settings.navVerticalAlwaysLabel;
  saveUiSettings();
  applyNavRailWidth();
  renderSettingWindow();
}
function setNavOrientation(orient) {
  if (orient !== 'vertical' && orient !== 'horizontal') return;
  const style = S.settings.workspaceStyle;
  S.settings.navOrientation = Object.assign({}, S.settings.navOrientation, { [style]: orient });
  saveUiSettings();
  applyNavOrientation();
  if (style === 'wyvern') renderWyvernToolbar(); else renderModuleRail();
  renderSettingWindow();
}
function setNavHorizontalDisplay(mode) {
  if (!['icon', 'label', 'both'].includes(mode)) return;
  S.settings.navHorizontalDisplay = mode;
  saveUiSettings();
  applyNavOrientation();
  renderSettingWindow();
}
function selectPendingWorkspaceStyle(style) {
  if (!WORKSPACE_STYLE_OPTIONS.includes(style)) return;
  S.settingPendingWorkspace = style;
  renderSettingWindow();
}
// Chrome swap needs a fresh boot (same reasoning as applyWorkspaceStyle()
// in core/boot.js), so this is a deliberate two-step commit rather than
// live-applying like setUiSetting() does for theme/language — confirm via
// uiConfirm(), same guard settingProfileRestore() already uses before its
// own location.reload() (core/account.js).
async function applyWorkspaceStyleChoice() {
  const pending = S.settingPendingWorkspace;
  if (!pending || pending === S.settings.workspaceStyle) return;
  if (!(await uiConfirm(t('settingWorkspaceApplyConfirm')))) return;
  S.settings.workspaceStyle = pending;
  saveUiSettings();
  location.reload();
}
registerSettingPage('workspace', 'style', settingWorkspaceStylePageHtml);
