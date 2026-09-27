'use strict';
// ═══ Canvas context menus (v5 Part 3, APP docs/V5.md §7.2 / §7.6) ═══════
// The eight boards that used to swallow right-click with preventDefault()
// and offer nothing. Each board binds itself with bindCanvasCtx (hub/
// ctxmenu.js) in its own mount; the menus live here so the whole "what can I
// do on an empty canvas" answer reads in one place. Per §7.1 these are the
// Contextual/Advanced tiers — nothing here is new capability, every item is
// an action the board's toolbar or modal already had.

// v5 Part 6: every row is a command (core/commands.js) — the same entry the
// palette runs — so nothing on a canvas menu is findable only by right-click.
const ctxZoomPair = () => [cmdItem('canvas.zoomIn'), cmdItem('canvas.zoomOut')];

CTX_PROVIDERS['designer.canvas'] = () => {
  const d = S.designerData;
  if (!d) return [];
  const c = { moduleId: d.moduleId };
  return [
    cmdItem('designer.addShape', c),
    cmdItem('designer.pinLink', c),
    cmdItem('designer.edgeTool', c),
    cmdItem('designer.readOrder', c),
    cmdItem('designer.renumber', c),
    { sep: true },
    ...ctxZoomPair(),
    { sep: true },
    cmdItem('designer.linkFilter', c),
  ];
};

CTX_PROVIDERS['sketcher.canvas'] = () => {
  const d = S.sketcherData;
  if (!d) return [];
  const c = { moduleId: d.moduleId };
  return [
    cmdItem('sketcher.pen', c),
    cmdItem('sketcher.eraser', c),
    cmdItem('sketcher.pinLink', c),
    { sep: true },
    cmdItem('sketcher.newPage', c),
    cmdItem('sketcher.exportPng', c),
    { sep: true },
    ...ctxZoomPair(),
  ];
};

CTX_PROVIDERS['narrator.canvas'] = () => {
  const d = S.narratorData;
  if (!d) return [];
  return [
    cmdItem('narrator.addDialogue', { moduleId: d.moduleId }),
    { sep: true },
    ...ctxZoomPair(),
  ];
};

CTX_PROVIDERS['manager.graph'] = () => ctxZoomPair();

// Chronicler's downline graph and the one-line / compare timeline share a
// menu: both are views of the same line. (§10.6: with the top bar down to
// Add Event, this menu and the floating strip carry the rest.)
CTX_PROVIDERS['chronicler.graph'] = () => {
  const d = S.chroniclerData;
  if (!d) return [];
  const c = { moduleId: d.moduleId };
  return [
    cmdItem('chronicler.addEvent', c),
    cmdItem('chronicler.editLine', c),
    cmdItem('chronicler.switchLine', c),
    cmdItem('chronicler.graphOptions', c),
    cmdItem('chronicler.resetView', c),
  ];
};

CTX_PROVIDERS['sagehut.graph'] = () => SAGEHUT_VIEWS.map(v => ({
  label: SAGEHUT_VIEW_LABEL[v], checked: S.sageHut?.tab === v, onClick: () => openSageTab(v),
}));

CTX_PROVIDERS['exhibitor.graph'] = () => [
  cmdItem('exhibitor.addRelation', { moduleId: S.exhibitorData?.moduleId }),
  cmdItem('exhibitor.openScene', { moduleId: S.exhibitorData?.moduleId }),
  cmdItem('exhibitor.treeLayout', { moduleId: S.exhibitorData?.moduleId }),
  { sep: true },
  ...ctxZoomPair(),
];
