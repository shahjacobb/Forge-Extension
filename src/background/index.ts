import { maybeSyncCompletedSessions } from "../shared/account";
import {
  alarmName,
  badgeAlarmName,
  createSession,
  getState,
  modeDurationMs,
  nextBreakMode,
  setState,
  trimSessions
} from "../shared/storage";
import type { ChimeType, PersistedState, RuntimeMessage, TimerCommand, TimerMode } from "../shared/types";

const createAlarm = (endsAt: number) => {
  chrome.alarms.create(alarmName, { when: endsAt });
};

const playSound = (chime: ChimeType, volume: number, enabled: boolean) => {
  if (!enabled || volume <= 0) {
    return;
  }

  void (async () => {
    const offscreenUrl = chrome.runtime.getURL("offscreen.html");
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: "Play Still timer sounds"
      });
    }

    void chrome.runtime.sendMessage({ type: "playChime", chime, volume }).catch(() => {});
  })();
};

const clearAlarm = async () => {
  await chrome.alarms.clear(alarmName);
};

const formatBadge = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    return `${Math.round(minutes / 60)}h`;
  }

  if (minutes >= 10) {
    return `${minutes}m`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const updateBadge = async (state: PersistedState) => {
  const remainingMs =
    state.timer.status === "running" && state.timer.endsAt
      ? Math.max(0, state.timer.endsAt - Date.now())
      : state.timer.status === "paused"
        ? state.timer.remainingMs
        : 0;

  const color =
    state.timer.mode === "focus" ? "#6c6a60" : state.timer.mode === "longBreak" ? "#b9a57a" : "#8f9a7c";

  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor({ color: "#ffffff" }).catch(() => {});

  if (state.timer.status === "running" || state.timer.status === "paused") {
    await chrome.action.setBadgeText({ text: formatBadge(remainingMs) });
    await chrome.alarms.create(badgeAlarmName, { periodInMinutes: 1, delayInMinutes: 1 });
  } else {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.alarms.clear(badgeAlarmName);
  }
};

const buildRunningTimer = (state: PersistedState, mode: TimerMode = state.timer.mode) => {
  const now = Date.now();
  const durationMs = modeDurationMs(mode, state.settings);

  return {
    ...state.timer,
    mode,
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
  const completedMode = state.timer.mode;
  const nextCount = completedMode === "focus" ? state.timer.sessionCount + 1 : state.timer.sessionCount;
  const nextMode: TimerMode = completedMode === "focus" ? nextBreakMode(nextCount, state.settings) : "focus";
  const sessions = trimSessions([...state.sessions, createSession(completedMode, durationMs)]);

  const nextState: PersistedState = {
    ...state,
    sessions,
    timer: {
      ...buildStoppedTimer(state, nextMode),
      sessionCount: nextCount
    }
  };

  const shouldAutoStart =
    (nextMode !== "focus" && state.settings.autoStartBreaks) ||
    (nextMode === "focus" && state.settings.autoStartFocus);

  if (shouldAutoStart) {
    nextState.timer = buildRunningTimer(nextState, nextMode);
    createAlarm(nextState.timer.endsAt!);
  } else {
    await clearAlarm();
  }

  await setState(nextState);
  await updateBadge(nextState);
  void maybeSyncCompletedSessions(sessions);

  const isMilestone = completedMode === "focus" && nextCount > 0 && nextCount % state.settings.sessionsUntilLongBreak === 0;
  const chime: ChimeType = isMilestone
    ? "milestone"
    : completedMode === "longBreak"
      ? "longBreak"
      : completedMode === "focus"
        ? "focus"
        : "break";

  playSound(chime, state.settings.soundVolume, state.settings.soundEnabled);

  const title = isMilestone
    ? "Four sessions done — take a long break"
    : completedMode === "focus"
      ? "Focus session done"
      : completedMode === "longBreak"
        ? "Long break over"
        : "Break over";
  const message = isMilestone
    ? "Great work. Step away for 15–20 minutes."
    : completedMode === "focus"
      ? "Time to step away."
      : "Ready to focus again.";

  await chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon-128.png"),
    title,
    message
  });

  return nextState;
};

const syncExpiredTimer = async () => {
  const state = await getState();

  if (state.timer.status === "running" && state.timer.endsAt && state.timer.endsAt <= Date.now()) {
    await completeCurrentSession(state);
    return;
  }

  await updateBadge(state);
};

const handleCommand = async (command: TimerCommand) => {
  const state = await getState();

  if (command.type === "previewSound") {
    playSound(command.payload.chime, state.settings.soundVolume, true);
    return state;
  }

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
    await updateBadge(nextState);
    playSound("start", state.settings.soundVolume, state.settings.soundEnabled);
    return nextState;
  }

  if (command.type === "start") {
    const nextState = { ...state, timer: buildRunningTimer(state) };
    await setState(nextState);
    createAlarm(nextState.timer.endsAt!);
    await updateBadge(nextState);
    playSound("start", state.settings.soundVolume, state.settings.soundEnabled);
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
    await updateBadge(nextState);
    playSound("pause", state.settings.soundVolume, state.settings.soundEnabled);
    return nextState;
  }

  if (command.type === "reset") {
    const nextState = { ...state, timer: buildStoppedTimer(state, "focus") };
    await clearAlarm();
    await setState(nextState);
    await updateBadge(nextState);
    return nextState;
  }

  if (command.type === "skip") {
    playSound("skip", state.settings.soundVolume, state.settings.soundEnabled);
    await clearAlarm();
    return completeCurrentSession(state);
  }

  if (command.type === "setMode") {
    const nextState: PersistedState = {
      ...state,
      timer: buildStoppedTimer(state, command.payload.mode)
    };

    if (command.payload.autoStart) {
      nextState.timer = buildRunningTimer(nextState, command.payload.mode);
      createAlarm(nextState.timer.endsAt!);
    } else {
      await clearAlarm();
    }

    await setState(nextState);
    await updateBadge(nextState);
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
    await updateBadge(nextState);
    return nextState;
  }

  return state;
};

chrome.runtime.onInstalled.addListener(() => {
  void getState().then(updateBadge);
});

chrome.runtime.onStartup.addListener(() => {
  void syncExpiredTimer();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName) {
    void syncExpiredTimer();
    return;
  }

  if (alarm.name === badgeAlarmName) {
    void getState().then(updateBadge);
  }
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "toggle-timer") {
    void (async () => {
      const state = await getState();
      await handleCommand({ type: state.timer.status === "running" ? "pause" : "start" });
    })();
  }

  if (command === "skip-session") {
    void handleCommand({ type: "skip" });
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage | { type: "playChime" }, _sender, sendResponse) => {
  if ("type" in message && message.type === "playChime") {
    return;
  }

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
