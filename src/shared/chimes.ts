import type { ChimeType } from "./types";

type Note = {
  freq: number;
  time: number;
  vol?: number;
  duration?: number;
  type?: OscillatorType;
  detune?: number;
};

const notesFor = (type: ChimeType): Note[] => {
  if (type === "start") {
    return [
      { freq: 523.25, time: 0, vol: 0.2, duration: 0.16, type: "triangle" },
      { freq: 783.99, time: 0.07, vol: 0.18, duration: 0.2 }
    ];
  }

  if (type === "pause") {
    return [
      { freq: 392, time: 0, vol: 0.16, duration: 0.18, type: "triangle" },
      { freq: 329.63, time: 0.08, vol: 0.14, duration: 0.22 }
    ];
  }

  if (type === "skip") {
    return [
      { freq: 659.25, time: 0, vol: 0.12, duration: 0.1, type: "triangle" },
      { freq: 493.88, time: 0.08, vol: 0.1, duration: 0.12 }
    ];
  }

  if (type === "focus") {
    return [
      { freq: 659.25, time: 0, vol: 0.24, duration: 0.55 },
      { freq: 830.61, time: 0.16, vol: 0.22, duration: 0.6 },
      { freq: 659.25, time: 0, vol: 0.08, duration: 0.7, type: "triangle", detune: -8 }
    ];
  }

  if (type === "break") {
    return [
      { freq: 493.88, time: 0, vol: 0.2, duration: 0.7 },
      { freq: 392, time: 0.12, vol: 0.16, duration: 0.75, type: "triangle" }
    ];
  }

  if (type === "longBreak") {
    return [
      { freq: 392, time: 0, vol: 0.18, duration: 0.7 },
      { freq: 493.88, time: 0.14, vol: 0.16, duration: 0.7 },
      { freq: 587.33, time: 0.28, vol: 0.14, duration: 0.8 }
    ];
  }

  return [
    { freq: 523.25, time: 0, vol: 0.22, duration: 0.45 },
    { freq: 659.25, time: 0.14, vol: 0.2, duration: 0.45 },
    { freq: 783.99, time: 0.28, vol: 0.2, duration: 0.5 },
    { freq: 1046.5, time: 0.44, vol: 0.16, duration: 0.7 },
    { freq: 523.25, time: 0, vol: 0.07, duration: 0.9, type: "triangle", detune: 6 }
  ];
};

export const playChime = async (type: ChimeType, volume = 0.7): Promise<void> => {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  notesFor(type).forEach(({ freq, time, vol = 0.28, duration = 0.55, type: wave = "sine", detune = 0 }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.value = 2200;
    filter.Q.value = 0.7;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc.type = wave;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const start = ctx.currentTime + time;
    const peak = Math.max(0.0008, vol * volume);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.start(start);
    osc.stop(start + duration + 0.04);
  });

  window.setTimeout(() => {
    void ctx.close();
  }, 1800);
};
