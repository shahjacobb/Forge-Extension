import React from "react";
import ReactDOM from "react-dom/client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { User } from "@supabase/supabase-js";
import { installChromeMock } from "../shared/chrome-mock";
import {
  getAccountSnapshot,
  requestPasswordReset,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  syncAccountState,
  syncSessionsToAccount,
  syncSettingsToAccount,
  updateProfileName
} from "../shared/account";
import {
  buildMonthData,
  buildWeeklyData,
  computeStreak,
  getCompletionMessage,
  getWeekLabel,
  modeLabel
} from "../shared/analytics";
import { supabase } from "../shared/supabase";
import type { ChimeType, PersistedState, RuntimeMessage, TimerCommand, TimerMode, TimerSettings } from "../shared/types";
import "./styles.css";

installChromeMock();

const sendMessage = <T,>(message: RuntimeMessage): Promise<T> =>
  chrome.runtime.sendMessage(message) as Promise<T>;

const formatClock = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

const firstName = (value: string): string => value.trim().split(/\s+/)[0] || value;

type PopupView = "timer" | "activity" | "settings";
type AuthMode = "signin" | "signup";
type CompletedMode = TimerMode | "milestone";

const Mark = () => (
  <span className="mark" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6.2" r="4.1" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6 6.2V3.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M6 1.4v1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  </span>
);

const TimerIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="9" r="5.2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 6.6V9l1.6 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6 2.2h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const ActivityIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 12V8.5M7 12V4.5M11 12V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8 2.4v1.3M8 12.3v1.3M2.4 8h1.3M12.3 8h1.3M4 4l.9.9M11.1 11.1l.9.9M12 4l-.9.9M4.9 11.1l-.9.9"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const TimerRing = ({
  progress,
  mode,
  running
}: {
  progress: number;
  mode: TimerMode;
  running: boolean;
}) => {
  const size = 228;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, progress)) / 100);
  const color = mode === "focus" ? "var(--primary)" : mode === "longBreak" ? "var(--gold)" : "var(--success)";

  return (
    <svg viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--ring-track)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: running ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 240ms ease" }}
      />
    </svg>
  );
};

const chartTooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  color: "var(--ink)",
  fontSize: 12
};

const previewParams = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
const previewDemoMs = Number(previewParams.get("demoMs"));
const previewView = ((): PopupView => {
  const value = previewParams.get("view");
  return value === "activity" || value === "settings" ? value : "timer";
})();
const previewActivity = previewParams.get("range") === "month" ? "monthly" : "weekly";

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [view, setView] = React.useState<PopupView>(previewView);
  const [settingsDraft, setSettingsDraft] = React.useState<TimerSettings | null>(null);
  const [authUser, setAuthUser] = React.useState<User | null>(null);
  const [profileName, setProfileName] = React.useState("");
  const [authEmail, setAuthEmail] = React.useState("");
  const [authPassword, setAuthPassword] = React.useState("");
  const [authDisplayName, setAuthDisplayName] = React.useState("");
  const [authMode, setAuthMode] = React.useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = React.useState(false);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authNotice, setAuthNotice] = React.useState<string | null>(null);
  const [cloudConfigured, setCloudConfigured] = React.useState(true);
  const [completedMode, setCompletedMode] = React.useState<CompletedMode | null>(null);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [monthOffset, setMonthOffset] = React.useState(0);
  const [activityMode, setActivityMode] = React.useState<"weekly" | "monthly">(previewActivity);
  const prevSessions = React.useRef<number | null>(null);

  const refresh = React.useCallback(async () => {
    const nextState = await sendMessage<PersistedState>({ type: "getState" });
    const account = await getAccountSnapshot();
    setCloudConfigured(account.configured);
    setAuthUser(account.user);
    setProfileName(account.profile?.display_name ?? account.user?.email?.split("@")[0] ?? "");

    if (account.user) {
      try {
        const syncedState = await syncAccountState(account.user);
        setState(syncedState);
        return;
      } catch {
        setState(nextState);
        return;
      }
    }

    setState(nextState);
  }, []);

  React.useEffect(() => {
    if (previewParams.has("shot")) {
      document.documentElement.dataset.shot = "true";
    }

    void (async () => {
      await refresh();
      if (previewParams.get("running") === "1") {
        const next = await sendMessage<PersistedState>({ type: "start" });
        setState(next);
      }
      if (previewParams.get("modal") === "1") {
        setCompletedMode(previewParams.get("milestone") === "1" ? "milestone" : "focus");
        setView("timer");
      }
    })();

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    if (state?.timer.status !== "running") {
      return;
    }
    const poll = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(poll);
  }, [state?.timer.status, refresh]);

  const settingsSignature = state ? JSON.stringify(state.settings) : "";

  React.useEffect(() => {
    if (!state) {
      return;
    }

    setSettingsDraft(state.settings);
  }, [settingsSignature]);

  React.useEffect(() => {
    if (!state) {
      return;
    }

    if (prevSessions.current !== null && state.sessions.length > prevSessions.current) {
      const last = state.sessions.at(-1);
      if (last?.mode === "focus") {
        const isMilestone =
          state.timer.sessionCount > 0 && state.timer.sessionCount % state.settings.sessionsUntilLongBreak === 0;
        setCompletedMode(isMilestone ? "milestone" : "focus");
      } else if (state.timer.mode === "focus") {
        setCompletedMode(state.settings.sessionsUntilLongBreak > 0 && state.timer.sessionCount % state.settings.sessionsUntilLongBreak === 0 ? "longBreak" : "break");
      } else {
        setCompletedMode("break");
      }
      setView("timer");
    }

    prevSessions.current = state.sessions.length;
  }, [state]);

  React.useEffect(() => {
    if (!supabase) {
      return;
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void sendMessage<PersistedState>({ type: state?.timer.status === "running" ? "pause" : "start" }).then(setState);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state?.timer.status]);

  if (!state) {
    return <main className="app loading">Loading</main>;
  }

  const remainingMs =
    state.timer.status === "running" && state.timer.endsAt
      ? Math.max(0, state.timer.endsAt - now)
      : state.timer.remainingMs;
  const scheduledMs = Math.max(1, (state.timer.mode === "focus"
    ? state.settings.focusMinutes
    : state.timer.mode === "longBreak"
      ? state.settings.longBreakMinutes
      : state.settings.breakMinutes) * 60_000);
  const totalMs = Number.isFinite(previewDemoMs) && previewDemoMs > 0 ? previewDemoMs : scheduledMs;
  const progressPct = state.timer.status === "idle" ? 0 : Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100));
  const currentWeekData = buildWeeklyData(state.sessions);
  const focusToday = currentWeekData.at(-1)?.minutes ?? 0;
  const sessionsToday = currentWeekData.at(-1)?.sessions ?? 0;
  const currentWeekTotal = currentWeekData.reduce((sum, day) => sum + day.minutes, 0);
  const streak = computeStreak(state.sessions);
  const viewedWeekData = weekOffset === 0 ? currentWeekData : buildWeeklyData(state.sessions, weekOffset);
  const viewedWeekTotal = viewedWeekData.reduce((sum, day) => sum + day.minutes, 0);
  const monthData = buildMonthData(state.sessions, monthOffset);
  const maxDayMinutes = Math.max(1, ...monthData.days.map((day) => day.minutes));
  const isRunning = state.timer.status === "running";
  const greetingName = profileName ? firstName(profileName) : "";
  const goal = state.settings.dailyGoalMinutes;
  const goalPct = goal > 0 ? Math.min(100, (focusToday / goal) * 100) : 0;
  const nextBreak = state.timer.sessionCount > 0 && (state.timer.sessionCount + 1) % state.settings.sessionsUntilLongBreak === 0
    ? "long break"
    : "break";

  const act = async (command: TimerCommand) => {
    const nextState = await sendMessage<PersistedState>(command);
    setNow(Date.now());
    setState(nextState);

    if (authUser && (command.type === "skip" || command.type === "start")) {
      void syncSessionsToAccount(authUser.id, nextState.sessions).catch(() => {});
    }
  };

  const switchMode = async (mode: TimerMode) => {
    setState(await sendMessage<PersistedState>({ type: "setMode", payload: { mode } }));
    setNow(Date.now());
  };

  const updateSettings = async (patch: Partial<TimerSettings>) => {
    const nextState = await sendMessage<PersistedState>({ type: "updateSettings", payload: patch });
    setState(nextState);
    return nextState;
  };

  const hasSettingsChanges =
    settingsDraft !== null && JSON.stringify(settingsDraft) !== JSON.stringify(state.settings);

  const saveSettings = async () => {
    if (!settingsDraft) {
      return;
    }

    const nextState = await updateSettings(settingsDraft);
    if (authUser) {
      await syncSettingsToAccount(authUser.id, nextState.settings);
    }
    setAuthNotice("Settings saved.");
  };

  const applyPreset = (focusMinutes: number, breakMinutes: number, longBreakMinutes: number) => {
    const next = {
      ...(settingsDraft ?? state.settings),
      focusMinutes,
      breakMinutes,
      longBreakMinutes
    };
    setSettingsDraft(next);
    void updateSettings({ focusMinutes, breakMinutes, longBreakMinutes });
  };

  const handleAuth = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      if (authMode === "signup") {
        const { error, data } = await signUpWithEmail(authEmail, authPassword, authDisplayName);
        if (error) {
          setAuthError(error.message);
          return;
        }
        if (!data.session) {
          setAuthNotice("Check your email to confirm, then sign in on any Chrome profile.");
          return;
        }
        setAuthNotice("Account created. Your sessions will follow you.");
      } else {
        const { error } = await signInWithEmail(authEmail, authPassword);
        if (error) {
          setAuthError(error.message);
          return;
        }
        setAuthNotice("Signed in. This profile is now synced.");
      }
      await refresh();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not reach your account.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError(null);
    await signOutAccount();
    setAuthBusy(false);
    setAuthNotice("Signed out on this Chrome profile.");
    await refresh();
  };

  const handleProfileSave = async () => {
    if (!authUser) {
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    const { error } = await updateProfileName(authUser.id, profileName.trim());
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthNotice("Profile updated.");
    await refresh();
  };

  const handleReset = async () => {
    if (!authEmail) {
      setAuthError("Enter your email first.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    const { error } = await requestPasswordReset(authEmail);
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthNotice("Reset link sent. Open it in a browser, then sign in here.");
  };

  const statusText = isRunning
    ? `${modeLabel(state.timer.mode)} in progress`
    : state.timer.status === "paused"
      ? "Paused — press space to resume"
      : `Next up: ${modeLabel(state.timer.mode)}`;

  const chartColor = "#9a9588";

  return (
    <main className="app">
      <div className="frame">
        <header className="topbar">
          <div className="brand">
            <Mark />
            <div className="brand-copy">
              <div className="brand-name">Lahza</div>
              <div className="brand-sub">
                {greetingName ? `Good focus, ${greetingName}` : formatDate(new Date(now))}
              </div>
            </div>
          </div>
          <button
            className={`account-chip${authUser ? "" : " guest"}`}
            onClick={() => setView("settings")}
          >
            <span className="dot" />
            <span>{authUser ? "Synced" : "Sign in"}</span>
          </button>
        </header>

        {view === "timer" ? (
          <section className="view timer-view">
            <div className="ring-wrap">
              <TimerRing progress={progressPct} mode={state.timer.mode} running={isRunning} />
              <div className="ring-center">
                <div className="mode-kicker">{modeLabel(state.timer.mode)}</div>
                <div className="clock">{formatClock(remainingMs)}</div>
                <div className="status-line">
                  <span
                    className={`status-dot${isRunning ? " live" : ""}${state.timer.mode === "break" ? " break" : ""}${state.timer.mode === "longBreak" ? " long" : ""}`}
                  />
                  {statusText}
                </div>
              </div>
            </div>

            <div className="mode-switcher">
              <button className={`mode-toggle${state.timer.mode === "focus" ? " selected" : ""}`} onClick={() => void switchMode("focus")}>
                Focus
              </button>
              <button className={`mode-toggle${state.timer.mode === "break" ? " selected" : ""}`} onClick={() => void switchMode("break")}>
                Break
              </button>
              <button className={`mode-toggle${state.timer.mode === "longBreak" ? " selected" : ""}`} onClick={() => void switchMode("longBreak")}>
                Long
              </button>
            </div>

            <div className="actions">
              <button
                className={`cta${isRunning ? " pause" : ""}`}
                onClick={() => void act({ type: isRunning ? "pause" : "start" })}
              >
                {isRunning ? "Pause" : state.timer.status === "paused" ? `Resume ${modeLabel(state.timer.mode).toLowerCase()}` : `Start ${modeLabel(state.timer.mode).toLowerCase()}`}
              </button>
              <div className="utility-row">
                <button className="linkish" onClick={() => void act({ type: "skip" })}>
                  Skip to {state.timer.mode === "focus" ? nextBreak : "focus"}
                </button>
                <button className="linkish" onClick={() => void act({ type: "start" })}>
                  Restart
                </button>
                <button className="linkish" onClick={() => void act({ type: "reset" })}>
                  Reset
                </button>
              </div>
            </div>

            <div className="goal">
              <div className="goal-row">
                <span>Today</span>
                <strong>
                  {focusToday} / {goal || "—"} min
                </strong>
              </div>
              <div className="track" aria-hidden="true">
                <span style={{ width: `${goalPct}%` }} />
              </div>
              <div className="meta-row">
                <span>{sessionsToday} sessions</span>
                <span>{streak} day streak</span>
                <span>{state.timer.sessionCount} total</span>
              </div>
            </div>

            {!authUser && cloudConfigured ? (
              <div className="sync-banner">
                <p>Sign in to keep this timer in every Chrome profile.</p>
                <button onClick={() => setView("settings")}>Account</button>
              </div>
            ) : null}
          </section>
        ) : null}

        {view === "activity" ? (
          <section className="view">
            <div className="heading">
              <div>
                <h1>Activity</h1>
                <p>{formatDate(new Date(now))}</p>
              </div>
              <div className="segmented">
                <button className={activityMode === "weekly" ? "active" : ""} onClick={() => setActivityMode("weekly")}>
                  Week
                </button>
                <button className={activityMode === "monthly" ? "active" : ""} onClick={() => setActivityMode("monthly")}>
                  Month
                </button>
              </div>
            </div>

            <div className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">Today</span>
                <strong>{focusToday}m</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">Week</span>
                <strong>{currentWeekTotal}m</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">Streak</span>
                <strong>{streak}d</strong>
              </article>
            </div>

            {activityMode === "weekly" ? (
              <>
                <div className="panel-header">
                  <h2>{getWeekLabel(weekOffset)}</h2>
                  <div className="week-nav">
                    <button className="icon-btn" onClick={() => setWeekOffset((value) => value - 1)}>←</button>
                    {weekOffset < 0 ? <button className="icon-btn" onClick={() => setWeekOffset((value) => Math.min(0, value + 1))}>→</button> : null}
                    {weekOffset < 0 ? <button className="icon-btn" onClick={() => setWeekOffset(0)}>Today</button> : null}
                  </div>
                </div>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={viewedWeekData}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} width={28} tick={{ fill: "currentColor", fontSize: 10 }} tickFormatter={(value: number) => `${value}m`} />
                      <Tooltip cursor={{ fill: "var(--primary-soft)" }} contentStyle={chartTooltipStyle} formatter={(value: number) => [`${value} min`, "Focus"]} />
                      <Bar dataKey="minutes" fill={chartColor} radius={[4, 4, 1, 1]} minPointSize={viewedWeekTotal === 0 ? 0 : 2} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {viewedWeekTotal === 0 ? <div className="activity-empty">No focus yet this week. Start a session and it lands here.</div> : null}
                <div className="activity-list">
                  {viewedWeekData.map((day) => (
                    <article className="activity-row" key={day.key}>
                      <div>
                        <strong>{day.fullLabel}</strong>
                        <div className="activity-subtle">{day.sessions > 0 ? `${day.sessions} focus session${day.sessions === 1 ? "" : "s"}` : "No sessions"}</div>
                      </div>
                      <strong>{day.minutes} min</strong>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="panel-header">
                  <h2>{monthData.label}</h2>
                  <div className="month-nav">
                    <button className="icon-btn" onClick={() => setMonthOffset((value) => value - 1)}>←</button>
                    {monthOffset < 0 ? <button className="icon-btn" onClick={() => setMonthOffset((value) => Math.min(0, value + 1))}>→</button> : null}
                    {monthOffset < 0 ? <button className="icon-btn" onClick={() => setMonthOffset(0)}>Today</button> : null}
                  </div>
                </div>
                <div className="calendar-grid">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div className="calendar-header" key={day}>{day}</div>
                  ))}
                  {monthData.days.map((day) => (
                    <div className={`calendar-day${day.isToday ? " today" : ""}${day.minutes > 0 ? " has-data" : ""}${day.isOutside ? " outside" : ""}`} key={day.key}>
                      {day.minutes > 0 ? (
                        <div className="heat-bg" style={{ background: `rgba(159, 154, 136, ${0.12 + 0.42 * (day.minutes / maxDayMinutes)})` }} />
                      ) : null}
                      <span>{day.day}</span>
                    </div>
                  ))}
                </div>
                <div className="month-summary">
                  <span><strong>{monthData.totalMinutes}</strong> min</span>
                  <span><strong>{monthData.activeDays}</strong> active days</span>
                </div>
              </>
            )}
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="view">
            <div className="heading">
              <div>
                <h1>Settings</h1>
                <p>Durations, sound, and the account that follows you across Chrome profiles.</p>
              </div>
            </div>

            <div className="presets">
              {[
                { label: "Classic", focus: 25, brk: 5, long: 15 },
                { label: "Deep", focus: 50, brk: 10, long: 20 },
                { label: "Sprint", focus: 15, brk: 3, long: 10 }
              ].map((preset) => {
                const active =
                  settingsDraft?.focusMinutes === preset.focus &&
                  settingsDraft?.breakMinutes === preset.brk &&
                  settingsDraft?.longBreakMinutes === preset.long;
                return (
                  <button key={preset.label} className={`preset${active ? " active" : ""}`} onClick={() => applyPreset(preset.focus, preset.brk, preset.long)}>
                    <strong>{preset.label}</strong>
                    {preset.focus}/{preset.brk}
                  </button>
                );
              })}
            </div>

            <section className="settings-group">
              {(
                [
                  ["focusMinutes", "Focus", "Length of a deep work block."],
                  ["breakMinutes", "Break", "Short reset between rounds."],
                  ["longBreakMinutes", "Long break", "After every fourth focus."],
                  ["sessionsUntilLongBreak", "Rounds", "Focus sessions before a long break."],
                  ["dailyGoalMinutes", "Daily goal", "Target focus minutes for the day."]
                ] as const
              ).map(([key, label, help]) => (
                <label className="settings-row" key={key}>
                  <div className="settings-copy">
                    <span className="settings-label">{label}</span>
                    <p>{help}</p>
                  </div>
                  <input
                    className="settings-input"
                    type="number"
                    min={key === "dailyGoalMinutes" ? 0 : 1}
                    value={settingsDraft?.[key] ?? state.settings[key]}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...(current ?? state.settings),
                        [key]: Number(event.target.value) || 0
                      }))
                    }
                  />
                </label>
              ))}

              <label className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Start breaks automatically</span>
                  <p>When focus ends, the break begins on its own.</p>
                </div>
                <input
                  className="settings-toggle"
                  type="checkbox"
                  checked={settingsDraft?.autoStartBreaks ?? state.settings.autoStartBreaks}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...(current ?? state.settings), autoStartBreaks: event.target.checked }))
                  }
                />
              </label>

              <label className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Start focus automatically</span>
                  <p>When a break ends, the next focus starts immediately.</p>
                </div>
                <input
                  className="settings-toggle"
                  type="checkbox"
                  checked={settingsDraft?.autoStartFocus ?? state.settings.autoStartFocus}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...(current ?? state.settings), autoStartFocus: event.target.checked }))
                  }
                />
              </label>

              <label className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Sound effects</span>
                  <p>Layered chimes for start, pause, and session complete.</p>
                </div>
                <input
                  className="settings-toggle"
                  type="checkbox"
                  checked={settingsDraft?.soundEnabled ?? state.settings.soundEnabled}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...(current ?? state.settings), soundEnabled: event.target.checked }))
                  }
                />
              </label>

              <div className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Volume</span>
                  <p>Preview the completion chime.</p>
                </div>
                <div className="sound-row">
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settingsDraft?.soundVolume ?? state.settings.soundVolume}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...(current ?? state.settings),
                        soundVolume: Number(event.target.value)
                      }))
                    }
                  />
                  <button className="ghost" onClick={() => void act({ type: "previewSound", payload: { chime: "focus" as ChimeType } })}>
                    Play
                  </button>
                </div>
              </div>

            </section>

            <button className="cta full" disabled={!hasSettingsChanges} onClick={() => void saveSettings()}>
              Save changes
            </button>

            <section className="account-card">
              <div className="account-header">
                <span className="stat-label">Account</span>
                <h2>{authUser ? "Synced across Chrome profiles" : "Use Lahza on every profile"}</h2>
                <p className="lede">
                  {cloudConfigured
                    ? "The same email unlocks your sessions and settings on work, personal, or guest Chrome."
                    : "Add Supabase keys to enable cloud sync across Chrome profiles."}
                </p>
              </div>

              {!cloudConfigured ? (
                <p className="lede">
                  Cloud sync needs a Supabase project. Add the keys in `.env.local`, then sign in here on every Chrome profile you use.
                </p>
              ) : null}

              {authUser ? (
                <div className="account-body">
                  <label className="account-field">
                    <span className="settings-label">Name</span>
                    <input className="account-input" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                  </label>
                  <div className="account-meta">{authUser.email}</div>
                  <div className="account-actions">
                    <button className="ghost" disabled={authBusy} onClick={() => void handleProfileSave()}>Save name</button>
                    <button className="ghost" disabled={authBusy} onClick={() => void handleSignOut()}>Log out</button>
                  </div>
                </div>
              ) : (
                <div className="account-body">
                  <div className="auth-tabs segmented">
                    <button className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>Sign in</button>
                    <button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Create account</button>
                  </div>
                  {authMode === "signup" ? (
                    <label className="account-field">
                      <span className="settings-label">Name</span>
                      <input className="account-input" value={authDisplayName} onChange={(event) => setAuthDisplayName(event.target.value)} />
                    </label>
                  ) : null}
                  <label className="account-field">
                    <span className="settings-label">Email</span>
                    <input className="account-input" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
                  </label>
                  <label className="account-field">
                    <span className="settings-label">Password</span>
                    <input
                      className="account-input"
                      type={showPassword ? "text" : "password"}
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                  </label>
                  <button className="linkish" onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? "Hide password" : "Show password"}
                  </button>
                  <button className="cta full" disabled={authBusy || !authEmail || !authPassword} onClick={() => void handleAuth()}>
                    {authMode === "signup" ? "Create account" : "Sign in"}
                  </button>
                  {authMode === "signin" ? (
                    <button className="linkish" disabled={authBusy} onClick={() => void handleReset()}>
                      Forgot password
                    </button>
                  ) : null}
                </div>
              )}

              {authNotice ? <div className="account-notice">{authNotice}</div> : null}
              {authError ? <div className="account-error">{authError}</div> : null}
            </section>

            <div className="meta-row">
              <span>Space starts or pauses</span>
              <span>
                <span className="kbd">Alt</span> <span className="kbd">Shift</span> <span className="kbd">P</span>
              </span>
            </div>
          </section>
        ) : null}
      </div>

      <nav className="tabbar">
        <button className={`tab${view === "timer" ? " active" : ""}`} onClick={() => setView("timer")}>
          <TimerIcon />
          Timer
        </button>
        <button className={`tab${view === "activity" ? " active" : ""}`} onClick={() => setView("activity")}>
          <ActivityIcon />
          Activity
        </button>
        <button className={`tab${view === "settings" ? " active" : ""}`} onClick={() => setView("settings")}>
          <SettingsIcon />
          Settings
        </button>
      </nav>

      {completedMode ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-title">
              {getCompletionMessage({
                streak,
                sessionCount: state.timer.sessionCount,
                mode: completedMode === "milestone" ? "milestone" : completedMode
              }).title}
            </div>
            <div className="modal-sub">
              {getCompletionMessage({
                streak,
                sessionCount: state.timer.sessionCount,
                mode: completedMode === "milestone" ? "milestone" : completedMode
              }).subtitle}
            </div>
            {streak >= 2 && completedMode !== "break" && completedMode !== "longBreak" ? (
              <div className="streak-badge">{streak} day streak</div>
            ) : null}
            <div className="modal-actions">
              <button
                className="cta"
                onClick={() => {
                  setCompletedMode(null);
                  void act({ type: "start" });
                }}
              >
                {completedMode === "focus" || completedMode === "milestone" ? "Start break" : "Start focus"}
              </button>
              <button className="ghost" onClick={() => setCompletedMode(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
