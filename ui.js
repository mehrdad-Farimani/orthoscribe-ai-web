import { hasClinicalBody, hasSignoff } from './note-style.js';
/* Native-inspired, dependency-free presentation layer. Clinical actions stay in controller.js. */

export const APPOINTMENTS = [
  { id: "initial_consultation", title: "Initial Consultation", description: "History, findings and treatment options", icon: "consult" },
  { id: "progress", title: "Progress Visit", description: "Adjustments and next steps", icon: "progress" },
  { id: "aligner", title: "Aligner Check", description: "Fit, tracking and wear", icon: "aligner" },
  { id: "debond", title: "Debond", description: "Treatment outcome and retention", icon: "sparkles" },
  { id: "retention", title: "Retention Check", description: "Retainer fit and stability", icon: "shield" },
  { id: "emergency", title: "Emergency Visit", description: "Concern, assessment and action", icon: "medical" },
  { id: "custom", title: "Custom Template", description: "Your clinic’s own note structure", icon: "custom" },
];

const NAVIGATION = [
  { id: "home", title: "Home", icon: "home" },
  { id: "notes", title: "Recent Notes", icon: "notes" },
  { id: "templates", title: "Templates", icon: "templates" },
  { id: "settings", title: "Settings", icon: "settings" },
];
const ROLE_NAMES = { doctor: "Doctor", assistant: "Assistant", patient: "Patient", guardian: "Parent or Guardian", unknown: "Not assigned" };
const STATUS_NAMES = { recording: "Recording", processing: "Preparing note", draft: "Needs review", approved: "Approved", email_pending: "Email pending", sent: "Sent", failed: "Needs attention" };
const ICON_PATHS = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  notes: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M13 3v6h6M13 3l6 6M8 12h4M8 16h2"/><circle cx="17" cy="16" r="3"/><path d="m19.2 18.2 2.8 2.8"/>',
  templates: '<rect x="4" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12M8 11h5M8 15h5"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2z"/><circle cx="12" cy="12" r="3"/>',
  consult: '<circle cx="10" cy="7" r="3"/><path d="M3 20v-2a7 7 0 0 1 11-5M18 12v8M14 16h8"/>',
  progress: '<path d="M4 4v16h16M8 15l4-5 4 2 5-7"/>',
  aligner: '<path d="M4 7c0-3 3-4 5-2 2 1 4 1 6 0 2-2 5-1 5 2 0 6-3 13-5 13-2 0-1-7-3-7s-1 7-3 7C7 20 4 13 4 7z"/><path d="m5 10 4 1h6l4-1"/>',
  sparkles: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2zM20 2v4M18 4h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  medical: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M12 11v6M9 14h6"/>',
  custom: '<path d="M13 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V10l-7-7zM13 3v7h7M8 14h4M8 17h7"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>',
  play: '<path d="m8 4 13 8-13 8z"/>',
  wave: '<path d="M2 12h3l2-6 3 13 4-17 3 14 2-7 2 3h2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  trash: '<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  pencil: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  cloud: '<path d="M6 18a5 5 0 1 1 0-10 6 6 0 0 1 11-2 6 6 0 0 1 1 12M12 11v10m-3-7 3-3 3 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
  speaker: '<path d="M4 9h4l5-5v16l-5-5H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M7 14h3M14 14h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  beaker: '<path d="M8 3h8M9 3v7L3 20h18l-6-10V3M6 15h12"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  apple: '<path d="M15.8 3.8c.9-1.1.8-2.3.8-2.3s-1.4.1-2.3 1.2c-.9 1-.8 2.1-.8 2.1s1.3.1 2.3-1zM18.7 12.5c0-2.4 2-3.5 2.1-3.6-1.2-1.8-3-2-3.6-2-1.5-.1-2.9.9-3.7.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.2 2.5-1.8 3-.5 7.5 1.2 10 1 1.2 2 2.5 3.3 2.4 1.3-.1 1.9-.9 3.5-.9s2.1.9 3.5.9 2.3-1.3 3.2-2.5c1-1.4 1.4-2.8 1.4-2.9-.1 0-3.4-1.2-3.4-3.9z" fill="currentColor" stroke="none"/>',
};

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
const h = escapeHTML;
export function icon(name, label = "") {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${h(label)}"` : 'aria-hidden="true"'}>${ICON_PATHS[name] || ICON_PATHS.notes}</svg>`;
}
const appointment = id => APPOINTMENTS.find(type => type.id === id) || APPOINTMENTS[6];
const attrDisabled = value => value ? " disabled" : "";
const checked = value => value ? " checked" : "";
const selected = value => value ? " selected" : "";
const badge = status => `<span class="badge ${h(status)}">${h(STATUS_NAMES[status] || status)}</span>`;
const actionAttributes = (type, data = {}) => `data-action="${h(type)}" ${Object.entries(data).map(([key, value]) => `data-${key}="${h(value)}"`).join(" ")}`;
const button = (label, type, { style = "secondary", symbol = "", disabled = false, data = {}, classes = "", busy = false } = {}) => `<button type="button" class="btn btn-${style} ${classes}" ${actionAttributes(type, data)}${attrDisabled(disabled || busy)}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : symbol ? icon(symbol) : ""}<span>${h(label)}</span></button>`;
const iconButton = (label, type, symbol, data = {}, disabled = false, danger = false) => `<button type="button" class="icon-button${danger ? " danger" : ""}" ${actionAttributes(type, data)} aria-label="${h(label)}" title="${h(label)}"${attrDisabled(disabled)}>${icon(symbol)}</button>`;
const fieldId = path => `field-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
function field(label, path, value, { type = "text", placeholder = "", disabled = false, help = "", autocomplete = "off", min = "", max = "" } = {}) {
  return `<label class="field" for="${h(fieldId(path))}"><span>${h(label)}</span><input aria-label="${h(label)}" id="${h(fieldId(path))}" data-field="${h(path)}" type="${h(type)}" value="${h(value)}" placeholder="${h(placeholder)}" autocomplete="${h(autocomplete)}"${min !== "" ? ` min="${h(min)}"` : ""}${max !== "" ? ` max="${h(max)}"` : ""}${attrDisabled(disabled)}>${help ? `<span class="field-help">${h(help)}</span>` : ""}</label>`;
}
function selectField(label, path, value, options, disabled = false) {
  return `<label class="field" for="${h(fieldId(path))}"><span>${h(label)}</span><select id="${h(fieldId(path))}" data-field="${h(path)}"${attrDisabled(disabled)}>${options.map(option => `<option value="${h(option.value)}"${selected(option.value === value)}>${h(option.label)}</option>`).join("")}</select></label>`;
}
function toggle(label, description, path, value, disabled = false) {
  return `<div class="setting-row"><div><strong>${h(label)}</strong>${description ? `<p>${h(description)}</p>` : ""}</div><label class="toggle"><input id="${h(fieldId(path))}" data-field="${h(path)}" type="checkbox" aria-label="${h(label)}"${checked(value)}${attrDisabled(disabled)}><span></span></label></div>`;
}
function dateLabel(value, detailed = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat(undefined, detailed ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}
function clock(seconds) { const total = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`; }
const initials = name => (String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("")).toUpperCase();
const waveform = active => `<div class="waveform${active ? " active" : ""}" aria-hidden="true">${"<i></i>".repeat(30)}</div>`;
function notice(text, kind = "info", dismissable = false) {
  if (!text) return "";
  return `<div class="notice ${h(kind)}" role="${kind === "error" ? "alert" : "status"}">${icon(kind === "error" || kind === "warning" ? "alert" : "info")}<p>${h(text)}</p>${dismissable ? iconButton("Dismiss message", "DISMISS_NOTICE", "close") : ""}</div>`;
}
function demoStrip(state, recording = false) {
  if (state.mode !== "demo") return "";
  return `<div class="demo-strip">${icon("beaker")}<div><strong>${recording ? "Sample conversation. Microphone is off." : "Fictional demonstration"}</strong> ${recording ? "No patient audio is captured or uploaded." : "No real AI or email. Sample notes exist only in this session and reset on refresh."}</div></div>`;
}
function pageHeading(title, subtitle = "", actions = "", eyebrow = "") {
  return `<header class="page-heading"><div>${eyebrow ? `<div class="eyebrow">${h(eyebrow)}</div>` : ""}<h1>${h(title)}</h1>${subtitle ? `<p>${h(subtitle)}</p>` : ""}</div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
}

function selectedTemplate(state) {
  const templates = state.templates || [];
  const id = state.selectedTemplateId || state.settings?.default_templates?.[state.selection];
  return templates.find(template => template.id === id && template.appointment_type === state.selection) || templates.find(template => template.appointment_type === state.selection && template.is_builtin) || templates.find(template => template.appointment_type === state.selection);
}

function noteTable(notes) {
  return `<div class="notes-table"><div class="table-header"><span>Patient</span><span>Appointment</span><span>Date</span><span>Status</span><span></span></div>${notes.map(note => `<button class="note-list-row" type="button" ${actionAttributes("OPEN_NOTE", { id: note.id })}><span class="note-patient"><span class="initial-avatar">${h(initials(note.patient_name))}</span><span><span class="patient-name">${h(note.patient_name || "Patient name needed")}</span><span class="patient-reference">${h(note.patient_reference || appointment(note.appointment_type).title)}</span></span></span><span>${h(appointment(note.appointment_type).title)}</span><span class="muted">${h(dateLabel(note.created_at))}</span>${badge(note.status)}${icon("chevron")}</button>`).join("")}</div>`;
}

function home(state) {
  const template = selectedTemplate(state);
  const demo = state.mode === "demo";
  const connection = state.connection || {};
  const recordingActive = ["recording", "paused", "uploading"].includes(state.recording?.status);
  const disabled = state.busy || !template || (!demo && (!connection.available || !connection.authenticated || !state.policyAcknowledged));
  const greetingDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return `${pageHeading("More attention. Less typing.", "Start an appointment. We’ll help you prepare the note.", button("Try a sample", "TRY_SAMPLE", { symbol: "play", disabled: state.busy || !demo }), greetingDate)}
  ${demoStrip(state)}
  ${!demo && state.recoveries?.length ? `<section class="card"><div class="card-header"><h3 class="icon-label">${icon("cloud")}Saved recordings</h3></div>${state.recoveries.map(item => `<div class="setting-row"><div><strong>Recover an appointment</strong><p>${h(item.updated_at || item.updatedAt ? dateLabel(item.updated_at || item.updatedAt,true) : "Encrypted audio is saved in this browser.")}</p></div>${button("Recover","RECOVER_RECORDING",{symbol:"arrow",classes:"btn-small",data:{id:item.noteId || item.note_id || item.id},disabled:state.busy})}</div>`).join("")}</section><br>` : ""}
  ${recordingActive ? `<div class="notice">${icon("wave")}<p>Your current recording is ${h(state.recording.status)}.</p>${button("Return", "NAVIGATE", { style: "ghost", data: { screen: "recording" } })}</div>` : ""}
  <div class="home-layout"><section class="home-main" aria-label="Start an appointment"><div class="section-heading"><h2>Choose your appointment</h2><span class="muted small">7 visit types</span></div>
  <div class="appointment-grid">${APPOINTMENTS.map(type => `<button type="button" class="appointment-card${state.selection === type.id ? " selected" : ""}" ${actionAttributes("SELECT_APPOINTMENT", { value: type.id })} aria-pressed="${state.selection === type.id}"><span class="appointment-icon">${icon(type.icon)}</span><span><span class="card-title">${h(type.title)}</span><span class="card-subtitle">${h(type.description)}</span></span>${state.selection === type.id ? `<span class="selected-dot">${icon("checkCircle")}</span>` : ""}</button>`).join("")}</div>
  <div class="start-panel">${state.selection === "custom" ? `${selectField("Custom template", "selectedTemplateId", state.selectedTemplateId || template?.id || "", (state.templates || []).filter(item => item.appointment_type === "custom").map(item => ({ value: item.id, label: item.title })))}<br>` : ""}<p class="selected-template">${icon("notes")}<span>${h(template?.title || "Select an available template")}</span></p>
  ${!demo && !state.policyAcknowledged ? `<label class="policy-check"><input type="checkbox" id="${fieldId("policyAcknowledged")}" data-field="policyAcknowledged"${checked(state.policyAcknowledged)}><span>I understand the recording policy<small>Obtain the required consent from every participant before each appointment. Stop if consent is withdrawn.</small></span></label>` : ""}
  ${button(recordingActive ? "Return to Recording" : demo ? "Start Demo Recording" : "Start Recording", recordingActive ? "NAVIGATE" : "START_RECORDING", { style: "primary", symbol: "mic", classes: "btn-large", disabled: recordingActive ? false : disabled, data: recordingActive ? { screen: "recording" } : {}, busy: state.busy })}
  <p class="consent-text">${demo ? "A fictional conversation plays here. Your microphone stays off." : "By tapping Start, I confirm consent for this appointment’s participants."}</p>
  ${!demo && !connection.authenticated ? button("Set up clinic connection", "NAVIGATE", { style: "ghost", classes: "btn-full", data: { screen: "settings" } }) : ""}</div></section>
  <aside class="home-aside"><section class="hero-panel"><span class="eyebrow">Built around your appointment</span><h2>Your attention belongs with your patient.</h2><p>Turn conversations into brief, chart-ready orthodontic notes.</p>${waveform(false)}<div class="hero-foot">${icon("checkCircle")}Reviewed and approved by you</div></section>
  <section class="steps-card"><h3>From conversation to chart</h3>${[["1", "Record the appointment", "Choose a visit type and start."], ["2", "Review your note", "Check evidence, speakers and details."], ["3", "Approve and send", "Only your final chart text is delivered."]].map(([number,title,text]) => `<div class="workflow-step"><span class="step-number">${number}</span><div><strong>${title}</strong><p>${text}</p></div></div>`).join("")}</section></aside></div>
  <section class="recent-section"><div class="section-heading"><h2>Recent notes</h2>${button("View all", "NAVIGATE", { style: "ghost", classes: "btn-small", symbol: "arrow", data: { screen: "notes" } })}</div>${(state.notes || []).length ? noteTable(state.notes.slice(0, 3)) : `<div class="card empty-state">${icon("notes")}<h3>Your next note starts here</h3><p>${demo ? "Try a fictional appointment to explore the complete workflow." : "Recorded appointments and reviewed notes will appear here."}</p>${demo ? button("Open a sample note", "TRY_SAMPLE", { style: "ghost", symbol: "arrow", disabled: state.busy }) : ""}</div>`}</section>`;
}

function recording(state) {
  const data = state.recording || {};
  const active = data.status === "recording";
  const waiting = data.status === "uploading" || state.busy;
  const needsInterruptionReview = Boolean(data.needsInterruptionReview);
  return `${pageHeading("Appointment in progress", appointment(state.selection).title, button("Back to Home", "NAVIGATE", { data: { screen: "home" }, symbol: "home" }))}${demoStrip(state, true)}
  ${data.warning ? notice(data.warning, "warning") : ""}
  <div class="record-layout"><div class="card record-control"><div class="live-label"><span class="record-dot${active ? " active" : ""}"></span>${waiting ? "Preparing your note" : active ? state.mode === "demo" ? "Playing sample conversation" : "Recording appointment" : "Recording paused"}</div><div class="record-timer" aria-label="Elapsed recording time">${clock(data.elapsed)}</div><div class="record-type">${h(appointment(state.selection).title)}</div><div class="record-wave${active ? " active" : ""}">${waveform(active)}</div><div class="record-status">${icon("cloud")}<span>${h(data.connection || (state.mode === "demo" ? "Fictional session. No audio connection." : "Connecting to your clinic"))}</span></div>${data.saved > 0 ? `<progress class="progress-meter" max="${Number(data.saved)}" value="${Number(data.uploaded) || 0}" aria-label="Audio upload progress"></progress>` : ""}
  ${needsInterruptionReview ? `<section class="interruption-review" aria-label="Recording interruption review">${notice(data.interruptionMessage || "Recording was interrupted. Review the transcript for missing conversation before preparing the note.", "warning")}<p>Confirm that you have reviewed the interruption before ending this recording.</p>${button("I reviewed the interruption", "ACKNOWLEDGE_INTERRUPTION", { symbol: "checkCircle", classes: "btn-full", disabled: waiting })}</section>` : ""}
  <div class="record-actions">${button(active ? "Pause" : "Resume", active ? "PAUSE_RECORDING" : "RESUME_RECORDING", { symbol: active ? "pause" : "play", disabled: waiting })}${button("End Recording", "END_RECORDING", { style: "danger", symbol: "stop", disabled: waiting || needsInterruptionReview })}</div><p class="record-help">${state.mode === "demo" ? "End the sample at any time to create its fictional chart note." : "Keep this page in the foreground. Resume only after confirming ongoing participant consent."}</p></div>
  <section class="card transcript-panel"><div class="card-header"><h2 class="icon-label">${icon("wave")}Live transcript</h2><span class="badge">${state.mode === "demo" ? "Sample text" : "Provisional"}</span></div><div class="transcript-feed" id="live-transcript">${(data.segments || []).length ? data.segments.map(segment => transcriptSegment(segment, data.speaker_roles || {})).join("") : `<div class="empty-state">${icon("mic")}<h3>${state.mode === "demo" ? "Your sample is starting" : "Listening to the appointment"}</h3><p>Recognized speech appears here. Speaker roles are verified during review.</p></div>`}</div><div class="transcript-foot">Live text and speaker IDs are provisional. Final transcription is reconciled before note review.</div></section></div>`;
}

function transcriptSegment(segment, roles = {}) {
  const role = roles[segment.speaker_id];
  return `<article class="transcript-segment"><div class="transcript-meta"><span class="speaker-name">${icon("speaker")}${h(role && role !== "unknown" ? ROLE_NAMES[role] || role : `Speaker ${segment.speaker_id}`)}</span><time class="muted">${clock(segment.start)}</time></div><p>${h(segment.text)}</p>${Number(segment.confidence) < .8 ? '<span class="badge failed">Low recognition confidence</span>' : ""}</article>`;
}

function notes(state) {
  const filters = state.filters || {};
  const query = String(filters.query || "").trim().toLowerCase();
  const results = (state.notes || []).filter(note => {
    const haystack = [note.patient_name, note.patient_reference, note.final_text, ...(note.sections || []).map(section => section.text)].join(" ").toLowerCase();
    const date = String(note.created_at || "").slice(0,10);
    return (!query || haystack.includes(query)) && (!filters.appointment_type || filters.appointment_type === note.appointment_type) && (!filters.date_from || date >= filters.date_from) && (!filters.date_to || date <= filters.date_to);
  });
  return `${pageHeading("Recent Notes", "Find an appointment, continue a draft or review a completed note.", button("New appointment", "NAVIGATE", { style: "primary", symbol: "plus", data: { screen: "home" } }))}${demoStrip(state)}<div class="filter-bar"><label class="search-field filter-field"><span>Patient or keyword</span>${icon("search")}<input id="${fieldId("filters.query")}" type="search" data-field="filters.query" value="${h(filters.query)}" placeholder="Search your notes" autocomplete="off"></label><label class="filter-field"><span>Appointment type</span><select id="${fieldId("filters.appointment_type")}" data-field="filters.appointment_type"><option value="">All appointments</option>${APPOINTMENTS.map(type => `<option value="${type.id}"${selected(filters.appointment_type === type.id)}>${h(type.title)}</option>`).join("")}</select></label><label class="filter-field"><span>From</span><input id="${fieldId("filters.date_from")}" type="date" data-field="filters.date_from" value="${h(filters.date_from)}"></label><label class="filter-field"><span>To</span><input id="${fieldId("filters.date_to")}" type="date" data-field="filters.date_to" value="${h(filters.date_to)}"></label></div>${results.length ? `${noteTable(results)}<p class="list-footer">${results.length} ${results.length === 1 ? "note" : "notes"}</p>` : `<section class="card empty-state">${icon("search")}<h3>No matching notes</h3><p>Try a different patient, appointment type or date range.</p></section>`}`;
}

export function reviewRequirements(note) {
  const speakers = [...new Set((note?.transcript || []).map(segment => segment.speaker_id))];
  return {
    name: Boolean(String(note?.patient_name || "").trim()),
    text: hasClinicalBody(note?.final_text, note?.sections || [], note?.chart_style || undefined),
    signoff: !note?.chart_style || hasSignoff(note.final_text, note.chart_style),
    consent: Boolean(note?.consent_confirmed),
    roles: speakers.length > 0 && Boolean(note?.speaker_roles_confirmed) && speakers.every(id => ["doctor", "assistant", "patient", "guardian"].includes(note?.speaker_roles?.[id])),
    uncertainty: !(note?.uncertainties || []).some(item => !item.resolved),
  };
}

function editor(state) {
  const note = state.draft;
  if (!note) return `${pageHeading("Chart Note")}<section class="card empty-state">${icon("notes")}<h3>Select an appointment note</h3><p>Open a note from Recent Notes to review it here.</p>${button("View notes", "NAVIGATE", { style: "primary", data: { screen: "notes" } })}</section>`;
  const editable = note.status === "draft";
  const pending = note.status === "email_pending";
  const unknown = note.email_status === "unknown";
  const ready = Object.values(reviewRequirements(note)).every(Boolean);
  const unresolved = (note.uncertainties || []).filter(item => !item.resolved).length;
  const tab = state.editorTab || "note";
  const fields = `<section class="card"><div class="card-header"><h2 class="icon-label">${icon("user")}Patient details</h2>${badge(note.status)}</div><div class="identity-grid">${field("Patient name", "draft.patient_name", note.patient_name, { placeholder: "Name required", disabled: !editable, autocomplete: "off" })}${field("Patient reference", "draft.patient_reference", note.patient_reference, { placeholder: "Optional", disabled: !editable })}</div></section>`;
  const buttons = editable ? button("Save Changes", "SAVE_NOTE", { symbol: "check", disabled: state.busy }) : pending || unknown || note.status === "sent" ? button("Refresh Status", "REFRESH_NOTE", { symbol: "cloud", data: { id: note.id }, disabled: state.busy }) : "";
  let content;
  if (note.status === "processing") content = `<section class="card generation-state"><span class="spinner" aria-hidden="true"></span><h2>Preparing your chart note</h2><p>${state.mode === "demo" ? "Preparing the fictional appointment for your review." : "Reconciling speakers and preparing evidence-backed sections. Target: under one minute; service and recording length can affect timing."}</p><br>${button("Refresh status","REFRESH_NOTE",{symbol:"cloud",data:{id:note.id},disabled:state.busy})}</section>`;
  else if (note.status === "failed") content = `<section class="card empty-state">${icon("alert")}<h3>This note needs attention</h3><p>${h(note.last_error || "Processing could not complete. The preserved recording can be reviewed with your clinic administrator.")}</p>${button("Retry Generation", "RETRY_GENERATION", { style:"primary",symbol:"arrow",data: { id:note.id },disabled:state.busy })}</section>`;
  else content = `<div class="editor-layout"><div class="editor-main">${fields}<div class="tab-switcher" role="tablist" aria-label="Note review areas">${[["note","Final Note"],["review",`Review${unresolved ? ` (${unresolved})` : ""}`],["transcript","Transcript"]].map(([value,label]) => `<button type="button" role="tab" aria-selected="${tab === value}" class="${tab === value ? "active" : ""}" ${actionAttributes("EDITOR_TAB", { value })}>${h(label)}</button>`).join("")}</div>${tab === "review" ? reviewPanel(note, editable, state) : tab === "transcript" ? `<section class="card"><div class="card-header"><h2 class="icon-label">${icon("speaker")}Final transcript</h2></div>${(note.transcript || []).map(segment => transcriptSegment(segment, note.speaker_roles)).join("") || '<p class="empty-inline">No transcript is available.</p>'}</section>` : notePanel(note, editable, state)}</div><aside class="review-side"><section class="card"><div class="card-header"><h2 class="icon-label">${icon("checkCircle")}Ready for your review</h2></div><p class="settings-card-description">The final clinical record stays under your control.</p><div class="review-summary">${Object.entries(reviewRequirements(note)).map(([key, done]) => `<div class="review-check ${done ? "done" : "pending"}">${icon(done ? "checkCircle" : "circle")}<span>${({name:"Patient identified",text:"Chart text present",signoff:"Note sign-off present",consent:"Consent recorded",roles:"Speakers verified",uncertainty:"Uncertainty resolved"})[key]}</span></div>`).join("")}</div>
  ${editable ? `${button(state.settings?.auto_email ? state.mode === "demo" ? "Approve and Simulate Email" : "Approve and Send" : "Approve Note", "APPROVE_NOTE", { style: "primary", symbol: "checkCircle", classes: "btn-full", disabled: !ready || state.busy })}${tab !== "review" ? button("Review speakers and evidence", "EDITOR_TAB", { style: "ghost", classes: "btn-full", data: { value: "review" } }) : ""}` : pending ? '<p class="connection-status">Email is queued for delivery.</p>' : `${note.status === "approved" ? button(state.mode === "demo" ? "Simulate Email" : "Send to Email", "EMAIL_NOTE", { style: "primary", symbol: "email", classes: "btn-full", disabled: state.busy || unknown }) : ""}${button("Edit New Version", "EDIT_NOTE_VERSION", { symbol: "pencil", classes: "btn-full", disabled: state.busy || unknown })}`}
  <p class="delivery-destination">${state.mode === "demo" ? "Demo delivery is simulated. No message leaves this browser." : `Delivery address: ${h(state.settings?.email_address || "Set an address in Settings")}`}</p>
  ${unknown ? notice("Delivery outcome is unknown. Ask your administrator to reconcile it before editing or sending again.", "warning") : note.email_status === "rejected" ? notice("The clinic mail server rejected delivery. Check the recipient and delivery settings.", "warning") : note.email_status === "demo_only" ? '<p class="field-help">Simulation complete. No email was sent.</p>' : note.status === "sent" ? `<p class="field-help">${state.mode === "demo" ? "Demo email marked as sent. No real email was delivered." : "Accepted by the clinic mail server. Confirm receipt in the destination mailbox."}</p>` : ""}</section>
  <section class="card"><div class="card-header"><h3>Appointment details</h3></div><div class="note-meta-list"><div class="note-meta-item"><span>Visit type</span><span>${h(appointment(note.appointment_type).title)}</span></div><div class="note-meta-item"><span>Created</span><span>${h(dateLabel(note.created_at, true))}</span></div><div class="note-meta-item"><span>Version</span><span>${Number(note.version) || 1}</span></div><div class="note-meta-item"><span>Template</span><span>${h((state.templates || []).find(template => template.id === note.template_id)?.title || appointment(note.appointment_type).title)}</span></div></div><hr class="settings-divider">${button("Delete Note", "DELETE_NOTE", { style: "ghost", symbol: "trash", disabled: pending || unknown || state.busy, data: { id: note.id } })}</section></aside></div>`;
  return `${pageHeading("Chart Note", `${appointment(note.appointment_type).title} · ${dateLabel(note.created_at)}`, buttons)}${demoStrip(state)}${content}`;
}

function notePanel(note, editable, state) {
  const macros = state.settings?.macros || [];
  const phrases = state.settings?.signature_phrases || [];
  const insertion = editable ? `<select class="inline-select" aria-label="Insert standard language" data-insert><option value="">Insert phrase</option>${macros.map(macro => `<option value="macro:${h(macro.id)}">${h(macro.name)}</option>`).join("")}${phrases.map((phrase,index) => `<option value="phrase:${index}">${h(phrase.length > 48 ? phrase.slice(0,48) + "…" : phrase)}</option>`).join("")}</select>` : "";
  return `<section class="card"><div class="card-header"><h2>Final chart text</h2><div class="editor-tools">${insertion}${editable ? button("Apply sign-off", "APPLY_SIGNOFF", { style:"ghost", classes:"btn-small", disabled:state.busy }) : ""}${iconButton("Copy final chart note", "COPY_NOTE", "copy", {}, state.busy || !note.final_text)}</div></div>${editable ? `<textarea id="${fieldId("draft.final_text")}" data-field="draft.final_text" class="note-textarea" aria-label="Final chart text" spellcheck="false">${h(note.final_text)}</textarea>` : `<pre class="note-final">${h(note.final_text)}</pre>`}<p class="note-caption">${editable ? "Edit and verify this text before approval. " : "This version is approved. Create a new editable version to make changes. "}The email body contains exactly this chart text, including the visible sign-off. No email footer is added. The sign-off is editable chart text, not proof of authentication.</p>${editable ? `<div class="settings-fields">${button("Rebuild from extracted sections", "REBUILD_CHART", {style:"ghost",classes:"btn-small",disabled:state.busy})}<span class="field-help">Rebuilding replaces manual text edits after confirmation.</span></div>` : ""}</section>`;
}

function evidenceQuotes(note, ids) {
  return (note.transcript || []).filter(segment => (ids || []).includes(segment.id)).map(segment => `<blockquote class="evidence-quote"><strong>${h(ROLE_NAMES[note.speaker_roles?.[segment.speaker_id]] || `Speaker ${segment.speaker_id}`)}</strong>${h(segment.text)}</blockquote>`).join("");
}

function reviewPanel(note, editable) {
  const speakers = [...new Set((note.transcript || []).map(segment => segment.speaker_id))];
  const mapped = speakers.length > 0 && speakers.every(id => ["doctor", "assistant", "patient", "guardian"].includes(note.speaker_roles?.[id]));
  return `<section class="card"><div class="card-header"><h2 class="icon-label">${icon("user")}Verify speaker roles</h2></div><p class="settings-card-description">Assign the role of each voice. Voice labels alone do not establish a person’s clinical role.</p>${speakers.map((id,index) => `<div class="role-row"><strong>Speaker ${h(id)}</strong><select id="role-${index}" data-speaker-id="${h(id)}" aria-label="Role for speaker ${h(id)}"${attrDisabled(!editable)}>${Object.entries(ROLE_NAMES).map(([value,label]) => `<option value="${value}"${selected((note.speaker_roles?.[id] || "unknown") === value)}>${label}</option>`).join("")}</select><p>${h((note.transcript || []).find(segment => segment.speaker_id === id)?.text || "")}</p></div>`).join("") || '<p class="empty-inline">No speaker segments are available. Approval is blocked.</p>'}<label class="check-label"><input id="${fieldId("draft.speaker_roles_confirmed")}" type="checkbox" data-field="draft.speaker_roles_confirmed"${checked(note.speaker_roles_confirmed)}${attrDisabled(!editable || !mapped)}><span>I verified every speaker role.</span></label></section>
  ${(note.uncertainties || []).length ? `<section class="card"><div class="card-header"><h2 class="icon-label">${icon("alert")}Statements to resolve</h2></div><p class="settings-card-description">Clarify these points in the final chart note, then confirm each resolution.</p>${note.uncertainties.map((item,index) => `<div class="uncertainty-item${item.resolved ? " resolved" : ""}"><h3>${h(item.section_heading)}</h3><p>${h(item.text)}</p>${evidenceQuotes(note,item.evidence_segment_ids)}<label class="check-label"><input type="checkbox" id="uncertainty-${h(item.id)}" data-field="draft.uncertainties.${index}.resolved"${checked(item.resolved)}${attrDisabled(!editable)}><span>Resolved in the final note</span></label></div>`).join("")}</section>` : ""}
  <section class="card"><div class="card-header"><h2 class="icon-label">${icon("notes")}Generated sections and evidence</h2></div><p class="settings-card-description">These are the generated source sections. Your edited Final Note is the content submitted for approval.</p>${(note.sections || []).map((section,index) => `<details class="section-evidence" data-detail-id="section-${index}"><summary>${h(section.heading)}</summary><p class="generated-text">${h(section.text)}</p>${evidenceQuotes(note,section.evidence_segment_ids)}</details>`).join("")}</section>`;
}

function templates(state) {
  const all = state.templates || [];
  const card = template => `<article class="card template-card"><span class="appointment-icon">${icon(appointment(template.appointment_type).icon)}</span><h3>${h(template.title)}</h3><p>${template.sections?.length || 0} sections · ${h(appointment(template.appointment_type).title)}</p><div class="template-headings">${(template.sections || []).slice(0,4).map(heading => `<span class="heading-tag">${h(heading)}</span>`).join("")}${template.sections?.length > 4 ? `<span class="heading-tag">+${template.sections.length - 4} more</span>` : ""}</div><div class="template-card-actions">${button(template.is_builtin ? "Customize a Copy" : "Edit Template", "EDIT_TEMPLATE", { symbol: template.is_builtin ? "copy" : "pencil", classes: "btn-small", data: { id: template.id }, disabled: state.busy })}${!template.is_builtin ? iconButton("Delete template", "DELETE_TEMPLATE", "trash", { id: template.id }, state.busy, true) : ""}</div></article>`;
  return `${pageHeading("Templates", "A consistent structure for every appointment.", button("New Template", "NEW_TEMPLATE", { style: "primary", symbol: "plus", disabled: state.busy }))}${demoStrip(state)}<section><div class="section-heading"><h2>Clinic templates</h2><span class="small muted">Your own chart structure</span></div>${all.some(template => !template.is_builtin) ? `<div class="template-grid">${all.filter(template => !template.is_builtin).map(card).join("")}</div>` : `<div class="card empty-state">${icon("templates")}<h3>Make it your clinic’s own</h3><p>Create a new template or customize one of the built-in templates below.</p>${button("Create a template", "NEW_TEMPLATE", { style: "ghost", symbol: "plus" })}</div>`}</section><section class="template-section"><div class="section-heading"><h2>Built-in templates</h2><span class="small muted">Customize without changing the original</span></div><div class="template-grid">${all.filter(template => template.is_builtin).map(card).join("")}</div></section>`;
}

function settings(state) {
  const data = state.settings || {};
  const connection = state.connection || {};
  const available = Boolean(connection.available);
  const demo = state.mode === "demo";
  const section = (title,symbol,content,description="") => `<section class="card"><div class="card-header"><h2 class="icon-label">${icon(symbol)}${h(title)}</h2></div>${description ? `<p class="settings-card-description">${h(description)}</p>` : ""}${content}</section>`;
  const delivery = `<div class="settings-fields">${field("Chart-note email address", "settings.email_address", data.email_address || "", { type: "email", placeholder: "notes@your-clinic.example", autocomplete: "off", help: demo ? "This address is part of the demonstration. No email will be sent." : "The clinic server must allow this recipient." })}${toggle("Email after approval", "Approval also requests delivery of the final chart text.", "settings.auto_email", data.auto_email)}</div>`;
  const chartPresentation = `<div class="settings-fields">${selectField("Chart note format", "settings.note_style", data.note_style || "brief", [{value:"brief",label:"Brief clinic note"},{value:"structured",label:"Structured sections"}])}${field("Note sign-off", "settings.note_signoff", data.note_signoff || "Dr. Reza", {help:"New drafts end with this name. Confirm authorship before approval. Other clinicians named in the body are preserved."})}${toggle("Date in chart text", "The appointment date remains saved and appears in the email subject even when omitted here.", "settings.include_note_date", data.include_note_date)}<p class="field-help">Brief notes use one compact paragraph, NV/NNV for explicitly stated follow-ups, and separate Case notes when documented. Empty fields are omitted. These choices apply to new appointments, not previously approved notes.</p></div>`;
  const defaultTemplates = APPOINTMENTS.map(type => `<label class="field-inline"><span>${h(type.title)}</span><select id="${fieldId(`settings.default_templates.${type.id}`)}" data-field="settings.default_templates.${type.id}"><option value="">Built-in default</option>${(state.templates || []).filter(template => template.appointment_type === type.id).map(template => `<option value="${h(template.id)}"${selected(data.default_templates?.[type.id] === template.id)}>${h(template.title)}</option>`).join("")}</select></label>`).join("");
  const phrases = `${(data.signature_phrases || []).map((phrase,index) => `<div class="phrase-entry"><textarea aria-label="Favorite phrase ${index + 1}" id="${fieldId(`settings.signature_phrases.${index}`)}" data-field="settings.signature_phrases.${index}" rows="2">${h(phrase)}</textarea>${iconButton("Delete phrase", "REMOVE_PHRASE", "trash", { index }, false, true)}</div>`).join("") || '<p class="empty-inline">Add a favorite phrase or signature for explicit insertion in a note.</p>'}${button("Add Phrase", "ADD_PHRASE", { style: "ghost", symbol: "plus", classes: "btn-small" })}`;
  const macros = `${(data.macros || []).map((macro,index) => `<div class="macro-entry"><div class="macro-fields"><input aria-label="Macro ${index + 1} name" id="${fieldId(`settings.macros.${index}.name`)}" data-field="settings.macros.${index}.name" value="${h(macro.name)}" placeholder="Name, for example /retainer"><textarea aria-label="Macro ${index + 1} text" id="${fieldId(`settings.macros.${index}.text`)}" data-field="settings.macros.${index}.text" placeholder="Standard language to insert" rows="3">${h(macro.text)}</textarea></div>${iconButton("Delete macro", "REMOVE_MACRO", "trash", { index }, false, true)}</div>`).join("") || '<p class="empty-inline">Save named blocks of standard language. They are inserted only when selected.</p>'}${button("Add Macro", "ADD_MACRO", { style: "ghost", symbol: "plus", classes: "btn-small" })}`;
  const appearance = `<div class="settings-fields">${selectField("Appearance", "settings.dark_mode", data.dark_mode || "system", [{value:"system",label:"Follow device"},{value:"light",label:"Light"},{value:"dark",label:"Dark"}])}<label class="field"><span>Text size: ${Number(data.font_size) || 17} px</span><input type="range" min="14" max="24" step="1" id="${fieldId("settings.font_size")}" data-field="settings.font_size" value="${Number(data.font_size) || 17}" aria-label="Text size"><span class="field-help">Your chart text responds to this setting.</span></label></div>`;
  const access = `<div class="settings-fields">${selectField("Lock after inactivity", "settings.inactivity_seconds", Number(data.inactivity_seconds) || 300, [{value:60,label:"1 minute"},{value:120,label:"2 minutes"},{value:300,label:"5 minutes"},{value:600,label:"10 minutes"},{value:900,label:"15 minutes"}])}${button("Lock Workspace", "LOCK", { symbol: "lock" })}<p class="field-help">Leaving a live recording page pauses capture. This web app does not claim native Face ID authentication.</p></div>`;
  const connectionFields = `<div class="mode-options"><button type="button" class="mode-option${demo ? " active" : ""}" ${actionAttributes("SET_MODE",{value:"demo"})}>${icon("beaker")}Fictional demo</button><button type="button" class="mode-option${!demo ? " active" : ""}" ${actionAttributes("SET_MODE",{value:"connected"})}${attrDisabled(!available)}>${icon("globe")}Connected clinic</button></div><br>${!available ? notice(connection.blockedReason || "Live clinic connections are disabled on this public demonstration host. Patient appointments require a clinic-approved host and backend.", "warning") : `<div class="settings-fields">${field("Clinic API origin", "connection.endpoint", connection.endpoint || "", {type:"url",placeholder:"https://scribe.your-clinic.example",help:"Enter the HTTPS origin without /v1."})}${field("Apple web client ID", "connection.appleClientId", connection.appleClientId || "", {placeholder:"com.yourclinic.orthoscribe.web"})}${field("Apple return URL", "connection.appleRedirectUri", connection.appleRedirectUri || "", {type:"url",placeholder:"https://scribe.your-clinic.example/sign-in"})}${field("Recording recovery passphrase", "connection.recordingPassphrase", connection.recordingPassphrase || "", {type:"password",placeholder:"At least 12 characters",help:"Kept in session memory. Re-enter it to unlock this browser’s encrypted recording recovery."})}${button("Prepare Clinic Connection", "CONNECT", {symbol:"globe",classes:"btn-full",busy:state.busy})}${connection.authenticated ? `<div class="connection-status">${icon("checkCircle")}Signed in to the clinic</div>${button("Sign Out of Clinic", "DISCONNECT", {classes:"btn-full",disabled:state.busy})}` : `<button class="btn apple-login" type="button" ${actionAttributes("APPLE_LOGIN")}${attrDisabled(state.busy || !connection.readyForApple)}>${icon("apple")}<span>Sign in with Apple</span></button>`}</div>`}`;
  return `${pageHeading("Settings", "Shape the workspace around your clinic.", button("Save Settings", "SAVE_SETTINGS", {style:"primary",symbol:"check",busy:state.busy}))}${demoStrip(state)}<div class="settings-layout"><div class="settings-stack">${section("Chart note style","pencil",chartPresentation,"Brief clinic notes with a single sign-off.")}${section("Chart delivery","email",delivery,"Send only the approved final chart text.")}${section("Default templates","templates",`<div class="settings-fields">${defaultTemplates}</div>`)}${section("Favorite phrases and signatures","notes",phrases,"Insert these yourself after confirming that they apply to the appointment.")}${section("Macros and standard language","custom",macros)}${section("Writing preferences","pencil",toggle("Suggest writing preferences","Connected service suggestions concern style only. No patient fact is reused across notes.","settings.learn_preferences",data.learn_preferences,demo),demo?"Preference learning is inactive in the fictional demonstration.":"")}</div><div class="settings-stack">${section("Workspace mode","globe",connectionFields)}${section("Appearance","sparkles",appearance)}${section("Access and inactivity","shield",access)}</div></div><div class="settings-save-mobile">${button("Save Settings", "SAVE_SETTINGS", {style:"primary",symbol:"check",classes:"btn-full",busy:state.busy})}</div>`;
}

function modal(state) {
  const dialog = state.dialog;
  if (!dialog) return "";
  let title = dialog.title || "Confirm action";
  let body = "";
  let footer = "";
  if (dialog.type === "template") {
    const draft = state.templateDraft || { title:"", appointment_type:"custom", sections:[] };
    title = draft.is_builtin ? "Customize Template" : draft.id ? "Edit Template" : "New Template";
    body = `${draft.is_builtin ? notice("Save a clinic copy. The built-in template stays available.") : ""}<div class="template-fields">${field("Template name", "templateDraft.title", draft.title, {placeholder:"Your clinic template"})}${selectField("Appointment type","templateDraft.appointment_type",draft.appointment_type,APPOINTMENTS.map(type=>({value:type.id,label:type.title})))}<div><div class="section-heading"><h3>Note sections</h3><span class="small muted">Drag-free ordering</span></div>${(draft.sections || []).map((heading,index)=>`<div class="section-editor-row"><span class="section-index">${index+1}</span><input id="${fieldId(`templateDraft.sections.${index}`)}" data-field="templateDraft.sections.${index}" value="${h(heading)}" aria-label="Section ${index+1} heading" placeholder="Section heading">${iconButton("Move section up","MOVE_TEMPLATE_SECTION","up",{from:index,to:index-1},index===0)}${iconButton("Move section down","MOVE_TEMPLATE_SECTION","down",{from:index,to:index+1},index===draft.sections.length-1)}${iconButton("Remove section","REMOVE_TEMPLATE_SECTION","trash",{index},draft.sections.length<=1,true)}</div>`).join("")}${button("Add Section","ADD_TEMPLATE_SECTION",{style:"ghost",symbol:"plus",classes:"btn-small",disabled:draft.sections.length>=30})}<p class="field-help">Use concise, unique headings. Each generated section must be supported by the conversation.</p></div></div>`;
    footer = `${button("Cancel","CLOSE_DIALOG")}${button("Save Template","SAVE_TEMPLATE",{style:"primary",symbol:"check",busy:state.busy})}`;
  } else {
    body = `<p>${h(dialog.message || "Please confirm this action.")}</p>`;
    footer = `${button("Cancel","CLOSE_DIALOG")}${button(dialog.confirmLabel || "Confirm","CONFIRM_DIALOG",{style:dialog.destructive?"danger":"primary",busy:state.busy})}`;
  }
  const dialogError = dialog.type === "template" && state.notice?.message && (state.notice.kind || state.notice.type) === "error" ? notice(state.notice.message, "error") : "";
  return `<div class="modal-backdrop"><section class="modal${dialog.type !== "template"?" confirm-modal":""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title" tabindex="-1">${h(title)}</h2>${iconButton("Close dialog","CLOSE_DIALOG","close",{},state.busy)}</header><div class="modal-body">${dialogError}${body}</div><footer class="modal-footer">${footer}</footer></section></div>`;
}

function privacyScreen(state) {
  return `<main class="privacy-screen" id="main-content"><img src="./assets/logo.svg" width="80" height="80" alt=""><div class="eyebrow">Workspace locked</div><h1>OrthoScribe AI</h1><p>${state.mode === "demo" ? "Your fictional demonstration is paused. Continue when you are ready." : "Sign in again and enter your recovery passphrase to open your clinical workspace."}</p>${button(state.mode === "demo"?"Return to Demo":"Unlock Workspace","UNLOCK",{style:"primary",symbol:"lock",busy:state.busy})}<p class="small">${state.mode === "demo" ? "No microphone access. No real patient data." : "Browser authentication is separate from native Face ID."}</p></main>`;
}

let currentState;
let previousScreen = "";
let previousDialog = "";
let dispatchAction = () => {};
let mounted = false;

export function mountUI(dispatch) {
  dispatchAction = dispatch;
  if (mounted) return;
  mounted = true;
  const app = document.getElementById("app");
  app.addEventListener("click", event => {
    if (event.target.classList?.contains("modal-backdrop")) { if (!currentState?.busy) dispatchAction({type:"CLOSE_DIALOG"}); return; }
    const control = event.target.closest?.("[data-action]");
    if (!control || control.disabled) return;
    event.preventDefault();
    const type = control.dataset.action;
    if (type === "CONFIRM_DIALOG") { if (currentState?.dialog?.action) dispatchAction({...currentState.dialog.action}); return; }
    if (type === "EDITOR_TAB") { dispatchAction({type:"SET_FIELD",path:"editorTab",value:control.dataset.value}); return; }
    const action = {type};
    for (const [key,value] of Object.entries(control.dataset)) {
      if (key === "action") continue;
      action[key] = ["index","from","to"].includes(key) ? Number(value) : value;
    }
    dispatchAction(action);
  });
  app.addEventListener("input", event => {
    const target = event.target;
    if (!target.matches?.("[data-field]") || target.matches("select")) return;
    dispatchAction({type:"SET_FIELD",path:target.dataset.field,value:target.type==="checkbox"?target.checked:["number","range"].includes(target.type)?Number(target.value):target.value});
  });
  app.addEventListener("change", event => {
    const target = event.target;
    if (target.matches?.("select[data-field]")) {
      const numeric = target.dataset.field === "settings.inactivity_seconds";
      dispatchAction({type:"SET_FIELD",path:target.dataset.field,value:numeric?Number(target.value):target.value});
    }
    if (target.matches?.("[data-speaker-id]")) {
      dispatchAction({type:"SET_FIELD",path:"draft.speaker_roles",value:{...(currentState?.draft?.speaker_roles || {}),[target.dataset.speakerId]:target.value}});
      dispatchAction({type:"SET_FIELD",path:"draft.speaker_roles_confirmed",value:false});
    }
    if (target.matches?.("[data-insert]") && target.value) {
      const separator = target.value.indexOf(":");
      const kind = target.value.slice(0,separator); const id = target.value.slice(separator+1);
      dispatchAction(kind === "macro" ? {type:"INSERT_MACRO",id} : {type:"INSERT_PHRASE",index:Number(id)});
      target.value = "";
    }
  });
  document.addEventListener("keydown", event => {
    if (!currentState?.dialog) return;
    if (event.key === "Escape" && !currentState.busy) { event.preventDefault(); dispatchAction({type:"CLOSE_DIALOG"}); }
    if (event.key === "Tab") {
      const modal = document.querySelector(".modal");
      const focusable = [...(modal?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || [])];
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement?.id === "modal-title")) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (currentState?.settings?.dark_mode === "system") render(currentState); });
}

export function render(state) {
  const app = document.getElementById("app");
  if (!app) return;
  const sameScreen = previousScreen === state.screen;
  const active = document.activeElement;
  const activeId = active?.id;
  const selectionStart = active && "selectionStart" in active ? active.selectionStart : null;
  const selectionEnd = active && "selectionEnd" in active ? active.selectionEnd : null;
  const activeScroll = active?.scrollTop || 0;
  const scrollTop = document.scrollingElement?.scrollTop || 0;
  const openDetails = [...app.querySelectorAll("details[open][data-detail-id]")].map(element=>element.dataset.detailId);
  const transcript = app.querySelector("#live-transcript");
  const transcriptAtEnd = transcript ? transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight < 80 : true;
  const transcriptScroll = transcript?.scrollTop || 0;
  currentState = state;
  const theme = state.settings?.dark_mode || "system";
  document.documentElement.dataset.theme = theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light" : theme;
  document.documentElement.dataset.font = String(Math.max(14,Math.min(24,Math.round(Number(state.settings?.font_size)||17))));
  const screenTitle = state.screen === "recording" ? "Appointment" : state.screen === "editor" ? "Chart Note" : NAVIGATION.find(item=>item.id===state.screen)?.title || "Home";
  document.title = `${screenTitle} · OrthoScribe AI`;
  if (state.locked) {
    app.innerHTML = privacyScreen(state);
    previousScreen = "locked"; previousDialog = "";
    return;
  }
  const activeNav = ["recording","editor"].includes(state.screen) ? state.screen === "recording"?"home":"notes" : state.screen || "home";
  const modeLabel = state.mode === "demo" ? "DEMO" : "CLINIC";
  const brand = `<div class="brand"><img src="./assets/logo.svg" width="40" height="40" alt=""><div class="brand-title">OrthoScribe AI<span>CLINICAL WORKSPACE</span></div></div>`;
  const body = ({home,recording,notes,editor,templates,settings}[state.screen] || home)(state);
  const topNotice = typeof state.notice === "string" ? notice(state.notice,"info",true) : state.notice?.message ? notice(state.notice.message,state.notice.kind || state.notice.type || "info",true) : "";
  app.innerHTML = `<div class="app-shell"><aside class="sidebar">${brand}<div class="nav-label eyebrow">Workspace</div><nav class="nav-items" aria-label="Main navigation">${NAVIGATION.map(item=>`<button type="button" class="nav-item${activeNav===item.id?" active":""}" ${actionAttributes("NAVIGATE",{screen:item.id})}${activeNav===item.id?' aria-current="page"':""}>${icon(item.icon)}<span>${item.title}</span>${item.id==="notes" && state.notes?.length?`<span class="nav-count">${state.notes.length}</span>`:""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="local-status"><div class="status-label"><span class="status-dot${state.mode==="demo"?" amber":""}"></span>${state.mode==="demo"?"Demonstration mode":"Clinic workspace"}</div><p>${state.mode==="demo"?"Explore with fictional appointments. No microphone or real email.":state.connection?.authenticated?"Connected to your approved clinic service.":"Configure your approved clinic connection in Settings."}</p></div><div class="sidebar-footer">OrthoScribe AI · Web edition</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumbs">Workspace ${icon("chevron")}<span>${h(screenTitle)}</span></div><div class="topbar-right"><span class="mode-chip${state.mode!=="demo"?" connected":""}">${modeLabel}</span>${iconButton("Lock workspace","LOCK","lock")}</div></header><header class="mobile-header">${brand}<div class="mobile-header-right"><span class="mode-chip${state.mode!=="demo"?" connected":""}">${modeLabel}</span>${iconButton("Lock workspace","LOCK","lock")}</div></header><main class="main-content" id="main-content">${topNotice}${body}</main></div></div><nav class="bottom-nav" aria-label="Mobile navigation">${NAVIGATION.map(item=>`<button type="button" class="bottom-tab${activeNav===item.id?" active":""}" ${actionAttributes("NAVIGATE",{screen:item.id})}${activeNav===item.id?' aria-current="page"':""}><span class="tab-icon">${icon(item.icon)}</span><span>${item.id==="notes"?"Notes":item.title}</span></button>`).join("")}</nav>${modal(state)}`;
  if (sameScreen) {
    for (const id of openDetails) app.querySelector(`details[data-detail-id="${CSS.escape(id)}"]`)?.setAttribute("open","");
    document.scrollingElement.scrollTop = scrollTop;
    if (activeId) {
      const next = document.getElementById(activeId);
      if (next && !next.disabled) {
        next.focus({preventScroll:true});
        if (selectionStart !== null && typeof next.setSelectionRange === "function") { try { next.setSelectionRange(selectionStart,selectionEnd); } catch { /* Number/date fields have no text-selection API. */ } }
        next.scrollTop = activeScroll;
      }
    }
  } else { document.scrollingElement.scrollTop = 0; }
  const nextTranscript = app.querySelector("#live-transcript");
  if (nextTranscript) nextTranscript.scrollTop = transcriptAtEnd ? nextTranscript.scrollHeight : transcriptScroll;
  if (state.dialog && !previousDialog) document.getElementById("modal-title")?.focus({preventScroll:true});
  previousScreen = state.screen;
  previousDialog = state.dialog?.type || "";
}
