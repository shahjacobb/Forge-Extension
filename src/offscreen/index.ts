type ChimeType = "focus" | "break" | "milestone" | "start" | "pause";

const playChime = (type: ChimeType) => {
  const ctx = new AudioContext();

  type Note = { freq: number; time: number; vol?: number; duration?: number };

  let notes: Note[];

  if (type === "start") {
    // Short soft click-up — confirms the session kicked off
    notes = [{ freq: 660, time: 0, vol: 0.25, duration: 0.12 }];
  } else if (type === "pause") {
    // Slightly lower, fades out — signals things slowing down
    notes = [{ freq: 440, time: 0, vol: 0.2, duration: 0.18 }];
  } else if (type === "focus") {
    // Two ascending notes — work is done, clean finish
    notes = [{ freq: 880, time: 0 }, { freq: 1108, time: 0.2 }];
  } else if (type === "break") {
    // Single soft low note — gentle, rest is over
    notes = [{ freq: 528, time: 0, vol: 0.3 }];
  } else {
    // Milestone: three-note celebration
    notes = [{ freq: 880, time: 0 }, { freq: 1108, time: 0.18 }, { freq: 1320, time: 0.36 }];
  }

  notes.forEach(({ freq, time, vol = 0.4, duration = 0.7 }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    const start = ctx.currentTime + time;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.start(start);
    osc.stop(start + duration + 0.05);
  });
};

chrome.runtime.onMessage.addListener((message: { type: string; chime?: ChimeType }) => {
  if (message.type === "playChime") {
    playChime(message.chime ?? "focus");
  }
});
