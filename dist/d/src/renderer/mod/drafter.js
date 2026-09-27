'use strict';
// ═══ Doc "Drafter" (progress.md Phase 13) ══════════════════════════════
// A blank .md-style page (mockup docs/mockups/13-drafter.png) — the
// thinnest kind: the module's own `description` IS the document, edited
// with the shared markdown editor (src/renderer/mdeditor.js) plus its
// optional format bar. The editor's built-in Ctrl+E edit/preview toggle
// covers this kind's "2 views: Edit · Read", and wikilink indexing rides
// on the module_<id> key kind that every module already has.

const DRAFTER_VIEW_LABEL = { edit: 'Edit', read: 'Read' };
// Plan part5 Drafter #1: the live editor, for the export button — per
// instance now (v5 Part 8), in the instance's state.

// v5 Part 8 (§12.3): a scoped page component, once per page (one editor per
// description, as for the Inspector kind).
registerComponent('drafter.view', {
  kind: 'drafter', label: () => kindLabel('drafter'), borrow: true, once: true,
  render: (c) => buildDrafterMainHtml(c.source, c),
  mount: (c) => mountDrafterEditor(c.source, c),
});

function buildDrafterMainHtml(m, c) {
  return `<div class="drafter-hint">${t('drafterHint')}
      <button class="btn btn-s btn-i" style="float:right" onclick="exportDrafterFile(${m.id},${xj(c.iid)})" title="${t('exportFile')}">${I.document}</button></div>
    <div data-r="editor" class="scribe-editor" style="height:${canvasFrameHeight(c, 520)}px"></div>`;
}

function mountDrafterEditor(m, c) {
  const el = c.root.querySelector('[data-r="editor"]');
  if (!el) return;
  c.state.editor = createMarkdownEditor(el, {
    title: m.name,
    content: m.description || '',
    srcKey: `module_${m.id}`,
    toolbar: true,
    save: async (content) => {
      await api.module.updateDescription(m.id, content);
      const node = findModuleNode(m.id);
      if (node) node.description = content;
      // The page's links follow the text: refresh Properties and Related in
      // place (page/page.js) without tearing down this editor mid-edit.
      await refreshPageProps(m.id);
    },
  });
}

async function exportDrafterFile(moduleId, iid) {
  const m = findModuleNode(moduleId);
  const ed = iid ? pbState(iid).editor : null;
  const content = ed ? ed.getContent() : (m?.description || '');
  const res = await api.drafter.exportFile(m?.name || 'document', 'md', content);
  if (!res?.canceled) toast(t('saved'), 'ok');
}
