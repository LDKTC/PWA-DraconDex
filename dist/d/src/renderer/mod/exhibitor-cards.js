'use strict';
// ═══ Exhibitor — object cards and tables (v5 Part 3, APP docs/V5.md §7.9) ═
// No new schema. Two shapes already in exhibit_node carry the whole thing:
//   card   node_type 'entity' on a cobj_<id> key, props {display:'card',
//          fields:[templateId,...]} — one object, field:value rows
//   table  node_type 'group', props {display:'table', columns:[...]} —
//          every child (parent_id) is a cobj entity, one row each
// Values are read live: loadExhibitorData pulls getObjectsFull for every
// category a placed object belongs to, so an edit in the Classifier shows
// the next time this scene renders — nothing is copied into props.
//
// Dropping an object onto a card merges the two into a table where the card
// stood; dropping onto a table adds a row. The drag feedback borrows the
// Nest tree's drop-in idea (hub/tree.js onNestDragOver): the node under the
// pointer lights up while it would accept, and the cursor says "no" over a
// node that would not.

const EXH_CARD = { w: 210, head: 30, row: 18, maxRows: 8 };
const EXH_TABLE = { name: 130, col: 110, head: 30, colHead: 22, row: 20 };
const EXH_DEFAULT_FIELDS = 5;

function exhProps(n) {
  if (!n?.props) return {};
  if (typeof n.props === 'object') return n.props;
  try { return JSON.parse(n.props) || {}; } catch (_) { return {}; }
}

const exhIsCobjKey = (key) => typeof key === 'string' && key.startsWith('cobj_');
const exhIsCard = (n) => n?.node_type === 'entity' && exhIsCobjKey(n.linker_key) && exhProps(n).display === 'card';
const exhIsTable = (n) => n?.node_type === 'group' && exhProps(n).display === 'table';
const exhInTable = (n) => n?.parent_id != null && exhIsTable(exhNodeById(n.parent_id));

// The live classifier_object behind a cobj key, with attrMap/levelMap.
function exhClsObject(key) {
  const cls = S.exhibitorData?.cls;
  return exhIsCobjKey(key) && cls ? cls.objects.get(Number(key.slice(5))) || null : null;
}

// Shared templates of the object's category (private ones are per-object
// and would give a table ragged columns).
function exhTemplatesFor(key) {
  const o = exhClsObject(key);
  return (o && S.exhibitorData.cls.templates.get(o.module_ref)) || [];
}

function exhTemplateById(id) {
  for (const list of S.exhibitorData?.cls?.templates.values() || []) {
    const tp = list.find(tp2 => tp2.id === id);
    if (tp) return tp;
  }
  return null;
}

// One field's value as the Classifier table shows it: a levelable field
// reads its latest level row, everything else its attribute_value.
function exhFieldValue(o, tp) {
  if (!o || !tp) return '';
  if (tp.levelable || tp.has_condition) {
    const rows = o.levelMap?.[tp.id] || [];
    const last = rows[rows.length - 1];
    return last ? (last.level_label || last.condition_value || last.info_value || '') : '';
  }
  return o.attrMap?.[tp.id] || '';
}

function exhCardFields(n) {
  const p = exhProps(n);
  const all = exhTemplatesFor(n.linker_key);
  if (Array.isArray(p.fields)) return p.fields.map(exhTemplateById).filter(Boolean);
  return all.slice(0, EXH_DEFAULT_FIELDS);
}

function exhTableRows(n) {
  return (S.exhibitorData?.nodes || []).filter(m => m.parent_id === n.id && !m.hidden).sort((a, b) => a.z - b.z || a.id - b.id);
}

function exhTableColumns(n) {
  const p = exhProps(n);
  if (Array.isArray(p.columns)) return p.columns.map(exhTemplateById).filter(Boolean);
  const first = exhTableRows(n).find(r => exhIsCobjKey(r.linker_key));
  return first ? exhTemplatesFor(first.linker_key).slice(0, 4) : [];
}

function exhCardSize(n) {
  const rows = Math.max(1, Math.min(EXH_CARD.maxRows, exhCardFields(n).length));
  return { w: n.w || EXH_CARD.w, h: EXH_CARD.head + rows * EXH_CARD.row + 8 };
}

function exhTableSize(n) {
  const cols = exhTableColumns(n).length;
  const rows = Math.max(1, exhTableRows(n).length);
  return { w: EXH_TABLE.name + cols * EXH_TABLE.col + 12, h: EXH_TABLE.head + EXH_TABLE.colHead + rows * EXH_TABLE.row + 8 };
}

// Where a table row sits in world space — edges to an object shown as a row
// attach to its row, not to a hidden node of its own.
function exhTableRowBox(child) {
  const table = exhNodeById(child.parent_id);
  const idx = exhTableRows(table).findIndex(r => r.id === child.id);
  const size = exhTableSize(table);
  return {
    x: table.x + size.w / 2, y: table.y + EXH_TABLE.head + EXH_TABLE.colHead + Math.max(0, idx) * EXH_TABLE.row + EXH_TABLE.row / 2,
    hw: size.w / 2, hh: EXH_TABLE.row / 2,
  };
}

// ── Drawing (called from exhDrawNode) ───────────────────────────────────
function exhDrawCard(g, n, col, selected) {
  const size = exhCardSize(n);
  const o = exhClsObject(n.linker_key);
  const stroke = n.color || col.accent;
  g.add(new Konva.Rect({ width: size.w, height: size.h, fill: col.surface, stroke, strokeWidth: selected ? 3 : 1.4, cornerRadius: 8, opacity: o ? 1 : 0.5, name: 'exh-frame' }));
  g.add(new Konva.Rect({ width: size.w, height: EXH_CARD.head - 4, fill: stroke, opacity: 0.18, cornerRadius: [8, 8, 0, 0], listening: false }));
  g.add(new Konva.Text({ x: 10, y: 8, width: size.w - 20, text: exhNodeTitle(n), fontSize: 13, fontStyle: 'bold', fill: col.text, ellipsis: true, wrap: 'none' }));
  const fields = exhCardFields(n).slice(0, EXH_CARD.maxRows);
  if (!fields.length) {
    g.add(new Konva.Text({ x: 10, y: EXH_CARD.head + 2, width: size.w - 20, text: o ? t('clsFieldsEmpty') : '?', fontSize: 11, fill: col.dim, ellipsis: true, wrap: 'none' }));
  }
  fields.forEach((tp, i) => {
    const y = EXH_CARD.head + i * EXH_CARD.row;
    g.add(new Konva.Text({ x: 10, y, width: 78, text: tp.description, fontSize: 11, fill: col.dim, ellipsis: true, wrap: 'none', listening: false }));
    g.add(new Konva.Text({ x: 92, y, width: size.w - 102, text: exhFieldValue(o, tp) || '—', fontSize: 11, fill: col.text, ellipsis: true, wrap: 'none', listening: false }));
  });
  return g;
}

function exhDrawTable(g, n, col, selected) {
  const size = exhTableSize(n);
  const stroke = n.color || col.accent;
  const cols = exhTableColumns(n);
  const rows = exhTableRows(n);
  g.add(new Konva.Rect({ width: size.w, height: size.h, fill: col.surface, stroke, strokeWidth: selected ? 3 : 1.4, cornerRadius: 8, name: 'exh-frame' }));
  g.add(new Konva.Text({ x: 10, y: 8, width: size.w - 20, text: exhNodeTitle(n), fontSize: 13, fontStyle: 'bold', fill: col.text, ellipsis: true, wrap: 'none' }));
  const hy = EXH_TABLE.head;
  g.add(new Konva.Rect({ x: 6, y: hy, width: size.w - 12, height: EXH_TABLE.colHead, fill: stroke, opacity: 0.16, listening: false }));
  g.add(new Konva.Text({ x: 10, y: hy + 5, width: EXH_TABLE.name - 8, text: t('name'), fontSize: 11, fontStyle: 'bold', fill: col.dim, listening: false }));
  cols.forEach((tp, ci) => g.add(new Konva.Text({
    x: 6 + EXH_TABLE.name + ci * EXH_TABLE.col, y: hy + 5, width: EXH_TABLE.col - 8, text: tp.description,
    fontSize: 11, fontStyle: 'bold', fill: col.dim, ellipsis: true, wrap: 'none', listening: false,
  })));
  rows.forEach((r, ri) => {
    const y = hy + EXH_TABLE.colHead + ri * EXH_TABLE.row;
    const o = exhClsObject(r.linker_key);
    // One hit rect per row, named so a right-click or double-click can tell
    // which object it landed on.
    g.add(new Konva.Rect({ x: 6, y, width: size.w - 12, height: EXH_TABLE.row, fill: ri % 2 ? col.raised : col.surface, opacity: 0.6, name: `exh-row-${r.id}` }));
    g.add(new Konva.Text({ x: 10, y: y + 4, width: EXH_TABLE.name - 8, text: exhNodeTitle(r), fontSize: 11, fill: o ? col.text : col.dim, ellipsis: true, wrap: 'none', listening: false }));
    cols.forEach((tp, ci) => g.add(new Konva.Text({
      x: 6 + EXH_TABLE.name + ci * EXH_TABLE.col, y: y + 4, width: EXH_TABLE.col - 8, text: exhFieldValue(o, tp) || '—',
      fontSize: 11, fill: col.text, ellipsis: true, wrap: 'none', listening: false,
    })));
  });
  return g;
}

// The node id a Konva hit belongs to — a table row resolves to its object.
function exhNodeIdFromShape(shape) {
  let s = shape;
  while (s && s.getStage && s !== s.getStage()) {
    const name = s.name?.() || '';
    const row = name.match(/exh-row-(\d+)/);
    if (row) return Number(row[1]);
    const id = s.id?.() || '';
    if (id.startsWith('exh-')) return Number(id.slice(4));
    s = s.getParent();
  }
  return null;
}

// ── Merge: drop an object onto a card or a table (§7.9) ─────────────────
// The topmost visible node under a world point that is a card, a table, or
// a plain cobj entity (which becomes a card as it merges).
function exhNodeAtWorld(p, exceptId) {
  const d = S.exhibitorData;
  const hits = d.nodes.filter(n => !n.hidden && n.id !== exceptId && !exhInTable(n)).filter((n) => {
    const s = exhNodeSize(n);
    return p.x >= n.x && p.x <= n.x + s.w && p.y >= n.y && p.y <= n.y + s.h;
  });
  // Non-groups above groups, then by z — the order the canvas paints them.
  hits.sort((a, b) => (a.node_type === 'group' ? 0 : 1) - (b.node_type === 'group' ? 0 : 1) || a.z - b.z);
  return hits[hits.length - 1] || null;
}

const exhAcceptsObject = (n) => !!n && (exhIsTable(n) || (n.node_type === 'entity' && exhIsCobjKey(n.linker_key)));

// What a drop of `key` at world point p would do: 'merge' onto a target,
// 'place' on empty canvas, or 'none' over a node that cannot take it.
function exhDropIntent(key, p, exceptId) {
  const target = exhNodeAtWorld(p, exceptId);
  if (!target) return { kind: 'place' };
  if (exhIsCobjKey(key) && exhAcceptsObject(target) && target.linker_key !== key) return { kind: 'merge', target };
  return { kind: 'none', target };
}

// Merge the object `key` into `target`. `existing` is the node already in
// this scene for that key (a canvas drag), or null (a palette drop).
async function exhMergeObject(target, key, existing) {
  const d = S.exhibitorData;
  let table = exhIsTable(target) ? target : null;
  if (!table) {
    const tpls = exhTemplatesFor(target.linker_key);
    const cardFields = exhProps(target).fields;
    const columns = Array.isArray(cardFields) ? cardFields : tpls.slice(0, 4).map(tp => tp.id);
    const [gid] = await api.exhibitor.addNodes(d.moduleId, [{
      node_type: 'group', label: exhibitorTableLabel(target), x: target.x, y: target.y,
      props: JSON.stringify({ display: 'table', columns }),
    }]);
    table = { id: gid };
    await api.exhibitor.updateNode(target.id, { parent_id: gid });
  }
  if (existing) await api.exhibitor.updateNode(existing.id, { parent_id: table.id });
  else await api.exhibitor.addNodes(d.moduleId, [{ linker_key: key, node_type: 'entity', parent_id: table.id, x: target.x, y: target.y, props: JSON.stringify({ display: 'card' }) }]);
  d.sel = table.id;
  await refreshExhibitor();
}

// A new table is named after the category its first object came from.
function exhibitorTableLabel(n) {
  const it = S.exhibitorData?.index.get(n.linker_key);
  return it?.moduleName || t('exhibitorGroup');
}

// dragover on the stage wrapper: light up the node the drop would merge
// into, and refuse (dropEffect none) over a node that cannot take it.
function exhDragOverScene(ev) {
  const key = S.dragExhKey || (S.dragAsset != null ? `file_${S.dragAsset}` : null);
  if (!key || !exhStage) return;
  ev.preventDefault();
  exhStage.setPointersPositions(ev);
  const intent = exhDropIntent(key, exhPointerWorld());
  ev.dataTransfer.dropEffect = intent.kind === 'none' ? 'none' : 'copy';
  exhHighlightDrop(intent.kind === 'merge' ? intent.target.id : null);
}

let exhDropLit = null;
function exhHighlightDrop(id) {
  if (!exhStage || exhDropLit === id) return;
  const paint = (nid, on) => {
    const frame = nid != null && exhStage.findOne(`#exh-${nid}`)?.findOne('.exh-frame');
    if (!frame) return;
    if (on) { frame._exhStroke = frame.strokeWidth(); frame.strokeWidth(4); frame.dash([6, 4]); }
    else { frame.strokeWidth(frame._exhStroke || 1.4); frame.dash([]); }
  };
  paint(exhDropLit, false);
  paint(id, true);
  exhDropLit = id;
  exhStage.batchDraw();
}

function exhPointerWorld() {
  const p = exhStage.getPointerPosition() || { x: exhStage.width() / 2, y: exhStage.height() / 2 };
  const s = exhStage.scaleX();
  return { x: (p.x - exhStage.x()) / s, y: (p.y - exhStage.y()) / s };
}

// Take a row out of its table; it lands just right of the table.
async function exhUngroupRow(id) {
  const n = exhNodeById(id);
  const table = n && exhNodeById(n.parent_id);
  if (!table) return;
  const size = exhTableSize(table);
  await api.exhibitor.updateNode(id, { parent_id: null, x: table.x + size.w + 30, y: table.y });
  await refreshExhibitor();
}

// ── Customize fields / columns (right-click only, §7.9 + §7.1) ──────────
function openExhibitorFieldsModal(nodeId) {
  const n = exhNodeById(nodeId);
  if (!n) return;
  const table = exhIsTable(n);
  const current = new Set((table ? exhTableColumns(n) : exhCardFields(n)).map(tp => tp.id));
  // A table can hold objects from several categories; offer every
  // category's fields, labelled when there is more than one.
  const keys = table ? exhTableRows(n).map(r => r.linker_key) : [n.linker_key];
  const byModule = new Map();
  for (const k of keys) {
    const o = exhClsObject(k);
    if (o && !byModule.has(o.module_ref)) byModule.set(o.module_ref, S.exhibitorData.cls.templates.get(o.module_ref) || []);
  }
  const many = byModule.size > 1;
  const rows = [...byModule.entries()].map(([mid, tpls]) => `
    ${many ? `<div class="insp-label" data-no-i18n>${x(findModuleNode(mid)?.name || '')}</div>` : ''}
    ${tpls.map(tp => `<label class="fv-useimg"><input type="checkbox" class="exh-fld" value="${tp.id}" ${current.has(tp.id) ? 'checked' : ''}> <span data-no-i18n>${x(tp.description)}</span></label>`).join('')}`).join('');
  openModal(t(table ? 'exhCustomizeColumns' : 'exhCustomizeFields'), `
    <div class="exh-fld-list">${rows || `<p class="cls-lv-empty">${t('clsFieldsEmpty')}</p>`}</div>
    <div class="mfoot">
      <button class="btn btn-s" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn btn-p" onclick="submitExhibitorFieldsModal(${nodeId})">${t('save')}</button>
    </div>`);
}

async function submitExhibitorFieldsModal(nodeId) {
  const n = exhNodeById(nodeId);
  if (!n) return;
  const ids = [...document.querySelectorAll('.exh-fld:checked')].map(el => Number(el.value));
  const p = { ...exhProps(n), [exhIsTable(n) ? 'columns' : 'fields']: ids };
  if (!exhIsTable(n)) p.display = 'card';
  closeModal();
  await patchExhibitorNode(nodeId, { props: JSON.stringify(p) });
}

// Plain cobj entity → card (older scenes, seeded Connectors) and back.
async function toggleExhibitorCard(nodeId) {
  const n = exhNodeById(nodeId);
  if (!n) return;
  const p = exhProps(n);
  await patchExhibitorNode(nodeId, { props: JSON.stringify({ ...p, display: p.display === 'card' ? null : 'card' }) });
}

// ── Right-click on the scene: a node, a table row, or empty canvas ──────
CTX_PROVIDERS['exhibitor.scene'] = ({ nodeId } = {}) => {
  const d = S.exhibitorData;
  if (!d) return [];
  const n = nodeId != null ? exhNodeById(nodeId) : null;
  if (!n) {
    return [
      cmdItem('exhibitor.addNote', { moduleId: d.moduleId }),
      cmdItem('exhibitor.addGroup', { moduleId: d.moduleId }),
      { sep: true },
      cmdItem('exhibitor.fit', { moduleId: d.moduleId }),
      cmdItem('canvas.zoomIn'),
      cmdItem('canvas.zoomOut'),
    ];
  }
  const c = { moduleId: d.moduleId, node: n };
  return [
    cmdItem('exhibitor.openNode', c),
    cmdItem('exhibitor.columns', c),
    cmdItem('exhibitor.fields', c),
    cmdItem('exhibitor.showCard', c),
    cmdItem('exhibitor.ungroup', c),
    cmdItem('exhibitor.linkTo', c),
    { sep: true },
    cmdItem('exhibitor.removeNode', c),
  ];
};
