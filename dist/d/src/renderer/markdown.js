// Minimal self-contained markdown renderer for DraconDex (no external lib —
// the app runs offline with no bundler). Supports the Obsidian-flavored
// subset used across Scribe notes, object notes and Writer previews:
//   blocks : # h1..h6, ---, > quote, ``` fenced code, -/*/1. lists, - [ ] task
//   inline : **bold** *italic* ~~strike~~ `code` ==highlight==
//            [text](url) [[Wikilink]] [[Wikilink|alias]]
// Every piece of user text is HTML-escaped; formatting markers are applied on
// the escaped text, so no raw user HTML ever reaches innerHTML.

const _mdEsc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Canonical wikilink pattern — keep in sync with WIKILINK_RE in src/db/wiki.js.
const MD_WIKILINK_RE = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;

// → [{name, alias, start, end}] for every [[...]] in raw text.
function mdExtractWikilinks(text) {
  const out = [];
  if (!text) return out;
  MD_WIKILINK_RE.lastIndex = 0;
  let m;
  while ((m = MD_WIKILINK_RE.exec(text)) !== null) {
    out.push({ name: m[1].trim(), alias: m[2]?.trim() || null, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Inline pass. Protects code spans / links / wikilinks behind \x00n\x00
// placeholders, escapes everything else, then applies the marker regexes.
function _mdInline(text, resolveLink, fn = null) {
  const slots = [];
  const stash = (html) => `\x00${slots.push(html) - 1}\x00`;

  let s = String(text);
  s = s.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${_mdEsc(code)}</code>`));
  // [^id] — a footnote reference: a raised number carrying its note, which
  // the hover card shows (page/links.js); fn numbers it for the page.
  if (fn) s = s.replace(MD_FOOTNOTE_REF, (_, id) => {
    const note = fn.notes.get(id);
    return stash(`<sup class="fn-ref${note == null ? ' fn-missing' : ''}" data-fn="${_mdEsc(id)}" data-note="${_mdEsc(note ?? '')}" tabindex="0">${fn.num(id)}</sup>`);
  });
  s = s.replace(MD_WIKILINK_RE, (_, name, alias) => {
    const nm = name.trim();
    const key = resolveLink ? (resolveLink(nm) || '') : '';
    const cls = key ? 'wikilink' : 'wikilink wikilink-unresolved';
    return stash(`<a class="${cls}" data-name="${_mdEsc(nm)}" data-key="${_mdEsc(key)}">${_mdEsc(alias?.trim() || nm)}</a>`);
  });
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) =>
    stash(`<a class="md-link" href="${_mdEsc(url)}" title="${_mdEsc(url)}" onclick="return false">${_mdEsc(label)}</a>`));

  s = _mdEsc(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=\n]+)==/g, '<mark class="md-hl">$1</mark>');

  return s.replace(/\x00(\d+)\x00/g, (_, i) => slots[Number(i)]);
}

// Footnotes (Procress 14, APP docs/TEMPLATES.md §7.3): [^id] in the text,
// "[^id]: the note" on a line of its own.
const MD_FOOTNOTE_REF = /\[\^([A-Za-z0-9_-]{1,20})\]/g;
const MD_FOOTNOTE_DEF = /^\[\^([A-Za-z0-9_-]{1,20})\]:\s?(.*)$/;

// → { notes: Map(id → text), order: [ids, first reference first] } for raw
// text, fenced code skipped.
function mdFootnotes(text) {
  const notes = new Map();
  const order = [];
  let fenced = false;
  for (const line of String(text ?? '').split('\n')) {
    if (/^```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const d = MD_FOOTNOTE_DEF.exec(line);
    if (d) { if (!notes.has(d[1])) notes.set(d[1], d[2].trim()); continue; }
    for (const m of line.replace(/`[^`\n]+`/g, '').matchAll(MD_FOOTNOTE_REF)) if (!order.includes(m[1])) order.push(m[1]);
  }
  return { notes, order };
}

// Full block-level render. opts.resolveLink: (name) => entity key | null.
// opts.footnotes: { num(id) → the page's number, notes?: Map, hideDefs } —
// a page numbers its notes across every text block and may list them in one
// References block; without it the notes are numbered here and listed at
// the end of this text.
function mdRender(text, opts = {}) {
  const resolveLink = opts.resolveLink || null;
  const lines = String(text ?? '').split('\n');
  const out = [];
  let i = 0;
  const own = mdFootnotes(text);
  const fn = own.order.length || own.notes.size ? {
    notes: opts.footnotes?.notes || own.notes,
    num: opts.footnotes?.num || ((id) => { const n = own.order.indexOf(id); return n < 0 ? id : n + 1; }),
  } : null;
  const inl = (t) => _mdInline(t, resolveLink, fn);

  const listItem = (line) => {
    const task = line.match(/^(\s*)[-*] \[([ xX])\] (.*)$/);
    if (task) return { indent: task[1].length, html: `<li class="md-task"><input type="checkbox" disabled ${task[2] !== ' ' ? 'checked' : ''}> ${inl(task[3])}</li>`, ordered: false };
    const ul = line.match(/^(\s*)[-*] (.*)$/);
    if (ul) return { indent: ul[1].length, html: `<li>${inl(ul[2])}</li>`, ordered: false };
    const ol = line.match(/^(\s*)\d+\. (.*)$/);
    if (ol) return { indent: ol[1].length, html: `<li>${inl(ol[2])}</li>`, ordered: true };
    return null;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {                                   // fenced code
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence (or EOF)
      out.push(`<pre><code>${_mdEsc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (fn && MD_FOOTNOTE_DEF.test(line)) { i++; continue; }  // listed below / by the page

    const h = line.match(/^(#{1,6}) (.*)$/);                   // heading
    if (h) { out.push(`<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (/^> ?/.test(line)) {                                   // blockquote
      const buf = [];
      while (i < lines.length && /^> ?/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${buf.map(l => inl(l)).join('<br>')}</blockquote>`);
      continue;
    }

    if (listItem(line)) {                                      // list (2-space nesting)
      const stack = []; // [{ordered, indentLevel}]
      let html = '';
      while (i < lines.length) {
        const it = listItem(lines[i]);
        if (!it) break;
        const level = Math.floor(it.indent / 2);
        while (stack.length - 1 > level) html += stack.pop().ordered ? '</ol>' : '</ul>';
        if (stack.length - 1 === level && stack.length && stack[stack.length - 1].ordered !== it.ordered) {
          html += stack.pop().ordered ? '</ol>' : '</ul>';
        }
        while (stack.length - 1 < level || stack.length === 0) {
          stack.push({ ordered: it.ordered });
          html += it.ordered ? '<ol>' : '<ul>';
        }
        html += it.html;
        i++;
      }
      while (stack.length) html += stack.pop().ordered ? '</ol>' : '</ul>';
      out.push(html);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const buf = [];                                            // paragraph
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,6} |> ?|```|\s*[-*] |\s*\d+\. |\s*(---+|\*\*\*+|___+)\s*$)/.test(lines[i]) && !(fn && MD_FOOTNOTE_DEF.test(lines[i]))) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${buf.map(l => inl(l)).join('<br>')}</p>`);
  }

  if (fn && own.notes.size && !opts.footnotes?.hideDefs) {
    const ids = [...own.notes.keys()].sort((p, q) => (Number(fn.num(p)) || 1e9) - (Number(fn.num(q)) || 1e9));
    out.push(`<ol class="md-footnotes">${ids.map((id) => `<li data-fn="${_mdEsc(id)}" value="${Number(fn.num(id)) || ''}">${_mdInline(own.notes.get(id), resolveLink)}</li>`).join('')}</ol>`);
  }
  return out.join('\n');
}
