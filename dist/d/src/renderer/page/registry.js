'use strict';
// ═══ Components (v5 Part 8, APP docs/V5.md §12.2–§12.3) ═════════════════
// A page is a stack of page_block rows (db/page-block.js). A `component`
// block names one of these; the other block types (text, heading, divider,
// image, columns) are drawn by page/blocks.js. An entry:
//   kind       the module kind whose data it shows ('core' = any page)
//   labelKey   i18n key for the add-block picker and the arrange bar (or
//   label      () => the text, when it is not one key — a kind's name)
//   presets    () => [preset ids] — what the old view chips switched between
//   presetLabel (p) => the chip's text
//   render(c)  HTML for one instance; c is the instance (page/page.js pbCtx)
//   mount(c)   after the HTML is in the document; c.root is the section
//   borrow     true when another page may show it with source_key (§12.12)
//   once       at most one instance per page
//   container  true when it holds blocks of its own (parent_id + config.col,
//              as columns do): core.tabs, core.toggle; drawn with
//              pbChildrenHtml, never nested inside another container
//   options    () => [{key, type, label, choices?, default?, min?, max?}] —
//              its own settings, drawn by the ⚙ popover's Options tab
//              (page/style-pop.js) and read with pbOpt(c, key) (page/style.js).
//              Types: select, toggle, number, text, fields, module, links,
//              list (short strings: tab names).
//
// Every kind's view is a component (`<kind>.view`) whose presets are the
// kind's old views, so an existing module opens looking exactly as before:
// its default block's preset is the module's saved activeView. Each kind
// registers its own in mod/<kind>.js, scoped per instance through
// page/kind-state.js — the legacy adapter that wrapped an unconverted kind's
// page renderer went once the last kind (Manager) was converted.

const COMPONENTS = {};

function registerComponent(id, spec) { COMPONENTS[id] = { id, ...spec }; }

const componentOf = (b) => (b?.block_type === 'component' ? COMPONENTS[b.component] || null : null);
const componentLabel = (comp) => (comp?.label ? comp.label() : comp ? t(comp.labelKey) : '?');

// The layout a page gets the first time it opens (db ensurePage stores it
// once). A module page: Properties at the head, the kind's own view with the
// preset its old activeView named, the related links at the foot.
function defaultPageLayout(m, ui) {
  if (!m || m.kind === 'collector') return [];
  const preset = ui?.activeView || ui?.view || null;
  return [
    { component: 'core.properties' },
    { component: `${m.kind}.view`, config: preset ? { preset } : {} },
    { component: 'core.related' },
  ];
}
