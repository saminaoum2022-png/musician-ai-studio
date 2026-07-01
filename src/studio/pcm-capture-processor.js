/**
 * AudioWorklet — copies mic Float32 samples to the main thread with no gain or DSP.
 * If the input is stereo but only one channel carries the mic, picks that channel
 * per sample (channel routing only — not amplification).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = (ev) => {
      if (ev.data?.type === "stop") this._active = false;
    };
  }

  process(inputs, outputs) {
    if (!this._active) return false;

    const input = inputs[0];
    if (!input?.length) return true;

    const ch0 = input[0];
    if (!ch0?.length) return true;

    const n = ch0.length;
    const mono = new Float32Array(n);

    if (input.length > 1 && input[1]?.length) {
      const ch1 = input[1];
      for (let i = 0; i < n; i++) {
        mono[i] = Math.abs(ch0[i]) >= Math.abs(ch1[i]) ? ch0[i] : ch1[i];
      }
    } else {
      mono.set(ch0);
    }

    this.port.postMessage({ type: "pcm", samples: mono }, [mono.buffer]);

    const out = outputs[0];
    if (out?.[0]) out[0].fill(0);

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
