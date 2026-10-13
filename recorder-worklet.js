import { PCMResampler } from "./pcm.js";

class OrthoPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resampler = new PCMResampler(sampleRate);
    this.finished = false;
    this.port.onmessage = event => {
      if (event.data?.type === "flush" && !this.finished) {
        this.finished = true;
        this.emit(this.resampler.flush());
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  emit(chunks) {
    for (const pcm of chunks) this.port.postMessage({ type: "pcm", pcm }, [pcm]);
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channels = inputs[0];
    if (this.finished || !channels?.length || !channels[0].length) return true;
    const mono = new Float32Array(channels[0].length);
    for (const channel of channels) for (let index = 0; index < mono.length; index++) mono[index] += channel[index] / channels.length;
    this.emit(this.resampler.push(mono));
    return true;
  }
}

registerProcessor("orthoscribe-pcm", OrthoPCMProcessor);
