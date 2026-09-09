import type { PersistedState, SessionMode, SessionRecord, TimerMode, TimerSettings, TimerState } from "./types";

const STORAGE_KEY = "tempo-grid-state";
const ALARM_NAME = "tempo-grid-alarm";
const BADGE_ALARM_NAME = "forge-badge-tick";
const MAX_SESSIONS = 400;

export const defaultSettings: TimerSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
  soundVolume: 0.7,
  dailyGoalMinutes: 120,
  theme: "dark"
};

const defaultTimer = (settings: TimerSettings): TimerState => ({
  mode: "focus",
  status: "idle",
  startedAt: null,
  endsAt: null,
  remainingMs: settings.focusMinutes * 60_000,
  sessionCount: 0
});

export const defaultState = (): PersistedState => {
  const settings = { ...defaultSettings };

  return {
    settings,
    timer: defaultTimer(settings),
    sessions: []
  };
};

export const alarmName = ALARM_NAME;
export const badgeAlarmName = BADGE_ALARM_NAME;
export const stateStorageKey = STORAGE_KEY;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const modeDurationMs = (mode: TimerMode, settings: TimerSettings): number => {
  if (mode === "focus") {
    return settings.focusMinutes * 60_000;
  }

  if (mode === "longBreak") {
    return settings.longBreakMinutes * 60_000;
  }

  return settings.breakMinutes * 60_000;
};

export const nextBreakMode = (focusCount: number, settings: TimerSettings): TimerMode => {
  const every = Math.max(1, settings.sessionsUntilLongBreak);
  return focusCount > 0 && focusCount % every === 0 ? "longBreak" : "break";
};

export const toSessionMode = (mode: TimerMode): SessionMode => (mode === "focus" ? "focus" : "break");

export const getState = async (): Promise<PersistedState> => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY] as PersistedState | undefined;

  if (!state) {
    const freshState = defaultState();
    await setState(freshState);
    return freshState;
  }

  return normalizeState(state);
};

export const setState = async (state: PersistedState): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
};

export const createSession = (mode: TimerMode, durationMs: number): SessionRecord => ({
  id: `${toSessionMode(mode)}-${Date.now()}`,
  mode: toSessionMode(mode),
  durationMs,
  completedAt: new Date().toISOString()
});

export const trimSessions = (sessions: SessionRecord[]): SessionRecord[] => sessions.slice(-MAX_SESSIONS);

export const normalizeSettings = (settings?: Partial<TimerSettings> | null): TimerSettings => ({
  focusMinutes: clamp(Math.round(settings?.focusMinutes ?? defaultSettings.focusMinutes), 1, 180),
  breakMinutes: clamp(Math.round(settings?.breakMinutes ?? defaultSettings.breakMinutes), 1, 60),
  longBreakMinutes: clamp(Math.round(settings?.longBreakMinutes ?? defaultSettings.longBreakMinutes), 1, 60),
  sessionsUntilLongBreak: clamp(
    Math.round(settings?.sessionsUntilLongBreak ?? defaultSettings.sessionsUntilLongBreak),
    2,
    12
  ),
  autoStartBreaks: settings?.autoStartBreaks ?? defaultSettings.autoStartBreaks,
  autoStartFocus: settings?.autoStartFocus ?? defaultSettings.autoStartFocus,
  soundEnabled: settings?.soundEnabled ?? defaultSettings.soundEnabled,
  soundVolume: clamp(settings?.soundVolume ?? defaultSettings.soundVolume, 0, 1),
  dailyGoalMinutes: clamp(Math.round(settings?.dailyGoalMinutes ?? defaultSettings.dailyGoalMinutes), 0, 720),
  theme: settings?.theme === "light" ? "light" : "dark"
});

export const normalizeState = (state: PersistedState): PersistedState => {
  const settings = normalizeSettings(state.settings);
  const rawMode = state.timer?.mode;
  const timerMode: TimerMode = rawMode === "break" || rawMode === "longBreak" ? rawMode : "focus";

  return {
    settings,
    timer: {
      mode: timerMode,
      status: state.timer?.status ?? "idle",
      startedAt: state.timer?.startedAt ?? null,
      endsAt: state.timer?.endsAt ?? null,
      remainingMs: state.timer?.remainingMs ?? modeDurationMs(timerMode, settings),
      sessionCount: state.timer?.sessionCount ?? 0
    },
    sessions: trimSessions(state.sessions ?? [])
  };
};
