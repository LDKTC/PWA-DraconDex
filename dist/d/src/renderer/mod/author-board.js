'use strict';
// ═══ Author — corkboard (v5 Part 7, APP docs/V5.md §11.6) ════════════════
// The corkboard / beat-sheet the user chose to fold into Author rather than
// build as a module: every chapter as an index card with the three facts a
// planner moves around — its synopsis, where it stands (idea → done), and
// whose point of view it is told from (pov_key: any entity, usually a
// Classifier character). Cards reorder by drag, with the same handlers as
// the chapter column; a card's synopsis edits in place.

const AUTHOR_STATUSES = ['idea', 'draft', 'revised', 'done'];
const AUTHOR_STATUS_KEY = { idea: 'auStatusIdea', draft: 'auStatusDraft', revised: 'auStatusRevised', done: 'auStatusDone' };

function buildAuthorBoardHtml(m, d) {
  const cards = d.chapters.map((c, i) => {
    const pov = c.pov_key ? d.povNames?.get(c.pov_key) : null;
    return `<div class="au-card${c.id === d.selectedId ? ' sel' : ''}" data-status="${x(c.status || '')}"
      draggable="true" ondragstart="onAuthorChapterDragStart(event,${c.id})" ondragover="onAuthorChapterDragOver(event,this)"
      ondragleave="this.classList.remove('drop-before','drop-after')" ondrop="onAuthorChapterDrop(event,${m.id},${c.id})">
      <div class="au-card-head">
        <span class="au-card-no" data-no-i18n>${x(c.chapter_label || String(i + 1))}</span>
        <span class="au-card-name" onclick="selectAuthorChapter(${c.id}).then(()=>setAuthorView('editor'))">${x(c.name)}</span>
        <button class="btn btn-g btn-i" onclick="openAuthorChapterModal(${m.id},${c.id})" title="${t('edit')}">${I.edit}</button>
      </div>
      <textarea class="au-card-syn" rows="4" placeholder="${x(t('auSynopsis'))}" onchange="saveAuthorChapterMeta(${c.id},{synopsis:this.value})">${x(c.synopsis || '')}</textarea>
      <div class="au-card-foot">
        <select class="au-card-status" onchange="saveAuthorChapterMeta(${c.id},{status:this.value},true)">
          <option value="">—</option>
          ${AUTHOR_STATUSES.map(s => `<option value="${s}"${c.status === s ? ' selected' : ''}>${t(AUTHOR_STATUS_KEY[s])}</option>`).join('')}
        </select>
        ${pov ? `<span class="au-card-pov" title="${x(t('auPov'))}">${I.person} ${x(pov)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  const counts = AUTHOR_STATUSES.map(s => [s, d.chapters.filter(c => c.status === s).length]).filter(([, n]) => n);
  return `${counts.length ? `<div class="au-board-sum">${counts.map(([s, n]) => `<span class="au-status-pill" data-status="${s}">${t(AUTHOR_STATUS_KEY[s])} <b data-no-i18n>${n}</b></span>`).join('')}</div>` : ''}
    <div class="au-board">${cards}
      <div class="au-card au-card-add" onclick="openAuthorChapterModal(${m.id})">${I.plus}<span>${t('writeChapterNew')}</span></div>
    </div>`;
}

// One field at a time from the board; `repaint` when the card's look changes.
async function saveAuthorChapterMeta(id, meta, repaint = false) {
  await api.author.setChapterMeta(id, meta);
  const c = S.authorData?.chapters.find(ch => ch.id === id);
  if (c) {
    if ('synopsis' in meta) c.synopsis = meta.synopsis;
    if ('status' in meta) c.status = meta.status || null;
  }
  if (repaint) renderNexusHome();
}

// The chapter modal's part: synopsis, status, point of view.
async function authorChapterMetaFieldsHtml(ch) {
  const idx = S.nexus ? await api.viewer.index(S.nexus.id) : [];
  const people = idx.filter(e => e.kind === 'object');
  return `<div class="fg"><label>${t('auSynopsis')}</label><textarea id="ac-syn" rows="3">${x(ch.synopsis || '')}</textarea></div>
    <div class="fg"><label>${t('auStatus')}</label>
      <select id="ac-status"><option value="">—</option>
        ${AUTHOR_STATUSES.map(s => `<option value="${s}"${ch.status === s ? ' selected' : ''}>${t(AUTHOR_STATUS_KEY[s])}</option>`).join('')}
      </select></div>
    <div class="fg"><label>${t('auPov')}</label>
      <select id="ac-pov"><option value="">—</option>
        ${people.map(e => `<option value="${x(e.key)}"${e.key === ch.pov_key ? ' selected' : ''}>${x(e.name)}${e.moduleName ? ` — ${x(e.moduleName)}` : ''}</option>`).join('')}
      </select></div>`;
}

async function submitAuthorChapterMeta(id) {
  if (!q('#ac-syn')) return;
  await api.author.setChapterMeta(id, { synopsis: q('#ac-syn').value, status: q('#ac-status').value, povKey: q('#ac-pov').value });
}
