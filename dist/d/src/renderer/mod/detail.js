'use strict';
// ═══ Detail "Inspector" (progress.md Phase 6) ══════════════════════════
// A small note field — reuses the shared markdown editor component
// (src/renderer/mdeditor.js, the same one Scribe/Director notes use) on
// the module's `description` field. Its built-in edit/preview toggle
// (Ctrl+E) satisfies this kind's "2 views: Note · Preview" on its own, so
// no separate view switcher is needed here.

// v5 Part 8 (§12.3): a scoped page component. `once`: two live editors on
// one module's description would let either overwrite the other.
registerComponent('inspector.view', {
  kind: 'inspector', label: () => kindLabel('inspector'), borrow: true, once: true,
  render: (c) => buildDetailMainHtml(c.source, c),
  mount: (c) => mountDetailEditor(c.source, c),
});

function buildDetailMainHtml(m, c) {
  return `<div data-r="editor" class="scribe-editor" style="height:${canvasFrameHeight(c, 460)}px"></div>`;
}

function mountDetailEditor(m, c) {
  const el = c.root.querySelector('[data-r="editor"]');
  if (!el) return;
  createMarkdownEditor(el, {
    title: m.name,
    content: m.description || '',
    srcKey: `module_${m.id}`,
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
