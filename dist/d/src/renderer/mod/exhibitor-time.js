'use strict';
// ═══ Exhibitor — relations in time, and field-owned relations (v5 Part 7) ═
// Two things a relation row can now carry, and how the Exhibitor shows them:
//
//   valid_from / valid_to   the story-time span the relation holds for
//                           ("married 1020–1045", §11.6), on Chronicler's
//                           own date rows. The toolbar's "as of" year hides
//                           every relation that does not hold then.
//   rel_type 'ctpl_<id>'    the row is a Classifier relation FIELD's value
//                           (§11.3). Its type shows as the field's name, and
//                           stays fixed here — the user chose to let the
//                           Exhibitor edit and delete these rows, but changing
//                           the type would silently detach it from its field.

const exhIsFieldRel = (rt) => /^ctpl_\d+$/.test(rt || '');

// The label a relation type shows: a field-owned row shows its field.
function exhRelTypeText(rt) {
  if (!rt) return '';
  if (exhIsFieldRel(rt)) return S.exhibitorData?.fieldNames?.get(rt) || t('dispTypeRelation');
  return rt;
}

// Field names for every ctpl_ type in use — one resolveKeys round trip.
async function loadExhibitorFieldNames(relations) {
  const keys = [...new Set(relations.map(r => r.rel_type).filter(exhIsFieldRel))];
  if (!keys.length) return new Map();
  const rows = await api.wiki.resolveKeys(keys);
  return new Map(rows.map(e => [e.key, e.name]));
}

// {day, month, years} → a comparable number; null stays null.
const exhSpanOrd = (d) => (d && d.years != null ? Number(d.years) * 10000 + (Number(d.month) || 1) * 100 + (Number(d.day) || 1) : null);

// Does relation r hold at story year `asOf`? No span, or no asOf, = always.
function exhRelHoldsAt(r, asOf) {
  if (asOf == null || asOf === '') return true;
  const y = Number(asOf);
  if (!Number.isFinite(y)) return true;
  const lo = exhSpanOrd(r.validFrom), hi = exhSpanOrd(r.validTo);
  const at = y * 10000 + 101; // start of that year…
  const atEnd = y * 10000 + 1231; // …to its end: a span inside the year holds
  return (lo == null || lo <= atEnd) && (hi == null || hi >= at);
}

const exhSpanText = (r) => {
  const f = (d) => (d ? fmtDate(d.day, d.month, d.years) : '…');
  return r.validFrom || r.validTo ? `${f(r.validFrom)} – ${f(r.validTo)}` : '';
};

function exhAsOfInputHtml(d) {
  return `<span class="vw-filterlabel">${t('relAsOf')}</span>
    <input class="exh-asof" type="number" step="1" value="${x(d.asOf ?? '')}" placeholder="—"
      title="${x(t('relAsOfHint'))}" onchange="setExhibitorAsOf(this.value)" data-no-i18n>`;
}

async function setExhibitorAsOf(v) {
  const d = S.exhibitorData;
  if (!d) return;
  const val = String(v || '').trim();
  d.asOf = val === '' ? null : val;
  await api.module.setUi(d.moduleId, 'relAsOf', val);
  renderNexusHome();
}

// The span part of the relation form.
function exhSpanFieldsHtml(rel) {
  const part = (id, d) => `
    <input id="${id}-y" type="number" placeholder="${x(t('calUnitYear'))}" value="${x(d?.years ?? '')}" style="width:7em">
    <input id="${id}-m" type="number" min="1" placeholder="${x(t('calUnitMonth'))}" value="${x(d?.years != null ? d.month ?? '' : '')}" style="width:5em">
    <input id="${id}-d" type="number" min="1" placeholder="${x(t('calUnitDay'))}" value="${x(d?.years != null ? d.day ?? '' : '')}" style="width:5em">`;
  return `<details class="cls-adv"${rel?.validFrom || rel?.validTo ? ' open' : ''}>
    <summary>${t('relSpan')}</summary>
    <p class="drafter-hint">${t('relSpanHint')}</p>
    <div class="fg"><label>${t('relSpanFrom')}</label><div class="exh-span">${part('xr-vf', rel?.validFrom)}</div></div>
    <div class="fg"><label>${t('relSpanTo')}</label><div class="exh-span">${part('xr-vt', rel?.validTo)}</div></div>
  </details>`;
}

function readExhSpan(id) {
  const y = pbQOr(`#${id}-y`)?.value.trim();
  if (!y) return null;
  return { years: Number(y), month: Number(pbQOr(`#${id}-m`)?.value) || 1, day: Number(pbQOr(`#${id}-d`)?.value) || 1 };
}
