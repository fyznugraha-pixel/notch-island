export type AmbientPresetId = "rain" | "cafe" | "waves" | "fire";

export interface AmbientPreset {
  id: AmbientPresetId;
  label: string;
  subtitle: string;
  accent: string;
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: "rain", label: "Hujan", subtitle: "Rintik tenang", accent: "#38bdf8" },
  { id: "cafe", label: "Kafe", subtitle: "Suasana ruangan", accent: "#f59e0b" },
  { id: "waves", label: "Ombak", subtitle: "Pasang surut", accent: "#34d399" },
  { id: "fire", label: "Api Unggun", subtitle: "Kayu & bara", accent: "#fb7185" },
];

export interface ActiveSoundGraph {
  ctx: AudioContext;
  timers: number[];
  masterGain: GainNode;
}

export function setGraphVolume(graph: ActiveSoundGraph | null, volume: number) {
  if (!graph) return;
  const clamped = Math.max(0, Math.min(1, volume));
  try {
    graph.masterGain.gain.setTargetAtTime(clamped, graph.ctx.currentTime, 0.04);
  } catch {
    graph.masterGain.gain.value = clamped;
  }
}

export function stopSoundGraph(graph: ActiveSoundGraph | null) {
  if (!graph) return;
  graph.timers.forEach((id) => window.clearInterval(id));
  graph.ctx.close().catch(() => {});
}

export function buildSoundscapeGraph(
  mode: AmbientPresetId,
  volume: number
): ActiveSoundGraph {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(1, volume));
  masterGain.connect(ctx.destination);

  const timers: number[] = [];
  const bufLen = ctx.sampleRate * 3;
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);

  if (mode === "rain") {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.04) * 0.28;
    }

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1650;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(masterGain);
    src.start();

    const dropTimer = window.setInterval(() => {
      if (ctx.state !== "running" || Math.random() > 0.65) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(900 + Math.random() * 1400, ctx.currentTime);
      g.gain.setValueAtTime(0.015, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.045);
    }, 110);
    timers.push(dropTimer);
  } else if (mode === "cafe") {
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      data[i] = last * 0.28;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 420;
    f1.Q.value = 1.4;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(f1.frequency);
    lfo.start();

    src.connect(f1);
    f1.connect(masterGain);
    src.start();

    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
    const cupTimer = window.setInterval(() => {
      if (ctx.state !== "running" || Math.random() > 0.55) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], ctx.currentTime);
      g.gain.setValueAtTime(0.022, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.48);
    }, 950);
    timers.push(cupTimer);
  } else if (mode === "waves") {
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.14;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 480;

    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.5;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.14;

    const lfoFreqGain = ctx.createGain();
    lfoFreqGain.gain.value = 340;
    lfo.connect(lfoFreqGain);
    lfoFreqGain.connect(lp.frequency);

    const lfoAmpGain = ctx.createGain();
    lfoAmpGain.gain.value = 0.38;
    lfo.connect(lfoAmpGain);
    lfoAmpGain.connect(waveGain.gain);

    lfo.start();
    src.connect(lp);
    lp.connect(waveGain);
    waveGain.connect(masterGain);
    src.start();
  } else {
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.015 * w) / 1.015;
      data[i] = last * 0.32;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 210;

    src.connect(lp);
    lp.connect(masterGain);
    src.start();

    const crackleTimer = window.setInterval(() => {
      if (ctx.state !== "running") return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(2200 + Math.random() * 2800, ctx.currentTime);
      g.gain.setValueAtTime(0.035, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.018);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    }, 90);
    timers.push(crackleTimer);
  }

  return { ctx, timers, masterGain };
}
