// All functions declared in regular <script> tags are already global.
// No Object.assign needed — lazy-loaded modules (timeline/relation/map/hashtag)
// register their own globals when first loaded.

// ═══ START ═════════════════════════════════════════════
// The .catch is what guarantees the boot splash comes down: init() ends with
// __splash.finish(), so a throw anywhere above would otherwise leave the
// full-window overlay covering the app until its 20s watchdog fires.
init().catch(err => { console.error('init failed', err); window.__splash?.finish(); });
