/** Free-tier test client. No local/session storage and no Groq credential in this module. */
import { renderChartNote, chartStyle } from './note-style.js';
export const TEST_LIMITS = Object.freeze({audioBytes: 4 * 1024 * 1024, seconds: 180, textChars: 4500});
export function workerOrigin(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter the HTTPS address of your Cloudflare Worker.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Use a Worker address such as https://orthoscribe-ai-test.your-subdomain.workers.dev with no extra path.');
  }
  return url.origin;
}
export function validateTestKey(value) {
  if (!/^ost_[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Use the test access key generated here, not your Groq API key.');
  return value;
}
export function generateTestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return 'ost_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function newTestAPI({fetchImpl = (...args) => fetch(...args)} = {}) {
  let origin = '', key = '', generation = 0;
  const pending = new Set();
  function cancel() { generation++; for (const controller of pending) controller.abort(); pending.clear(); }
  function disconnect() { cancel(); origin = ''; key = ''; }
  async function request(path, {method = 'GET', body, headers = {}, timeoutMs = 90000} = {}) {
    if (!origin || !key) throw new Error('Connect the test Worker first.');
    const atStart = generation, controller = new AbortController();
    pending.add(controller);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${origin}${path}`, {method, body, headers: {Authorization: `Bearer ${key}`, ...headers},
        signal: controller.signal, mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error'});
      if (atStart !== generation) throw new Error('The test session ended.');
      const text = await response.text();
      if (text.length > 100000) throw new Error('The test service returned an oversized response.');
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('The Worker did not return JSON. Check its address and deployment.'); }
      if (!response.ok) {
        const message = typeof data.error?.message === 'string' ? data.error.message.slice(0, 400) : `The test request failed (${response.status}).`;
        const error = new Error(message); error.status = response.status; error.retryAfter = Number(data.error?.retry_after) || 0; throw error;
      }
      if (atStart !== generation) throw new Error('The test session ended.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Request cancelled or timed out. Your current text has not been replaced.');
      if (error instanceof TypeError) throw new Error('Cannot reach the Worker. Check its address, ALLOWED_ORIGIN, and your internet connection.');
      throw error;
    } finally { clearTimeout(timeout); pending.delete(controller); }
  }
  return {
    disconnect, cancel,
    async connect(endpoint, accessKey) {
      disconnect(); origin = workerOrigin(endpoint); key = validateTestKey(accessKey);
      try {
        const result = await request('/health', {timeoutMs: 15000});
        if (result.service !== 'orthoscribe-free-test' || result.mode !== 'fictional-only' || result.version !== '0.3.0' || !result.provider_configured) throw new Error('This address is not the expected OrthoScribe v0.3.0 test Worker.');
        return result;
      } catch (error) { disconnect(); throw error; }
    },
    async transcribe(blob, fictional) {
      if (fictional !== true) throw new Error('Confirm that the recording contains only fictional practice content.');
      if (!(blob instanceof Blob) || blob.size < 100 || blob.size > TEST_LIMITS.audioBytes) throw new Error('Use a practice recording under 4 MiB.');
      const result = await request('/v1/test/transcribe', {method: 'POST', body: blob,
        headers: {'Content-Type': blob.type, 'X-Fictional-Test': 'true', 'X-Audio-Bytes': String(blob.size)}, timeoutMs: 60000});
      if (result.mode !== 'fictional-only' || typeof result.transcript !== 'string' || !result.transcript.trim() || result.transcript.length > TEST_LIMITS.textChars) throw new Error('The transcription response is invalid or too long.');
      return result;
    },
    async generate(transcript, appointmentType, fictional, reviewed) {
      if (fictional !== true || reviewed !== true) throw new Error('Confirm fictional content and review the transcript first.');
      if (typeof transcript !== 'string' || transcript.trim().length < 15 || transcript.length > TEST_LIMITS.textChars) throw new Error('Use 15 to 4500 characters of fictional transcript.');
      const result = await request('/v1/test/note', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Fictional-Test': 'true'},
        body: JSON.stringify({transcript, appointment_type: appointmentType, fictional: true, transcript_reviewed: true})});
      if (result.mode !== 'fictional-only' || !Array.isArray(result.claims) || !result.claims.length || result.claims.length > 14 || !Array.isArray(result.concerns)) throw new Error('The draft response is invalid.');
      return result;
    },
  };
}
export function chartFromClaims(result, template, signoff = 'Dr. Reza') {
  const style = chartStyle({note_style: 'brief', note_signoff: signoff, include_note_date: false});
  const sections = template.sections.filter(heading => heading !== 'Date').map(heading => ({
    heading, text: result.claims.filter(claim => claim.heading === heading).map(claim => {
      if (typeof claim.text !== 'string' || typeof claim.quote !== 'string' || typeof claim.uncertain !== 'boolean') throw new Error('Invalid claim format.');
      return claim.text.trim();
    }).join(' '),
  }));
  if (result.claims.some(claim => !template.sections.includes(claim.heading))) throw new Error('The draft used an unexpected template heading.');
  return renderChartNote(sections, style);
}
export function draftCanBeCopied({text, sourceTranscript, currentTranscript, finalReviewed, flagsReviewed, result}) {
  return Boolean(result && typeof text === 'string' && text.trim() && sourceTranscript === currentTranscript && finalReviewed &&
    (!(result.concerns.length || result.claims.some(claim => claim.uncertain)) || flagsReviewed));
}
export class PracticeRecorder {
  constructor({onStopped = () => {}, onTick = () => {}, mediaDevices = globalThis.navigator?.mediaDevices,
      Recorder = globalThis.MediaRecorder, now = () => Date.now()} = {}) {
    Object.assign(this, {onStopped, onTick, mediaDevices, Recorder, now});
    this.state = 'idle'; this.serial = 0;
  }
  async start() {
    if (this.state !== 'idle') throw new Error('A recording is already in progress.');
    if (!this.mediaDevices?.getUserMedia || !this.Recorder) throw new Error('Recording is unavailable. Open this HTTPS page in Safari or paste a fictional transcript.');
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => this.Recorder.isTypeSupported(type));
    if (!mime) throw new Error('This browser has no supported recording format. Paste a fictional transcript instead.');
    this.state = 'requesting'; const serial = ++this.serial;
    try {
      const stream = await this.mediaDevices.getUserMedia({audio: {channelCount: {ideal: 1}, echoCancellation: true, noiseSuppression: true}, video: false});
      if (serial !== this.serial) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream; this.recorder = new this.Recorder(stream, {mimeType: mime, audioBitsPerSecond: 64000});
      this.chunks = []; this.size = 0; this.reason = 'ended'; this.startedAt = this.now(); this.problem = '';
      this.finished = new Promise(resolve => { this.resolveFinished = resolve; });
      this.recorder.ondataavailable = event => {
        if (!event.data?.size || this.problem) return;
        this.size += event.data.size;
        if (this.size > TEST_LIMITS.audioBytes) { this.problem = 'The recording exceeded 4 MiB and was discarded.'; this.chunks = []; void this.stop('size_limit'); return; }
        this.chunks.push(event.data);
      };
      this.recorder.onerror = () => { this.problem = 'The microphone stopped unexpectedly. The recording was discarded.'; void this.stop('error'); };
      let finalized = false;
      this.recorder.onstop = () => {
        if (finalized) return;
        finalized = true;
        clearInterval(this.timer); this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = null;
        const blob = this.problem ? null : new Blob(this.chunks, {type: this.recorder.mimeType || mime});
        this.chunks = []; this.state = 'idle'; const result = {blob, reason: this.reason, error: this.problem};
        this.resolveFinished(result); this.finished = null; this.resolveFinished = null; this.recorder = null; this.onStopped(result);
      };
      for (const track of stream.getTracks()) track.onended = () => { void this.stop('interrupted'); };
      this.recorder.start(1000); this.state = 'recording';
      this.timer = setInterval(() => {
        const seconds = Math.floor((this.now() - this.startedAt) / 1000); this.onTick(seconds);
        if (seconds >= TEST_LIMITS.seconds) void this.stop('limit');
      }, 250);
      return true;
    } catch (error) {
      if (serial !== this.serial) return false;
      this.state = 'idle'; this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      if (error.name === 'NotAllowedError') throw new Error('Microphone access was denied. Allow it in Safari settings or paste a fictional transcript.');
      throw error;
    }
  }
  async stop(reason = 'ended') {
    if (this.state === 'requesting') { this.serial++; this.state = 'idle'; return null; }
    if (!['recording', 'stopping'].includes(this.state)) return null;
    const finished = this.finished;
    if (this.state === 'recording') {
      this.reason = reason; this.state = 'stopping'; clearInterval(this.timer);
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      else this.recorder.onstop();
    }
    return finished;
  }
}
