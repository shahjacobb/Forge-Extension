export type TimerMode = "focus" | "break" | "longBreak";
export type SessionMode = "focus" | "break";
export type TimerStatus = "idle" | "running" | "paused";
export type ThemePreference = "light" | "dark";

export interface TimerSettings {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  sessionsUntilLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  dailyGoalMinutes: number;
  theme: ThemePreference;
}

export interface SessionRecord {
  id: string;
  mode: SessionMode;
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

export type ChimeType = "start" | "pause" | "focus" | "break" | "longBreak" | "milestone" | "skip";

export type TimerCommand =
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "skip" }
  | { type: "setMode"; payload: { mode: TimerMode; autoStart?: boolean } }
  | { type: "updateSettings"; payload: Partial<TimerSettings> }
  | { type: "previewSound"; payload: { chime: ChimeType } };

export type RuntimeMessage = TimerCommand | { type: "getState" };
