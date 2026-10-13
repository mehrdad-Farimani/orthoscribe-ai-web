import { APIError } from "./bridge.js";
import { encodeAudioFrame } from "./pcm.js";
export { encodeAudioFrame, PCMResampler } from "./pcm.js";

const workletURL = new URL("./recorder-worklet.js", import.meta.url);

export class OrthoRecorder {
  constructor({ api, persistence, onStatus = () => {}, onTranscript = () => {}, onError = () => {}, maximumSeconds = 7200 }) {
    this.api = api;
    this.persistence = persistence;
    this.onStatus = onStatus;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.maximumSeconds = maximumSeconds;
    this.manifest = null;
    this.state = "idle";
    this.socket = null;
    this.socketReady = false;
    this.captureActive = false;
    this.context = null;
    this.node = null;
    this.media = null;
    this.storageTail = Promise.resolve();
    this.storageError = null;
    this.pendingWrites = 0;
    this.socketEpoch = 0;
    this.nextToSend = 0;
    this.durableSequenceCount = 0;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.pumping = false;
    this.finishing = false;
    this.finished = false;
    this.disposed = false;
    this.stoppingCapture = null;
    this.pausing = null;
    this.cancelConnect = null;
    this.pumpTimer = null;
    this.captureEpoch = 0;
    this.visibilityHandler = () => {
      if (document.hidden && this.captureActive) this.pause("Recording paused because this page is no longer visible.").catch(error => this.report(error));
    };
    this.pageHideHandler = () => {
      if (this.captureActive) this.pause("Recording paused after leaving this page.").catch(() => {});
    };
    this.unloadHandler = event => {
      if (this.captureActive || this.pendingWrites) { event.preventDefault(); event.returnValue = ""; }
    };
    globalThis.document?.addEventListener("visibilitychange", this.visibilityHandler);
    globalThis.addEventListener?.("pagehide", this.pageHideHandler);
    globalThis.addEventListener?.("beforeunload", this.unloadHandler);
  }

  emit(message = "") {
    this.onStatus({ state: this.state, message, elapsedSeconds: (this.manifest?.pcm_byte_count || 0) / 32000,
      nextSequence: this.manifest?.next_sequence || 0, acknowledgedSequence: this.manifest?.acknowledged_sequence ?? -1,
      needsInterruptionReview: Boolean(this.manifest?.capture_gap && !this.manifest.capture_gap_acknowledged),
      interruptionMessage: this.manifest?.capture_gap_message || "" });
  }
  report(error) { this.onError(error instanceof Error ? error : new APIError("Recording could not continue.")); }
  requireReady() {
    if (this.disposed) throw new APIError("This recorder has been closed.");
    if (!this.api?.hasSession) throw new APIError("Sign in to the clinic before recording.", 401);
    if (!this.persistence || ["saveChunk", "loadChunk", "saveManifest"].some(name => typeof this.persistence[name] !== "function")) {
      throw new APIError("Unlock encrypted recording storage before starting.");
    }
    const host = (globalThis.location?.hostname || "").toLowerCase().replace(/\.+$/, "");
    if (host === "github.io" || host.endsWith(".github.io")) {
      throw new APIError("Microphone recording is unavailable in this public demonstration.");
    }
  }

  arm() {
    this.requireReady();
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass || !globalThis.navigator?.mediaDevices?.getUserMedia) throw new APIError("This browser does not support secure microphone recording.");
    if (!this.context || this.context.state === "closed") this.context = new AudioContextClass({ latencyHint: "interactive" });
    this.context.resume().catch(() => this.report(new APIError("Tap Resume Recording to enable browser audio.")));
  }

  async start(noteId, { manifest = null } = {}) {
    this.requireReady();
    if (this.captureActive || this.finishing || this.stoppingCapture) throw new APIError("Finish the current recording first.");
    if (typeof noteId !== "string" || !/^[a-z0-9-]{1,100}$/i.test(noteId)) throw new APIError("Invalid appointment identifier.");
    if (manifest && (manifest.note_id !== noteId || manifest.owner_id !== this.api.session.user_id || manifest.endpoint !== this.api.baseURL ||
        !Number.isSafeInteger(manifest.next_sequence) || manifest.next_sequence < 0 || !Number.isSafeInteger(manifest.pcm_byte_count) || manifest.pcm_byte_count < 0 ||
        manifest.pcm_byte_count % 2 || manifest.pcm_byte_count > this.maximumSeconds * 32000 ||
        !Number.isSafeInteger(manifest.acknowledged_sequence) || manifest.acknowledged_sequence < -1 || manifest.acknowledged_sequence >= manifest.next_sequence)) {
      throw new APIError("The saved recording belongs to another clinic or account.");
    }
    this.manifest = manifest ? { ...manifest } : { note_id: noteId, owner_id: this.api.session.user_id, endpoint: this.api.baseURL,
      next_sequence: 0, acknowledged_sequence: -1, pcm_byte_count: 0, ended: false, created_at: new Date().toISOString() };
    this.durableSequenceCount = this.manifest.next_sequence;
    if (manifest && !manifest.ended && manifest.capture_state !== "paused") {
      this.manifest.capture_gap = true;
      this.manifest.capture_gap_acknowledged = false;
      this.manifest.capture_gap_message = "The earlier browser session ended before recording was closed. Review the last saved words and restate anything missing.";
    }
    this.finished = false;
    this.storageError = null;
    this.state = "connecting";
    this.emit("Connecting to the clinic's recording service.");
    await this.persistence.saveManifest({ ...this.manifest });
    if (manifest?.ended) {
      this.state = "paused";
      this.emit("Saved audio is ready to finish uploading. Tap End Recording to continue.");
      return;
    }
    if (!this.context) this.arm();
    try {
      await this.connect();
      await this.beginCapture();
    } catch (error) {
      await this.stopCapture(); this.closeSocket(); this.state = "paused"; this.emit();
      throw error;
    }
  }

  async beginCapture() {
    this.requireReady();
    if (globalThis.document?.hidden) throw new APIError("Keep this page visible to record.");
    if (!this.context || this.context.state === "closed") this.arm();
    const epoch = ++this.captureEpoch;
    const context = this.context;
    try {
      this.manifest.capture_state = "recording";
      this.queueManifest(); await this.storageTail;
      if (this.storageError) throw new APIError("Encrypted recovery storage is unavailable.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (this.disposed || globalThis.document?.hidden || epoch !== this.captureEpoch) {
        for (const track of media.getTracks()) track.stop();
        throw new APIError("Recording paused before the microphone became available.");
      }
      this.media = media;
      await context.audioWorklet.addModule(workletURL);
      if (this.disposed || globalThis.document?.hidden || epoch !== this.captureEpoch) throw new APIError("Recording paused before the microphone became available.");
      this.node = new AudioWorkletNode(context, "orthoscribe-pcm", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.node.port.onmessage = event => {
        if (event.data?.type === "pcm" && event.data.pcm instanceof ArrayBuffer) this.queueChunk(event.data.pcm);
        if (event.data?.type === "flushed") this.resolveFlush?.();
      };
      this.node.onprocessorerror = () => {
        this.markGap("The audio processor stopped before all recent audio could be saved. Review the final spoken words and restate anything missing.");
        this.pause("The audio processor stopped. Review the final spoken words before resuming.").catch(() => {});
        this.report(new APIError("The audio processor was interrupted. Recording has paused."));
      };
      this.source = context.createMediaStreamSource(this.media);
      this.silentGain = context.createGain(); this.silentGain.gain.value = 0;
      this.source.connect(this.node); this.node.connect(this.silentGain); this.silentGain.connect(context.destination);
      let resumeTimer;
      try {
        await Promise.race([context.resume(), new Promise((_, reject) => {
          resumeTimer = setTimeout(() => reject(new APIError("Tap Resume Recording to enable microphone processing.")), 8000);
        })]);
      } finally { clearTimeout(resumeTimer); }
      if (this.disposed || globalThis.document?.hidden || epoch !== this.captureEpoch) throw new APIError("Recording paused before the microphone became available.");
      this.captureActive = true;
      this.context.onstatechange = () => {
        if (this.captureActive && this.context && !["running", "closed"].includes(this.context.state)) {
          this.markGap("A device audio interruption may have prevented recent words from being recorded. Review the last saved words and restate anything missing.");
          this.pause("Recording paused after a device audio interruption. Check the last spoken words.").catch(error => this.report(error));
        }
      };
      for (const track of this.media.getAudioTracks()) {
        const interrupted = () => {
          if (!this.captureActive) return;
          this.markGap("The microphone became unavailable. Review the last saved words and restate anything missing before generating a note.");
          this.pause("The microphone stopped. Tap Resume Recording when ready.").catch(error => this.report(error));
        };
        track.onended = interrupted;
        track.onmute = interrupted;
      }
      this.state = "recording"; this.emit();
    } catch (error) {
      await this.stopCapture();
      if (error instanceof APIError) throw error;
      throw new APIError("The microphone could not start. Check permission and try again.");
    }
  }

  queueChunk(pcm) {
    this.pendingWrites++;
    if (this.pendingWrites > 16 && this.captureActive) this.pause("Recording paused to finish encrypted storage writes.").catch(error => this.report(error));
    this.storageTail = this.storageTail.then(async () => {
      if (this.storageError) return;
      if (this.manifest.pcm_byte_count + pcm.byteLength > this.maximumSeconds * 32000) {
        this.markGap("The recording reached its maximum duration. Recent speech beyond that limit was not saved. Review the appointment before generating a note.");
        this.pause("Maximum appointment duration reached. End this recording and review the saved audio.").catch(error => this.report(error));
        return;
      }
      const sequence = this.manifest.next_sequence;
      await this.persistence.saveChunk(this.manifest.note_id, sequence, pcm);
      this.manifest.next_sequence++;
      this.manifest.pcm_byte_count += pcm.byteLength;
      this.manifest.updated_at = new Date().toISOString();
      await this.persistence.saveManifest({ ...this.manifest });
      this.durableSequenceCount = this.manifest.next_sequence;
      this.emit(); this.pump();
      if (this.manifest.next_sequence - this.manifest.acknowledged_sequence > 120 && this.captureActive) {
        this.pause("Recording paused after one minute of unsynchronized audio. Restore the clinic connection to resume.").catch(error => this.report(error));
      }
    }).catch(error => {
      if (!this.storageError) {
        this.storageError = error;
        this.pause("Encrypted storage failed. Keep this page open and contact the clinic administrator.").catch(() => {});
        this.report(new APIError("Some audio could not be saved. Keep this page open; do not approve an incomplete recording."));
      }
    }).finally(() => { this.pendingWrites--; });
  }

  queueManifest() {
    this.storageTail = this.storageTail.then(() => this.persistence.saveManifest({ ...this.manifest })).catch(error => {
      this.storageError = error;
      this.pause("Encrypted recovery state could not be saved.").catch(() => {});
      this.report(new APIError("Recording recovery storage failed. Keep this page open."));
    });
  }

  async connect() {
    this.requireReady();
    this.closeSocket();
    const epoch = ++this.socketEpoch;
    this.socketReady = false;
    this.socket = new WebSocket(this.api.streamURL(this.manifest.note_id));
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new APIError("The recording connection timed out.")); socket.close(); }
      }, 15000);
      const fail = message => {
        if (!settled) { settled = true; clearTimeout(timeout); reject(new APIError(message)); }
      };
      this.cancelConnect = () => fail("The recording connection was paused.");
      socket.onopen = () => {
        if (epoch !== this.socketEpoch) return;
        try { socket.send(JSON.stringify(this.api.streamAuthMessage())); }
        catch { fail("Sign in again before reconnecting the recording."); socket.close(); }
      };
      socket.onmessage = event => {
        if (epoch !== this.socketEpoch || typeof event.data !== "string") return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "ready") {
          if (!Number.isSafeInteger(message.next_sequence) || message.next_sequence < 0 || message.next_sequence > this.durableSequenceCount) {
            fail("The server recording does not match this browser's saved audio."); socket.close(); return;
          }
          this.manifest.acknowledged_sequence = message.next_sequence - 1;
          this.nextToSend = message.next_sequence;
          this.socketReady = true; this.reconnectAttempts = 0;
          this.queueManifest(); this.pump();
          if (!settled) { settled = true; clearTimeout(timeout); this.cancelConnect = null; resolve(); }
        } else if (message.type === "ack") {
          if (!Number.isSafeInteger(message.sequence) || message.sequence < 0 || message.sequence >= this.durableSequenceCount) {
            socket.close(); this.report(new APIError("The server returned an invalid audio acknowledgement.")); return;
          }
          if (message.sequence > this.manifest.acknowledged_sequence) {
            if (message.sequence !== this.manifest.acknowledged_sequence + 1) { socket.close(); return; }
            this.manifest.acknowledged_sequence = message.sequence;
            this.queueManifest(); this.emit(); this.pump();
          }
        } else if (message.type === "transcript" && Array.isArray(message.segments)) {
          // Provider time and speaker IDs restart on reconnect. Keep provisional
          // segment IDs unique; final generation diarizes all saved audio again.
          this.onTranscript(message.segments.map(segment => ({ ...segment, id: `connection_${epoch}_${segment.id}` })), Boolean(message.is_final));
        } else if (message.type === "finished") {
          this.finished = true;
        } else if (message.type === "error") {
          const text = typeof message.message === "string" ? message.message : "The recording service reported an error.";
          if (/^(Live transcription|Final live transcript)/.test(text)) this.emit(text);
          else { fail(text); this.pause(text).catch(() => {}); this.report(new APIError(text)); }
        }
      };
      socket.onerror = () => fail("The recording service could not be reached.");
      socket.onclose = () => {
        clearTimeout(timeout);
        if (epoch !== this.socketEpoch) return;
        this.socketReady = false;
        fail("The recording connection closed. Sign in again if the clinic session expired.");
        if (this.captureActive && !this.disposed && !this.finishing) this.scheduleReconnect();
      };
    });
  }

  closeSocket() {
    clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
    clearTimeout(this.pumpTimer); this.pumpTimer = null;
    this.cancelConnect?.(); this.cancelConnect = null;
    this.socketEpoch++;
    this.socketReady = false;
    if (this.socket) { this.socket.onclose = null; this.socket.onerror = null; this.socket.close(); this.socket = null; }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (++this.reconnectAttempts > 5) {
      this.pause("The clinic connection is unavailable. Encrypted audio is saved; reconnect before resuming.").catch(error => this.report(error));
      return;
    }
    this.emit("The connection was interrupted. Audio is saved securely as the app reconnects.");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.captureActive) this.connect().catch(() => { if (this.captureActive) this.scheduleReconnect(); });
    }, Math.min(8000, 500 * 2 ** (this.reconnectAttempts - 1)));
  }

  async pump() {
    if (this.pumping || !this.socketReady || !this.socket) return;
    this.pumping = true;
    const socket = this.socket;
    try {
      for (; socket === this.socket && this.socketReady && socket.readyState === WebSocket.OPEN &&
          this.nextToSend < this.durableSequenceCount && this.nextToSend - this.manifest.acknowledged_sequence <= 8 && socket.bufferedAmount < 256000;) {
        const sequence = this.nextToSend;
        const pcm = await this.persistence.loadChunk(this.manifest.note_id, sequence);
        if (!pcm) throw new APIError("A saved audio chunk is missing. Do not approve this incomplete recording.");
        if (socket !== this.socket || !this.socketReady) break;
        socket.send(encodeAudioFrame(sequence, pcm));
        this.nextToSend++;
      }
    } catch (error) {
      this.socketReady = false;
      this.pause("Audio synchronization paused. Saved frames have been retained.").catch(() => {});
      this.report(error instanceof APIError ? error : new APIError("Audio could not be synchronized."));
    } finally {
      this.pumping = false;
      // A new ready event can arrive during an earlier connection's disk read.
      // Also retry after WebSocket buffering drains without a new ACK event.
      if (this.socketReady && this.socket?.readyState === WebSocket.OPEN && this.nextToSend < this.durableSequenceCount &&
          this.nextToSend - this.manifest.acknowledged_sequence <= 8) {
        clearTimeout(this.pumpTimer);
        this.pumpTimer = setTimeout(() => { this.pumpTimer = null; this.pump(); }, 50);
      }
    }
  }

  markGap(message) {
    if (!this.manifest) return;
    this.manifest.capture_gap = true;
    this.manifest.capture_gap_acknowledged = false;
    this.manifest.capture_gap_message = message;
    this.queueManifest();
    this.emit(message);
  }

  async acknowledgeInterruption() {
    if (!this.manifest?.capture_gap) return;
    this.manifest.capture_gap_acknowledged = true;
    this.queueManifest();
    await this.storageTail;
    if (this.storageError) throw new APIError("The interruption review could not be saved.");
    this.emit("Interruption reviewed. Confirm the final note includes only supported clinical information.");
  }

  stopCapture() {
    if (this.stoppingCapture) return this.stoppingCapture;
    this.captureActive = false;
    this.captureEpoch++;
    const context = this.context;
    const node = this.node;
    const source = this.source;
    const gain = this.silentGain;
    if (context) context.onstatechange = null;
    if (this.media) for (const track of this.media.getTracks()) { track.onended = null; track.onmute = null; track.stop(); }
    this.media = null;
    this.stoppingCapture = (async () => {
      if (node) {
        let timeout;
        const flushed = await new Promise(resolve => {
          this.resolveFlush = () => resolve(true);
          timeout = setTimeout(() => resolve(false), 1200);
          try { node.port.postMessage({ type: "flush" }); } catch { resolve(false); }
        });
        clearTimeout(timeout);
        this.resolveFlush = null;
        if (!flushed) this.markGap("The browser interrupted audio before the final buffer was confirmed. Check the last spoken words and restate anything missing before approving a note.");
        node.port.onmessage = null; node.disconnect();
        if (this.node === node) this.node = null;
      }
      source?.disconnect(); gain?.disconnect();
      if (this.source === source) this.source = null;
      if (this.silentGain === gain) this.silentGain = null;
      if (context && context.state !== "closed") await context.close().catch(() => {});
      if (this.context === context) this.context = null;
      if (this.manifest) { this.manifest.capture_state = "paused"; this.queueManifest(); }
      await this.storageTail;
    })().finally(() => { this.stoppingCapture = null; });
    return this.stoppingCapture;
  }

  pause(message = "Recording paused. Tap Resume Recording when ready.") {
    if (this.disposed) return Promise.resolve();
    if (this.pausing) return this.pausing;
    this.state = "paused";
    this.pausing = (async () => {
      await this.stopCapture();
      this.closeSocket();
      this.emit(message);
    })().finally(() => { this.pausing = null; });
    return this.pausing;
  }

  async resume() {
    this.requireReady();
    if (!this.manifest || this.manifest.ended || this.storageError) throw new APIError("This recording cannot resume. Finish uploading or review the storage error.");
    if (this.captureActive) return;
    if (this.stoppingCapture || this.pausing) throw new APIError("The recording is finishing its pause. Tap Resume Recording again in a moment.");
    if (globalThis.document?.hidden) throw new APIError("Keep this page visible to record.");
    this.arm();
    this.state = "connecting"; this.emit();
    try {
      await this.connect();
      await this.beginCapture();
    } catch (error) {
      await this.stopCapture(); this.closeSocket(); this.state = "paused"; this.emit();
      throw error;
    }
  }

  async waitFor(predicate, timeout, message) {
    const end = Date.now() + timeout;
    for (; Date.now() < end;) {
      if (predicate()) return;
      if (this.storageError || this.disposed) throw new APIError("Recording storage is unavailable.");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new APIError(message);
  }

  async stop() {
    this.requireReady();
    if (!this.manifest) throw new APIError("There is no recording to finish.");
    this.finishing = true;
    this.state = "syncing"; this.emit("Saving and uploading the complete recording.");
    try {
      await this.stopCapture();
      if (this.storageError) throw new APIError("Encrypted storage failed. Do not generate from an incomplete recording.");
      if (this.manifest.capture_gap && !this.manifest.capture_gap_acknowledged) throw new APIError("Review and acknowledge the audio interruption before generating a note. Resume to restate any missing information.");
      if (!this.manifest.next_sequence) throw new APIError("No microphone audio was recorded.");
      this.manifest.ended = true;
      await this.persistence.saveManifest({ ...this.manifest });
      if (!this.socketReady) await this.connect();
      this.pump();
      await this.waitFor(() => this.manifest.acknowledged_sequence === this.manifest.next_sequence - 1, 45000, "Saved audio still needs to upload. Keep the encrypted recording and retry End Recording.");
      this.finished = false;
      this.socket.send(JSON.stringify({ type: "finish", audio_chunk_count: this.manifest.next_sequence }));
      await this.waitFor(() => this.finished, 20000, "The recording finish was not confirmed. Retry End Recording before generating.");
      await this.storageTail;
      if (this.storageError) throw new APIError("Encrypted recovery storage failed. Keep this recording and retry after resolving storage.");
      this.state = "stopped"; this.emit();
      return { audio_chunk_count: this.manifest.next_sequence };
    } catch (error) {
      this.state = "paused"; this.emit("Encrypted recording retained. Retry End Recording after restoring the connection.");
      throw error;
    } finally { this.finishing = false; this.closeSocket(); }
  }

  async dispose() {
    if (this.disposed) return;
    await this.pause();
    this.disposed = true;
    globalThis.document?.removeEventListener("visibilitychange", this.visibilityHandler);
    globalThis.removeEventListener?.("pagehide", this.pageHideHandler);
    globalThis.removeEventListener?.("beforeunload", this.unloadHandler);
  }
}
