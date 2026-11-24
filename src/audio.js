// Synthesised audio (no sample files): engine, tyre/road and wind noise,
// rain, horn and crash sounds via the Web Audio API.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  start(spec) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.#noise();
      this.#road();
    }
    this.ctx.resume?.();
    this.#engine(spec);
  }

  #noise() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5 * 0.5 + w * 0.5;
    }
    return b;
  }

  #loopNoise(filterType, freq, q = 0.7) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }

  #road() {
    this.tyre = this.#loopNoise('bandpass', 700, 0.6);
    this.wind = this.#loopNoise('lowpass', 420);
    this.rain = this.#loopNoise('highpass', 2500);
  }

  #engine(spec) {
    if (this.eng) {
      for (const o of this.eng.oscs) o.stop();
      this.eng.out.disconnect();
    }
    const ctx = this.ctx;
    const type = spec.engine.type;
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = type === 'small' ? 4 : 1.5;
    filter.connect(out).connect(this.master);
    const mk = (wave, mult, gain, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(filter);
      o.start();
      return { o, mult };
    };
    const parts =
      type === 'heavy'
        ? [mk('sawtooth', 1, 0.5), mk('square', 0.5, 0.35), mk('sawtooth', 2, 0.12, 7)]
        : type === 'diesel'
          ? [mk('sawtooth', 1, 0.45), mk('square', 0.5, 0.25), mk('triangle', 2, 0.2)]
          : type === 'small'
            ? [mk('square', 1, 0.35), mk('sawtooth', 2, 0.18, 12)]
            : [mk('sawtooth', 1, 0.4), mk('triangle', 2, 0.25), mk('sine', 0.5, 0.3)];
    this.eng = { out, filter, parts, oscs: parts.map((p) => p.o), spec };
  }

  update(player, env) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime;
    const e = this.eng.spec.engine;
    const rpm = player.rpm;
    const f = e.idle + (e.max - e.idle) * Math.min(1.05, rpm);
    for (const p of this.eng.parts) p.o.frequency.setTargetAtTime(f * p.mult, t, 0.05);
    this.eng.filter.frequency.setTargetAtTime(300 + rpm * 1800 + player.throttle * 900, t, 0.05);
    const vol = this.enabled ? 0.12 + player.throttle * 0.12 + rpm * 0.08 : 0;
    this.eng.out.gain.setTargetAtTime(vol, t, 0.08);
    const v = Math.abs(player.speed);
    const on = this.enabled ? 1 : 0;
    this.tyre.g.gain.setTargetAtTime(on * Math.min(0.25, v * 0.006) * (player.offroad ? 2.2 : 1) + (player.sliding ? 0.15 : 0), t, 0.1);
    this.tyre.f.frequency.setTargetAtTime(player.offroad ? 300 : 600 + v * 8, t, 0.1);
    this.wind.g.gain.setTargetAtTime(on * Math.min(0.35, v * v * 0.00006), t, 0.2);
    this.rain.g.gain.setTargetAtTime(on * env.rainAmount * 0.12, t, 0.3);
  }

  horn(spec, on) {
    if (!this.ctx) return;
    if (on && !this.hornNodes) {
      const heavy = spec.category === 'heavy' || spec.id === 'bus';
      const freqs = heavy ? [185, 233, 277] : spec.bike || spec.threeWheeler ? [520, 610] : [392, 494];
      const g = this.ctx.createGain();
      g.gain.value = this.enabled ? 0.12 : 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = heavy ? 1400 : 2400;
      f.connect(g).connect(this.master);
      const oscs = freqs.map((fr) => {
        const o = this.ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = fr;
        o.connect(f);
        o.start();
        return o;
      });
      this.hornNodes = { g, oscs };
    } else if (!on && this.hornNodes) {
      const { g, oscs } = this.hornNodes;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      oscs.forEach((o) => o.stop(this.ctx.currentTime + 0.1));
      this.hornNodes = null;
    }
  }

  crash(strength) {
    if (!this.ctx || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(Math.min(0.9, 0.2 + strength * 0.05), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.8);
  }

  setEnabled(on) {
    this.enabled = on;
  }
}
