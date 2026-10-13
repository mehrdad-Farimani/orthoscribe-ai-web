/**
 * Chart presentation for the clinic's brief-note preference.
 * Clinical statements come only from reviewed, evidence-linked sections.
 */
export const DEFAULT_CHART_STYLE = Object.freeze({
  note_style: 'brief', note_signoff: 'Dr. Reza', include_note_date: false,
});
const LABELS = Object.freeze({
  'chief complaint': 'CC', 'medical history': 'MH', 'dental history': 'DH',
  'clinical findings': 'Findings', 'radiographic findings': 'Imaging', 'diagnosis': 'Dx',
  'treatment options discussed': 'Options discussed', 'risks benefits discussed': 'Risks/benefits discussed',
  'questions answered': 'Questions answered', 'treatment plan': 'Plan', 'next steps': 'Next steps',
  'treatment stage': 'Stage', 'appliances present': 'Appliances', 'adjustments performed': 'Performed',
  'intervention performed': 'Performed', 'treatment performed': 'Performed',
  'elastic wear': 'Elastics', 'patient compliance': 'Compliance', 'compliance': 'Compliance',
  'oral hygiene': 'OH', 'instructions given': 'Instructions', 'instructions': 'Instructions',
  'next visit': 'NV', 'follow-up': 'NV', 'follow-up plan': 'NV',
  'visit after next': 'NNV', 'next next visit': 'NNV',
  'current aligner': 'Current aligner', 'fit assessment': 'Fit', 'tracking': 'Tracking',
  'ipr performed': 'IPR performed', 'refinement discussion': 'Refinement discussed',
  'treatment outcome': 'Outcome', 'appliances removed': 'Appliances removed',
  'retainers delivered': 'Retainers delivered', 'retention instructions': 'Retention instructions',
  'retainer fit': 'Retainer fit', 'occlusion stability': 'Occlusion', 'findings': 'Findings',
  'recommendations': 'Recommendations', 'patient cooperation': 'Cooperation',
  'guardian discussion': 'Guardian discussion', 'records and scan limitations': 'Records/scan limitations',
  'treatment limitations': 'Treatment limitations',
});
const NEXT_HEADINGS = new Set(['next visit', 'follow-up', 'follow-up plan', 'visit after next', 'next next visit', 'next steps']);
const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = value => compact(value).replace(/:$/, '').toLowerCase();
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function chartStyle(input = {}) {
  input = input ?? {};
  const result = Object.fromEntries(Object.keys(DEFAULT_CHART_STYLE).map(
    name => [name, input[name] ?? DEFAULT_CHART_STYLE[name]],
  ));
  if (!['brief', 'structured'].includes(result.note_style)) throw new Error('Choose Brief clinic note or Structured sections.');
  if (typeof result.note_signoff !== 'string' || /[\r\n\u0000-\u001f]/.test(result.note_signoff)) {
    throw new Error('The note sign-off must be a single line.');
  }
  result.note_signoff = result.note_signoff.trim().replace(/^-+\s*/, '');
  if (!result.note_signoff || result.note_signoff.length > 100) throw new Error('Enter a note sign-off from 1 to 100 characters.');
  if (typeof result.include_note_date !== 'boolean') throw new Error('The date preference must be on or off.');
  return result;
}
export function signoffLabel(style = DEFAULT_CHART_STYLE) { return `-${chartStyle(style).note_signoff}`; }
export function stripSignoff(text, style = DEFAULT_CHART_STYLE) {
  const label = escaped(signoffLabel(style));
  return String(text ?? '').replace(new RegExp(`(?:\\s*${label})+\\s*$`), '').trim();
}
export function appendSignoff(text, style = DEFAULT_CHART_STYLE) {
  const body = stripSignoff(text, style);
  return body ? `${body} ${signoffLabel(style)}` : '';
}
export function hasSignoff(text, style = DEFAULT_CHART_STYLE) {
  const body = String(text ?? '').trim();
  const unsigned = stripSignoff(body, style);
  return Boolean(unsigned) && body === appendSignoff(unsigned, style);
}
export function hasClinicalBody(text, sections = [], style = DEFAULT_CHART_STYLE) {
  const headings = new Set(sections.map(section => `${key(section.heading)}:`));
  const remainder = stripSignoff(text, style).split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !headings.has(line.toLowerCase()))
    .filter(line => !/^(?:Date:\s*)?\d{4}-\d{2}-\d{2}\.?$/i.test(line));
  return remainder.length > 0;
}
function sentence(heading, text) {
  const label = LABELS[key(heading)] ?? compact(heading).replace(/:$/, '');
  const body = compact(text);
  // Keep the label: removing it can turn a planned or discussed item into a performed procedure.
  return `${label}: ${body}${/[.!?]$/.test(body) ? '' : '.'}`;
}
export function renderChartNote(sections, settings = DEFAULT_CHART_STYLE) {
  const style = chartStyle(settings);
  if (!Array.isArray(sections)) throw new Error('Chart sections are required.');
  if (!sections.some(section => key(section.heading) !== 'date' && compact(section.text))) return '';
  const visible = sections.filter(section => key(section.heading) !== 'date' || style.include_note_date);
  if (style.note_style === 'structured') {
    return appendSignoff(visible.map(section => `${section.heading}:\n${String(section.text ?? '').trim()}`).join('\n\n'), style);
  }
  const current = [], future = [], caseNotes = [];
  for (const section of visible) {
    if (!compact(section.text)) continue; // An absent finding stays absent, never "normal".
    const heading = key(section.heading);
    if (heading === 'case notes') { caseNotes.push(compact(section.text)); continue; }
    (NEXT_HEADINGS.has(heading) ? future : current).push(sentence(section.heading, section.text));
  }
  const text = [...new Set([...current, ...future])].join(' ');
  const contextual = caseNotes.length ? `Case notes: ${caseNotes.join(' ')}` : '';
  return appendSignoff([text, contextual].filter(Boolean).join('\n\n'), style);
}
