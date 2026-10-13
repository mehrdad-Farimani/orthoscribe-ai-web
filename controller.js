import { appendSignoff, stripSignoff, renderChartNote } from './note-style.js';
import { APP_CONFIG } from './config.js';
import { BUILTIN_TEMPLATES } from './data.js';
import { APPOINTMENTS, DEFAULT_SETTINGS, approvalProblems, canUseConnected, copy, createDemoNote, newID, normalizeSettings, sampleFor, validateTemplate } from './domain.js';
import { APIClient } from './bridge.js';
import { OrthoRecorder } from './recorder.js';
import { RecordingVault } from './vault.js';

const EDITABLE_FIELDS = ['patient_name', 'patient_reference', 'sections', 'final_text', 'uncertainties', 'speaker_roles', 'speaker_roles_confirmed'];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const inertLocation = { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost', pathname: '/' };
const stopped = () => new DOMException('Workspace changed', 'AbortError');

export function createController({ render = () => {}, config = APP_CONFIG, environment = globalThis, seed = true } = {}) {
  const location = environment.location ?? inertLocation;
  const available = canUseConnected(config, location.hostname, location.protocol);
  const state = {
    mode: 'demo', screen: 'home', selection: 'progress', selectedTemplateId: '', policyAcknowledged: false,
    notes: [], templates: copy(BUILTIN_TEMPLATES), settings: copy(DEFAULT_SETTINGS), draft: null, editorTab: 'note',
    filters: { query: '', appointment_type: '', date_from: '', date_to: '' },
    recording: { status: 'idle', elapsed: 0, segments: [], connection: '', warning: '', saved: 0, uploaded: 0, needsInterruptionReview: false, interruptionMessage: '' },
    busy: false, notice: null, dialog: null, locked: false, templateDraft: null, recoveries: [],
    connection: {
      endpoint: '', appleClientId: '', appleRedirectUri: `${location.origin}${location.pathname}`, recordingPassphrase: '',
      authenticated: false, readyForApple: false, available,
      blockedReason: 'This GitHub-ready build uses fictional sample data. Live recording, Apple sign-in, and patient services require an approved host and a configured backend.',
    },
  };
  if (seed) {
    const progress = createDemoNote('progress');
    const aligner = createDemoNote('aligner', undefined, null, new Date(Date.now() - 86400000));
    state.notes = [progress, aligner];
  }
  let api = null, recorder = null, vault = null, epoch = 0, destroyed = false, appleLoginInProgress = false;
  let lastActivity = Date.now(), lastTick = Date.now(), activeNote = null, demoSample = null;
  let dirty = false, draftSaveTimer = null, draftSaveChain = Promise.resolve(), searchTimer = null;
  let demoWorkspace = null;
  const emit = () => { if (!destroyed) render(state); };
  const valid = ticket => { if (ticket !== epoch || destroyed) throw stopped(); };
  function notice(message, kind = 'info') { state.notice = { message, kind }; emit(); }
  function upsert(note) {
    const index = state.notes.findIndex(item => item.id === note.id);
    if (index < 0) state.notes.unshift(copy(note)); else state.notes[index] = copy(note);
    state.notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  function chosenTemplate() {
    const id = state.selectedTemplateId || state.settings.default_templates[state.selection];
    return state.templates.find(item => item.id === id && item.appointment_type === state.selection) ??
      state.templates.find(item => item.id === `builtin-${state.selection}`);
  }
  function requireConnected() {
    if (!available || state.mode !== 'connected') throw new Error('Clinical services are disabled in this public demonstration.');
    if (!api?.hasSession) throw new Error('Prepare the clinic connection and sign in first.');
  }
  async function run(operation) {
    if (state.busy || destroyed) return;
    const ticket = epoch; state.busy = true; emit();
    try { await operation(ticket); }
    catch (error) { if (ticket === epoch && error?.name !== 'AbortError') notice(error.message || 'The action could not be completed.', 'error'); }
    finally { if (ticket === epoch) { state.busy = false; emit(); } }
  }
  async function ensureVault(ticket) {
    if (vault?.unlocked) return;
    requireConnected();
    const unlocked = await RecordingVault.unlock({ endpoint: api.baseURL, ownerId: api.session.user_id, passphrase: state.connection.recordingPassphrase });
    if (ticket !== epoch) { unlocked.lock(); throw stopped(); }
    vault = unlocked; state.connection.recordingPassphrase = '';
    const manifests = await vault.listRecordings(); valid(ticket); state.recoveries = manifests;
  }
  function stageDraft() {
    if (!dirty || state.mode !== 'connected' || !vault?.unlocked || !state.draft) return;
    clearTimeout(draftSaveTimer);
    const note = copy(state.draft); const destination = vault;
    draftSaveTimer = setTimeout(() => {
      draftSaveChain = draftSaveChain.then(() => destination.saveDraft(note)).catch(() => {
        if (!state.locked) notice('Local draft recovery could not be saved. Save the note to the clinic server before leaving.', 'error');
      });
    }, 250);
  }
  function makeRecorder(ticket) {
    const persistence = Object.fromEntries(['saveChunk', 'loadChunk', 'saveManifest', 'deleteRecording'].map(method => [method, (...args) => {
      if (!vault?.unlocked) throw new Error('Unlock local recording recovery first.');
      return vault[method](...args);
    }]));
    const finalSegments = new Map();
    return new OrthoRecorder({ api, persistence,
      onStatus: status => {
        if (ticket !== epoch || destroyed) return;
        const mapped = { connecting: 'uploading', recording: 'recording', paused: 'paused', syncing: 'uploading', stopped: 'paused', error: 'paused' };
        if (mapped[status.state]) state.recording.status = mapped[status.state];
        state.recording.connection = status.message || status.state || '';
        state.recording.elapsed = status.elapsedSeconds ?? state.recording.elapsed;
        state.recording.saved = status.nextSequence ?? state.recording.saved;
        state.recording.uploaded = Math.max(0, (status.acknowledgedSequence ?? -1) + 1);
        state.recording.needsInterruptionReview = Boolean(status.needsInterruptionReview);
        state.recording.interruptionMessage = status.interruptionMessage || '';
        emit();
      },
      onTranscript: (segments, isFinal) => {
        if (ticket !== epoch || destroyed) return;
        if (isFinal) for (const segment of segments) finalSegments.set(segment.id, segment);
        const interim = isFinal ? [] : segments;
        state.recording.segments = [...finalSegments.values(), ...interim]; emit();
      },
      onError: error => {
        if (ticket === epoch && !destroyed) { state.recording.status = 'paused'; state.recording.warning = error.message || String(error); emit(); }
      },
    });
  }
  async function loadNotes(ticket) {
    requireConnected();
    const f = state.filters;
    const page = await api.request('notes', { query: { query: f.query, appointment_type: f.appointment_type, date_from: f.date_from, date_to: f.date_to, limit: 100 } });
    valid(ticket); state.notes = page.items; emit();
  }
  async function openNote(id, ticket) {
    let note;
    if (state.mode === 'demo') note = state.notes.find(item => item.id === id);
    else { requireConnected(); note = await api.request(`notes/${id}`); valid(ticket); }
    if (!note) throw new Error('The note could not be found.');
    state.draft = copy(note); dirty = false; state.editorTab = 'note'; state.screen = 'editor';
    if (state.mode === 'connected' && vault?.unlocked && note.status === 'draft') {
      const recovered = await vault.loadDraft(note.id); valid(ticket);
      if (recovered?.version === note.version) { state.draft = recovered; dirty = true; notice('Recovered your unsaved local draft.'); }
      else if (recovered) notice('A local draft uses an older server version. The current server note is shown; encrypted recovery has been retained.', 'warning');
    }
    emit();
  }
  async function saveDraft(ticket) {
    if (!state.draft || state.draft.status !== 'draft') throw new Error('Open an editable draft first.');
    const draft = copy(state.draft); let result;
    if (state.mode === 'demo') {
      const stored = state.notes.find(item => item.id === draft.id);
      if (stored && stored.version !== draft.version) throw new Error('The note has changed. Open its current version.');
      result = { ...draft, version: draft.version + 1, updated_at: new Date().toISOString(), email_status: null };
    } else {
      requireConnected();
      const body = Object.fromEntries(EDITABLE_FIELDS.map(key => [key, draft[key]])); body.expected_version = draft.version;
      result = await api.request(`notes/${draft.id}`, { method: 'PATCH', body }); valid(ticket);
    }
    state.draft = result; upsert(result); dirty = false; clearTimeout(draftSaveTimer);
    await draftSaveChain;
    if (vault?.unlocked) await vault.deleteDraft(result.id).catch(() => {});
    valid(ticket); return result;
  }
  async function emailNote(ticket) {
    const note = state.draft;
    if (!note || !['approved','email_pending','sent'].includes(note.status)) throw new Error('Approve the final chart text before sending.');
    if (!state.settings.email_address.trim()) throw new Error('Set the chart-note email address in Settings first.');
    if (state.mode === 'demo') {
      state.draft = { ...note, email_status: 'demo_only' }; upsert(state.draft);
      notice('Demo delivery simulated. No email was sent. The final chart text is available to copy.', 'success');
      return;
    }
    requireConnected();
    const sent = await api.request(`notes/${note.id}/email`, { method: 'POST', body: { expected_version: note.version } });
    valid(ticket); state.draft = sent; upsert(sent);
    notice(sent.email_status === 'accepted' ? 'The clinic mail server accepted this note.' : 'Email is queued. Refresh this note to check its status.', 'success');
  }
  async function pollGeneration(id, ticket) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await delay(1500); valid(ticket);
      const note = await api.request(`notes/${id}`); valid(ticket); upsert(note);
      if (state.draft?.id === id && !dirty) state.draft = copy(note);
      if (note.status !== 'processing') {
        if (note.status === 'failed') notice(note.last_error || 'Generation failed. The recording is retained for retry.', 'error');
        else {
          state.recording.status = 'idle'; activeNote = null;
          await vault?.deleteRecording(id); valid(ticket);
          state.recoveries = state.recoveries.filter(item => item.note_id !== id);
          notice('Draft ready. Verify the speakers and clinical statements before approval.', 'success');
        }
        emit(); return;
      }
      emit();
    }
    notice('The server is still processing. Return through Recent Notes and refresh the note.', 'info');
  }
  function startPolling(id, ticket) {
    pollGeneration(id, ticket).catch(error => { if (ticket === epoch && error?.name !== 'AbortError') notice(error.message, 'error'); });
  }
  async function beginRecording(ticket, recoveryId = null) {
    if (state.recording.status !== 'idle') throw new Error('Finish the active appointment first.');
    state.notice = null;
    if (state.mode === 'demo') {
      demoSample = sampleFor(state.selection);
      state.recording = { status: 'recording', elapsed: 0, segments: copy(demoSample.transcript.slice(0, 1)), connection: 'Fictional sample playback', warning: '', saved: 0, uploaded: 0 };
      state.screen = 'recording'; lastTick = Date.now(); emit(); return;
    }
    requireConnected();
    if (!state.policyAcknowledged) throw new Error('Acknowledge the recording policy and obtain consent before recording.');
    recorder = makeRecorder(ticket);
    try {
      recorder.arm();
      await ensureVault(ticket); valid(ticket);
      let manifest = null;
      if (recoveryId) {
        activeNote = await api.request(`notes/${recoveryId}`); valid(ticket);
        manifest = await vault.loadManifest(recoveryId); valid(ticket);
        if (!manifest) throw new Error('No encrypted recording manifest was found.');
        if (activeNote.status !== 'recording') throw new Error('This recording has already reached generation. Open the note to refresh or retry it.');
        state.selection = activeNote.appointment_type;
      } else {
        activeNote = await api.request('notes', { method: 'POST', body: { appointment_type: state.selection, template_id: chosenTemplate().id, patient_name: '', patient_reference: '', consent_confirmed: true } });
        valid(ticket);
      }
      state.recording = { status: 'recording', elapsed: 0, segments: [], connection: 'Connecting', warning: '', saved: 0, uploaded: 0 };
      state.screen = 'recording'; upsert(activeNote); emit();
      await recorder.start(activeNote.id, manifest ? { manifest } : undefined); valid(ticket);
    } catch (error) {
      await recorder?.dispose(); recorder = null;
      if (ticket === epoch) {
        state.recording.status = 'idle'; state.screen = 'home';
        if (vault?.unlocked) state.recoveries = await vault.listRecordings();
      }
      throw error;
    }
  }
  async function endRecording(ticket) {
    if (!['recording','paused'].includes(state.recording.status)) throw new Error('Start an appointment first.');
    if (state.mode === 'connected') requireConnected();
    state.recording.status = 'uploading'; emit();
    if (state.mode === 'demo') {
      const note = createDemoNote(state.selection, chosenTemplate(), state.recording.segments, new Date(), state.settings);
      upsert(note); state.draft = note; state.screen = 'editor'; state.editorTab = 'note'; dirty = false;
      state.recording.status = 'idle'; demoSample = null;
      notice('Demo draft created from the sample segments shown. No AI service was called.', 'success'); return;
    }
    try {
      const completed = await recorder.stop(); valid(ticket);
      const note = await api.request(`notes/${activeNote.id}/generate`, { method: 'POST', body: { expected_version: activeNote.version, audio_chunk_count: completed.audio_chunk_count } });
      valid(ticket); await recorder.dispose(); recorder = null; valid(ticket);
      state.draft = note; upsert(note); state.screen = 'editor'; dirty = false;
      state.recording.status = 'idle'; startPolling(note.id, ticket); emit();
    } catch (error) {
      valid(ticket);
      // A response can be lost after the server accepted generation. Read status
      // before offering another attempt so a delayed response cannot duplicate it.
      const current = await api.request(`notes/${activeNote.id}`).catch(() => null); valid(ticket);
      if (current && current.status !== 'recording') {
        await recorder?.dispose(); recorder = null; valid(ticket);
        state.draft = current; upsert(current); state.screen = 'editor'; dirty = false; state.recording.status = 'idle';
        if (current.status === 'processing') { startPolling(current.id, ticket); notice('The server accepted this recording. Waiting for its draft.'); return; }
        if (current.status === 'draft') {
          await vault?.deleteRecording(current.id); valid(ticket); activeNote = null;
          notice('Draft ready. Verify the speakers and clinical statements before approval.', 'success'); return;
        }
      } else {
        if (current) activeNote = current;
        state.recording.status = 'paused';
        state.recording.warning = 'The saved recording is retained. Review the message and retry End Recording.';
      }
      throw error;
    }
  }
  async function retryGeneration(id, ticket) {
    requireConnected(); await ensureVault(ticket); valid(ticket);
    const note = await api.request(`notes/${id}`); valid(ticket);
    const manifest = await vault.loadManifest(id); valid(ticket);
    if (note.status === 'processing') { state.draft = note; state.screen = 'editor'; startPolling(id, ticket); return; }
    if (note.status !== 'failed' || !manifest?.ended || !manifest.next_sequence || manifest.acknowledged_sequence !== manifest.next_sequence - 1) throw new Error('A fully uploaded ended recording and failed generation are required for retry.');
    const result = await api.request(`notes/${id}/generate`, { method: 'POST', body: { expected_version: note.version, audio_chunk_count: manifest.next_sequence } });
    valid(ticket); state.draft = result; upsert(result); state.screen = 'editor'; startPolling(id, ticket);
  }
  function setField(path, value) {
    const parts = String(path).split('.');
    if (parts.some(part => ['__proto__','prototype','constructor'].includes(part))) return;
    const allowedRoots = new Set(['draft','settings','connection','filters','templateDraft','editorTab','policyAcknowledged','selectedTemplateId']);
    if (!allowedRoots.has(parts[0])) return;
    if (parts[0] === 'connection' && !['endpoint','appleClientId','appleRedirectUri','recordingPassphrase'].includes(parts[1])) return;
    if (parts[0] === 'draft') {
      if (state.draft?.status !== 'draft' || !EDITABLE_FIELDS.includes(parts[1])) return;
      dirty = true;
    }
    let target = state;
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== 'object') return;
      target = target[part];
    }
    if (path.startsWith('settings.default_templates.') && value === '') delete target[parts.at(-1)];
    else target[parts.at(-1)] = value;
    if (path.startsWith('connection.') && path !== 'connection.recordingPassphrase') state.connection.readyForApple = false;
    if (path.startsWith('draft.')) stageDraft();
    if (path.startsWith('filters.') && state.mode === 'connected' && api?.hasSession) {
      clearTimeout(searchTimer); const ticket = epoch;
      searchTimer = setTimeout(() => loadNotes(ticket).catch(error => { if (ticket === epoch) notice(error.message, 'error'); }), 350);
    }
    emit();
  }
  async function lockWorkspace() {
    if (state.locked) return;
    state.locked = true; state.busy = false; epoch += 1; state.dialog = null; emit();
    if (state.mode === 'demo') { if (state.recording.status === 'recording') state.recording.status = 'paused'; return; }
    const pendingDraft = dirty && state.draft && vault?.unlocked ? copy(state.draft) : null;
    clearTimeout(draftSaveTimer); state.draft = null; state.notes = []; state.templates = copy(BUILTIN_TEMPLATES);
    const idle = state.settings.inactivity_seconds; state.settings = { ...copy(DEFAULT_SETTINGS), inactivity_seconds: idle };
    state.connection.authenticated = false; state.connection.readyForApple = false; state.connection.recordingPassphrase = '';
    state.recording.segments = []; state.recording.status = 'idle'; state.recoveries = []; activeNote = null; emit();
    await recorder?.pause().catch(() => {}); await recorder?.dispose(); recorder = null;
    await draftSaveChain;
    if (pendingDraft) await vault?.saveDraft(pendingDraft).catch(() => {});
    vault?.lock(); vault = null;
    await api?.logout().catch(() => {}); api?.clearSession();
  }
  function confirm(title, message, action, destructive = false, confirmLabel = 'Confirm') {
    state.dialog = { type: 'confirm', title, message, action, destructive, confirmLabel }; emit();
  }
  async function dispatch(action) {
    lastActivity = Date.now();
    if (state.locked && !['UNLOCK','DISMISS_NOTICE'].includes(action.type)) return;
    if (action.type === 'SET_FIELD') { setField(action.path, action.value); return; }
    if (action.type === 'DISMISS_NOTICE') { state.notice = null; emit(); return; }
    if (action.type === 'CLOSE_DIALOG') { state.dialog = null; state.templateDraft = null; emit(); return; }
    if (action.type === 'UNLOCK') { state.locked = false; state.screen = state.mode === 'connected' ? 'settings' : state.screen; notice(state.mode === 'connected' ? 'Sign in again to open the clinic workspace.' : 'Demo workspace reopened.'); return; }
    if (action.type === 'LOCK') { await lockWorkspace(); return; }
    if (action.type === 'NAVIGATE') {
      if (action.screen === 'recording' && state.recording.status !== 'idle') { state.screen = 'recording'; emit(); return; }
      if (!['home','notes','templates','settings'].includes(action.screen)) return;
      if (state.recording.status !== 'idle') { state.screen = 'recording'; notice('End this appointment before leaving the recording screen.'); return; }
      if (dirty && state.draft && !action.confirmed) {
        confirm('Leave this draft?', 'Save your changes first, or leave this editor. Connected local recovery requires an unlocked recording vault.', { ...action, confirmed: true }, false, 'Leave Editor'); return;
      }
      state.dialog = null; state.screen = action.screen; state.draft = null; dirty = false; emit();
      if (state.mode === 'connected' && action.screen === 'notes' && api?.hasSession) await run(loadNotes);
      return;
    }
    if (action.type === 'SELECT_APPOINTMENT') {
      if (state.recording.status === 'idle' && APPOINTMENTS.some(t => t.id === action.value)) { state.selection = action.value; state.selectedTemplateId = ''; emit(); }
      return;
    }
    if (action.type === 'SET_MODE') {
      if (!['demo','connected'].includes(action.value) || action.value === state.mode) return;
      if (action.value === 'connected' && !available) { notice(state.connection.blockedReason, 'warning'); return; }
      if (state.recording.status !== 'idle') { notice('End the active recording before changing workspace.', 'warning'); return; }
      if (!action.confirmed) { confirm('Change workspace?', 'Unsaved changes in the current editor will be closed.', { ...action, confirmed: true }, false, 'Change Workspace'); return; }
      epoch += 1; state.busy = false; state.dialog = null;
      if (state.mode === 'demo') demoWorkspace = { notes: copy(state.notes), settings: copy(state.settings), templates: copy(state.templates) };
      api?.clearSession(); vault?.lock(); vault = null; state.mode = action.value; state.draft = null; dirty = false;
      state.connection.authenticated = false; state.connection.readyForApple = false; state.connection.recordingPassphrase = '';
      const workspace = action.value === 'demo' && demoWorkspace ? demoWorkspace : { notes: [], templates: copy(BUILTIN_TEMPLATES), settings: copy(DEFAULT_SETTINGS) };
      Object.assign(state, copy(workspace)); state.screen = 'settings'; emit(); return;
    }
    if (action.type === 'REBUILD_CHART' && !action.confirmed) {
      confirm('Rebuild from extracted sections?', 'This replaces manual text edits with the original evidence-linked sections in this note\'s saved format. Save a copy of edits before continuing.', { ...action, confirmed: true }, false, 'Rebuild Text'); return;
    }
    if (action.type === 'DELETE_NOTE' && !action.confirmed) { confirm('Delete this note?', 'This removes the note from this workspace.', { ...action, confirmed: true }, true, 'Delete Note'); return; }
    if (action.type === 'DELETE_TEMPLATE' && !action.confirmed) { confirm('Delete this template?', 'Existing notes retain their original headings.', { ...action, confirmed: true }, true, 'Delete Template'); return; }
    if (action.type === 'EDIT_NOTE_VERSION' && !action.confirmed) { confirm('Create an editable version?', 'This invalidates approval. Any previously submitted email remains unchanged.', { ...action, confirmed: true }, false, 'Edit New Version'); return; }
    await run(async ticket => {
      if (state.dialog?.type === 'confirm') state.dialog = null;
      switch (action.type) {
        case 'TRY_SAMPLE': {
          if (state.mode !== 'demo') throw new Error('Sample appointments are available in the demo workspace.');
          const note = createDemoNote(state.selection, chosenTemplate(), null, new Date(), state.settings); upsert(note); state.draft = note; dirty = false; state.editorTab = 'note'; state.screen = 'editor';
          notice('Fictional sample loaded. Review the speakers and uncertainty before approval.'); break;
        }
        case 'START_RECORDING': await beginRecording(ticket); break;
        case 'RECOVER_RECORDING': await beginRecording(ticket, action.id); break;
        case 'PAUSE_RECORDING':
          if (state.mode === 'connected') await recorder?.pause(); valid(ticket); state.recording.status = 'paused'; break;
        case 'RESUME_RECORDING':
          if (state.mode === 'connected') { requireConnected(); await recorder?.resume(); valid(ticket); }
          state.recording.status = 'recording'; lastTick = Date.now(); break;
        case 'ACKNOWLEDGE_INTERRUPTION':
          if (state.mode === 'connected') { requireConnected(); await recorder?.acknowledgeInterruption(); valid(ticket); }
          state.recording.needsInterruptionReview = false; break;
        case 'END_RECORDING': await endRecording(ticket); break;
        case 'OPEN_NOTE': await openNote(action.id, ticket); break;
        case 'REFRESH_NOTE': if (state.draft) await openNote(state.draft.id, ticket); break;
        case 'RETRY_GENERATION': await retryGeneration(action.id || state.draft?.id, ticket); break;
        case 'SAVE_NOTE': await saveDraft(ticket); notice(state.mode === 'demo' ? 'Demo note saved for this browser session.' : 'Note saved to the clinic server.', 'success'); break;
        case 'APPROVE_NOTE': {
          const problems = approvalProblems(state.draft); if (problems.length) throw new Error(problems.join(' '));
          let note = dirty ? await saveDraft(ticket) : state.draft; valid(ticket);
          if (state.mode === 'demo') note = { ...note, status: 'approved', version: note.version + 1, updated_at: new Date().toISOString() };
          else { note = await api.request(`notes/${note.id}/approve`, { method: 'POST', body: { expected_version: note.version } }); valid(ticket); }
          state.draft = note; upsert(note); dirty = false;
          notice((state.mode === 'demo' && state.settings.auto_email) || note.status === 'email_pending' ? 'Note approved; delivery requested.' : 'Final note approved.', 'success');
          if (state.mode === 'demo' && state.settings.auto_email) await emailNote(ticket);
          break;
        }
        case 'EMAIL_NOTE': await emailNote(ticket); break;
        case 'EDIT_NOTE_VERSION': {
          const note = state.draft;
          if (!note || !['approved','sent'].includes(note.status) || note.email_status === 'unknown') throw new Error('Delivery must be resolved before creating an edited version.');
          let result;
          if (state.mode === 'demo') result = { ...note, status: 'draft', version: note.version + 1, email_status: null };
          else { result = await api.request(`notes/${note.id}`, { method: 'PATCH', body: { expected_version: note.version, final_text: note.final_text } }); valid(ticket); }
          state.draft = result; upsert(result); dirty = false; break;
        }
        case 'DELETE_NOTE':
          if (state.mode === 'connected') { requireConnected(); await api.request(`notes/${action.id}`, { method: 'DELETE' }); valid(ticket); }
          clearTimeout(draftSaveTimer); await draftSaveChain;
          if (vault?.unlocked) { await vault.deleteDraft(action.id); await vault.deleteRecording(action.id); valid(ticket); }
          state.recoveries = state.recoveries.filter(item => item.note_id !== action.id);
          state.notes = state.notes.filter(note => note.id !== action.id); state.draft = null; state.screen = 'notes'; dirty = false; notice('Note deleted.'); break;
        case 'APPLY_SIGNOFF':
          if (state.draft?.status !== 'draft') throw new Error('Open an editable draft first.');
          state.draft.final_text = appendSignoff(state.draft.final_text, state.draft.chart_style || state.settings);
          dirty = true; stageDraft(); break;
        case 'REBUILD_CHART':
          if (state.draft?.status !== 'draft') throw new Error('Open an editable draft first.');
          state.draft.final_text = renderChartNote(state.draft.sections, state.draft.chart_style || state.settings);
          dirty = true; stageDraft(); notice('Chart text rebuilt. Review it before approval.'); break;
        case 'COPY_NOTE':
          if (!state.draft?.final_text) throw new Error('Open a note with final chart text first.');
          if (!environment.navigator?.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Select the chart text and use Copy.');
          await environment.navigator.clipboard.writeText(state.draft.final_text); valid(ticket); notice('Final chart text copied.', 'success'); break;
        case 'NEW_TEMPLATE':
          state.notice = null;
          state.templateDraft = { title: '', appointment_type: state.selection, sections: ['Date','Clinical Findings','Treatment Performed','Instructions Given','Next Steps'], is_builtin: false };
          state.dialog = { type: 'template', title: 'New Template' }; break;
        case 'EDIT_TEMPLATE': {
          state.notice = null;
          const template = state.templates.find(item => item.id === action.id); if (!template) throw new Error('Template not found.');
          state.templateDraft = copy(template); if (template.is_builtin) state.templateDraft.title = `${template.title} Copy`;
          state.dialog = { type: 'template', title: template.is_builtin ? 'Customize Template' : 'Edit Template' }; break;
        }
        case 'SAVE_TEMPLATE': {
          const draft = validateTemplate(state.templateDraft); const existing = draft.id && !draft.is_builtin;
          const body = { title: draft.title, appointment_type: draft.appointment_type, sections: draft.sections };
          let template;
          if (state.mode === 'demo') template = { ...body, id: existing ? draft.id : newID(), is_builtin: false, version: existing ? draft.version + 1 : 1 };
          else {
            requireConnected(); if (existing) body.expected_version = draft.version;
            template = await api.request(existing ? `templates/${draft.id}` : 'templates', { method: existing ? 'PUT' : 'POST', body }); valid(ticket);
          }
          state.templates = state.templates.filter(item => item.id !== template.id).concat(template);
          state.templateDraft = null; state.dialog = null; notice('Template saved.', 'success'); break;
        }
        case 'DELETE_TEMPLATE': {
          const template = state.templates.find(item => item.id === action.id); if (template?.is_builtin) throw new Error('Built-in templates remain available. Customize a copy.');
          if (state.mode === 'connected') { requireConnected(); await api.request(`templates/${action.id}`, { method: 'DELETE' }); valid(ticket); }
          state.templates = state.templates.filter(item => item.id !== action.id);
          for (const [type,id] of Object.entries(state.settings.default_templates)) if (id === action.id) delete state.settings.default_templates[type];
          notice('Template deleted.'); break;
        }
        case 'ADD_TEMPLATE_SECTION': if (state.templateDraft?.sections.length < 30) { state.templateDraft.sections.push(''); state.dialog = { type: 'template' }; } break;
        case 'REMOVE_TEMPLATE_SECTION':
          if (state.templateDraft?.sections.length > 1) state.templateDraft.sections.splice(Number(action.index), 1);
          state.dialog = { type: 'template' }; break;
        case 'MOVE_TEMPLATE_SECTION': {
          const items = state.templateDraft?.sections; const from = Number(action.from), to = Number(action.to);
          if (items && from >= 0 && to >= 0 && from < items.length && to < items.length) items.splice(to, 0, items.splice(from, 1)[0]);
          state.dialog = { type: 'template' }; break;
        }
        case 'SAVE_SETTINGS': {
          const settings = normalizeSettings(state.settings);
          settings.macros = settings.macros.filter(macro => macro.name.trim() && macro.text.trim()).map(macro => ({ ...macro, name: macro.name.trim(), text: macro.text.trim() }));
          if (state.mode === 'connected') { requireConnected(); const saved = await api.request('settings', { method: 'PUT', body: settings }); valid(ticket); state.settings = saved; }
          else state.settings = settings;
          notice(state.mode === 'demo' ? 'Demo settings saved for this session. Refreshing resets them.' : 'Settings saved.', 'success'); break;
        }
        case 'ADD_PHRASE': if (state.settings.signature_phrases.length < 100) state.settings.signature_phrases.push(''); break;
        case 'REMOVE_PHRASE': state.settings.signature_phrases.splice(Number(action.index), 1); break;
        case 'ADD_MACRO': if (state.settings.macros.length < 100) state.settings.macros.push({ id: newID(), name: '', text: '' }); break;
        case 'REMOVE_MACRO': state.settings.macros.splice(Number(action.index), 1); break;
        case 'INSERT_PHRASE': case 'INSERT_MACRO': {
          if (state.draft?.status !== 'draft') throw new Error('Open an editable draft first.');
          const text = action.type === 'INSERT_PHRASE' ? state.settings.signature_phrases[Number(action.index)] : state.settings.macros.find(m => m.id === action.id)?.text;
          if (text) {
            const style = state.draft.chart_style || state.settings;
            const body = stripSignoff(state.draft.final_text, style);
            state.draft.final_text = appendSignoff([body, text].filter(Boolean).join('\n\n'), style);
            dirty = true; stageDraft();
          } break;
        }
        case 'CONNECT': {
          if (!available) throw new Error(state.connection.blockedReason);
          if (state.mode !== 'connected') throw new Error('Select Connected clinic first.');
          if (api?.hasSession) throw new Error('Sign out before changing the clinic connection.');
          api = new APIClient({ baseURL: state.connection.endpoint, allowConnected: true, onUnauthorized: () => { if (!state.locked) void lockWorkspace(); } });
          await api.health(); valid(ticket);
          await api.prepareAppleSignIn({ clientId: state.connection.appleClientId, redirectURI: state.connection.appleRedirectUri }); valid(ticket);
          state.connection.readyForApple = true; notice('Clinic connection prepared. Tap Sign in with Apple.'); break;
        }
        case 'APPLE_LOGIN': {
          if (!available || !api?.appleSignInReady) throw new Error('Prepare the clinic connection first.');
          let session;
          appleLoginInProgress = true;
          try { session = await api.signInWithApple(); valid(ticket); }
          finally { appleLoginInProgress = false; }
          state.connection.authenticated = true; state.connection.readyForApple = false;
          const [settings,templates,notes] = await Promise.all([api.request('settings'),api.request('templates'),api.request('notes',{query:{limit:100}})]); valid(ticket);
          state.settings = settings; state.templates = templates; state.notes = notes.items;
          if (state.connection.recordingPassphrase.length >= 12) await ensureVault(ticket);
          valid(ticket); state.screen = 'home'; notice('Signed in. Confirm consent before each appointment.', 'success');
          if (!session.user_id) throw new Error('The clinic session is incomplete.');
          break;
        }
        case 'DISCONNECT':
          await lockWorkspace(); state.locked = false; state.screen = 'settings'; emit(); break;
        default: break;
      }
    });
  }
  function tick(now = Date.now()) {
    const delta = Math.max(0, Math.min(2, (now - lastTick) / 1000)); lastTick = now;
    if (destroyed || state.locked) return;
    if (state.mode === 'demo' && state.recording.status === 'recording' && demoSample) {
      state.recording.elapsed += delta;
      const count = Math.min(demoSample.transcript.length, 1 + Math.floor(state.recording.elapsed / 3));
      state.recording.segments = copy(demoSample.transcript.slice(0, count));
      if (state.recording.elapsed >= demoSample.transcript.length * 3) {
        state.recording.status = 'paused'; state.recording.warning = 'The sample conversation is complete. Tap End Recording to review its draft.';
      }
      emit();
    }
    if (state.recording.status !== 'recording' && now - lastActivity >= state.settings.inactivity_seconds * 1000) void lockWorkspace();
  }
  async function onHidden() {
    // Apple's sign-in popup can hide the originating iPhone tab. At this point
    // no clinic session or patient content exists. Explicit Lock still cancels it.
    if (appleLoginInProgress && !api?.hasSession && !state.connection.authenticated) return;
    if (state.mode === 'connected') await lockWorkspace();
    else if (state.recording.status === 'recording') { state.recording.status = 'paused'; state.recording.warning = 'Sample playback paused after leaving the app.'; emit(); }
  }
  function destroy() {
    destroyed = true; epoch += 1; clearTimeout(draftSaveTimer); clearTimeout(searchTimer);
    void recorder?.dispose(); api?.clearSession(); vault?.lock();
  }
  emit();
  return { dispatch, tick, onHidden, destroy, getState: () => copy(state), activity: () => { lastActivity = Date.now(); } };
}
