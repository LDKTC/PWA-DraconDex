'use strict';
// ═══ Per-instance kind state (v5 Part 8, APP docs/V5.md §12.3) ══════════
// Most kinds read their page's state from one object, S.<kind>Data, in
// dozens of places. kindState() keeps that shape while making the object
// per INSTANCE:
//   - the loader stores what belongs to the MODULE (its rows, its settings)
//     with setModule(moduleId, data)
//   - each instance gets a Proxy: the keys listed in `instanceKeys` (plus
//     iid, moduleId and view) are its own; every other key reads and writes
//     through to the module's data, so a row added in one instance is in
//     all of them
//   - S.<prop> resolves to the CURRENT instance (page/page.js pbCurrent),
//     or — for the palette — the open module's first instance
// A kind converted this way is a scoped component: two of its views can
// share a page, and neither reads the other's selection or view.
function kindState({ prop, kind, component, views = null, viewKey = 'activeView', instanceKeys = [], defaults = null }) {
  const M = {};
  const I = {};
  const own = new Set(['iid', 'moduleId', 'view', ...instanceKeys]);
  Object.defineProperty(S, prop, {
    configurable: true,
    get() {
      const cur = I[pbCurrent()];
      if (cur) return cur;
      const m = S.activeModuleNode;
      return m?.kind === kind ? I[pbFirstInstance(component, m.id)] || null : null;
    },
    set() { /* per instance now — setModule / instance() */ },
  });
  PB_DISPOSERS.push((iid) => { delete I[iid]; });

  const make = (iid, mid) => new Proxy({ iid, moduleId: mid, ...(defaults ? defaults(M[mid]) : {}) }, {
    get: (tgt, k) => (own.has(k) || k in tgt ? tgt[k] : M[tgt.moduleId]?.[k]),
    set: (tgt, k, v) => {
      if (own.has(k) || !M[tgt.moduleId]) tgt[k] = v;
      else M[tgt.moduleId][k] = v;
      return true;
    },
    has: (tgt, k) => k in tgt || !!(M[tgt.moduleId] && k in M[tgt.moduleId]),
  });

  return {
    M, I,
    setModule(moduleId, data) { M[moduleId] = data; return data; },
    // The instance for this page block, made on its first render.
    instance(c) {
      const mid = c.source?.id;
      if (mid == null || !M[mid]) return null;
      let p = I[c.iid];
      if (!p || p.moduleId !== mid) p = I[c.iid] = make(c.iid, mid);
      if (views) {
        const pre = c.config?.preset || M[mid].ui?.[viewKey];
        p.view = views.includes(pre) ? pre : views[0];
      }
      return p;
    },
    // A view chip: the instance's preset, and the module's default.
    async setView(view) {
      const d = S[prop];
      if (!d) return;
      await api.module.setUi(d.moduleId, viewKey, view);
      if (M[d.moduleId]) M[d.moduleId].ui = { ...(M[d.moduleId].ui || {}), [viewKey]: view };
      if (S.inspectorData?.moduleId === d.moduleId) S.inspectorData.ui = { ...S.inspectorData.ui, [viewKey]: view };
      await pbSetConfig(d.iid, { preset: view });
    },
  };
}
