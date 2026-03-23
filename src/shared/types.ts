export type TimerMode = "focus" | "break";
export type TimerStatus = "idle" | "running" | "paused";

export interface TimerSettings {
  focusMinutes: number;
  breakMinutes: number;
  autoStartBreaks: boolean;
}

export interface SessionRecord {
  id: string;
  mode: TimerMode;
  durationMs: number;
  completedAt: string;
}

export interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  startedAt: number | null;
  endsAt: number | null;
  remainingMs: number;
  sessionCount: number;
}

export interface PersistedState {
  settings: TimerSettings;
  timer: TimerState;
  sessions: SessionRecord[];
}

export type TimerCommand =
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "skip" }
  | { type: "setMode"; payload: { mode: TimerMode; autoStart?: boolean } }
  | { type: "updateSettings"; payload: Partial<TimerSettings> };
