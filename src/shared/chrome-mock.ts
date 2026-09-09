import { playChime } from "./chimes";
import { defaultState, modeDurationMs, nextBreakMode, normalizeSettings, normalizeState } from "./storage";
import type { ChimeType, PersistedState, RuntimeMessage, TimerMode } from "./types";

const memoryLocal = new Map<string, unknown>();
const memorySync = new Map<string, unknown>();
const demoSessions = () => {
  const now = new Date();
  now.setHours(18, 0, 0, 0);
  const days = [0, 0, 1, 2, 3, 5, 6];
  return days.flatMap((offset, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - offset));
    date.setMinutes(index * 7);
    return [
      {
        id: `focus-demo-${offset}-${index}`,
        mode: "focus" as const,
        durationMs: (25 + (index % 3) * 5) * 60_000,
        completedAt: date.toISOString()
      }
    ];
  });
};

let state = normalizeState({
  ...defaultState(),
  sessions: demoSessions(),
  timer: {
    ...defaultState().timer,
    sessionCount: demoSessions().length
  }
});
const listeners = new Set<(message: unknown) => void>();

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const playPreview = (chime: ChimeType, volume: number) => {
  void playChime(chime, volume);
  listeners.forEach((listener) => listener({ type: "playChime", chime, volume }));
};

const completeSession = () => {
  const durationMs = modeDurationMs(state.timer.mode, state.settings);
  const completedMode = state.timer.mode;
  const nextCount = completedMode === "focus" ? state.timer.sessionCount + 1 : state.timer.sessionCount;
  const nextMode: TimerMode = completedMode === "focus" ? nextBreakMode(nextCount, state.settings) : "focus";

  state = normalizeState({
    ...state,
    sessions: [
      ...state.sessions,
      {
        id: `${completedMode === "focus" ? "focus" : "break"}-${Date.now()}`,
        mode: completedMode === "focus" ? "focus" : "break",
        durationMs,
        completedAt: new Date().toISOString()
      }
    ],
    timer: {
      mode: nextMode,
      status: "idle",
      startedAt: null,
      endsAt: null,
      remainingMs: modeDurationMs(nextMode, state.settings),
      sessionCount: nextCount
    }
  });

  const shouldAutoStart =
    (nextMode !== "focus" && state.settings.autoStartBreaks) ||
    (nextMode === "focus" && state.settings.autoStartFocus);

  if (shouldAutoStart) {
    const now = Date.now();
    state.timer = {
      ...state.timer,
      status: "running",
      startedAt: now,
      endsAt: now + state.timer.remainingMs
    };
  }

  return clone(state);
};

const handleMessage = async (message: RuntimeMessage): Promise<PersistedState> => {
  if (message.type === "getState") {
    if (state.timer.status === "running" && state.timer.endsAt && state.timer.endsAt <= Date.now()) {
      completeSession();
    }
    return clone(state);
  }

  if (message.type === "previewSound") {
    playPreview(message.payload.chime, state.settings.soundVolume);
    return clone(state);
  }

  if (message.type === "start" && state.timer.status === "paused") {
    const now = Date.now();
    state = {
      ...state,
      timer: {
        ...state.timer,
        status: "running",
        startedAt: now,
        endsAt: now + state.timer.remainingMs
      }
    };
    if (state.settings.soundEnabled) {
      playPreview("start", state.settings.soundVolume);
    }
    return clone(state);
  }

  if (message.type === "start") {
    const now = Date.now();
    const durationMs = modeDurationMs(state.timer.mode, state.settings);
    state = {
      ...state,
      timer: {
        ...state.timer,
        status: "running",
        startedAt: now,
        endsAt: now + durationMs,
        remainingMs: durationMs
      }
    };
    if (state.settings.soundEnabled) {
      playPreview("start", state.settings.soundVolume);
    }
    return clone(state);
  }

  if (message.type === "pause" && state.timer.status === "running" && state.timer.endsAt) {
    state = {
      ...state,
      timer: {
        ...state.timer,
        status: "paused",
        startedAt: null,
        endsAt: null,
        remainingMs: Math.max(0, state.timer.endsAt - Date.now())
      }
    };
    if (state.settings.soundEnabled) {
      playPreview("pause", state.settings.soundVolume);
    }
    return clone(state);
  }

  if (message.type === "reset") {
    state = {
      ...state,
      timer: {
        mode: "focus",
        status: "idle",
        startedAt: null,
        endsAt: null,
        remainingMs: modeDurationMs("focus", state.settings),
        sessionCount: state.timer.sessionCount
      }
    };
    return clone(state);
  }

  if (message.type === "skip") {
    if (state.settings.soundEnabled) {
      playPreview("skip", state.settings.soundVolume);
    }
    return completeSession();
  }

  if (message.type === "setMode") {
    const durationMs = modeDurationMs(message.payload.mode, state.settings);
    const now = Date.now();
    state = {
      ...state,
      timer: {
        ...state.timer,
        mode: message.payload.mode,
        status: message.payload.autoStart ? "running" : "idle",
        startedAt: message.payload.autoStart ? now : null,
        endsAt: message.payload.autoStart ? now + durationMs : null,
        remainingMs: durationMs
      }
    };
    return clone(state);
  }

  if (message.type === "updateSettings") {
    const settings = normalizeSettings({ ...state.settings, ...message.payload });
    state = {
      ...state,
      settings,
      timer:
        state.timer.status === "running"
          ? state.timer
          : {
              ...state.timer,
              remainingMs: modeDurationMs(state.timer.mode, settings)
            }
    };
    return clone(state);
  }

  return clone(state);
};

const storageArea = (map: Map<string, unknown>) => ({
  get: async (keys?: string | string[] | Record<string, unknown> | null) => {
    if (!keys) {
      return Object.fromEntries(map);
    }

    if (typeof keys === "string") {
      return map.has(keys) ? { [keys]: map.get(keys) } : {};
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.filter((key) => map.has(key)).map((key) => [key, map.get(key)]));
    }

    return {};
  },
  set: async (items: Record<string, unknown>) => {
    Object.entries(items).forEach(([key, value]) => map.set(key, value));
  },
  remove: async (keys: string | string[]) => {
    (Array.isArray(keys) ? keys : [keys]).forEach((key) => map.delete(key));
  },
  clear: async () => map.clear()
});

export const installChromeMock = (): void => {
  const runtime = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime;
  if (runtime?.id) {
    return;
  }

  (globalThis as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (message: RuntimeMessage, callback?: (response: PersistedState) => void) => {
        const result = handleMessage(message);
        if (callback) {
          void result.then(callback);
          return true;
        }
        return result;
      },
      getURL: (path: string) => path,
      onMessage: {
        addListener: (callback: (message: unknown) => void) => listeners.add(callback),
        removeListener: (callback: (message: unknown) => void) => listeners.delete(callback)
      }
    },
    storage: {
      local: storageArea(memoryLocal),
      sync: storageArea(memorySync)
    }
  };
};
