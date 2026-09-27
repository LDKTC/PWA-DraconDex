// Global state + static tables. FIRST script of the core/ family: every other
// file's top level (and every module) reads `S`, `I` and the UI_* option lists,
// and cross-script `const` is in a TDZ until this file has been evaluated.
// Contains no rendering and no IPC — just the shape of the app's memory.
'use strict';

const I = {
  // V5.md §7.2: menus used the characters ✓ and › for want of these.
  check: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  chevronDown: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  chevronUp: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  copy: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  eye: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  info: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  book: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  projects: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  return: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
  timeline: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  relation: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  map: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"/></svg>`,
  hashtag: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
  import: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  export: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  colors: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="7.5" cy="10.5" r="1.5"/><circle cx="11.5" cy="7.5" r="1.5"/><circle cx="16.5" cy="9.5" r="1.5"/><circle cx="15.5" cy="14.5" r="1.5"/></svg>`,
  edit: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  delete: `<svg class="icon icon-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  move: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
  folder: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  plus: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  options: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
  close: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  pin: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.5A2 2 0 0 1 15 9.26V5a3 3 0 0 0-6 0v4.26a2 2 0 0 1-.78 1.24l-2.78 3.5a2 2 0 0 0-.44 1.24z"/></svg>`,
  fields: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
  // Mirror of #hub-toggle-btn's inline SVG (index.html) — same panel glyph,
  // divider line on the RIGHT instead of the left, so the Module Inspector
  // toggle (which collapses a RIGHT-side dock) reads as the opposite of the
  // Hub toggle (which collapses the LEFT sidebar) — Plan part2 #2.1.
  panelRight: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
  // Same panel glyph as panelRight above but divider on the LEFT — moved
  // in from #hub-toggle-btn's old inline SVG (index.html) when the toggle
  // relocated into #search-bar (process2 part1 #3). Shown on #nav-logo-btn
  // in place of the logo/return icon whenever the hub is collapsed.
  panelLeft: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  settings: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  list: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  table: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="10" y1="9" x2="10" y2="21"/></svg>`,
  director: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 3.9"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,
  globe: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  person: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  layer: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  navigator: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  sword: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>`,
  hero: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>`,
  item: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  story: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  func: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  chevronLeft: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  book: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  writer: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  series: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  document: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  chart: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  sage: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  artisan: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/></svg>`,
  scribe: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m10.5 12.5 3 3L9 20l-3 1 1-3z"/></svg>`,
  manager: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  narrator: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
  sketcher: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>`,
  wanderer: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12 7 14 12 12 17 10 12 12 7"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/></svg>`,
  home: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>`
};

const UI_SETTINGS_KEY = 'novel-manager-ui-settings';
const LEFT_PANEL_COLLAPSED_KEY = 'novel-manager-left-panel-collapsed';
const LEFT_PANEL_WIDTH_KEY = 'novel-manager-left-panel-width';
const NAV_RAIL_WIDTH_KEY = 'novel-manager-nav-rail-width';
// Process 6 part 1: horizontal nav orientation's own resize lever (--navh),
// same idiom as NAV_RAIL_WIDTH_KEY/--nav for vertical mode.
const NAV_H_HEIGHT_KEY = 'novel-manager-nav-h-height';
// The Inspector dock's width — read once by page/side-panel.js, which took
// over its job (v5 Part 8).
const INSPECTOR_WIDTH_KEY = 'novel-manager-inspector-width';
const PAGE_VIEW_WIDTH_KEY = 'novel-manager-page-view-width';
const NEXUS_ACTIVE_KEY = 'novel-manager-active-nexus';
// Recently-opened vaults, most recent first (v4.6.0). The nexus table has no
// recency column — update_at only moves on an explicit name/memo/color edit —
// so the MRU lives here, like NEXUS_ACTIVE_KEY, and is shared across windows
// (same origin). Feeds the Welcome window's "recent" cards and the vault-head
// switcher's top-3. Helpers: loadRecentNexusIds/pushRecentNexus in nexus.js.
const NEXUS_RECENT_KEY = 'novel-manager-recent-nexus';
// Set by the Welcome window right before it hands off to a new app window, so
// the onboarding tour runs there instead of in the window that's closing.
const NEXUS_PENDING_GUIDE_KEY = 'novel-manager-pending-guide';
const HUB_OPEN_KEY = 'novel-manager-hub-open';
const HUB_SECTION_HEIGHTS_KEY = 'novel-manager-hub-section-heights';

function loadHubOpen(){
  try { return { nest:true, kinds:false, sage:false, dock:false, ...JSON.parse(localStorage.getItem(HUB_OPEN_KEY) || '{}') }; }
  catch(e){ return { nest:true, kinds:false, sage:false, dock:false }; }
}
function loadHubSectionHeights(){
  try { return JSON.parse(localStorage.getItem(HUB_SECTION_HEIGHTS_KEY) || '{}'); }
  catch(e){ return {}; }
}
// Themes and locales installed from DraconDex-PKG. Filled once at boot by
// applyInstalledPackages() below, from window.api.pkg.active(). Empty until
// then on purpose: a slow or failed package load degrades to exactly the
// built-in behaviour rather than to an empty picker.
const INSTALLED_PACKAGES = { themes: [], langs: [], views: [], uistyles: [] };

// Built-in options. The live registries below start as copies of these and are
// EXTENDED in place when packages load, so every `UI_THEME_OPTIONS.includes(x)`
// call site keeps working with no change.
// Procress 10 part 2 (slim): the collapsed picker's 3 basics + rainbow, whose
// extra rules (css/themes.css) a palette-only package can't carry. The other
// 28 are DraconDex-PKG packages; a saved one is carried over to
// pkg:theme-<name> by loadUiSettings() and fetched by pkgResolvePending().
const UI_THEME_OPTIONS_BUILTIN = ['daylight','moonlight','midnight','rainbow'];
const PACKAGED_THEMES = ['redEclipse','clearSky','clearStar','afterRain','atDawn','atDusk','atDay','blueEclipse','clearAurora','atTwilight','atSunset','clearComet','atDaybreak','afterSunset','atSunrise','atNight','atNoon','clearDusk','atMidnight','clearMoon','clearGalaxy','clearNebula','afterStorm','afterSnow','atMorning','clearSun','atEvening','clearMeteor'];
const PKG_SETTING_RE = /^pkg:[A-Za-z0-9][A-Za-z0-9-]{0,63}$/; // a saved package choice
const UI_LANGUAGE_OPTIONS_BUILTIN = ['en','ja','ko','th','zh','vi','id','es','pt','fr','de','ru','it','nl','pl','uk','tr','qd'];

const UI_THEME_OPTIONS = UI_THEME_OPTIONS_BUILTIN.slice();
const UI_LANGUAGE_OPTIONS = UI_LANGUAGE_OPTIONS_BUILTIN.slice();

/**
 * Replace the installed-package registry and re-extend both option lists in
 * place. Called at boot and again after an install or uninstall.
 *
 * A downloaded package must never redefine a built-in out from under the app.
 * Themes are safe by construction — an installed one is `pkg:<id>`, so it
 * cannot collide with a bare built-in name. Locales share one namespace (a
 * package supplying `th` really is the `th` the app already has), so there the
 * built-in wins and the package is skipped.
 */
function applyInstalledPackages(active){
  INSTALLED_PACKAGES.themes   = Array.isArray(active?.themes)   ? active.themes   : [];
  INSTALLED_PACKAGES.langs    = Array.isArray(active?.langs)    ? active.langs    : [];
  INSTALLED_PACKAGES.views    = Array.isArray(active?.views)    ? active.views    : [];
  INSTALLED_PACKAGES.uistyles = Array.isArray(active?.uistyles) ? active.uistyles : [];

  // splice+push rather than reassign: these are `const`, and every consumer
  // holds the same array reference.
  UI_THEME_OPTIONS.splice(0, UI_THEME_OPTIONS.length, ...UI_THEME_OPTIONS_BUILTIN);
  for (const t of INSTALLED_PACKAGES.themes) {
    const id = `pkg:${t.id}`;
    if (!UI_THEME_OPTIONS.includes(id)) UI_THEME_OPTIONS.push(id);
  }
  UI_LANGUAGE_OPTIONS.splice(0, UI_LANGUAGE_OPTIONS.length, ...UI_LANGUAGE_OPTIONS_BUILTIN);
  for (const l of INSTALLED_PACKAGES.langs) {
    if (!UI_LANGUAGE_OPTIONS.includes(l.locale)) UI_LANGUAGE_OPTIONS.push(l.locale);
  }
  // UI_STYLE_OPTIONS_BUILTIN/UI_STYLE_OPTIONS are declared further down this
  // file (Procress 10 part 1's shape/elevation preset) — fine to reference
  // here since this function only runs at boot, well after the whole script
  // has evaluated.
  UI_STYLE_OPTIONS.splice(0, UI_STYLE_OPTIONS.length, ...UI_STYLE_OPTIONS_BUILTIN);
  for (const u of INSTALLED_PACKAGES.uistyles) {
    const id = `pkg:${u.id}`;
    if (!UI_STYLE_OPTIONS.includes(id)) UI_STYLE_OPTIONS.push(id);
  }
}

/**
 * Take the result of window.api.pkg.active() and make the app aware of it:
 * extend the option lists, and merge any installed locale into i18n.js's L so
 * t() resolves its keys like any built-in language.
 *
 * A package locale is merged UNDER the built-in table for its code when one
 * exists, so a package can add keys but never rewrite the app's own strings.
 */
function loadInstalledPackages(active){
  applyInstalledPackages(active);
  for (const l of INSTALLED_PACKAGES.langs) {
    if (!l?.locale || !l.keys) continue;
    L[l.locale] = Object.assign({}, l.keys, L[l.locale] || {});
    if (typeof LANGUAGE_LABELS === 'object' && LANGUAGE_LABELS && !LANGUAGE_LABELS[l.locale]) {
      LANGUAGE_LABELS[l.locale] = l.label || l.locale;
    }
  }
}

/** The palette an installed theme package carries, or null. */
function installedThemeVars(theme){
  const t = INSTALLED_PACKAGES.themes.find(x => `pkg:${x.id}` === theme);
  return t ? t.vars : null;
}

/** The key table an installed locale package carries, or null. */
function installedLangKeys(code){
  const l = INSTALLED_PACKAGES.langs.find(x => x.locale === code);
  return l ? l.keys : null;
}

/** The 7 shape/elevation vars an installed uistyle package carries, or null. */
function installedUistyleVars(uiStyle){
  const u = INSTALLED_PACKAGES.uistyles.find(x => `pkg:${x.id}` === uiStyle);
  return u ? u.vars : null;
}
// Plan part2 #New Workspace — which top-level app layout is active. 'drake'
// (today's nav-rail+left-panel+split-pane Builder) is the default so
// nobody's UI changes on upgrade; 'wyvern' (newcomer/simple) and 'dragon'
// (expert/sandbox) are opt-in via Setting window -> Layout -> Workspace.
const WORKSPACE_STYLE_OPTIONS = ['drake', 'wyvern', 'dragon'];
// Procress 10 part 1 — shape/elevation preset, distinct from workspaceStyle
// above (that picks the app's top-level LAYOUT; this only reshapes corner
// radius and shadow depth, see css/ui-style.css). 'oldPlain' is the default
// so nobody's UI changes on upgrade — it needs no CSS block of its own
// because it IS tokens.css's own --r/--rs/--rl/--shadow-* values.
//
// Procress 10 part 2: split into a _BUILTIN literal plus a live array, same
// shape as UI_THEME_OPTIONS/_BUILTIN above — applyInstalledPackages()
// extends UI_STYLE_OPTIONS in place with `pkg:<id>` for every installed
// uistyle package, so every existing UI_STYLE_OPTIONS.includes(x) call site
// keeps working with no change.
// Procress 10 part 2 (slim): fluent stays built in, Procress 13 outgrows 7 tokens.
const UI_STYLE_OPTIONS_BUILTIN = ['oldPlain', 'fluent'];
const PACKAGED_UISTYLES = ['roundedMinimal', 'cleanMinimal', 'hardBlock'];
const UI_STYLE_OPTIONS = UI_STYLE_OPTIONS_BUILTIN.slice();
// Process 5 part1: each workspace style's own default nav orientation —
// Drake/Dragon default to vertical (today's rail), Wyvern defaults to
// horizontal (its own toolbar was always meant to read as a top strip, see
// wyvern.js) — user-overridable per style from Setting -> Workspace, see
// applyNavOrientation() (core/boot.js).
const NAV_ORIENTATION_DEFAULT = { drake: 'vertical', wyvern: 'horizontal', dragon: 'vertical' };
// Dragon's ERP console (dragon.js) renders the level either as grouped app
// tiles or as a flat record table — a persisted per-user preference, same
// tier as the nav-orientation/display prefs above.
const DRAGON_VIEW_OPTIONS = ['tiles', 'table'];
// Process 7 part 1: the "advanced" animation-speed preset — a fixed set of
// durations (not a free-form scrubber) matching the Workspace page's other
// preset-button controls (nav orientation/display mode).
const ANIM_SPEED_MS = { fast: 100, normal: 150, slow: 300 };
const UI_SIZE_MIN = 50;
const UI_SIZE_MAX = 200;
const UI_SIZE_STEP = 5;
// First-run "UI Size" (S.settings.size) defaults to the screen instead of a
// flat 100%. Baseline 1920px width == 100%, scaled proportionally, rounded
// to the nearest UI_SIZE_STEP, clamped to the same 80-130 safety band
// fontScale already uses elsewhere in this file — narrower than the full
// manual 50-200 slider range, so an unusually small/huge monitor can't
// silently produce an illegible or absurd auto default. The user can still
// push further via the slider's full range.
function autoUiSizeFromScreen(){
  const w = (window.screen && window.screen.width) || 1920;
  const stepped = Math.round((w / 1920) * 100 / UI_SIZE_STEP) * UI_SIZE_STEP;
  return Math.min(130, Math.max(80, stepped));
}
// Every palette token a custom or installed theme may override.
//
// Was 10 (mockup 27) until theme packages arrived. The built-in blocks in
// css/themes.css actually use 15: the 12 below that appear in all 32 themes,
// plus --on-accent (15 of 32) and --button/--on-button (12 of 32). Injecting
// only 10 left --danger/--success/--button/--on-accent/--on-button at whatever
// the PREVIOUS theme had put on <body> — a half-applied theme, which reads as a
// subtle colour bug rather than an obvious failure.
//
// applyUiSettings() clears every token in this list before setting the ones a
// theme provides, so widening it is safe for existing 10-token custom themes:
// the five new ones simply fall through to css/themes.css as they did before.
const CUSTOM_THEME_TOKENS = ['--bg','--surface','--raised','--hover','--border',
  '--t1','--t2','--t3','--t3-aa','--accent','--accentH','--danger','--success',
  '--button','--on-accent','--on-button'];
// The 7 shape/elevation tokens an installed uistyle package may override —
// the same 7 css/ui-style.css sets per body[data-ui-style="<name>"]. Same
// clear-then-set idiom as CUSTOM_THEME_TOKENS: applyUiSettings() clears every
// one of these before setting the ones a pkg: uistyle provides (there is no
// optional subset here, unlike theme — a uistyle package must set all 7).
const CUSTOM_UISTYLE_TOKENS = ['--r','--rs','--rl','--shadow-pop','--shadow-float','--shadow-menu','--shadow-modal'];

// Cloud Sync (Supabase Token Sync) is switched off since v4.5.0. The repo is
// open source now, and making every user or forker stand up their own
// Supabase project first (run two migrations, configure the Google provider,
// paste a URL + anon key) is a barrier for a feature Google Drive Backup
// (docs/DRIVE.md) already covers with nobody's server involved — so Drive is
// this app's only cloud path for now.
//
// Nothing was deleted: src/renderer/sync.js, src/db/sync.js,
// src/db/sync-devserver.js, the 'sync:*' IPC handlers and api.sync are all
// still registered and working. This flag only gates the two UI entry points
// (the ☁ button in views.js and the Setting -> App-data -> Token Sync page in
// setting-window.js). Flip it to true to bring the feature back — see
// docs/SYNC.md.
//
// Note that src/db/sync.js keeps running either way: its snapshot engine
// (serializeVault / applySnapshot / importModuleSnapshot) is what powers
// Setting -> App-data -> Database, the purely offline Nexus/module file
// export-import in src/db/db-transfer.js. Nothing about that touches Supabase.
const CLOUD_SYNC_ENABLED = false;

// ...with one exception. The reason the feature was hidden was the setup wall
// (go make a Supabase project, run two migration files by hand, THEN come
// back) — and Setting -> App Data -> Supabase Project now walks the user
// through exactly that, checking and installing the schema for them. So a user
// who has finished that setup has no wall left to protect them from: the ☁
// button and the Token Sync page appear for them alone. S.supabaseReady is
// filled in once at startup by src/renderer/supabase.js.
function cloudSyncAvailable(){
  return CLOUD_SYNC_ENABLED || !!S.supabaseReady;
}

function loadUiSettings(){
  let saved = {};
  try{ saved = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || '{}'); }
  catch(e){ saved = {}; }
  // Procress 10 part 2: carry a former built-in over to its package, and keep
  // a `pkg:` value — packages load later in boot, so checking it against
  // UI_THEME_OPTIONS here reset every package theme on each restart.
  const savedTheme = PACKAGED_THEMES.includes(saved.theme) ? `pkg:theme-${saved.theme}` : saved.theme;
  const theme = UI_THEME_OPTIONS.includes(savedTheme) || PKG_SETTING_RE.test(String(savedTheme)) ? savedTheme : 'midnight';
  const language = UI_LANGUAGE_OPTIONS.includes(saved.language) ? saved.language : 'th';
  const savedSize = Number(saved.size);
  const size = Number.isFinite(savedSize) ? Math.min(UI_SIZE_MAX, Math.max(UI_SIZE_MIN, savedSize)) : autoUiSizeFromScreen();
  // v5 Part 6 (APP docs/V5.md §10.5, closes §7.8): Classic — the translated
  // names — is the default. Only an explicit 'unique' keeps the English set;
  // kindLabelBoth() shows the other name beside it either way.
  const nameMode = saved.nameMode === 'unique' ? 'unique' : 'classic';
  const savedFont = Number(saved.fontScale);
  const fontScale = Number.isFinite(savedFont) ? Math.min(130, Math.max(80, Math.round(savedFont))) : 100;
  const customThemes = Array.isArray(saved.customThemes) ? saved.customThemes : [];
  // a saved custom theme wins over the built-in whitelist check above
  const theme2 = String(saved.theme || '').startsWith('custom:') &&
    customThemes.some(ct => `custom:${ct.id}` === saved.theme) ? saved.theme : theme;
  // Nexus Nest display options (Plan part1 #2) — global renderer-local UI
  // prefs, same tier as nameMode, no per-vault scoping.
  const nestShowItems = saved.nestShowItems !== false;
  const nestShowMajorIcon = saved.nestShowMajorIcon !== false;
  const nestShowMinorIcon = saved.nestShowMinorIcon === true;
  // Process 8 part 1: was a 2-value icon/name flag, now 3-valued — a module's
  // handle is the third thing the Nest row can show after the name.
  const nestSignatureMode = ['icon', 'handle'].includes(saved.nestSignatureMode) ? saved.nestSignatureMode : 'name';
  // Setting window "Tool toggle" page (Plan part1 #Setting) — quick-setting
  // popup extras default OFF (popup stays trimmed unless opted into), nav
  // quick-buttons + status-bar segments default ON (matches today's always-
  // visible behavior so nobody's UI silently changes on upgrade).
  const quickExtras = Object.assign({ theme: false, account: false, profile: false }, saved.quickExtras || {});
  const navToggles = Object.assign({ importDb: true, exportDb: true, hashtag: true, colors: true }, saved.navToggles || {});
  // Nav-rail Hub quick-menu buttons (Plan process4 part2 #1) — kindBrowser/
  // sage/dock shortcuts toggled from the rail's own right-click menu
  // (hub/menus.js openHubQuickMenuContextMenu); Nexus Nest is the rail's
  // home button and always shows, so it has no entry here.
  const hubQuickToggles = Object.assign({ kinds: true, sage: true, dock: true }, saved.hubQuickToggles || {});
  const statusToggles = Object.assign({ vault: true, breadcrumb: true, words: true, saveState: true }, saved.statusToggles || {});
  const workspaceStyle = WORKSPACE_STYLE_OPTIONS.includes(saved.workspaceStyle) ? saved.workspaceStyle : 'drake';
  // Same carry-over and same restart fix as theme above.
  const savedUiStyle = PACKAGED_UISTYLES.includes(saved.uiStyle) ? `pkg:uistyle-${saved.uiStyle}` : saved.uiStyle;
  const uiStyle = UI_STYLE_OPTIONS.includes(savedUiStyle) || PKG_SETTING_RE.test(String(savedUiStyle)) ? savedUiStyle : 'oldPlain';
  // Process 5 part1: per-style nav orientation, sanitized against the
  // default map so an unknown/missing style key or garbage value falls back
  // cleanly rather than propagating into applyNavOrientation().
  const navOrientation = {};
  for (const st of WORKSPACE_STYLE_OPTIONS) {
    const v = (saved.navOrientation || {})[st];
    navOrientation[st] = (v === 'horizontal' || v === 'vertical') ? v : NAV_ORIENTATION_DEFAULT[st];
  }
  const navHorizontalDisplay = ['icon', 'label', 'both'].includes(saved.navHorizontalDisplay) ? saved.navHorizontalDisplay : 'both';
  // Process 6 part 1: vertical-only advanced customization — force the
  // icon+label row (normally only turned on past NAV_LABEL_THRESHOLD while
  // dragging, core/ui.js applyNavRailWidth) to stay on regardless of the
  // dragged rail width, mirroring horizontal's own display-mode setting.
  const navVerticalAlwaysLabel = saved.navVerticalAlwaysLabel === true;
  // Dragon's ERP console view mode — 'tiles' (grouped app launchpad) or
  // 'table' (flat record list). Replaces the freeform board's old
  // dragonLayout position map, which no longer has anything to position.
  const dragonView = DRAGON_VIEW_OPTIONS.includes(saved.dragonView) ? saved.dragonView : 'tiles';
  // Process 7 part 1: toggle animations (hub accordion, nest module-list
  // expand/collapse, module inspector) — default ON per Plan.md; the speed
  // preset is the "advanced" sub-setting, only meaningful while enabled.
  const animationsEnabled = saved.animationsEnabled !== false;
  const animationSpeed = ['fast', 'normal', 'slow'].includes(saved.animationSpeed) ? saved.animationSpeed : 'normal';
  return { theme: theme2, language, size, nameMode, fontScale, customThemes, nestShowItems, nestShowMajorIcon, nestShowMinorIcon, nestSignatureMode, quickExtras, navToggles, hubQuickToggles, statusToggles, workspaceStyle, uiStyle, navOrientation, navHorizontalDisplay, navVerticalAlwaysLabel, dragonView, animationsEnabled, animationSpeed, autoCollapseLeft: saved.autoCollapseLeft !== false };
}

// Kind display names (Phase 22): the Unique set (KIND_LABEL, locale-
// invariant by design — A.3 #7) or the localized Classic set, switched by
// the Settings nameMode toggle. Every DISPLAY call site goes through this.
const KIND_CLASSIC_KEY = {
  collector: 'kcFolder', manager: 'kcProject', inspector: 'kcDetail',
  classifier: 'kcCategory', locator: 'kcMap', chronicler: 'kcTimeline',
  wanderer: 'kcTimeMap', narrator: 'kcStory', author: 'kcBook',
  scribe: 'kcChat', drafter: 'kcDoc',
  exhibitor: 'kcExhibitor', sketcher: 'kcDrawing', designer: 'kcGraph', diviner: 'kcRandom',
};
function kindLabel(kind) {
  if (S.settings?.nameMode === 'classic') {
    const k = KIND_CLASSIC_KEY[kind];
    if (k && L.en[k]) return t(k);
  }
  return (typeof KIND_LABEL !== 'undefined' && KIND_LABEL[kind]) || kind;
}

const S = {
  nexus:null, nexuses:[],
  colors:[],
  recentColors:[],
  activeModule:null,
  view:'nexus',
  settings:loadUiSettings(),
  relListHeight:null,
  leftPanelCollapsed:localStorage.getItem(LEFT_PANEL_COLLAPSED_KEY) === '1',
  leftPanelWidth:Number(localStorage.getItem(LEFT_PANEL_WIDTH_KEY)) || 264,
  navRailWidth:Number(localStorage.getItem(NAV_RAIL_WIDTH_KEY)) || 42,
  navHorizontalHeight:Number(localStorage.getItem(NAV_H_HEIGHT_KEY)) || 44,
  pageViewWidth:Number(localStorage.getItem(PAGE_VIEW_WIDTH_KEY)) || null, // Plan part1 #2: null = fill pane (default)
  // Sage module state
  sageTab:'dataSize',
  // Artisan module state
  artisanTarget:null,
  // Wiki navigation state
  recentEntities:[],
  // Kind-browser accordion state (Plan part2 #1, replaces legacy Explorer —
  // session-only, not persisted).
  kindBrowserOpen:new Set(),
  // Plan part2 #New Workspace: Import Dock promoted to its own full page
  // for Wyvern's View-set menu — mutually exclusive with
  // activeModuleNode/filePreview/sageHut.
  importDockPage:false,
  // Plan part2 #New Workspace — Wyvern's drill-down browse position: an
  // array of module ids from the Nexus root down to wherever the user has
  // navigated, empty = at the Nexus root. Per-session only (not persisted),
  // same tier as S.wyvernBrowsePath's siblings above.
  wyvernBrowsePath:[],
  // Plan part2 #New Workspace — Dragon's own drill-down position, identical
  // shape/semantics to S.wyvernBrowsePath above (Dragon still needs to walk
  // into collector-kind modules, which have no standalone detail page) —
  // kept as a separate array since the two styles' boards render
  // independently and a user could in theory flip styles mid-session.
  dragonBrowsePath:[],
  // Dragon's ERP console search box — filters only the level currently
  // being browsed, cleared on every drill in/out (dragon.js). Session-only,
  // like the browse path above it.
  dragonSearch:'',
  // Setting window "Workspace Style" page — the card the user has clicked
  // but not yet committed via "Apply & Restart" (core/workspace-style.js).
  // Session-only UI state, not the persisted S.settings.workspaceStyle.
  settingPendingWorkspace:null,
  // First-run setup wizard in the Welcome window (core/welcome.js): index into
  // WELCOME_STEPS, or null for "not in the wizard, show the vault list".
  // Session-only by design — there is no first-run flag anywhere in this app;
  // boot.js starts the wizard whenever the DB holds zero vaults, the same
  // condition the old welcome modal used.
  welcomeStep:null,
  // v3 module system state (Nexus nest hub — progress.md Phases 1-3). Additive
  // alongside the legacy Scribe/Sage/Artisan modules (Director/Navigator/
  // Hero/Writer physically deleted, Process 2 Part 2); see progress.md
  // Section C for the scoping decision.
  moduleTree:[], activeModuleNode:null, inspectorData:null,
  moduleTabs:[], renamingModuleId:null, editingHandleId:null, handleDraft:null,
  // Plugin panels (v4.3.0, src/renderer/pluginpanel.js): the cached
  // contribution list from api.plugin.list(). v5 Part 8: `side` is what the
  // side panel shows (page/side-panel.js), `pages` the loaded page blocks
  // (page/page.js), `arranging` the pages in Arrange mode.
  pluginPanels:[], side:null, pages:{}, arranging:new Set(),
  // Content-item "minor module" pages (Plan part4) — a separate mirror from
  // activeModuleNode since an item is never itself a `module` row. nestItems
  // is the Nest tree's per-module item-list cache (moduleId -> null while
  // loading, else array), filled wholesale by module:getNestItems on tree
  // load (Plan part2 #2.5 — the old moduleItemCounts chevron gate went away
  // with it, since the count is now just .length); itemNodeCache feeds
  // builderTabMeta for tabs whose pane never focused (so the tab label is
  // warm regardless).
  activeItemNode:null, nestItems:new Map(), itemNodeCache:new Map(),
  // Sage Hut payloads, memoised per nexus so switching tabs doesn't refetch
  // (Plan part2 #2.3) — {nexusId, stats?, linkRows?, graph?}, each a promise.
  sageHutCache:null,
  classifierData:null, classifierView:'table', classifierSelectedObject:null,
  locatorAreas:null,
  chroniclerData:null,
  wandererData:null,
  hubOpen:loadHubOpen(),
  hubSectionHeights:loadHubSectionHeights(),
  moduleCollapsed:new Set(),
  importFolderCollapsed:new Set(),
  dragNest:null,
  dragTab:null,   // { key, paneIdx } — tab currently mid-drag in the Builder's split panes
};
const timelineGraphState = {};
const mapState = { viewByMap:{}, pointsByArea:{} };

// Walks the full module tree (arbitrary nesting depth) for every node of a
// given kind — shared by Wanderer (locator/chronicler ref pickers) and
// Chronicler (Compare-view module picker) so neither has to reach into the
// other's file (chronicler.js loads before wanderer.js in index.html).
function modulesOfKind(kind) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.kind === kind) out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(S.moduleTree);
  return out;
}

