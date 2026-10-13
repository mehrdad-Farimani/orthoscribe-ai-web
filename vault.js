const DB_NAME = 'orthoscribe-recording-vault-v1';
const STORE = 'records';
const ITERATIONS = 600000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Invalid recording data.');
}
export async function deriveVaultKey(passphrase, salt, iterations = ITERATIONS) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Use at least 12 characters for the recovery passphrase.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(salt), iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(key, recordKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(recordKey) }, key, bytes(plaintext));
  return { version: 1, iv, ciphertext };
}
export async function openEnvelope(key, recordKey, envelope) {
  if (envelope?.version !== 1) throw new Error('Unsupported encrypted recording format.');
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: encoder.encode(recordKey) }, key, bytes(envelope.ciphertext));
  } catch { throw new Error('The passphrase is incorrect or encrypted data failed verification.'); }
}
async function namespaceFor(endpoint, ownerId) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${endpoint}\n${ownerId}`));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('Encrypted local storage is unavailable.'));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('Close other OrthoScribe tabs to open recording recovery.'));
  });
}
function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); const store = tx.objectStore(STORE); let result;
    try { result = action(store); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = tx.onabort = () => reject(new Error('Encrypted local storage could not complete the operation.'));
  });
}
export class RecordingVault {
  #db; #key; #namespace;
  constructor(db, key, namespace) { this.#db = db; this.#key = key; this.#namespace = namespace; }
  static async unlock({ endpoint, ownerId, passphrase }) {
    if (!endpoint || !ownerId) throw new Error('Sign in before unlocking recording recovery.');
    const db = await database(); const namespace = await namespaceFor(endpoint, ownerId); const metaKey = `${namespace}:meta`;
    let metadata = await transaction(db, 'readonly', store => store.get(metaKey));
    if (metadata && metadata.iterations !== ITERATIONS) throw new Error('Unsupported vault configuration.');
    const salt = metadata?.salt ?? crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveVaultKey(passphrase, salt);
    if (metadata) {
      const check = await openEnvelope(key, metaKey, metadata.check);
      if (decoder.decode(check) !== 'OrthoScribe recording vault v1') throw new Error('Recording recovery verification failed.');
    } else {
      metadata = { salt, iterations: ITERATIONS, check: await seal(key, metaKey, encoder.encode('OrthoScribe recording vault v1')) };
      // add refuses a concurrent initial creation rather than replacing its key.
      await transaction(db, 'readwrite', store => store.add(metadata, metaKey));
    }
    return new RecordingVault(db, key, namespace);
  }
  get unlocked() { return Boolean(this.#key); }
  lock() { this.#key = null; this.#db?.close(); this.#db = null; }
  #record(kind, noteId, suffix = '') {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(noteId)) throw new Error('Invalid recording identifier.');
    return `${this.#namespace}:${kind}:${noteId}${suffix}`;
  }
  #requireKey() { if (!this.#key || !this.#db) throw new Error('Unlock recording recovery first.'); return this.#key; }
  async #save(recordKey, value) {
    const key = this.#requireKey(); const db = this.#db; const encrypted = await seal(key, recordKey, value);
    if (this.#key !== key || this.#db !== db) throw new Error('The workspace was locked before saving.');
    await transaction(db, 'readwrite', store => store.put(encrypted, recordKey));
  }
  async #load(recordKey) {
    const key = this.#requireKey(); const encrypted = await transaction(this.#db, 'readonly', store => store.get(recordKey));
    if (!encrypted) return null;
    const value = await openEnvelope(key, recordKey, encrypted);
    if (this.#key !== key) throw new Error('The workspace was locked.');
    return value;
  }
  async saveChunk(noteId, sequence, value) {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || bytes(value).byteLength > 32768) throw new Error('Invalid recording chunk.');
    const recordKey = this.#record('audio', noteId, `:${sequence}`);
    // Recorder serializes writes, and server replay verifies duplicate content.
    await this.#save(recordKey, value);
  }
  async loadChunk(noteId, sequence) { return this.#load(this.#record('audio', noteId, `:${sequence}`)); }
  async saveManifest(manifest) { await this.#save(this.#record('manifest', manifest.note_id), encoder.encode(JSON.stringify(manifest))); }
  async loadManifest(noteId) {
    const value = await this.#load(this.#record('manifest', noteId));
    return value ? JSON.parse(decoder.decode(value)) : null;
  }
  async listRecordings() {
    this.#requireKey();
    const keys = await transaction(this.#db, 'readonly', store => store.getAllKeys());
    const prefix = `${this.#namespace}:manifest:`; const output = [];
    for (const key of keys.filter(key => typeof key === 'string' && key.startsWith(prefix))) {
      const value = await this.#load(key); if (value) output.push(JSON.parse(decoder.decode(value)));
    }
    return output;
  }
  async deleteRecording(noteId) {
    this.#requireKey();
    const prefix = this.#record('audio', noteId, ':'); const manifestKey = this.#record('manifest', noteId);
    const keys = await transaction(this.#db, 'readonly', store => store.getAllKeys());
    await transaction(this.#db, 'readwrite', store => {
      for (const key of keys) if (key === manifestKey || (typeof key === 'string' && key.startsWith(prefix))) store.delete(key);
    });
  }
  async saveDraft(note) { await this.#save(this.#record('draft', note.id), encoder.encode(JSON.stringify(note))); }
  async loadDraft(noteId) {
    const value = await this.#load(this.#record('draft', noteId));
    return value ? JSON.parse(decoder.decode(value)) : null;
  }
  async deleteDraft(noteId) {
    this.#requireKey(); await transaction(this.#db, 'readwrite', store => store.delete(this.#record('draft', noteId)));
  }
}
