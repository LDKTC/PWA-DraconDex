// Shared markdown editor component (Scribe notes, Director object notes, …).
// Same construction as the Writer chapter editor: a <textarea> over a
// scroll-synced highlight backdrop, 800 ms debounce autosave, plus an
// edit ↔ rendered-preview toggle (Ctrl+E or the head button).
//
//   createMarkdownEditor(container, {
//     title,            // head label
//     content,          // initial markdown text
//     srcKey,           // entity key ('note_3', 'obj_12') — used by wiki indexing
//     save(content),    // async persist callback
//     resolveLink(name),// optional [[name]] -> entity key (Phase 3)
//     mode,             // 'edit' | 'preview' (default 'edit')
//   })

let _mdActive = null; // the most recently created editor (Ctrl+E target)

// ── Wiki name cache ─────────────────────────────────────────────────────────
// mdRender's resolveLink must be synchronous, so the vault's quickIndex is
// cached here; refreshWikiCache() is awaited before rendering a preview.
let _wikiCache = null;     // Map lowercased name -> key
let _wikiCacheList = [];   // raw quickIndex rows (feeds [[ autocomplete)

async function refreshWikiCache() {
  if (!S.nexus) { _wikiCache = null; _wikiCacheList = []; return; }
  _wikiCacheList = await api.wiki.quickIndex(S.nexus.id);
  _wikiCache = new Map();
  // quickIndex is emitted in resolution-precedence order; first name wins.
  for (const e of _wikiCacheList) {
    const k = e.name.toLowerCase();
    if (!_wikiCache.has(k)) _wikiCache.set(k, e.key);
  }
}

function resolveWikiNameCached(name) {
  if (!_wikiCache) return null;
  const raw = String(name).trim();
  const forced = raw.match(/^\w+:(.+)$/);
  return _wikiCache.get((forced ? forced[1] : raw).trim().toLowerCase()) || null;
}

function createMarkdownEditor(container, opts) {
  const st = {
    content: opts.content ?? '',
    mode: opts.mode === 'preview' ? 'preview' : 'edit',
    srcKey: opts.srcKey || '',
    saveTimer: null,
  };

  // Optional markdown format bar (opts.toolbar — mockup 13's B/I/H1… row).
  // Buttons act on the live textarea, so they only do anything in edit mode.
  const FMT_ACTIONS = [
    ['B', '**', '**', false], ['I', '*', '*', false],
    ['H1', '# ', '', true], ['H2', '## ', '', true],
    ['"', '> ', '', true], ['•—', '- ', '', true], ['[[]]', '[[', ']]', false],
    // Plan part5 Drafter #2: mdRender() already renders this syntax
    // (checkbox/hr/code-block) — these are just toolbar shortcuts to
    // insert it, no rendering changes needed.
    ['☑', '- [ ] ', '', true], ['—', '\n---\n', '', true], ['{ }', '```\n', '\n```', false],
  ];
  container.innerHTML = `
    <div class="mded-head">
      <span class="mded-title">${x(opts.title || '')}</span>
      <span class="mded-save-state"></span>
      <button class="btn btn-s btn-sm mded-links-toggle" title="${t('backlinks')}">🔗</button>
      <button class="btn btn-s btn-sm mded-toggle" title="Ctrl+E"></button>
    </div>
    ${opts.toolbar ? `<div class="mded-fmtbar" data-no-i18n>${FMT_ACTIONS.map((a, i) =>
      `<button class="btn btn-s btn-sm" data-fmt="${i}">${a[0]}</button>`).join('')}</div>` : ''}
    <div class="mded-cols">
      <div class="mded-body"></div>
      <div class="mded-linkspanel" style="display:none"></div>
    </div>`;
  const body = container.querySelector('.mded-body');
  const saveState = container.querySelector('.mded-save-state');
  container.querySelector('.mded-fmtbar')?.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-fmt]');
    if (!btn) return;
    e.preventDefault(); // keep the textarea's selection alive
    const ta = body.querySelector('.mded-text');
    if (!ta) return;
    const [, pre, post, linePrefix] = FMT_ACTIONS[Number(btn.dataset.fmt)];
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (linePrefix) {
      const ls = ta.value.lastIndexOf('\n', s - 1) + 1;
      ta.value = ta.value.slice(0, ls) + pre + ta.value.slice(ls);
      ta.selectionStart = s + pre.length; ta.selectionEnd = en + pre.length;
    } else {
      ta.value = ta.value.slice(0, s) + pre + ta.value.slice(s, en) + post + ta.value.slice(en);
      ta.selectionStart = s + pre.length; ta.selectionEnd = en + pre.length;
    }
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  });
  const toggleBtn = container.querySelector('.mded-toggle');
  const linksBtn = container.querySelector('.mded-links-toggle');
  const linksPanel = container.querySelector('.mded-linkspanel');

  const wordCount = () => {
    const s = st.content.trim();
    return s ? s.split(/\s+/).length : 0;
  };
  const reportStatus = (saveTxt) => {
    if (typeof updateStatusBar === 'function') {
      updateStatusBar({ item: opts.title || null, words: wordCount(), saveState: saveTxt });
    }
  };

  const doSave = async () => {
    if (!opts.save) return;
    await opts.save(st.content);
    if (saveState) saveState.textContent = t('saved');
    reportStatus(t('saved'));
  };

  const scheduleSave = () => {
    saveState.textContent = '…';
    reportStatus('…');
    clearTimeout(st.saveTimer);
    st.saveTimer = setTimeout(doSave, 800);
  };

  // Tint [[wikilinks]] while typing (backdrop mirror, like wlink-mark).
  const paintBackdrop = (bd, text) => {
    let html = '';
    let pos = 0;
    for (const l of mdExtractWikilinks(text)) {
      html += x(text.slice(pos, l.start));
      html += `<mark class="mded-wikimark">${x(text.slice(l.start, l.end))}</mark>`;
      pos = l.end;
    }
    bd.innerHTML = html + x(text.slice(pos)) + '<br>';
  };

  const renderMode = () => {
    toggleBtn.textContent = st.mode === 'edit' ? t('preview') : t('editMode');
    if (st.mode === 'edit') {
      body.innerHTML = `
        <div class="mded-wrap">
          <div class="mded-backdrop" aria-hidden="true"></div>
          <textarea class="mded-text" spellcheck="false"></textarea>
        </div>`;
      const ta = body.querySelector('.mded-text');
      const bd = body.querySelector('.mded-backdrop');
      const wrap = body.querySelector('.mded-wrap');
      ta.value = st.content;
      paintBackdrop(bd, st.content);

      // ── [[ autocomplete ──
      let acItems = [], acIdx = 0;
      const acFloat = document.createElement('div');
      acFloat.className = 'mded-ac';
      acFloat.style.display = 'none';
      wrap.appendChild(acFloat);
      const hideAc = () => { acFloat.style.display = 'none'; acItems = []; };
      // caret pixel position via a hidden mirror of the backdrop
      const caretXY = () => {
        const mirror = bd.cloneNode(false);
        mirror.style.visibility = 'hidden';
        mirror.textContent = ta.value.slice(0, ta.selectionStart);
        const marker = document.createElement('span');
        marker.textContent = '​';
        mirror.appendChild(marker);
        wrap.appendChild(mirror);
        const pos = { top: marker.offsetTop - ta.scrollTop, left: marker.offsetLeft - ta.scrollLeft };
        wrap.removeChild(mirror);
        return pos;
      };
      const paintAc = () => {
        acFloat.innerHTML = acItems.map((it, i) => `
          <div class="mded-ac-item ${i === acIdx ? 'active' : ''}" data-i="${i}">
            <span class="dot" style="background:${it.color || 'var(--accent)'}"></span>
            <span class="name">${x(it.name)}</span><span class="mded-linktype">${x(it.type)}</span>
          </div>`).join('');
      };
      const updateAc = () => {
        const m = ta.value.slice(0, ta.selectionStart).match(/\[\[([^\[\]\n]*)$/);
        if (!m || !_wikiCacheList.length) { hideAc(); return; }
        const frag = m[1].toLowerCase();
        acItems = _wikiCacheList.filter(e2 => e2.name.toLowerCase().includes(frag)).slice(0, 8);
        if (!acItems.length) { hideAc(); return; }
        acIdx = 0;
        paintAc();
        const pos = caretXY();
        acFloat.style.top = `${Math.max(0, pos.top + 26)}px`;
        acFloat.style.left = `${Math.min(Math.max(0, pos.left), wrap.clientWidth - 240)}px`;
        acFloat.style.display = '';
      };
      const acceptAc = () => {
        const it = acItems[acIdx];
        if (!it) return;
        const pos = ta.selectionStart;
        const m = ta.value.slice(0, pos).match(/\[\[([^\[\]\n]*)$/);
        if (!m) { hideAc(); return; }
        const start = pos - m[1].length;
        const after = ta.value.slice(pos);
        const closing = after.startsWith(']]') ? '' : ']]';
        ta.value = ta.value.slice(0, start) + it.name + closing + after;
        ta.selectionStart = ta.selectionEnd = start + it.name.length + 2;
        hideAc();
        ta.dispatchEvent(new Event('input'));
        ta.focus();
      };
      acFloat.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const row = e.target.closest('.mded-ac-item');
        if (row) { acIdx = Number(row.dataset.i); acceptAc(); }
      });

      ta.addEventListener('input', () => {
        st.content = ta.value;
        paintBackdrop(bd, st.content);
        scheduleSave();
        updateAc();
      });
      ta.addEventListener('blur', () => setTimeout(hideAc, 150));
      ta.addEventListener('scroll', () => { bd.scrollTop = ta.scrollTop; bd.scrollLeft = ta.scrollLeft; hideAc(); });
      ta.addEventListener('keydown', (e) => {
        if (acFloat.style.display !== 'none') {
          if (e.key === 'ArrowDown') { e.preventDefault(); acIdx = (acIdx + 1) % acItems.length; paintAc(); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); acIdx = (acIdx - 1 + acItems.length) % acItems.length; paintAc(); return; }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptAc(); return; }
          if (e.key === 'Escape') { e.preventDefault(); hideAc(); return; }
        }
        if (e.key === 'Tab') { // keep Tab inside the editor (indent/outdent)
          e.preventDefault();
          const s = ta.selectionStart, epos = ta.selectionEnd;
          if (s === epos) {
            if (e.shiftKey) {
              const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
              const lead = ta.value.slice(lineStart, s).match(/^ {1,2}/);
              const removed = lead ? lead[0].length : 0;
              if (removed) ta.value = ta.value.slice(0, lineStart) + ta.value.slice(lineStart + removed);
              ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - removed);
            } else {
              ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(epos);
              ta.selectionStart = ta.selectionEnd = s + 2;
            }
          } else {
            // Range selection spanning one or more lines — indent/outdent
            // every selected line at once, code-editor style.
            const blockStart = ta.value.lastIndexOf('\n', s - 1) + 1;
            const nlIdx = ta.value.indexOf('\n', epos);
            const blockEnd = nlIdx === -1 ? ta.value.length : nlIdx;
            const lines = ta.value.slice(blockStart, blockEnd).split('\n');
            let firstDelta = 0;
            const newLines = lines.map((line, i) => {
              if (e.shiftKey) {
                const m = line.match(/^ {1,2}/);
                const removed = m ? m[0].length : 0;
                if (i === 0) firstDelta = -removed;
                return removed ? line.slice(removed) : line;
              }
              if (i === 0) firstDelta = 2;
              return '  ' + line;
            });
            const oldLen = blockEnd - blockStart;
            const newBlock = newLines.join('\n');
            ta.value = ta.value.slice(0, blockStart) + newBlock + ta.value.slice(blockEnd);
            ta.selectionStart = Math.max(blockStart, s + firstDelta);
            ta.selectionEnd = Math.max(ta.selectionStart, epos + (newBlock.length - oldLen));
          }
          ta.dispatchEvent(new Event('input'));
          return;
        }
        // Ctrl+Z already works natively for a plain <textarea>; Chromium
        // doesn't bind Ctrl+Shift+Z to redo for text fields by default, so
        // that one case needs an explicit nudge.
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          document.execCommand('redo');
          ta.dispatchEvent(new Event('input'));
        }
      });
      ta.focus();
    } else {
      // tabindex so the preview holds focus and Ctrl+E can toggle back
      body.innerHTML = `<div class="md-preview" tabindex="0"></div>`;
      const pv = body.querySelector('.md-preview');
      pv.innerHTML = mdRender(st.content, { resolveLink: opts.resolveLink || resolveWikiNameCached, footnotes: opts.footnotes ? opts.footnotes() : null });
      pv.focus();
    }
  };

  const setMode = async (m) => {
    if (st.mode === m) return;
    st.mode = m;
    if (m === 'preview') {
      // flush a pending save and resolve links against a fresh index
      if (st.saveTimer) { clearTimeout(st.saveTimer); await doSave(); }
      await refreshWikiCache();
    }
    renderMode();
  };

  // ── Backlinks / outgoing-links side panel ──
  const linkRow = (e) => e.key
    ? `<div class="li mded-linkrow" onclick="openEntityByKey(${xj(e.key)})">
         <span class="dot" style="background:${e.color || 'var(--accent)'}"></span>
         <span class="name">${x(e.name)}</span><span class="mded-linktype">${x(e.type)}</span>
       </div>`
    : `<div class="li mded-linkrow mded-link-unresolved"><span class="name">${x(e.name)}</span><span class="mded-linktype">?</span></div>`;

  const refreshLinksPanel = async () => {
    if (!st.srcKey || linksPanel.style.display === 'none') return;
    const [back, out] = await Promise.all([api.wiki.backlinks(st.srcKey), api.wiki.outgoing(st.srcKey)]);
    linksPanel.innerHTML = `
      <div class="mded-links-h">${t('backlinks')} <span>${back.length}</span></div>
      ${back.length ? back.map(linkRow).join('') : `<div class="mded-links-empty">${t('noBacklinks')}</div>`}
      <div class="mded-links-h">${t('outgoingLinks')} <span>${out.length}</span></div>
      ${out.length ? out.map(linkRow).join('') : `<div class="mded-links-empty">—</div>`}`;
  };
  linksBtn.addEventListener('click', async () => {
    const show = linksPanel.style.display === 'none';
    linksPanel.style.display = show ? '' : 'none';
    linksBtn.classList.toggle('active', show);
    if (show) { await doSave(); await refreshLinksPanel(); }
  });

  toggleBtn.addEventListener('click', () => setMode(st.mode === 'edit' ? 'preview' : 'edit'));
  container.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      setMode(st.mode === 'edit' ? 'preview' : 'edit');
    }
  });

  // warm the name cache for autocomplete and the first preview
  refreshWikiCache().then(() => { if (st.mode === 'preview') renderMode(); });
  renderMode();
  reportStatus('');

  const editor = {
    srcKey: st.srcKey,
    getContent: () => st.content,
    getMode: () => st.mode,
    toggleMode: () => setMode(st.mode === 'edit' ? 'preview' : 'edit'),
    flush: doSave,
  };
  _mdActive = editor;
  return editor;
}
