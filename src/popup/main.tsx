import React from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ReactDOM from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import {
  getAccountSnapshot,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  syncAccountState,
  syncSessionsToAccount,
  syncSettingsToAccount,
  updateProfileName
} from "../shared/account";
import { buildMonthData, buildWeeklyData, computeStreak, getCompletionMessage, getWeekLabel } from "../shared/analytics";
import { supabase } from "../shared/supabase";
import type { PersistedState, TimerCommand, TimerMode, TimerSettings } from "../shared/types";
import "./styles.css";

const sendMessage = <T,>(message: TimerCommand | { type: "getState" }): Promise<T> =>
  chrome.runtime.sendMessage(message) as Promise<T>;

const formatClock = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
};

const formatDate = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });

type PopupView = "timer" | "activity" | "settings";

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [view, setView] = React.useState<PopupView>("timer");
  const [settingsDraft, setSettingsDraft] = React.useState<TimerSettings | null>(null);
  const [authUser, setAuthUser] = React.useState<User | null>(null);
  const [profileName, setProfileName] = React.useState("");
  const [authEmail, setAuthEmail] = React.useState("");
  const [authPassword, setAuthPassword] = React.useState("");
  const [authDisplayName, setAuthDisplayName] = React.useState("");
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authNotice, setAuthNotice] = React.useState<string | null>(null);
  const [completedMode, setCompletedMode] = React.useState<TimerMode | "milestone" | null>(null);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [monthOffset, setMonthOffset] = React.useState(0);
  const [activityMode, setActivityMode] = React.useState<"weekly" | "monthly">("weekly");
  const prevSessionCount = React.useRef<number | null>(null);

  const refresh = React.useCallback(async () => {
    const nextState = await sendMessage<PersistedState>({ type: "getState" });
    const account = await getAccountSnapshot();
    setAuthUser(account.user);
    setProfileName(account.profile?.display_name ?? "");

    if (account.user) {
      const syncedState = await syncAccountState(account.user);
      setState(syncedState);
      return;
    }

    setState(nextState);
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    if (state) {
      setSettingsDraft(state.settings);

      // Detect session completion while popup is open
      if (prevSessionCount.current !== null && state.timer.sessionCount > prevSessionCount.current) {
        const isMilestone = state.timer.sessionCount % 4 === 0;
        setCompletedMode(isMilestone ? "milestone" : "focus");
        setView("timer");
      }
      // Also detect break completing (mode switched back to focus, timer idle, prev was running break)
      prevSessionCount.current = state.timer.sessionCount;
    }
  }, [state]);

  React.useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  if (!state) {
    return <main className="shell loading">Loading control surface...</main>;
  }

  const remainingMs =
    state.timer.status === "running" && state.timer.endsAt
      ? Math.max(0, state.timer.endsAt - now)
      : state.timer.remainingMs;

  const totalMs =
    (state.timer.mode === "focus" ? state.settings.focusMinutes : state.settings.breakMinutes) * 60_000;
  const progressPct =
    state.timer.status === "idle" ? 0 : Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100));

  const currentWeekData = buildWeeklyData(state.sessions);
  const focusToday = currentWeekData.at(-1)?.minutes ?? 0;
  const currentWeekTotal = currentWeekData.reduce((sum, day) => sum + day.minutes, 0);
  const streak = computeStreak(state.sessions);

  const viewedWeekData = weekOffset === 0 ? currentWeekData : buildWeeklyData(state.sessions, weekOffset);
  const viewedWeekTotal = weekOffset === 0 ? currentWeekTotal : viewedWeekData.reduce((sum, day) => sum + day.minutes, 0);
  const monthData = buildMonthData(state.sessions, monthOffset);
  const maxDayMinutes = Math.max(1, ...monthData.days.map((d) => d.minutes));
  const currentDate = formatDate(new Date(now));
  const activeModeLabel = state.timer.mode === "focus" ? "Focus Session" : "Break Session";
  const isRunning = state.timer.status === "running";
  const primaryActionLabel = isRunning
    ? "Pause Session"
    : state.timer.status === "paused"
      ? `Resume ${state.timer.mode === "focus" ? "Focus" : "Break"}`
      : `Start ${state.timer.mode === "focus" ? "Focus" : "Break"}`;

  const act = async (command: TimerCommand) => {
    const nextState = await sendMessage<PersistedState>(command);
    setNow(Date.now());
    setState(nextState);

    if (authUser && command.type === "skip") {
      await syncSessionsToAccount(authUser.id, nextState.sessions);
    }
  };

  const switchMode = async (mode: TimerMode, autoStart = false) => {
    const nextState = await sendMessage<PersistedState>({
      type: "setMode",
      payload: { mode, autoStart }
    });
    setNow(Date.now());
    setState(nextState);
  };

  const updateSettings = async (patch: Partial<TimerSettings>) => {
    const nextState = await sendMessage<PersistedState>({
      type: "updateSettings",
      payload: patch
    });
    setState(nextState);
  };

  const hasSettingsChanges =
    settingsDraft !== null &&
    (settingsDraft.focusMinutes !== state.settings.focusMinutes ||
      settingsDraft.breakMinutes !== state.settings.breakMinutes ||
      settingsDraft.autoStartBreaks !== state.settings.autoStartBreaks);

  const saveSettings = async () => {
    if (!settingsDraft) {
      return;
    }

    await updateSettings(settingsDraft);

    if (authUser) {
      await syncSettingsToAccount(authUser.id, settingsDraft);
    }

    setView("timer");
    setAuthNotice("Settings saved.");
  };

  const handleSignUp = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);

    const { error, data } = await signUpWithEmail(authEmail, authPassword, authDisplayName);

    if (error) {
      setAuthError(error.message);
      setAuthBusy(false);
      return;
    }

    if (!data.session) {
      setAuthNotice("Check your email to confirm your account.");
      setAuthBusy(false);
      return;
    }

    setAuthNotice("Account created.");
    setAuthBusy(false);
    await refresh();
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);

    const { error } = await signInWithEmail(authEmail, authPassword);

    if (error) {
      setAuthError(error.message);
      setAuthBusy(false);
      return;
    }

    setAuthNotice("Signed in.");
    setAuthBusy(false);
    await refresh();
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    await signOutAccount();
    setAuthBusy(false);
    setAuthNotice("Signed out.");
  };

  const handleProfileSave = async () => {
    if (!authUser) {
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);

    const { error } = await updateProfileName(authUser.id, profileName.trim());

    if (error) {
      setAuthError(error.message);
      setAuthBusy(false);
      return;
    }

    setAuthNotice("Profile updated.");
    setAuthBusy(false);
    await refresh();
  };

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="topbar">
          <div className="brand-block">
            <div className="eyebrow">Forge</div>
            <div className="date-line">{currentDate}</div>
          </div>
          <div className="topbar-actions">
            {view === "timer" ? (
              <>
                <button className="toolbar-link" onClick={() => setView("activity")}>
                  Activity
                </button>
                <button className="toolbar-link" onClick={() => setView("settings")}>
                  Settings
                </button>
              </>
            ) : null}
            {view === "activity" ? (
              <>
                <button className="toolbar-link back-link" onClick={() => setView("timer")}>
                  ← Back
                </button>
                <button className="toolbar-link" onClick={() => setView("settings")}>
                  Settings
                </button>
              </>
            ) : null}
            {view === "settings" ? (
              <button className="toolbar-link back-link" onClick={() => setView("timer")}>
                ← Back
              </button>
            ) : null}
          </div>
        </div>
        {view === "timer" ? (
          <>
            <div className="mode-row">
              <span className="mode-pill">{activeModeLabel}</span>
              <span className="session-count">{focusToday} min today</span>
            </div>
            <div className="status-row">
              <span className={`status-dot${isRunning ? " live" : ""}`} />
              <span className="status-line">{isRunning ? "Session active" : "Choose a session and press start"}</span>
            </div>
            <div className="clock">{formatClock(remainingMs)}</div>
            <div className="progress-bar-wrap">
              <div className={`progress-bar-fill${isRunning ? " live" : ""}`} style={{ width: `${progressPct}%` }} />
            </div>

            <section className="control-section">
              <div className="mode-switcher">
                <button
                  className={`mode-toggle${state.timer.mode === "focus" ? " selected" : ""}`}
                  onClick={() => void switchMode("focus")}
                >
                  Focus
                </button>
                <button
                  className={`mode-toggle${state.timer.mode === "break" ? " selected" : ""}`}
                  onClick={() => void switchMode("break")}
                >
                  Break
                </button>
              </div>
            </section>

            <section className="control-section primary-section">
              <button
                className={`action action-large primary-cta${isRunning ? " danger" : " primary"}`}
                onClick={() => void act({ type: isRunning ? "pause" : "start" })}
              >
                {primaryActionLabel}
              </button>
              <button
                className="action-skip"
                onClick={() => void act({ type: "skip" })}
              >
                {state.timer.mode === "focus" ? "Skip to break →" : "Skip to focus →"}
              </button>
              <div className="utility-row">
                <button className="action-utility" onClick={() => void act({ type: "start" })}>Restart</button>
                <button className="action-utility" onClick={() => void act({ type: "reset" })}>Reset</button>
              </div>
            </section>

            <div className="meta-strip">
              <span>{state.settings.focusMinutes} min focus</span>
              <span>{state.settings.breakMinutes} min break</span>
              <span>{state.timer.sessionCount} completed</span>
            </div>
          </>
        ) : null}

        {view === "activity" ? (
          <div className="popup-view">
            <div className="view-heading">
              <h1>Focus activity</h1>
              <div className="view-toggle">
                <button className={`view-toggle-btn${activityMode === "weekly" ? " active" : ""}`} onClick={() => setActivityMode("weekly")}>Weekly</button>
                <button className={`view-toggle-btn${activityMode === "monthly" ? " active" : ""}`} onClick={() => setActivityMode("monthly")}>Monthly</button>
              </div>
            </div>
            <section className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">Today</span>
                <strong>{focusToday} min</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">This Week</span>
                <strong>{currentWeekTotal} min</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">Streak</span>
                <strong>{streak} {streak === 1 ? "day" : "days"}</strong>
              </article>
            </section>

            {activityMode === "weekly" ? (
              <>
                <div className="panel-header">
                  <h2>{getWeekLabel(weekOffset)}</h2>
                  <div className="week-nav">
                    <button className="week-nav-btn" onClick={() => setWeekOffset((o) => o - 1)}>←</button>
                    {weekOffset < 0 && (
                      <button className="week-nav-btn" onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}>→</button>
                    )}
                    {weekOffset < 0 && (
                      <button className="week-nav-btn" onClick={() => setWeekOffset(0)}>Today</button>
                    )}
                  </div>
                </div>
                <div className="activity-chart compact-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={viewedWeekData}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.48)", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} width={28} tickFormatter={(v: number) => `${v}m`} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{
                          background: "#0f0f10",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 16
                        }}
                        formatter={(value: number) => [`${value} min`, "Focus"]}
                        labelFormatter={(label: string, payload) => payload?.[0]?.payload?.fullLabel ?? label}
                      />
                      <Bar dataKey="minutes" fill="url(#popupActivityBars)" radius={[6, 6, 2, 2]} minPointSize={viewedWeekTotal === 0 ? 0 : 2} />
                      <defs>
                        <linearGradient id="popupActivityBars" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#f5f5f5" />
                          <stop offset="100%" stopColor="#6b7280" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {viewedWeekTotal === 0 && weekOffset === 0 && (
                  <div className="activity-empty">No focus sessions yet.<br />Start your first session.</div>
                )}
                <div className="activity-list compact-list">
                  {viewedWeekData.map((day) => (
                    <article className="activity-row compact-row" key={day.key}>
                      <div>
                        <strong>{day.fullLabel}</strong>
                        <div className="activity-subtle">{day.minutes > 0 ? "Focus tracked" : "No sessions"}</div>
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
                    <button className="week-nav-btn" onClick={() => setMonthOffset((o) => o - 1)}>←</button>
                    {monthOffset < 0 && (
                      <button className="week-nav-btn" onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}>→</button>
                    )}
                    {monthOffset < 0 && (
                      <button className="week-nav-btn" onClick={() => setMonthOffset(0)}>Today</button>
                    )}
                  </div>
                </div>
                <div className="calendar-grid">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div className="calendar-header" key={d}>{d}</div>
                  ))}
                  {monthData.days.map((day) => (
                    <div className={`calendar-day${day.isToday ? " today" : ""}${day.minutes > 0 ? " has-data" : ""}${day.isOutside ? " outside" : ""}`} key={day.key}>
                      {day.minutes > 0 && (
                        <div className="heat-bg" style={{ background: `rgba(255, 255, 255, ${0.04 + 0.12 * (day.minutes / maxDayMinutes)})` }} />
                      )}
                      <span>{day.day}</span>
                    </div>
                  ))}
                </div>
                <div className="month-summary">
                  <span><strong>{monthData.totalMinutes}</strong> min total</span>
                  <span><strong>{monthData.activeDays}</strong> active days</span>
                </div>
              </>
            )}
          </div>
        ) : null}

        {view === "settings" ? (
          <div className="popup-view settings-view">
            <div className="view-heading">
              <h1>Settings</h1>
              <p>Customize your session lengths.</p>
            </div>
            <section className="settings-group">
              <div className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Focus time</span>
                  <p>How long each work block lasts (minutes).</p>
                </div>
                <input
                  className="settings-input"
                  type="number"
                  min={1}
                  value={settingsDraft?.focusMinutes ?? state.settings.focusMinutes}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...(current ?? state.settings),
                      focusMinutes: Number(event.target.value) || 1
                    }))
                  }
                />
              </div>

              <div className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Break time</span>
                  <p>How long each break lasts (minutes).</p>
                </div>
                <input
                  className="settings-input"
                  type="number"
                  min={1}
                  value={settingsDraft?.breakMinutes ?? state.settings.breakMinutes}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...(current ?? state.settings),
                      breakMinutes: Number(event.target.value) || 1
                    }))
                  }
                />
              </div>

              <div className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Start break automatically</span>
                  <p>When focus ends, break starts without you having to press anything.</p>
                </div>
                <input
                  className="settings-toggle"
                  type="checkbox"
                  checked={settingsDraft?.autoStartBreaks ?? state.settings.autoStartBreaks}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...(current ?? state.settings),
                      autoStartBreaks: event.target.checked
                    }))
                  }
                />
              </div>
            </section>
            <div className="settings-actions">
              <button className="action primary action-save" disabled={!hasSettingsChanges} onClick={() => void saveSettings()}>
                Save Changes
              </button>
            </div>
            <section className="account-card">
              <div className="account-header">
                <div>
                  <span className="settings-label">Account</span>
                  <h2>{authUser ? "Syncing across devices" : "Sign in to sync across devices"}</h2>
                </div>
              </div>

              {authUser ? (
                <div className="account-body">
                  <label className="account-field">
                    <span className="settings-label">Your name</span>
                    <input
                      className="settings-input account-input"
                      type="text"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                  </label>
                  <div className="account-meta">{authUser.email}</div>
                  <div className="account-actions">
                    <button className="action" disabled={authBusy} onClick={() => void handleProfileSave()}>
                      Save Name
                    </button>
                    <button className="action" disabled={authBusy} onClick={() => void handleSignOut()}>
                      Log Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="account-body">
                  <label className="account-field">
                    <span className="settings-label">Name</span>
                    <input
                      className="settings-input account-input"
                      type="text"
                      value={authDisplayName}
                      onChange={(event) => setAuthDisplayName(event.target.value)}
                    />
                  </label>
                  <label className="account-field">
                    <span className="settings-label">Email</span>
                    <input
                      className="settings-input account-input"
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                    />
                  </label>
                  <label className="account-field">
                    <span className="settings-label">Password</span>
                    <input
                      className="settings-input account-input"
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                  </label>
                  <div className="account-actions">
                    <button className="action" disabled={authBusy} onClick={() => void handleSignIn()}>
                      Log In
                    </button>
                    <button className="action" disabled={authBusy} onClick={() => void handleSignUp()}>
                      Sign Up
                    </button>
                  </div>
                </div>
              )}

              {authNotice ? <div className="account-notice">{authNotice}</div> : null}
              {authError ? <div className="account-error">{authError}</div> : null}
            </section>
          </div>
        ) : null}
      </section>

      {completedMode ? (() => {
        const msg = completedMode === "break"
          ? { title: "Break over.", subtitle: "Ready when you are." }
          : getCompletionMessage({
              streak,
              sessionCount: state.timer.sessionCount,
              mode: completedMode === "milestone" ? "milestone" : "focus"
            });
        return (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-title">{msg.title}</div>
            <div className="modal-sub">{msg.subtitle}</div>
            {streak >= 2 && completedMode !== "break" && (
              <div className="streak-badge">{streak} day streak</div>
            )}
            <div className="modal-actions">
              <button
                className="action action-large primary-cta primary"
                onClick={() => {
                  setCompletedMode(null);
                  void act({ type: "start" });
                }}
              >
                {completedMode === "focus" || completedMode === "milestone" ? "Start Break" : "Start Focus"}
              </button>
              <button
                className="action"
                onClick={() => setCompletedMode(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
        );
      })() : null}
    </main>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
