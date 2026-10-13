/* Stateful windowed-sinc sample-rate conversion, shared by the AudioWorklet and tests. */

export function encodeAudioFrame(sequence, pcm) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError("Invalid audio sequence.");
  const bytes = pcm instanceof ArrayBuffer ? new Uint8Array(pcm) : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (!bytes.byteLength || bytes.byteLength > 32000 || bytes.byteLength % 2) throw new RangeError("Invalid PCM16 audio frame.");
  const frame = new ArrayBuffer(8 + bytes.byteLength);
  new DataView(frame).setBigUint64(0, BigInt(sequence), false);
  new Uint8Array(frame, 8).set(bytes);
  return frame;
}

export class PCMResampler {
  constructor(sourceRate, targetRate = 16000, chunkSamples = 8000) {
    if (!Number.isFinite(sourceRate) || sourceRate < 8000 || sourceRate > 192000 || targetRate !== 16000 ||
        !Number.isInteger(chunkSamples) || chunkSamples < 1 || chunkSamples > 16000) throw new RangeError("Unsupported recording sample rate.");
    this.sourceRate = sourceRate;
    this.targetRate = targetRate;
    this.step = sourceRate / targetRate;
    this.radius = 32;
    this.phases = 256;
    this.samples = new Array(this.radius).fill(0);
    this.position = this.radius;
    this.inputCount = 0;
    this.outputCount = 0;
    this.chunkSamples = chunkSamples;
    this.chunk = new ArrayBuffer(chunkSamples * 2);
    this.chunkView = new DataView(this.chunk);
    this.chunkPosition = 0;
    this.closed = false;
    const cutoff = 0.45 * Math.min(1, targetRate / sourceRate);
    this.kernels = Array.from({ length: this.phases }, (_, phase) => {
      const coefficients = new Float64Array(this.radius * 2);
      let sum = 0;
      for (let tap = 0; tap < coefficients.length; tap++) {
        const distance = tap - this.radius + 1 - phase / this.phases;
        const sinc = distance === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance);
        const window = 0.42 + 0.5 * Math.cos(Math.PI * distance / this.radius) + 0.08 * Math.cos(2 * Math.PI * distance / this.radius);
        coefficients[tap] = sinc * window;
        sum += coefficients[tap];
      }
      for (let tap = 0; tap < coefficients.length; tap++) coefficients[tap] /= sum;
      return coefficients;
    });
  }

  push(input) {
    if (this.closed) throw new Error("The resampler is closed.");
    if (!(input instanceof Float32Array)) throw new TypeError("Expected Float32 microphone samples.");
    for (const value of input) this.samples.push(Number.isFinite(value) ? value : 0);
    this.inputCount += input.length;
    return this.drain();
  }

  drain() {
    const chunks = [];
    const expected = Math.ceil(this.inputCount * this.targetRate / this.sourceRate);
    for (; this.position + this.radius < this.samples.length && this.outputCount < expected;) {
      const center = Math.floor(this.position);
      const phase = Math.min(this.phases - 1, Math.floor((this.position - center) * this.phases));
      const kernel = this.kernels[phase];
      let sample = 0;
      for (let tap = 0; tap < kernel.length; tap++) sample += this.samples[center - this.radius + 1 + tap] * kernel[tap];
      sample = Math.max(-1, Math.min(1, sample));
      this.chunkView.setInt16(this.chunkPosition * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
      this.chunkPosition++;
      this.outputCount++;
      this.position += this.step;
      if (this.chunkPosition === this.chunkSamples) {
        chunks.push(this.chunk);
        this.chunk = new ArrayBuffer(this.chunkSamples * 2);
        this.chunkView = new DataView(this.chunk);
        this.chunkPosition = 0;
      }
    }
    const discard = Math.max(0, Math.floor(this.position) - this.radius);
    if (discard) { this.samples.splice(0, discard); this.position -= discard; }
    return chunks;
  }

  flush() {
    if (this.closed) return [];
    this.closed = true;
    for (let index = 0; index <= this.radius; index++) this.samples.push(0);
    const chunks = this.drain();
    if (this.chunkPosition) chunks.push(this.chunk.slice(0, this.chunkPosition * 2));
    this.chunkPosition = 0;
    this.samples.length = 0;
    return chunks;
  }
}
