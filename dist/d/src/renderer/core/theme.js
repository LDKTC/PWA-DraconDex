// Custom-theme editor — gradient parsing, the token rows, live paint onto
// body's inline CSS vars, save/delete/duplicate, and palette import/export.
// Built-in themes live in css/themes.css; this file only makes user ones.
const isGradientValue = (v) => String(v || '').trim().startsWith('linear-gradient(');
// Parses "linear-gradient(<deg>deg, <hex1>, <hex2>)" back into its parts;
// falls back to a sane default if the stored string doesn't match (e.g. a
// hand-edited import).
function parseGradient(v){
  const m = /linear-gradient\((\d+)deg,\s*(#[0-9a-fA-F]{3,6}),\s*(#[0-9a-fA-F]{3,6})\)/.exec(String(v || ''));
  return m ? { deg: Number(m[1]), start: toHex6(m[2]), end: toHex6(m[3]) } : { deg: 135, start: '#6366f1', end: '#ec4899' };
}

function ctmRowHtml(tok, vars){
  if (tok !== '--accent') {
    const hex = toHex6(vars[tok]);
    return `<div class="ctm-row">
      <span class="ctm-tok" data-no-i18n>${tok}</span>
      <input type="color" class="ctm-color" data-tok="${tok}" value="${x(hex)}" oninput="ctmSync(this)">
      <input class="ctm-hex" data-tok="${tok}" value="${x(hex)}" oninput="ctmSyncHex(this)" data-no-i18n>
      <span class="ctm-sample" style="color:${x(hex)}" data-no-i18n>Aa</span>
    </div>`;
  }
  // --accent is the only token with a Solid/Gradient toggle (Plan part3):
  // gradients only render correctly in background contexts, and --accent is
  // the one token used that way almost everywhere (buttons, tab dots,
  // checkmarks) — the other 9 tokens are used as plain color/border-color,
  // where a gradient string is invalid CSS and would just fall back, so
  // they stay solid-only rather than growing the same UI unnecessarily.
  const isGrad = !!S.ctmAccentGradient;
  const grad = isGrad
    ? (isGradientValue(vars[tok]) ? parseGradient(vars[tok]) : { deg: 135, start: toHex6(vars[tok]), end: '#ec4899' })
    : null;
  const solidHex = grad ? grad.start : toHex6(vars[tok]);
  return `<div class="ctm-row">
    <span class="ctm-tok" data-no-i18n>${tok}</span>
    <input type="color" class="ctm-color" data-tok="${tok}" value="${x(solidHex)}" oninput="ctmSync(this)">
    <input class="ctm-hex" data-tok="${tok}" value="${x(solidHex)}" oninput="ctmSyncHex(this)" data-no-i18n>
    <span class="ctm-sample" style="color:${x(solidHex)}" data-no-i18n>Aa</span>
    <div class="ctm-grad-toggle">
      <button type="button" class="btn btn-sm ${!isGrad ? 'btn-p' : 'btn-s'}" onclick="ctmSetAccentMode(false)">${t('solid')}</button>
      <button type="button" class="btn btn-sm ${isGrad ? 'btn-p' : 'btn-s'}" onclick="ctmSetAccentMode(true)">${t('gradient')}</button>
    </div>
    ${isGrad ? `
    <input type="color" class="ctm-grad-end" id="ctm-grad-end" value="${x(grad.end)}" oninput="ctmPaint()">
    <input class="settings-number ctm-grad-deg" id="ctm-grad-deg" type="number" min="0" max="360" value="${grad.deg}" oninput="ctmPaint()">` : ''}
  </div>`;
}

function ctmSetAccentMode(isGrad){
  S.ctmAccentGradient = isGrad;
  const rows = q('#ctm-rows');
  if (rows) { const vars = ctmVars(); rows.innerHTML = CUSTOM_THEME_TOKENS.map(tok => ctmRowHtml(tok, vars)).join(''); }
  ctmPaint();
}

function openCustomThemeModal(id = null){
  const ct = id ? (S.settings.customThemes || []).find(c => c.id === id) : null;
  const vars = ct ? { ...ct.vars } : currentPaletteVars();
  S.ctmAccentGradient = isGradientValue(vars['--accent']);
  const rows = CUSTOM_THEME_TOKENS.map(tok => ctmRowHtml(tok, vars)).join('');
  openFloatingPanel('ctm-panel', `🎨 Custom Theme — ${t('customThemeNew')}`, `
    <div class="ctm-grid">
      <div>
        <div class="fg"><label>${t('name')} *</label><input id="ctm-name" value="${x(ct?.name || '')}"></div>
        <div class="settings-label" style="padding:0 0 6px" data-no-i18n>Palette (10)</div>
        <div class="ctm-rows" id="ctm-rows">${rows}</div>
      </div>
      <div>
        <div class="settings-label" style="padding:0 0 6px" data-no-i18n>Preview</div>
        <div class="ctm-preview" id="ctm-preview">
          <div class="ctm-pv-side"><i class="ctm-pv-acc"></i><i></i><i></i></div>
          <div class="ctm-pv-main">
            <span class="ctm-pv-txt w80" data-no-i18n>Aa Sample Text</span>
            <span class="ctm-pv-txt w60" data-no-i18n>Aa Sample</span>
            <button type="button" class="ctm-pv-btn" data-no-i18n>${t('save')}</button>
          </div>
        </div>
        <div class="settings-hint">${t('customThemeHint')}</div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="importCustomPalette()">${t('customThemeImport')}</button>
      <button class="btn btn-s" onclick="exportCustomPalette()">${t('customThemeExport')}</button>
      <button class="btn btn-s" onclick="closeFloatingPanel('ctm-panel')">${t('cancel')}</button>
      <button class="btn btn-p" onclick="saveCustomTheme(${id ? xj(id) : 'null'})">${t('save')}</button>
    </div>`, {width:640, height:560});
  ctmPaint();
}

const toHex6 = (c) => {
  const v = String(c || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + [...v.slice(1)].map(ch => ch + ch).join('');
  return '#000000';
};

function ctmVars(){
  const out = {};
  document.querySelectorAll('#ctm-panel .ctm-color').forEach(el => { out[el.dataset.tok] = el.value; });
  if (S.ctmAccentGradient) {
    const endEl = q('#ctm-grad-end'), degEl = q('#ctm-grad-deg');
    if (endEl && degEl) out['--accent'] = `linear-gradient(${Number(degEl.value) || 135}deg, ${out['--accent']}, ${endEl.value})`;
  }
  return out;
}

function ctmSync(colorEl){
  const hex = document.querySelector(`#ctm-panel .ctm-hex[data-tok="${colorEl.dataset.tok}"]`);
  if (hex) hex.value = colorEl.value;
  const sample = colorEl.closest('.ctm-row')?.querySelector('.ctm-sample');
  if (sample) sample.style.color = colorEl.value;
  ctmPaint();
}

function ctmSyncHex(hexEl){
  if (!/^#[0-9a-fA-F]{6}$/.test(hexEl.value.trim())) return;
  const color = document.querySelector(`#ctm-panel .ctm-color[data-tok="${hexEl.dataset.tok}"]`);
  if (color) color.value = hexEl.value.trim();
  const sample = hexEl.closest('.ctm-row')?.querySelector('.ctm-sample');
  if (sample) sample.style.color = hexEl.value.trim();
  ctmPaint();
}

function ctmPaint(){
  const pv = q('#ctm-preview');
  if (!pv) return;
  const v = ctmVars();
  pv.style.background = v['--bg'];
  pv.style.borderColor = v['--border'];
  pv.querySelector('.ctm-pv-side').style.background = v['--surface'];
  pv.querySelectorAll('.ctm-pv-side i:not(.ctm-pv-acc)').forEach(el => el.style.background = v['--raised']);
  pv.querySelector('.ctm-pv-acc').style.background = v['--accent'];
  pv.querySelectorAll('.ctm-pv-txt').forEach(el => el.style.color = v['--t2']);
  const btn = pv.querySelector('.ctm-pv-btn');
  btn.style.background = v['--accent'];
  btn.style.color = '#fff';
}

function saveCustomTheme(id){
  const name = q('#ctm-name').value.trim();
  if (!name) return;
  const vars = ctmVars();
  S.settings.customThemes = S.settings.customThemes || [];
  let ct = id ? S.settings.customThemes.find(c => c.id === id) : null;
  if (!ct) {
    ct = { id: String(Date.now()), name, vars };
    S.settings.customThemes.push(ct);
  } else {
    ct.name = name;
    ct.vars = vars;
  }
  closeFloatingPanel('ctm-panel');
  setUiSetting('theme', `custom:${ct.id}`);
}

async function deleteCustomTheme(id){
  // Reachable from a hover-only "×" in both the settings dropdown and the
  // Preferences grid — a stray click used to destroy a hand-tuned 10-token
  // palette with no undo path.
  if (!await uiConfirm(t('confirmDeleteTheme'), { okText: t('delete'), cancelText: t('cancel') })) return;
  S.settings.customThemes = (S.settings.customThemes || []).filter(c => c.id !== id);
  if (S.settings.theme === `custom:${id}`) S.settings.theme = 'midnight';
  saveUiSettings();
  applyUiSettings();
  renderSettingsMenu();
  renderSettingWindow(); // procress1 part3: refresh the Setting window's theme grid, not the retired #prefs-panel
  toast(t('deleted'),'ok');
}

// Duplicates a built-in or custom theme into a new, always-editable custom
// theme entry (Plan part3: "duplicated from standard becomes editable").
// Built-in and package themes come from getThemePalettes(); custom themes
// just clone their stored vars.
function duplicateTheme(key){
  const isCustom = key.startsWith('custom:');
  let name, vars;
  if (isCustom) {
    const ct = (S.settings.customThemes || []).find(c => `custom:${c.id}` === key);
    if (!ct) return;
    name = ct.name; vars = { ...ct.vars };
  } else {
    // getThemePalettes() covers built-ins (sampled with any active inline
    // palette lifted) and installed package themes (read from their vars).
    name = themeOptionLabel(key);
    const pal = getThemePalettes()[key];
    if (!pal) return;
    vars = Object.fromEntries(CUSTOM_THEME_TOKENS.map(tok => [tok, toHex6(pal[tok] || '')]));
  }
  S.settings.customThemes = S.settings.customThemes || [];
  const ct = { id: String(Date.now()), name: `${name} ${t('duplicate')}`, vars };
  S.settings.customThemes.push(ct);
  saveUiSettings();
  renderSettingsMenu();
  renderSettingWindow(); // procress1 part3: refresh the Setting window's theme grid, not the retired #prefs-panel
  toast(t('duplicated'), 'ok');
}

function exportCustomPalette(){
  const json = JSON.stringify(ctmVars());
  navigator.clipboard?.writeText(json);
  toast(t('customThemeCopied'),'ok');
}

async function importCustomPalette(){
  const raw = await uiPrompt(t('customThemeImport'), {
    okText: t('apply'), cancelText: t('cancel'), placeholder: '{"--accent": …, "--bg": …}'
  });
  if (!raw?.trim()) return;
  try {
    const imported = JSON.parse(raw);
    // Merge onto the current values so a partial JSON (missing tokens)
    // leaves those tokens untouched, matching the prior behavior.
    const merged = { ...ctmVars(), ...imported };
    S.ctmAccentGradient = isGradientValue(merged['--accent']);
    const rows = q('#ctm-rows');
    if (rows) rows.innerHTML = CUSTOM_THEME_TOKENS.map(tok => ctmRowHtml(tok, merged)).join('');
    ctmPaint();
  } catch (_) { toast(t('vRestoreFailed'), 'error'); }
}

