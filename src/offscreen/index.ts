type ChimeType = "focus" | "break" | "milestone";

const playChime = (type: ChimeType) => {
  const ctx = new AudioContext();

  // focus done: two ascending notes — clean, signals work is over
  // break done: single soft low note — gentle, signals rest is over
  // milestone (every 4th session): three-note ascending celebration
  const notes: { freq: number; time: number; vol?: number }[] =
    type === "focus"
      ? [{ freq: 880, time: 0 }, { freq: 1108, time: 0.2 }]
      : type === "break"
        ? [{ freq: 528, time: 0, vol: 0.3 }]
        : [{ freq: 880, time: 0 }, { freq: 1108, time: 0.18 }, { freq: 1320, time: 0.36 }];

  notes.forEach(({ freq, time, vol = 0.4 }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    const start = ctx.currentTime + time;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);

    osc.start(start);
    osc.stop(start + 0.75);
  });
};

chrome.runtime.onMessage.addListener((message: { type: string; chime?: ChimeType }) => {
  if (message.type === "playChime") {
    playChime(message.chime ?? "focus");
  }
});
