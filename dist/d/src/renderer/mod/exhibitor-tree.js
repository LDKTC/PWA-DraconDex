'use strict';
// ═══ Exhibitor — family-tree layout (v5 Part 7, APP docs/V5.md §11.6) ════
// The family tree the user chose over a module of its own: the Graph view
// laid out in generations from ONE relation type — usually a Classifier
// relation field such as "Parent" (rel_type ctpl_<id>, §11.3) — instead of
// the seed circle. The user says which way the relation points (child →
// parent, as a "Parent" field on the child does, or parent → child).
//
//   generation   the longest chain of parents above an item (so a child
//                sits below BOTH parents even when they are from different
//                depths); a loop is cut where it closes
//   order        inside a generation, by the average x of the parents
//                (one barycentre pass), which keeps siblings together and
//                under their parents
// Items the relation never touches go in a row of their own at the bottom.
// Positions land in the same per-session store the Graph view drags, so
// the result can be adjusted by hand; the Scene is still where a layout is
// saved for good.

const EXT_ROW = 150, EXT_GAP = 120, EXT_MARGIN = 70;

// keys: every item; links: [{ parent, child }]. Pure — test/exhibitor-tree.test.mjs.
function exhibitorTreeLayout(keys, links, W) {
  const inTree = new Set(links.flatMap(l => [l.parent, l.child]).filter(k => keys.includes(k)));
  const parents = new Map();
  for (const l of links) {
    if (!inTree.has(l.parent) || !inTree.has(l.child) || l.parent === l.child) continue;
    if (!parents.has(l.child)) parents.set(l.child, []);
    parents.get(l.child).push(l.parent);
  }
  const gen = new Map();
  const depth = (k, path = new Set()) => {
    if (gen.has(k)) return gen.get(k);
    if (path.has(k)) return 0; // a loop: cut here
    path.add(k);
    const g = Math.max(-1, ...(parents.get(k) || []).map(p => depth(p, path))) + 1;
    path.delete(k);
    gen.set(k, g);
    return g;
  };
  const tree = keys.filter(k => inTree.has(k));
  tree.forEach(k => depth(k));
  const rows = [];
  for (const k of tree) (rows[gen.get(k)] ||= []).push(k);
  const loose = keys.filter(k => !inTree.has(k));
  const pos = {};
  const place = (row, y) => {
    const gap = Math.min(EXT_GAP, (W - 2 * EXT_MARGIN) / Math.max(1, row.length));
    const x0 = W / 2 - (gap * (row.length - 1)) / 2;
    row.forEach((k, i) => { pos[k] = { x: x0 + i * gap, y }; });
  };
  rows.forEach((row, g) => {
    if (!row) return;
    if (g > 0) {
      const bx = (k) => { const ps = (parents.get(k) || []).filter(p => pos[p]); return ps.length ? ps.reduce((a, p) => a + pos[p].x, 0) / ps.length : Infinity; };
      row.sort((a, b) => bx(a) - bx(b));
    }
    place(row, EXT_MARGIN + g * EXT_ROW);
  });
  if (loose.length) place(loose, EXT_MARGIN + rows.length * EXT_ROW + (rows.length ? EXT_ROW / 2 : 0));
  return pos;
}

function openExhibitorTreeModal() {
  const d = S.exhibitorData;
  if (!d) return;
  const types = [...new Set(d.relations.map(r => r.rel_type).filter(Boolean))];
  if (!types.length) { toast(t('exhTreeNoTypes'), 'warn'); return; }
  const cur = d.treeRel && types.includes(d.treeRel) ? d.treeRel : types[0];
  openModal(t('exhTreeLayout'), `
    <p class="drafter-hint">${t('exhTreeHint')}</p>
    <div class="fg"><label>${t('exhTreeRelation')}</label>
      <select id="ext-rel">${types.map(rt => `<option value="${x(rt)}"${rt === cur ? ' selected' : ''}>${x(exhRelTypeText(rt))}</option>`).join('')}</select></div>
    <div class="fg"><label>${t('exhTreeDirection')}</label>
      <select id="ext-dir">
        <option value="toParent"${d.treeDir !== 'toChild' ? ' selected' : ''}>${t('exhTreeToParent')}</option>
        <option value="toChild"${d.treeDir === 'toChild' ? ' selected' : ''}>${t('exhTreeToChild')}</option>
      </select></div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="applyExhibitorTree()">${t('exhTreeApply')}</button>
    </div>`);
}

async function applyExhibitorTree() {
  const d = S.exhibitorData;
  const rel = pbQOr('#ext-rel')?.value, dir = pbQOr('#ext-dir')?.value || 'toParent';
  closeModal();
  if (!d || !rel) return;
  d.treeRel = rel; d.treeDir = dir;
  await Promise.all([api.module.setUi(d.moduleId, 'treeRel', rel), api.module.setUi(d.moduleId, 'treeDir', dir)]);
  const keys = d.items.map(n => n.key);
  const links = d.relations.filter(r => r.rel_type === rel && exhRelHoldsAt(r, d.asOf))
    .map(r => (dir === 'toParent' ? { child: r.from_key, parent: r.to_key } : { parent: r.from_key, child: r.to_key }));
  S.exhibitorGraphPos = S.exhibitorGraphPos || {};
  S.exhibitorGraphPos[d.moduleId] = exhibitorTreeLayout(keys, links, 1600);
  if (d.view !== 'graph') await setExhibitorView('graph');
  else renderNexusHome();
}
