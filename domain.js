import { DEFAULT_CHART_STYLE, chartStyle, hasClinicalBody, hasSignoff, renderChartNote } from './note-style.js';
import { BUILTIN_TEMPLATES } from './data.js';

export const APPOINTMENTS = [
  { id: 'initial_consultation', title: 'Initial Consultation' },
  { id: 'progress', title: 'Progress Visit' },
  { id: 'aligner', title: 'Aligner Check' },
  { id: 'debond', title: 'Debond' },
  { id: 'retention', title: 'Retention Check' },
  { id: 'emergency', title: 'Emergency Visit' },
  { id: 'custom', title: 'Custom Template' },
];

export const DEFAULT_SETTINGS = {
  ...DEFAULT_CHART_STYLE,
  email_address: '', signature_phrases: [], default_templates: {}, auto_email: false,
  dark_mode: 'system', font_size: 17, inactivity_seconds: 300, learn_preferences: false, macros: [],
};

// These are authored fictional fixtures. No model or speech service is called.
const CASES = {
  initial_consultation: {
    patient: 'Jamie Example',
    turns: [
      ['patient', 'I would like my front teeth to be straighter.'],
      ['guardian', 'Jamie takes no regular medicines and has no known allergies.'],
      ['patient', 'I have not had orthodontic treatment before.'],
      ['doctor', 'I see mild lower anterior crowding. We will obtain orthodontic records before making a diagnosis or final treatment plan.'],
      ['doctor', 'We discussed fixed appliances and clear aligners. We discussed discomfort, oral hygiene demands, and the need for retention.'],
      ['guardian', 'You answered our questions about appliance care and the records visit.'],
      ['assistant', 'The next step is a records appointment.'],
    ],
    fields: [
      ['Chief Complaint', 'Patient requests straighter anterior teeth.', [0]],
      ['Medical History', 'Guardian reports no regular medications or known allergies.', [1]],
      ['Dental History', 'Patient reports no previous orthodontic treatment.', [2]],
      ['Clinical Findings', 'Mild lower anterior crowding noted.', [3]],
      ['Treatment Options Discussed', 'Fixed appliances and clear aligners.', [4]],
      ['Risks Benefits Discussed', 'Discomfort, oral hygiene requirements, and retention discussed.', [4]],
      ['Questions Answered', 'Guardian reports questions about appliance care and records were answered.', [5]],
      ['Treatment Plan', 'Obtain orthodontic records before diagnosis and final treatment planning.', [3]],
      ['Next Steps', 'Records appointment.', [6]],
    ],
  },
  progress: {
    patient: 'Alex Sample',
    turns: [
      ['doctor', 'We are in the alignment phase. Upper and lower fixed appliances are present.'],
      ['doctor', 'Oral hygiene is fair today.'],
      ['patient', 'I think I wear the elastics about twelve hours a day, but I have not been keeping track.'],
      ['assistant', 'Both archwires were changed today.'],
      ['doctor', 'Continue elastics as previously instructed and brush carefully around every bracket.'],
      ['doctor', 'We will see you again in six weeks.'],
    ],
    fields: [
      ['Treatment Stage', 'Alignment phase.', [0]],
      ['Appliances Present', 'Upper and lower fixed appliances.', [0]],
      ['Adjustments Performed', 'Upper and lower archwires changed.', [3]],
      ['Elastic Wear', 'Patient estimates approximately 12 hours/day; duration is uncertain.', [2]],
      ['Patient Compliance', 'Elastic wear is based on an uncertain patient estimate.', [2]],
      ['Oral Hygiene', 'Fair.', [1]],
      ['Instructions Given', 'Continue elastics as previously instructed. Brush carefully around brackets.', [4]],
      ['Next Visit', 'Six weeks.', [5]],
    ],
    flags: [['Elastic wear is an estimate. Check that the final wording preserves that uncertainty.', 'Elastic Wear', [2]]],
  },
  aligner: {
    patient: 'Taylor Example',
    turns: [
      ['patient', 'I am on aligner twelve and wear it about twenty-two hours a day.'],
      ['doctor', 'There is a small gap at the upper right lateral incisor. The rest of the aligner is seated.'],
      ['doctor', 'No IPR was performed today. We may consider refinement after reviewing the next scan.'],
      ['doctor', 'Stay in this aligner for one more week and use the seating aid as demonstrated.'],
      ['assistant', 'The next check is in two weeks.'],
    ],
    fields: [
      ['Current Aligner', 'Aligner 12, per patient.', [0]],
      ['Fit Assessment', 'Small gap at the upper right lateral incisor; remainder seated.', [1]],
      ['Tracking', 'Incomplete seating at the upper right lateral incisor.', [1]],
      ['Compliance', 'Patient reports approximately 22 hours/day of wear.', [0]],
      ['IPR Performed', 'None today.', [2]],
      ['Refinement Discussion', 'Possible refinement after review of the next scan.', [2]],
      ['Instructions', 'Remain in the current aligner for one additional week. Use the seating aid as demonstrated.', [3]],
      ['Next Visit', 'Two weeks.', [4]],
    ],
  },
  debond: {
    patient: 'Morgan Sample',
    turns: [
      ['doctor', 'The patient is satisfied with the alignment. We removed the upper and lower fixed appliances today.'],
      ['assistant', 'Upper and lower removable retainers were delivered.'],
      ['doctor', 'Wear the retainers every night and clean them as demonstrated. Contact us if a retainer stops fitting.'],
      ['doctor', 'Retention review in three months.'],
    ],
    fields: [
      ['Treatment Outcome', 'Patient reports satisfaction with alignment.', [0]],
      ['Appliances Removed', 'Upper and lower fixed appliances.', [0]],
      ['Retainers Delivered', 'Upper and lower removable retainers.', [1]],
      ['Retention Instructions', 'Nightly retainer wear. Cleaning demonstrated. Contact the clinic if fit changes.', [2]],
      ['Follow-up Plan', 'Retention review in three months.', [3]],
    ],
  },
  retention: {
    patient: 'Sam Example',
    turns: [
      ['patient', 'I wear both retainers at night, but missed two nights this week.'],
      ['doctor', 'Both retainers seat fully. I do not see a change in occlusion today.'],
      ['doctor', 'Resume consistent nightly wear. Contact us if a retainer is lost or damaged.'],
      ['assistant', 'The next retention review is in six months.'],
    ],
    fields: [
      ['Retainer Fit', 'Upper and lower retainers seat fully.', [1]],
      ['Compliance', 'Patient reports nightly wear, with two missed nights this week.', [0]],
      ['Occlusion Stability', 'No observed change in occlusion today.', [1]],
      ['Recommendations', 'Consistent nightly wear. Contact the clinic for a lost or damaged retainer.', [2]],
      ['Follow-up', 'Six months.', [3]],
    ],
  },
  emergency: {
    patient: 'Casey Sample',
    turns: [
      ['patient', 'The wire on the lower left has been poking my cheek since yesterday.'],
      ['doctor', 'The lower left archwire end is prominent. I trimmed that end today.'],
      ['patient', 'It feels more comfortable now.'],
      ['doctor', 'Use orthodontic wax if the irritation returns, and call if discomfort persists.'],
      ['assistant', 'Keep the existing progress appointment next week.'],
    ],
    fields: [
      ['Chief Complaint', 'Patient reports lower left wire irritation since yesterday.', [0]],
      ['Clinical Findings', 'Prominent lower left archwire end.', [1]],
      ['Intervention Performed', 'Lower left archwire end trimmed. Patient reports improved comfort.', [1, 2]],
      ['Instructions Given', 'Use orthodontic wax for recurrent irritation. Call for persistent discomfort.', [3]],
      ['Follow-up Plan', 'Keep the scheduled progress appointment next week.', [4]],
    ],
  },
  custom: {
    patient: 'Riley Example',
    turns: [
      ['doctor', 'The lower right bracket has detached from the tooth.'],
      ['assistant', 'The lower right bracket was rebonded today.'],
      ['doctor', 'Avoid hard foods and contact us if the bracket loosens again.'],
      ['doctor', 'Review at the scheduled progress appointment.'],
    ],
    fields: [
      ['Clinical Findings', 'Detached lower right bracket.', [0]],
      ['Treatment Performed', 'Lower right bracket rebonded.', [1]],
      ['Instructions Given', 'Avoid hard foods. Contact the clinic for recurrent bracket loosening.', [2]],
      ['Next Steps', 'Review at the scheduled progress appointment.', [3]],
    ],
  },
};

export function copy(value) { return structuredClone(value); }
export function newID() { return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function appointmentTitle(id) { return APPOINTMENTS.find(x => x.id === id)?.title ?? 'Custom Template'; }
export function dayString(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function renderSections(sections) {
  return sections.map(s => `${s.heading}:\n${s.text.trim()}`).join('\n\n');
}
export function sampleFor(type) {
  const sample = CASES[type] ?? CASES.custom;
  const roleOrder = [...new Set(sample.turns.map(turn => turn[0]))];
  return {
    patient: sample.patient,
    transcript: sample.turns.map(([role, text], index) => ({
      id: `demo-segment-${index}`, speaker_id: String(roleOrder.indexOf(role)), text,
      start: index * 3, end: index * 3 + 2.7, confidence: 0.99,
    })),
    roles: Object.fromEntries(roleOrder.map((role, index) => [String(index), role])),
    fields: copy(sample.fields), flags: copy(sample.flags ?? []),
  };
}
export function createDemoNote(type, template, heardSegments = null, now = new Date(), settings = DEFAULT_SETTINGS) {
  const sample = sampleFor(type);
  const transcript = heardSegments === null ? sample.transcript : copy(heardSegments);
  const ids = new Set(transcript.map(s => s.id));
  const supported = sources => sources.every(i => ids.has(`demo-segment-${i}`));
  const selected = template ?? BUILTIN_TEMPLATES.find(t => t.appointment_type === type);
  const sections = selected.sections.map(heading => {
    const field = sample.fields.find(f => f[0].toLowerCase() === heading.toLowerCase() && supported(f[2]));
    return { heading, text: heading.toLowerCase() === 'date' ? dayString(now) : field?.[1] ?? '',
      evidence_segment_ids: field ? field[2].map(i => `demo-segment-${i}`) : [] };
  });
  const speakerIds = new Set(transcript.map(s => s.speaker_id));
  return {
    id: newID(), patient_name: sample.patient, patient_reference: 'FICTIONAL DEMO', appointment_type: type,
    template_id: selected.id, created_at: now.toISOString(), updated_at: now.toISOString(),
    status: 'draft', version: 1, transcript, sections, chart_style: chartStyle(settings), final_text: renderChartNote(sections, settings),
    consent_confirmed: true, speaker_roles: Object.fromEntries(Object.entries(sample.roles).filter(([id]) => speakerIds.has(id))),
    speaker_roles_confirmed: false,
    uncertainties: sample.flags.filter(f => supported(f[2])).map((f, i) => ({
      id: `demo-flag-${i}`, text: f[0], section_heading: f[1], evidence_segment_ids: f[2].map(n => `demo-segment-${n}`), resolved: false,
    })), last_error: null, email_status: null, is_demo: true,
  };
}
export function approvalProblems(note) {
  if (!note) return ['Open a draft first.'];
  const problems = [];
  if (note.status !== 'draft') problems.push('Only a draft can be approved.');
  if (!note.patient_name?.trim()) problems.push('Add the patient name.');
  if (!hasClinicalBody(note.final_text, note.sections, note.chart_style)) problems.push('The final chart text is empty.');
  if (note.chart_style && !hasSignoff(note.final_text, note.chart_style)) problems.push('Apply the note sign-off before approval.');
  if (!note.consent_confirmed) problems.push('Recording consent must be confirmed.');
  const speakers = [...new Set(note.transcript.map(s => s.speaker_id))];
  if (!speakers.length) problems.push('The note has no transcript speakers.');
  if (!note.speaker_roles_confirmed || speakers.some(id => !['doctor','assistant','patient','guardian'].includes(note.speaker_roles[id]))) {
    problems.push('Confirm every speaker role in Review.');
  }
  if (note.uncertainties.some(flag => !flag.resolved)) problems.push('Resolve the uncertainty flags in Review.');
  return problems;
}
export function validateTemplate(template) {
  const title = template.title.trim();
  const sections = template.sections.map(s => s.trim()).filter(Boolean);
  if (!title || title.length > 100) throw new Error('Use a template name from 1 to 100 characters.');
  if (!sections.length || sections.length > 30) throw new Error('Use between 1 and 30 section headings.');
  if (sections.some(s => s.length > 100)) throw new Error('Section headings must be at most 100 characters.');
  if (new Set(sections.map(s => s.toLowerCase())).size !== sections.length) throw new Error('Each section heading must be unique.');
  return { ...template, title, sections };
}
export function normalizeSettings(input) {
  const output = { ...copy(DEFAULT_SETTINGS), ...copy(input) };
  output.email_address = output.email_address.trim();
  if (output.email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email_address)) throw new Error('Enter a valid email address.');
  if (output.auto_email && !output.email_address) throw new Error('Set an email address before enabling automatic delivery.');
  output.font_size = Math.min(24, Math.max(14, Number(output.font_size) || 17));
  output.inactivity_seconds = Math.min(900, Math.max(60, Number(output.inactivity_seconds) || 300));
  if (!['system', 'light', 'dark'].includes(output.dark_mode)) throw new Error('Choose System, Light, or Dark appearance.');
  Object.assign(output, chartStyle(output));
  output.signature_phrases = output.signature_phrases.map(s => s.trim()).filter(Boolean);
  return output;
}
export function canUseConnected(config, hostname, protocol) {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  return config.allowConnected === true && !/(^|\.)github\.io$/i.test(host) &&
    (protocol === 'https:' || (protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(host)));
}
