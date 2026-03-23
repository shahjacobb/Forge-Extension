import type { PersistedState, SessionRecord, TimerMode, TimerSettings, TimerState } from "./types";

const STORAGE_KEY = "tempo-grid-state";
const ALARM_NAME = "tempo-grid-alarm";
const MAX_SESSIONS = 90;

export const defaultSettings: TimerSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  autoStartBreaks: false
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

export const modeDurationMs = (mode: TimerMode, settings: TimerSettings): number =>
  (mode === "focus" ? settings.focusMinutes : settings.breakMinutes) * 60_000;

export const createSession = (mode: TimerMode, durationMs: number): SessionRecord => ({
  id: `${mode}-${Date.now()}`,
  mode,
  durationMs,
  completedAt: new Date().toISOString()
});

export const trimSessions = (sessions: SessionRecord[]): SessionRecord[] => sessions.slice(-MAX_SESSIONS);

export const normalizeState = (state: PersistedState): PersistedState => {
  const settings = {
    focusMinutes: Math.max(1, state.settings?.focusMinutes ?? defaultSettings.focusMinutes),
    breakMinutes: Math.max(1, state.settings?.breakMinutes ?? defaultSettings.breakMinutes),
    autoStartBreaks: state.settings?.autoStartBreaks ?? defaultSettings.autoStartBreaks
  };

  const timerMode = state.timer?.mode ?? "focus";

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
