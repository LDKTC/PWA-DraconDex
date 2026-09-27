'use strict';
// ═══ Exhibitor — Scene side panels (v5 Part 2/3, APP docs/V5.md §3.2) ════
// The Scene's two HTML panels beside the Konva canvas (mod/exhibitor-
// scene.js): the Hierarchy rows (every node, nested by parent_id) and the
// Inspector for the selected node. Split out of exhibitor-scene.js when the
// §7.9 card/table wiring took it past 500 lines — the canvas file keeps the
// stage, the camera and the node actions.

function buildExhibitorHierarchyRows(d, parentId, depth) {
  return d.nodes.filter(n => (n.parent_id ?? null) === parentId).map(n => {
    const kids = n.node_type === 'group' ? buildExhibitorHierarchyRows(d, n.id, depth + 1) : '';
    const missing = n.linker_key && !d.index.has(n.linker_key);
    const cls = ['li', depth ? `indent${Math.min(depth, 5)}` : '', d.sel === n.id ? 'sel' : '',
      n.hidden ? 'exh-hidden' : '', missing ? 'asset-missing' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}"
        onclick="selectExhibitorNode(${n.id})" ondblclick="openExhibitorNodeTarget(${n.id})">
      <span class="name" data-no-i18n>${x(exhNodeTitle(n))}</span>
      <span class="acts">
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();patchExhibitorNode(${n.id},{hidden:${n.hidden ? 0 : 1}})" title="${x(t('exhibitorHidden'))}" data-no-i18n>${n.hidden ? '◌' : '●'}</button>
        <button class="btn btn-g btn-i" onclick="event.stopPropagation();patchExhibitorNode(${n.id},{locked:${n.locked ? 0 : 1}})" title="${x(t('exhibitorLocked'))}" data-no-i18n>${n.locked ? '⊠' : '□'}</button>
      </span>
    </div>${kids}`;
  }).join('');
}

function buildExhibitorInspectorHtml(d, n) {
  const it = n.linker_key ? d.index.get(n.linker_key) : null;
  const groups = d.nodes.filter(g => g.node_type === 'group' && g.id !== n.id);
  const rels = n.linker_key ? d.relations.filter(r => r.from_key === n.linker_key || r.to_key === n.linker_key) : [];
  const relRows = rels.map(r => {
    const out = r.from_key === n.linker_key;
    const other = out ? r.to_key : r.from_key;
    const arrow = r.directed === 0 ? '—' : out ? '→' : '←';
    return `<div class="cls-link-row">
      <span data-no-i18n>${arrow}</span>
      <span class="cls-link-name" onclick="openExhibitorRelationModal(${r.id})">${x(exhNameOf(other))}</span>
      ${r.label || r.rel_type ? `<span class="cls-link-lbl">${x([r.label, r.rel_type && `(${exhRelTypeText(r.rel_type)})`, exhSpanText(r)].filter(Boolean).join(' '))}</span>` : ''}
    </div>`;
  }).join('');
  return `<aside class="exh-insp">
    <div class="exh-hier-head"><span data-no-i18n>${x(exhNodeTitle(n))}</span>
      <button class="btn btn-g btn-i" onclick="selectExhibitorNode(null)" title="${x(t('cancel'))}" data-no-i18n>✕</button></div>
    ${it ? `<div class="drafter-hint" data-no-i18n>${VIEWER_KIND_LABEL[it.kind] || it.kind}${it.moduleName ? ` · ${x(it.moduleName)}` : ''}</div>
      <button class="btn btn-s btn-sm" onclick="openExhibitorNodeTarget(${n.id})">${t('exhibitorOpenItem')}</button>` : ''}
    <div class="fg"><label>${t('exhibitorLabel')}</label>
      ${n.node_type === 'note'
        // A note's label is its text, so it is a wiki field (V5.md §8.4);
        // every other node's label is a display name and stays plain.
        ? `<textarea data-wiki rows="4" onchange="patchExhibitorNode(${n.id},{label:this.value.trim()||null})">${x(n.label || '')}</textarea>`
        : `<input value="${x(n.label || '')}" placeholder="${x(it ? it.name : '')}" onchange="patchExhibitorNode(${n.id},{label:this.value.trim()||null})">`}</div>
    <div class="fg"><label>${t('color')}</label>
      <input type="color" value="${x(n.color || (exhCss('--accent') || '#6366f1'))}" onchange="patchExhibitorNode(${n.id},{color:this.value})"></div>
    ${n.node_type !== 'group' ? `<div class="fg"><label>${t('exhibitorGroup')}</label>
      <select onchange="patchExhibitorNode(${n.id},{parent_id:this.value?Number(this.value):null})">
        <option value="">—</option>
        ${groups.map(g => `<option value="${g.id}" ${n.parent_id === g.id ? 'selected' : ''}>${x(exhNodeTitle(g))}</option>`).join('')}
      </select></div>` : ''}
    <label class="fv-useimg"><input type="checkbox" ${n.locked ? 'checked' : ''} onchange="patchExhibitorNode(${n.id},{locked:this.checked?1:0})"> ${t('exhibitorLocked')}</label>
    <label class="fv-useimg"><input type="checkbox" ${n.hidden ? 'checked' : ''} onchange="patchExhibitorNode(${n.id},{hidden:this.checked?1:0})"> ${t('exhibitorHidden')}</label>
    ${n.linker_key ? `<div class="insp-label cls-link-label">${t('linkedElements')}</div>
      <div class="cls-link-list">${relRows || `<div class="cls-lv-empty">${t('noLinkedElements')}</div>`}</div>
      <button class="btn btn-p btn-sm" onclick="startExhibitorLink(${n.id})">${I.relation} ${t('exhibitorLinkTo')}</button>` : ''}
    <button class="btn btn-d btn-sm" onclick="removeExhibitorNode(${n.id})">${t('exhibitorRemoveNode')}</button>
  </aside>`;
}

function filterExhibitorPalette(v) {
  const needle = String(v || '').trim().toLowerCase();
  (pbQOr('#exh-palette')?.querySelectorAll('.exh-pal-row') || []).forEach(row => {
    row.style.display = !needle || row.dataset.name.includes(needle) ? '' : 'none';
  });
}
