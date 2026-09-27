'use strict';
// ═══ Sage Hut section (progress.md Phase 17) ═══════════════════════════
// Vault-wide analytics relocated into the hub accordion (mockup
// docs/mockups/25-sagehut.png): four rows (Data size · Object amount ·
// Linker list · Linker graph) that open a Sage Hut page in the builder
// while the hub stays visible — unlike the legacy nav-rail Sage which
// swaps the whole left panel. Data comes from db.sageHutStats /
// sageHutLinkerList over the v3 module tables.

const SAGEHUT_VIEWS = ['dataSize', 'objectAmount', 'linkerList', 'linkerGraph'];
const SAGEHUT_VIEW_LABEL = { dataSize: 'Size', objectAmount: 'Objects', linkerList: 'Links', linkerGraph: 'Graph' };

const fmtBytes = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB`
  : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b || 0} B`;

// Plan part2 #2.3: every tab click used to refetch all three payloads —
// including wiki:getGraph, by far the most expensive, even when opening
// "Size". Now each payload is fetched only for the tabs that render it and
// memoised per nexus, so clicking through all four costs 3 round-trips
// instead of 12. Entry points that re-run this (the hub rows, the in-page
// viewbar, and builder-tab restore) all get the cache too.
//
// `stats` is unconditional: the four tiles need it on every tab, and so do
// the hub's own row badges (hub.js reads S.sageHut.stats).
function sageHutCached(key, fetch) {
  const c = S.sageHutCache;
  if (c && c.nexusId === S.nexus.id && c[key] !== undefined) return c[key];
  if (!c || c.nexusId !== S.nexus.id) S.sageHutCache = { nexusId: S.nexus.id };
  // Cache the promise, not the resolved value — two tabs opened back to back
  // must not both fire the same fetch.
  S.sageHutCache[key] = fetch();
  return S.sageHutCache[key];
}

async function openSageTab(tab) {
  if (!S.nexus) { toast(t('nexusSelectFirst'), 'error'); return; }
  const needsLinks = tab === 'linkerList';
  const needsGraph = tab === 'linkerGraph';
  const [stats, linkRows, graph] = await Promise.all([
    sageHutCached('stats', () => api.sagehut.stats(S.nexus.id)),
    needsLinks ? sageHutCached('linkRows', () => api.sagehut.linkerList(S.nexus.id)) : (S.sageHut?.linkRows || []),
    needsGraph ? sageHutCached('graph', () => api.wiki.getGraph(S.nexus.id)) : (S.sageHut?.graph || { nodes: [], edges: [] }),
  ]);
  S.sageHut = { tab, stats, linkRows, graph };
  S.filePreview = null;
  S.activeModuleNode = null;
  S.activeItemNode = null;
  S.importDockPage = false;
  if (typeof builderNavigate === 'function') builderNavigate({ kind: 'sagehut', tab });
  renderNexusHome();
}

function buildSageHutHtml() {
  const d = S.sageHut;
  const st = d.stats;
  const viewBar = viewBarHtml(SAGEHUT_VIEWS, d.tab, v => `openSageTab('${v}')`, v => SAGEHUT_VIEW_LABEL[v], { noI18n: true });
  const tiles = `<div class="sh-tiles">
    <div class="sh-tile" style="border-top-color:#2dd4bf"><span class="sh-k" data-no-i18n>Objects</span><span class="sh-v" data-no-i18n>${st.objects}</span></div>
    <div class="sh-tile" style="border-top-color:#6366f1"><span class="sh-k" data-no-i18n>Modules</span><span class="sh-v" data-no-i18n>${st.modules}</span></div>
    <div class="sh-tile" style="border-top-color:#facc15"><span class="sh-k" data-no-i18n>Links</span><span class="sh-v" data-no-i18n>${st.links}</span></div>
    <div class="sh-tile" style="border-top-color:#f472b6"><span class="sh-k">${t('sageDataSize')}</span><span class="sh-v" data-no-i18n>${fmtBytes(st.bytes)}</span></div>
  </div>`;
  let body;
  if (d.tab === 'linkerList') body = buildSageHutLinkerListHtml(d);
  else if (d.tab === 'linkerGraph') body = `<div class="cn-wrap">
      <div id="sh-board" class="nar-board cn-board"><div id="sh-graph"><svg id="sh-edges"></svg></div></div>
      <div class="chint" data-no-i18n>${t('narratorPanHint')}</div>
      <div class="czoom" data-no-i18n><span class="cn-count">${d.graph.nodes.length} nodes · ${d.graph.edges.length} links</span></div>
    </div>`;
  else body = buildSageHutBarsHtml(d, d.tab === 'dataSize');
  return wrapPageView(`${pageHeadHtml({
      icon: I.sage, title: '<span data-no-i18n>Sage Hut</span>', titleText: 'Sage Hut',
      after: '<span class="kind-chip" data-no-i18n>Analytics</span>',
      sub: `${t('sageHutSubtitle')} ${x(S.nexus.name)}`,
    })}
    <div class="classifier-toolbar">${viewBar}</div>
    ${tiles}${body}`);
}

// ── Per-module bars (Data size / Object amount) ─────────────────────────
function buildSageHutBarsHtml(d, bySize) {
  const rows = d.stats.perModule.filter(m => (bySize ? m.bytes : m.items) > 0);
  const max = Math.max(1, ...rows.map(m => bySize ? m.bytes : m.items));
  return `<div class="sh-section" data-no-i18n>${(bySize ? SAGEHUT_VIEW_LABEL.dataSize : SAGEHUT_VIEW_LABEL.objectAmount).toUpperCase()} · ${t('sagePerModule')}</div>
    ${rows.map(m => {
      const v = bySize ? m.bytes : m.items;
      return `<div class="sh-bar-row" onclick="openModuleNode(${m.id})">
        <span class="sh-bar-name" data-no-i18n>${x(m.name)} (${kindLabel(m.kind)})</span>
        <span class="sh-bar-track"><span class="sh-bar-fill" style="width:${Math.max(2, Math.round(v / max * 100))}%;background:${x(m.color_code || 'var(--accent)')}"></span></span>
        <span class="sh-bar-val" data-no-i18n>${bySize ? fmtBytes(v) : v}</span>
      </div>`;
    }).join('') || `<div class="empty"><p>${t('nestEmpty')}</p></div>`}`;
}

// ── Linker list ─────────────────────────────────────────────────────────
function buildSageHutLinkerListHtml(d) {
  return `<table class="vw-table">
    <thead><tr><th>${t('relFrom')}</th><th data-no-i18n>[[link]]</th><th>${t('relTo')}</th></tr></thead>
    <tbody>${d.linkRows.map(r => `
      <tr>
        <td class="lk" onclick="openEntityByKey(${xj(r.from.key)})">${x(r.from.name)} <small data-no-i18n>${x(r.from.type)}</small></td>
        <td data-no-i18n>[[${x(r.text)}]]</td>
        <td ${r.to ? `class="lk" onclick="openEntityByKey(${xj(r.to.key)})"` : 'class="ghost"'}>${r.to ? `${x(r.to.name)} <small data-no-i18n>${x(r.to.type)}</small>` : '—'}</td>
      </tr>`).join('') || `<tr><td colspan="3" class="ghost">—</td></tr>`}
    </tbody></table>`;
}

// ── Linker graph (read-only vault graph) ────────────────────────────────
function mountSageHutGraph() {
  const d = S.sageHut;
  if (!d || d.tab !== 'linkerGraph') return;
  const board = fq('#sh-board'), graphEl = fq('#sh-graph'), svg = fq('#sh-edges');
  if (!board || !graphEl || !svg) return;
  const W = 1800, H = 1300, cx = W / 2, cy = H / 2;
  graphEl.style.cssText = `position:relative;width:${W}px;height:${H}px`;
  const N = d.graph.nodes.length || 1;
  const R = Math.min(560, 120 + N * 8);
  const pos = d.graph.nodes.map((_, i) => {
    const a = (2 * Math.PI * i) / N - Math.PI / 2;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  let html = '';
  for (const e2 of d.graph.edges) {
    const a = pos[e2.source], b = pos[e2.target];
    if (!a || !b) continue;
    html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
      stroke="${e2.wiki ? 'var(--accent)' : 'var(--t3)'}" stroke-width="1"
      ${e2.wiki ? '' : 'stroke-dasharray="4 4"'} opacity="0.55"></line>`;
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  svg.innerHTML = html;
  graphEl.querySelectorAll('.sh-node').forEach(el => el.remove());
  d.graph.nodes.forEach((n, i) => {
    const el = document.createElement('div');
    el.className = 'sh-node';
    el.style.left = `${pos[i].x}px`;
    el.style.top = `${pos[i].y}px`;
    el.innerHTML = `<span class="dot"></span><span data-no-i18n>${x(n.label)}</span>`;
    el.addEventListener('click', () => openEntityByKey(n.key));
    graphEl.appendChild(el);
  });
  bindCanvasCtx(board, 'sagehut.graph');
  board.addEventListener('pointerdown', (e2) => {
    if (e2.button !== 2) return;
    const sx = e2.clientX + board.scrollLeft, sy = e2.clientY + board.scrollTop;
    const mv = (e3) => { board.scrollLeft = sx - e3.clientX; board.scrollTop = sy - e3.clientY; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
  board.scrollLeft = cx - board.clientWidth / 2;
  board.scrollTop = cy - board.clientHeight / 2;
}
