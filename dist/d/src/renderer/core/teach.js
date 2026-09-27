'use strict';
// ═══ Teach when it is needed (v5 Part 6, APP docs/V5.md §10.4) ═══════════
// A feature is shown at the moment the user meets the problem it solves —
// not in a first-run tour, before there is any context to hang it on. Each
// tip is one row here: when(m) says the problem is present on the module
// page being drawn; the banner offers one action and a dismiss.
//
// What a Nexus has been taught lives in its vault (nexus.taught, via
// api.nexus.taught / markTaught): a backup or a copied .ddx carries it, and
// clearing the app's cache does not teach everything again. A tip that was
// acted on or dismissed never shows again in that Nexus. At most one shows
// at a time — the first whose when() holds.

const TEACH_TIPS = [
  // A list past what the eye can scan: filtering lives in the Exhibitor's
  // filter bar, so the tip opens the module's Exhibitor with the filter up.
  {
    id: 'filter', textKey: 'teachFilter', actionKey: 'teachFilterAction',
    when: (m) => m.kind === 'classifier' && clsData(m.id).objects.length > 30,
    action: async (m) => {
      await openExhibitorFor(m.id);
      const ex = S.activeModuleNode;
      if (ex?.kind === 'exhibitor') runCommand('exhibitor.editFilter', { moduleId: ex.id });
    },
  },
  // Several relations and no Exhibitor anywhere yet: the place relations are
  // seen and drawn (§3.6).
  {
    id: 'exhibitor', textKey: 'teachExhibitor', actionKey: 'openInExhibitor',
    when: (m) => {
      if (m.kind === 'exhibitor' || modulesOfKind('exhibitor').length) return false;
      const rel = (clsData(m.id).relations || []).length;
      const d = S.inspectorData?.moduleId === m.id ? S.inspectorData : null;
      const links = d ? d.links.outgoing.length + d.links.backlinks.length : 0;
      return rel + links >= 5;
    },
    action: (m) => openExhibitorFor(m.id),
  },
  // §10.7: the wizard no longer asks for a layout up front — once the Nest is
  // big enough to have an opinion about, offer the other two.
  {
    id: 'workspace', textKey: 'teachWorkspace', actionKey: 'teachWorkspaceAction',
    when: () => S.settings.workspaceStyle === 'drake' && flattenModulesByKind(S.moduleTree, []).length >= 8,
    action: () => runCommand('setting.style'),
  },
];

let _teachLoading = null;
function taughtMap() {
  const nx = S.nexus?.id;
  if (nx == null) return null;
  if (S.taught?.nexusId === nx) return S.taught.map;
  // First page drawn in this Nexus: fetch once, then draw again with it.
  if (!_teachLoading && typeof api.nexus?.taught === 'function') {
    _teachLoading = api.nexus.taught(nx).then((map) => {
      S.taught = { nexusId: nx, map: map || {} };
    }).catch(() => { S.taught = { nexusId: nx, map: {} }; })
      .finally(() => { _teachLoading = null; if (S.nexus?.id === nx) renderNexusHome(); });
  }
  return null;
}

function teachTipFor(m) {
  const map = taughtMap();
  if (!map || !m) return null;
  return TEACH_TIPS.find((tip) => !map[tip.id] && (() => { try { return tip.when(m); } catch (_) { return false; } })()) || null;
}

// The banner under a module page's navbar (hub/open.js), or ''.
function teachTipHtml(m) {
  const tip = teachTipFor(m);
  if (!tip) return '';
  return `<div class="teach-tip" role="note">
    <span class="teach-tip-icon">${I.info}</span>
    <span class="teach-tip-text">${t(tip.textKey)}</span>
    <button class="btn btn-p btn-sm" onclick="acceptTeachTip('${tip.id}',${m.id})">${t(tip.actionKey)}</button>
    <button class="btn btn-g btn-i" onclick="dismissTeachTip('${tip.id}')" title="${x(t('teachDismiss'))}">${I.close}</button>
  </div>`;
}

async function settleTeachTip(id, state) {
  const nx = S.nexus?.id;
  if (nx == null) return;
  if (S.taught?.nexusId === nx) S.taught.map[id] = state;
  try { await api.nexus.markTaught(nx, id, state); } catch (_) {}
}

async function acceptTeachTip(id, moduleId) {
  const tip = TEACH_TIPS.find((x2) => x2.id === id);
  const m = findModuleNode(moduleId);
  if (!tip || !m) return;
  await settleTeachTip(id, 'done');
  await tip.action(m);
  renderNexusHome();
}

async function dismissTeachTip(id) {
  await settleTeachTip(id, 'dismissed');
  renderNexusHome();
}
