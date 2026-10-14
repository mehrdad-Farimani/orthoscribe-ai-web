import { BUILTIN_TEMPLATES } from './data.js';
import { newTestAPI, generateTestKey, PracticeRecorder, TEST_LIMITS, chartFromClaims, draftCanBeCopied } from './ai-test-core.js';

const $ = id => document.getElementById(id);
const api = newTestAPI();
let connected = false, busy = false, operation = 0, audioBlob = null, audioURL = '', result = null;
let sourceTranscript = '', lastActivity = Date.now(), ignoreCapture = false;
const recorder = new PracticeRecorder({onStopped: receiveRecording, onTick: seconds => {
  $('elapsed').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}});
const SAMPLE = `Doctor: This is a fictional practice appointment. The patient reports no discomfort. We retied the upper wire today. We did not change the lower wire.
Assistant: Oral hygiene instructions were reviewed.
Doctor: Next visit, check elastic wear in 6 weeks. At the visit after that, take progress photos.`;
for (const template of BUILTIN_TEMPLATES) {
  const option = document.createElement('option'); option.value = template.appointment_type; option.textContent = template.title;
  $('appointment').append(option);
}
$('appointment').value = 'progress';
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function update() {
  const capturing = recorder.state !== 'idle';
  const ready = connected && !busy && !capturing && $('fictional').checked;
  $('connection-status').textContent = connected ? 'Test Worker connected' : 'Not connected';
  $('connect').disabled = busy || capturing || connected;
  $('disconnect').disabled = !connected && !busy && !capturing;
  $('worker-url').disabled = busy || connected || capturing;
  $('access-key').disabled = busy || connected || capturing;
  $('make-key').disabled = busy || connected || capturing;
  $('copy-key').disabled = !$('access-key').value || busy || capturing;
  $('start').disabled = !ready;
  $('stop').disabled = recorder.state !== 'recording';
  $('transcribe').hidden = !audioBlob;
  $('transcribe').disabled = !ready || !audioBlob;
  $('generate').disabled = !ready || !$('transcript-reviewed').checked || $('transcript').value.trim().length < 15;
  for (const id of ['appointment', 'signoff', 'transcript', 'transcript-reviewed', 'sample']) $(id).disabled = busy || capturing;
  $('note').disabled = busy || !result;
  $('final-reviewed').disabled = busy || !result;
  $('flags-reviewed').disabled = busy || !result;
  $('copy').disabled = busy || !draftCanBeCopied({text: $('note').value, sourceTranscript, currentTranscript: $('transcript').value,
    finalReviewed: $('final-reviewed').checked, flagsReviewed: $('flags-reviewed').checked, result});
  $('count').textContent = `${$('transcript').value.length} / ${TEST_LIMITS.textChars} characters`;
  $('record-status').textContent = recorder.state === 'recording' ? 'Recording practice audio' : recorder.state === 'requesting' ? 'Waiting for microphone permission' : recorder.state === 'stopping' ? 'Finishing recording' : 'Microphone off';
  document.querySelector('.recordbox').classList.toggle('live', recorder.state === 'recording');
}
function revokeAudio() { if (audioURL) URL.revokeObjectURL(audioURL); audioURL = ''; audioBlob = null; $('playback').pause(); $('playback').removeAttribute('src'); $('playback').hidden = true; }
function invalidateDraft(text = 'Generate a draft after reviewing the transcript.') {
  result = null; sourceTranscript = ''; $('note').value = ''; $('final-reviewed').checked = false; $('flags-reviewed').checked = false;
  $('flags').hidden = true; $('flag-list').replaceChildren(); $('evidence').replaceChildren(); $('evidence-panel').hidden = true;
  $('draft-status').textContent = text;
}
async function clearSession(disconnect = false, text = 'Practice session cleared. Nothing is saved by the app.') {
  operation++; api.cancel(); ignoreCapture = true; busy = true;
  if (disconnect) { api.disconnect(); connected = false; $('access-key').value = ''; }
  update(); await recorder.stop('cleared');
  revokeAudio(); $('transcript').value = ''; $('transcript-reviewed').checked = false; $('fictional').checked = false;
  $('elapsed').textContent = '00:00'; invalidateDraft(); busy = false; message(text); update();
}
async function run(label, task, apply) {
  const serial = ++operation; busy = true; message(label); update();
  try { const data = await task(); if (serial === operation) apply(data); }
  catch (error) { if (serial === operation) message(error.message, true); }
  finally { if (serial === operation) { busy = false; update(); } }
}
function receiveRecording(captured) {
  if (ignoreCapture) return;
  revokeAudio();
  if (captured.blob?.size >= 100) {
    audioBlob = captured.blob; audioURL = URL.createObjectURL(audioBlob); $('playback').src = audioURL; $('playback').hidden = false;
  }
  if (captured.error) message(captured.error, true);
  else if (captured.reason !== 'ended') message('Recording stopped or was interrupted. No audio was uploaded. Review playback, then choose Transcribe captured recording.', true);
  else if (!audioBlob) message('The recording is empty. Try again or paste a fictional transcript.', true);
  update();
}
async function transcribe() {
  if (!audioBlob || !connected || busy || !$('fictional').checked) return;
  const current = audioBlob;
  await run('Transcribing practice audio through Cloudflare and Groq…', () => api.transcribe(current, true), data => {
    $('transcript').value = data.transcript; $('transcript-reviewed').checked = false; invalidateDraft();
    message(['Transcript ready. Review it before generating a note.', ...(Array.isArray(data.warnings) ? data.warnings : [])].join(' '));
    $('transcript').focus();
  });
}
function showDraft(data, transcript, template, signoff) {
  const note = chartFromClaims(data, template, signoff);
  if (!note.trim()) throw new Error('No draft text could be rendered.');
  result = data; sourceTranscript = transcript; $('note').value = note;
  $('final-reviewed').checked = false; $('flags-reviewed').checked = false;
  const flags = [...data.concerns, ...data.claims.filter(claim => claim.uncertain).map(claim => `Uncertain statement: ${claim.text}`)];
  $('flag-list').replaceChildren();
  for (const flag of flags) { const item = document.createElement('li'); item.textContent = String(flag); $('flag-list').append(item); }
  $('flags').hidden = flags.length === 0;
  $('evidence').replaceChildren();
  for (const claim of data.claims) {
    const article = document.createElement('article'), title = document.createElement('strong'), text = document.createElement('p'), quote = document.createElement('blockquote');
    title.textContent = claim.heading; text.textContent = claim.text; quote.textContent = claim.quote;
    article.append(title, text, quote); $('evidence').append(article);
  }
  $('evidence-panel').hidden = false;
  $('draft-status').textContent = 'Draft generated by Groq. Exact-quote, numeric and second-pass meaning checks completed. Check for omissions and mistakes yourself.';
  message('Draft ready for review. Compare every statement to the transcript before copying.');
  $('note').disabled = false; $('note').focus();
}
$('connect').addEventListener('click', () => run('Checking the test Worker configuration…', () => api.connect($('worker-url').value, $('access-key').value), () => {
  connected = true; $('access-key').value = ''; $('setup').open = false; message('Worker connected. Only an actual AI request verifies Groq access. Confirm fictional content to begin.');
}));
$('disconnect').addEventListener('click', () => { void clearSession(true, 'Disconnected. Practice content and the test access key were cleared.'); });
$('clear').addEventListener('click', () => { void clearSession(); });
$('make-key').addEventListener('click', () => { $('access-key').value = generateTestKey(); message('Random test key generated. Copy it into the Cloudflare TEST_ACCESS_KEY secret and save it in your password manager.'); update(); });
$('copy-key').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('access-key').value); message('Test access key copied. Set it as TEST_ACCESS_KEY in Cloudflare, not in GitHub.'); }
  catch { message('Clipboard unavailable. Select and copy the test key from the field manually.', true); }
});
$('access-key').addEventListener('input', update);
$('start').addEventListener('click', async () => {
  if (!connected || busy || !$('fictional').checked) return;
  ignoreCapture = false; invalidateDraft(); $('transcript').value = ''; $('transcript-reviewed').checked = false; revokeAudio(); $('elapsed').textContent = '00:00';
  const starting = recorder.start(); update();
  try { if (await starting) message('Recording fictional practice audio. End the recording to transcribe it.'); }
  catch (error) { message(error.message, true); }
  update();
});
$('stop').addEventListener('click', async () => {
  const stopping = recorder.stop('ended'); update(); const capture = await stopping;
  if (capture?.reason === 'ended' && !document.hidden && !ignoreCapture) await transcribe();
});
$('transcribe').addEventListener('click', () => { void transcribe(); });
$('sample').addEventListener('click', () => {
  $('transcript').value = SAMPLE; $('transcript-reviewed').checked = false; invalidateDraft();
  message('Fictional example loaded locally. Nothing was sent. Review the text and connect your Worker to generate a real AI draft.'); update();
});
$('transcript').addEventListener('input', () => { $('transcript-reviewed').checked = false; invalidateDraft('Transcript changed. Regenerate the draft after reviewing it.'); update(); });
for (const id of ['appointment', 'signoff']) $(id).addEventListener('change', () => { invalidateDraft('Appointment or sign-off changed. Generate a new draft.'); update(); });
$('fictional').addEventListener('change', () => {
  if (!$('fictional').checked) { operation++; api.cancel(); busy = false; void recorder.stop('consent_withdrawn'); $('transcript-reviewed').checked = false; }
  update();
});
for (const id of ['transcript-reviewed', 'flags-reviewed', 'final-reviewed']) $(id).addEventListener('change', update);
$('note').addEventListener('input', () => { $('final-reviewed').checked = false; $('flags-reviewed').checked = false; update(); });
$('generate').addEventListener('click', () => {
  if (!connected || busy || !$('fictional').checked || !$('transcript-reviewed').checked) return;
  const transcript = $('transcript').value, template = BUILTIN_TEMPLATES.find(item => item.appointment_type === $('appointment').value), signoff = $('signoff').value;
  invalidateDraft('Generating a new draft…');
  void run('Extracting supported statements and checking their meaning against the transcript…', () => api.generate(transcript, template.appointment_type, true, true), data => showDraft(data, transcript, template, signoff));
});
$('copy').addEventListener('click', async () => {
  if (!draftCanBeCopied({text: $('note').value, sourceTranscript, currentTranscript: $('transcript').value, finalReviewed: $('final-reviewed').checked, flagsReviewed: $('flags-reviewed').checked, result})) return;
  try { await navigator.clipboard.writeText($('note').value); message('Reviewed practice note copied. No email was sent.'); }
  catch { $('note').focus(); $('note').select(); message('Clipboard access failed. The reviewed note is selected for manual copying.', true); }
});
for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, () => { lastActivity = Date.now(); }, {passive: true});
document.addEventListener('visibilitychange', () => { if (document.hidden) void recorder.stop('hidden'); });
window.addEventListener('pagehide', () => { void clearSession(true); });
window.addEventListener('beforeunload', event => { if (recorder.state !== 'idle' || busy || audioBlob || $('transcript').value || result) { event.preventDefault(); event.returnValue = ''; } });
setInterval(() => {
  if (Date.now() - lastActivity > 600000 && (connected || $('access-key').value)) {
    lastActivity = Date.now(); void clearSession(true, 'Test session locked after 10 minutes without interaction. Reconnect to continue.');
  }
}, 15000);
update();
