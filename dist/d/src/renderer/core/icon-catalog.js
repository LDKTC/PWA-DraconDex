'use strict';
// ═══ The icon catalog (Procress 14, APP docs/EXPORT-DECOR.md D1) ════════
// Every icon the app draws (the I dict — core/state.js plus the ones a kind
// adds, like I.dice), in categories, findable by an English or Thai word;
// an emoji set, stored as sym:<glyph> like a symbol; and the icons used
// last. One set for everywhere an icon is chosen: a module's icon
// (iconpicker.js), a block's header, an icon row, a divider's ornament
// (page/iconpick.js). References keep the existing svg: / sym: / img:
// shapes — iconRefHtml (core/pickers.js) draws them all.

const ICON_CATS = {
  people: ['person', 'hero', 'director', 'navigator', 'narrator', 'manager', 'writer', 'scribe', 'sage', 'artisan', 'sageTab'],
  places: ['globe', 'map', 'home', 'wanderer', 'pin', 'layer', 'collector'],
  things: ['sword', 'book', 'item', 'story', 'document', 'series', 'projects', 'folder', 'dice', 'sketcher', 'colors', 'classifier', 'exhibitor'],
  time: ['timeline', 'chart', 'list', 'table', 'fields', 'func', 'view'],
  magic: ['star', 'relation', 'hashtag', 'eye', 'dragonSearch', 'info'],
  arrows: ['chevronUp', 'chevronDown', 'chevronLeft', 'chevronRight', 'return', 'import', 'export', 'move'],
  ui: ['check', 'plus', 'minus', 'close', 'edit', 'delete', 'copy', 'search', 'settings', 'options', 'eyeOff', 'panelLeft', 'panelRight'],
};

// Words each icon answers to, beyond its own name.
// Words each icon answers to, beyond its own name (English). Words in the
// UI language come from its locale block, t('iconWords'): "key=w w;key=w".
const ICON_WORDS = {
  person: 'people character',
  hero: 'game rpg',
  director: 'film movie',
  navigator: 'compass world',
  narrator: 'voice dialogue',
  manager: 'task',
  writer: 'pen write',
  scribe: 'note chat',
  sage: 'wisdom ai',
  artisan: 'craft build',
  globe: 'world earth',
  map: 'region',
  home: 'house',
  wanderer: 'travel path',
  pin: 'place location',
  layer: 'stack category',
  collector: 'folder group',
  sword: 'weapon battle fight',
  book: 'read',
  item: 'object thing',
  story: 'plot',
  document: 'page file',
  series: 'books',
  projects: 'box',
  folder: '',
  dice: 'random luck',
  sketcher: 'draw',
  colors: 'palette paint',
  timeline: 'history',
  chart: 'stats graph',
  list: '',
  table: 'grid',
  fields: 'form',
  func: 'formula',
  star: 'favourite favorite special',
  relation: 'link network',
  hashtag: 'tag',
  eye: 'see watch',
  dragonSearch: 'dragon',
  info: 'about',
  check: 'done ok',
  plus: 'add',
  minus: 'remove',
  close: 'x',
  edit: 'pencil',
  delete: 'trash bin',
  copy: '',
  search: 'find',
  settings: 'gear',
  return: 'back',
  import: 'in',
  export: 'out',
  move: 'drag',
};

const EMOJI_CATS = {
  faces: '😀 😄 😊 🙂 😉 😍 🥰 😎 🤔 😐 😴 😢 😭 😡 🤯 😱 🥶 🤠 😈 👻 💀 🤖 👽 🎃',
  people: '👤 👥 🧙 🧝 🧛 🧟 🧜 🧚 🦸 🦹 🥷 🤴 👸 👑 🧑‍🚀 🧑‍🔬 🧑‍🎨 🧑‍🍳 🧑‍🌾 💂 🕵️ 🙏 ✋ 👊',
  nature: '🐉 🐲 🦄 🐺 🦊 🐱 🐶 🦅 🦉 🐍 🐢 🐟 🦈 🐙 🕷️ 🌲 🌳 🌵 🌸 🌹 🍀 🍄 🌊 🔥',
  places: '🏰 🏯 🏛️ 🗼 ⛪ 🕌 🏠 🏚️ 🏕️ 🏝️ 🌋 ⛰️ 🏔️ 🗻 🌍 🌙 ☀️ ⭐ 🌟 ☁️ ⛈️ ❄️ 🌈 🗺️',
  objects: '⚔️ 🗡️ 🏹 🛡️ 🪄 🔮 📜 📖 📚 ✉️ 🔑 🗝️ 💎 💰 🪙 ⚱️ 🏺 🧪 ⚗️ 🕯️ 🔔 🎭 🎲 🧭',
  symbols: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 ✨ ⚡ 💫 ☠️ ⚠️ ⛔ ✅ ❌ ❓ ❗ ♾️ ☯️ ⚜️ 🔱 ♠️ ♣️',
};

// All icon keys, category by category, then anything newer no category
// names yet — so a kind that adds an icon still shows it.
function iconCatalogKeys() {
  const seen = new Set();
  const out = [];
  for (const [cat, keys] of Object.entries(ICON_CATS)) for (const k of keys) if (I[k] && !seen.has(k)) { seen.add(k); out.push({ key: k, cat }); }
  for (const k of Object.keys(I)) if (!seen.has(k) && typeof I[k] === 'string' && I[k].startsWith('<svg')) { seen.add(k); out.push({ key: k, cat: 'things' }); }
  return out;
}

let _iconLocal = null; // [lang, Map(key → words)]
function iconLocalWords(key) {
  const lang = S.settings?.language || 'th';
  if (_iconLocal?.[0] !== lang) {
    const raw = t('iconWords');
    _iconLocal = [lang, new Map(raw === 'iconWords' ? [] : raw.split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]))];
  }
  return _iconLocal[1].get(key) || '';
}
function iconMatches(key, query) {
  const qy = String(query || '').trim().toLowerCase();
  if (!qy) return true;
  return `${key} ${ICON_WORDS[key] || ''} ${iconLocalWords(key)}`.toLowerCase().includes(qy);
}

const emojiList = (cat) => (cat ? EMOJI_CATS[cat] || '' : Object.values(EMOJI_CATS).join(' ')).split(' ').filter(Boolean);

// Icons used last, newest first — a per-viewer convenience, so browser
// storage; a private window just starts without one.
const ICON_RECENT_KEY = 'ddx.iconRecent';
function iconRecent() {
  try { const v = JSON.parse(localStorage.getItem(ICON_RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((r) => typeof r === 'string' && /^(svg|sym):/.test(r)).slice(0, 12) : []; } catch (_) { return []; }
}
function iconRecentPush(ref) {
  if (!/^(svg|sym):/.test(String(ref || ''))) return;
  try { localStorage.setItem(ICON_RECENT_KEY, JSON.stringify([ref, ...iconRecent().filter((r) => r !== ref)].slice(0, 12))); } catch (_) { /* no storage: no recents */ }
}
