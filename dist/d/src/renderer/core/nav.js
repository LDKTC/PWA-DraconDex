// Nav rail + title bar: nav-button visibility, the layout menu button and
// the title-bar vault label. The entity tab strip (legacy Scribe notes'
// tabs) went with Scribe in v5 Part 8 (§12).

function updateTopNavButton(){
  const logoBtn = q('#nav-logo-btn');
  const inModule = !!S.activeModule;
  if(logoBtn){
    // process2 part1 #3: a collapsed hub always wins the logo slot, even
    // inside a legacy module — it's the app icon's only way back to expand
    // #left-panel now that #hub-toggle-btn lives inside it (see views.js's
    // #nav-logo-btn click handler for the matching click-priority change).
    if(S.leftPanelCollapsed){
      logoBtn.innerHTML = I.panelLeft;
      logoBtn.setAttribute('title', t('toggleHub'));
      logoBtn.classList.remove('is-return');
    } else {
      logoBtn.innerHTML = inModule
        ? I.return
        : `<img src="../src/assets/brand/DraconDex_WhiteOut.png" class="brand-img" alt="DraconDex">`;
      const title = !inModule ? 'DraconDex' : tr('Back to Nexus');
      logoBtn.setAttribute('title', title);
      logoBtn.classList.toggle('is-return', inModule);
    }
  }
  document.querySelectorAll('.nav-btn.nexus-only').forEach(btn => {
    btn.style.display = (!S.activeModule) ? '' : 'none';
  });
}

// The title bar's own parts. The panes' tab groups are lifted over it by
// core/titlebar-tabs.js (§12.11).
function renderProjectTabs(){
  updateTitlebarVault();
  renderLayoutMenuBtn();
}

// Title-bar split-layout picker: one trigger button + an overlay list of
// named preset shapes (Plan part4 #2 — builderResetToPreset resets the
// whole tree to a fresh named shape; arbitrary further splitting/closing
// happens per-pane via buttons in builderPaneHeadHtml, builder.js).
// Labels are numeric/symbolic ("1×"/"2×"/"3×"), matching the original
// 3-item menu's own data-no-i18n convention — no new i18n keys needed
// since there's nothing language-specific to translate. With an arbitrary
// tree there's no longer a single "current preset" to highlight against,
// so (unlike the old menu) no item shows an active state.
function renderLayoutMenuBtn(){
  const wrap = q('#layout-menu-wrap');
  const btn = q('#layout-menu-btn');
  const menu = q('#layout-menu');
  if(!wrap || !btn || !menu) return;
  wrap.style.display = S.nexus ? '' : 'none';
  if(!S.nexus) return;
  btn.textContent = '⊞';
  const items = [
    { name: '1',  glyph: '▢', label: '1×' },
    { name: '2h', glyph: '◫', label: '2×' },
    { name: '2v', glyph: '⬓', label: '2×' },
    { name: '3',  glyph: '⊟', label: '3×' },
  ];
  menu.innerHTML = items.map(it => `
    <button class="layout-menu-item" data-no-i18n onclick="builderResetToPreset('${it.name}');toggleLayoutMenu(false)">
      <span>${it.glyph}</span><span>${it.label}</span>
    </button>`).join('');
}

function toggleLayoutMenu(force){
  const menu = q('#layout-menu');
  const btn = q('#layout-menu-btn');
  if(!menu || !btn) return;
  const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  btn.classList.toggle('active', open);
  btn.setAttribute('aria-expanded', String(open));
}

function updateTitlebarVault(){
  const el = q('#titlebar-vault');
  if(el) el.textContent = S.nexus ? `${S.nexus.name} — DraconDex` : 'DraconDex';
}

// v3 module tabs are pane-scoped now (Phase 19): opening a module books it
// into the focused builder pane's tab row + history stack.
function upsertModuleTab(id){
  if (typeof builderNavigate === 'function') builderNavigate({ kind: 'module', id });
  renderProjectTabs();
}

// Legacy views rewrite #main-inner wholesale — drop the builder grid so
// their layout isn't trapped inside it (panes rebuild on return to nexus).
function leaveBuilderGrid(){
  q('#main-inner')?.classList.remove('builder-grid','bl-1','bl-2','bl-4');
}
