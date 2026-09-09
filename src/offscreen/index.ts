import { playChime } from "../shared/chimes";
import type { ChimeType } from "../shared/types";

chrome.runtime.onMessage.addListener((message: { type: string; chime?: ChimeType; volume?: number }) => {
  if (message.type === "playChime") {
    void playChime(message.chime ?? "focus", message.volume ?? 0.7);
  }
});
