// Static window chrome: the settings-menu toggle, the two DOM-walking i18n
// passes that translate markup written before t() existed, the language
// MutationObserver, and the title-bar / window-control bindings.
function toggleSettingsMenu(force){
  const menu = q('#settings-menu');
  const btn = q('#settings-menu-btn');
  if(!menu || !btn) return;
  const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
  if(open && S.versionLimitCache === undefined && typeof api !== 'undefined' && api.setting){
    api.setting.get('versionLimit').then(v => {
      S.versionLimitCache = Number(v) >= 1 ? Number(v) : 50;
      renderSettingsMenu();
    }).catch(() => {});
  }
  menu.classList.toggle('hidden', !open);
  btn.classList.toggle('active', open);
  btn.setAttribute('aria-expanded', String(open));
}

function translateStaticChrome(){
  q('#settings-menu-btn')?.setAttribute('title', t('settings'));
  q('#layout-menu-btn')?.setAttribute('title', t('splitLayout'));
  q('#win-min')?.setAttribute('title', t('minimize'));
  q('#win-max')?.setAttribute('title', t('maximize'));
  q('#win-close')?.setAttribute('title', t('close'));
  // The hint is worth carrying here: with a vault open this box hands off to the
  // quick switcher, which otherwise has no discoverable entry point at all.
  q('#search-input')?.setAttribute('placeholder', `${t('search')} (Ctrl+P)`);
  document.querySelectorAll('.nav-btn[data-panel]').forEach(btn => {
    const key = btn.dataset.panel;
    if(L.en[key]) btn.setAttribute('title', t(key));
  });
  applyLeftPanelState();
  updateTopNavButton();
  translateCommonUiText();
}

function translateCommonUiText(root=document){
  const lang = S.settings?.language || 'th';
  // Note: no early return for 'th' — several modules render English source
  // strings that must be translated into Thai as well.
  const pick = (text) => {
    const entry = COMMON_UI_TEXT[text];
    if(!entry) return null;
    return entry[lang] || (lang === 'th' ? null : entry.en) || null;
  };
  const selectors = [
    'button',
    'label',
    'option',
    'th',
    'h1','h2','h3','h4',
    'p',
    'span',
    'div',
    '.settings-label',
    '.settings-head span',
    '#modal-title',
    '.confirm-msg'
  ].join(',');
  root.querySelectorAll(selectors).forEach(el => {
    // View-pattern names, kind badges and other locale-invariant labels opt
    // out of auto-translation (progress.md A.3 — unique names are fixed).
    if(el.closest('[data-no-i18n],.viewbar')) return;
    el.childNodes.forEach(node => {
      if(node.nodeType !== Node.TEXT_NODE) return;
      const value = node.nodeValue || '';
      const trimmed = value.trim();
      const translated = pick(trimmed);
      if(!translated) return;
      const lead = value.match(/^\s*/)?.[0] || '';
      const trail = value.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${lead}${translated}${trail}`;
    });
  });
  root.querySelectorAll('[placeholder],[title]').forEach(el => {
    ['placeholder','title'].forEach(attr => {
      const value = el.getAttribute(attr);
      if(!value) return;
      const translated = pick(value.trim());
      if(translated) el.setAttribute(attr, translated);
    });
  });
}

let _uiTranslateTimer = null;
function observeUiLanguage(){
  const observer = new MutationObserver(() => {
    clearTimeout(_uiTranslateTimer);
    _uiTranslateTimer = setTimeout(() => translateCommonUiText(), 0);
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

function bindWindowChrome(){
  q('#win-min')?.addEventListener('click', () => api.window.minimize());
  q('#win-max')?.addEventListener('click', () => api.window.toggleMaximize());
  q('#win-close')?.addEventListener('click', () => api.window.close());
  q('#settings-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsMenu();
  });
  q('#settings-menu')?.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => toggleSettingsMenu(false));
  q('#layout-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLayoutMenu();
  });
  q('#layout-menu')?.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => toggleLayoutMenu(false));
}

