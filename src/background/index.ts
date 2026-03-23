import { alarmName, createSession, getState, modeDurationMs, setState, trimSessions } from "../shared/storage";
import type { PersistedState, TimerCommand, TimerMode } from "../shared/types";

const createAlarm = (endsAt: number) => {
  chrome.alarms.create(alarmName, { when: endsAt });
};

const clearAlarm = async () => {
  await chrome.alarms.clear(alarmName);
};

const buildRunningTimer = (state: PersistedState) => {
  const now = Date.now();
  const durationMs = modeDurationMs(state.timer.mode, state.settings);

  return {
    ...state.timer,
    status: "running" as const,
    startedAt: now,
    endsAt: now + durationMs,
    remainingMs: durationMs
  };
};

const buildStoppedTimer = (state: PersistedState, mode: TimerMode = state.timer.mode) => ({
  ...state.timer,
  mode,
  status: "idle" as const,
  startedAt: null,
  endsAt: null,
  remainingMs: modeDurationMs(mode, state.settings)
});

const completeCurrentSession = async (state: PersistedState) => {
  const durationMs = modeDurationMs(state.timer.mode, state.settings);
  const nextMode: TimerMode = state.timer.mode === "focus" ? "break" : "focus";
  const sessions = trimSessions([
    ...state.sessions,
    createSession(state.timer.mode, durationMs)
  ]);

  const nextState: PersistedState = {
    ...state,
    sessions,
    timer: {
      ...buildStoppedTimer(state, nextMode),
      sessionCount: state.timer.mode === "focus" ? state.timer.sessionCount + 1 : state.timer.sessionCount
    }
  };

  if (nextMode === "break" && state.settings.autoStartBreaks) {
    nextState.timer = buildRunningTimer(nextState);
    createAlarm(nextState.timer.endsAt!);
  } else {
    await clearAlarm();
  }

  await setState(nextState);

  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: state.timer.mode === "focus" ? "Focus complete" : "Break complete",
    message: state.timer.mode === "focus" ? "Step away for a reset." : "Back to the grid."
  });
};

const syncExpiredTimer = async () => {
  const state = await getState();

  if (state.timer.status === "running" && state.timer.endsAt && state.timer.endsAt <= Date.now()) {
    await completeCurrentSession(state);
  }
};

const handleCommand = async (command: TimerCommand) => {
  const state = await getState();

  if (command.type === "start" && state.timer.status === "paused") {
    const now = Date.now();
    const nextState = {
      ...state,
      timer: {
        ...state.timer,
        status: "running" as const,
        startedAt: now,
        endsAt: now + state.timer.remainingMs
      }
    };
    await setState(nextState);
    createAlarm(nextState.timer.endsAt!);
    return nextState;
  }

  if (command.type === "start") {
    const nextState = { ...state, timer: buildRunningTimer(state) };
    await setState(nextState);
    createAlarm(nextState.timer.endsAt!);
    return nextState;
  }

  if (command.type === "pause" && state.timer.status === "running" && state.timer.endsAt) {
    const remainingMs = Math.max(0, state.timer.endsAt - Date.now());
    const nextState = {
      ...state,
      timer: {
        ...state.timer,
        status: "paused" as const,
        startedAt: null,
        endsAt: null,
        remainingMs
      }
    };
    await clearAlarm();
    await setState(nextState);
    return nextState;
  }

  if (command.type === "reset") {
    const nextState = { ...state, timer: buildStoppedTimer(state, "focus") };
    await clearAlarm();
    await setState(nextState);
    return nextState;
  }

  if (command.type === "skip") {
    await clearAlarm();
    await completeCurrentSession(state);
    return getState();
  }

  if (command.type === "setMode") {
    const nextState: PersistedState = {
      ...state,
      timer: buildStoppedTimer(state, command.payload.mode)
    };

    if (command.payload.autoStart) {
      nextState.timer = buildRunningTimer(nextState);
      createAlarm(nextState.timer.endsAt!);
    } else {
      await clearAlarm();
    }

    await setState(nextState);
    return nextState;
  }

  if (command.type === "updateSettings") {
    const settings = { ...state.settings, ...command.payload };
    const nextMode = state.timer.mode;
    const nextState = {
      ...state,
      settings,
      timer:
        state.timer.status === "running"
          ? state.timer
          : {
              ...state.timer,
              remainingMs: modeDurationMs(nextMode, settings)
            }
    };
    await setState(nextState);
    return nextState;
  }

  return state;
};

chrome.runtime.onInstalled.addListener(() => {
  void getState();
});

chrome.runtime.onStartup.addListener(() => {
  void syncExpiredTimer();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName) {
    void syncExpiredTimer();
  }
});

chrome.runtime.onMessage.addListener((message: TimerCommand | { type: "getState" }, _sender, sendResponse) => {
  void (async () => {
    if (message.type === "getState") {
      await syncExpiredTimer();
      sendResponse(await getState());
      return;
    }

    sendResponse(await handleCommand(message));
  })();

  return true;
});
