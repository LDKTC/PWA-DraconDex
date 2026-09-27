'use strict';
// ═══ Formula fields (v5 Part 7, APP docs/V5.md §11.6 "stat formulas") ════
// A Classifier field of type 'formula' shows a number computed from the
// object's other fields — `{Strength} * 2 + {Level}`. Never eval(), never
// Function(): a small recursive-descent parser over a fixed grammar, so a
// formula can read numbers and nothing else.
//
//   expr    := term (('+' | '-') term)*
//   term    := factor (('*' | '/' | '%') factor)*
//   factor  := unary ('^' factor)?            right-associative power
//   unary   := '-' unary | primary
//   primary := number | {Field name} | fn '(' expr (',' expr)* ')' | '(' expr ')'
//   fn      := min | max | round | floor | ceil | abs
//
// A field reference resolves through `lookup(name)`, which returns a number,
// NaN (the field is empty or not a number), or undefined (no such field).
// evalFormula never throws: a bad formula is { ok:false, error } for the UI.

const FORMULA_FNS = {
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  round: (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; },
  floor: (v) => Math.floor(v), ceil: (v) => Math.ceil(v), abs: (v) => Math.abs(v),
};

function tokenizeFormula(src) {
  const out = [];
  const s = String(src ?? '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error(`bad number at ${i}`);
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (c === '{') {
      const end = s.indexOf('}', i);
      if (end < 0) throw new Error('unclosed {');
      const name = s.slice(i + 1, end).trim();
      if (!name) throw new Error('empty {}');
      out.push({ t: 'ref', v: name }); i = end + 1; continue;
    }
    if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(s.slice(i));
      out.push({ t: 'fn', v: m[0].toLowerCase() }); i += m[0].length; continue;
    }
    if ('+-*/%^(),'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`unexpected "${c}"`);
  }
  return out;
}

function evalFormula(src, lookup) {
  let toks;
  try { toks = tokenizeFormula(src); } catch (e) { return { ok: false, error: e.message }; }
  if (!toks.length) return { ok: false, error: 'empty' };
  let p = 0;
  const refs = [];
  const peek = () => toks[p];
  const eat = (t) => { if (peek()?.t !== t) throw new Error(`expected ${t}`); return toks[p++]; };
  function expr() {
    let v = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p++].t; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = factor();
    while (peek() && '*/%'.includes(peek().t) && peek().t.length === 1) {
      const op = toks[p++].t; const r = factor();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function factor() {
    const b = unary();
    if (peek()?.t === '^') { p++; return b ** factor(); }
    return b;
  }
  function unary() {
    if (peek()?.t === '-') { p++; return -unary(); }
    return primary();
  }
  function primary() {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { p++; return tk.v; }
    if (tk.t === 'ref') {
      p++;
      refs.push(tk.v);
      const v = lookup(tk.v);
      if (v === undefined) throw new Error(`no field "${tk.v}"`);
      return v;
    }
    if (tk.t === 'fn') {
      p++;
      const fn = FORMULA_FNS[tk.v];
      if (!fn) throw new Error(`unknown function ${tk.v}`);
      eat('(');
      const args = [expr()];
      while (peek()?.t === ',') { p++; args.push(expr()); }
      eat(')');
      return fn(...args);
    }
    if (tk.t === '(') { p++; const v = expr(); eat(')'); return v; }
    throw new Error(`unexpected ${tk.t}`);
  }
  try {
    const v = expr();
    if (p < toks.length) throw new Error(`unexpected ${toks[p].t}`);
    return { ok: true, value: v, refs };
  } catch (e) {
    return { ok: false, error: e.message, refs };
  }
}

// The value a formula shows for one object. fields: [{id, description,
// attribute_type, options}], values: {templateId: raw string}. A formula may
// read another formula; a cycle ({A} = {B}, {B} = {A}) is an error, not a
// hang. An empty or non-numeric input makes the result empty, not 0 — a
// missing HP must not read as HP 0.
function formulaValue(field, fields, values, seen = new Set()) {
  if (seen.has(field.id)) return { ok: false, error: 'cycle' };
  let expr = '';
  try { expr = JSON.parse(field.options || '{}').expr || ''; } catch (_) {}
  const byName = new Map(fields.map((f) => [String(f.description).trim().toLowerCase(), f]));
  const next = new Set(seen).add(field.id);
  let inner = null;
  const r = evalFormula(expr, (name) => {
    const f = byName.get(name.trim().toLowerCase());
    if (!f) return undefined;
    if (f.attribute_type === 'formula') {
      const sub = formulaValue(f, fields, values, next);
      if (!sub.ok) { inner = sub; return NaN; }
      return sub.value == null ? NaN : sub.value; // empty stays empty through a chain
    }
    if (f.attribute_type === 'checkbox') return values[f.id] === '1' ? 1 : 0;
    const raw = String(values[f.id] ?? '').trim();
    return raw === '' ? NaN : Number(raw);
  });
  if (inner) return inner;
  if (r.ok && !Number.isFinite(r.value)) return { ok: true, value: null, refs: r.refs };
  return r;
}

const formatFormulaValue = (v) => (v == null ? '' : Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
