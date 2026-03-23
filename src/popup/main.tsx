import React from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import ReactDOM from "react-dom/client";
import { buildWeeklyData, getWeekLabel } from "../shared/analytics";
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

  const refresh = React.useCallback(async () => {
    const nextState = await sendMessage<PersistedState>({ type: "getState" });
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
    }
  }, [state]);

  if (!state) {
    return <main className="shell loading">Loading control surface...</main>;
  }

  const remainingMs =
    state.timer.status === "running" && state.timer.endsAt
      ? Math.max(0, state.timer.endsAt - now)
      : state.timer.remainingMs;

  const weeklyData = buildWeeklyData(state.sessions);
  const focusToday = weeklyData.at(-1)?.minutes ?? 0;
  const weeklyTotal = weeklyData.reduce((sum, day) => sum + day.minutes, 0);
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
    setView("timer");
  };

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="topbar">
          <div>
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
                <button className="toolbar-link" onClick={() => setView("timer")}>
                  Back
                </button>
                <button className="toolbar-link" onClick={() => setView("settings")}>
                  Settings
                </button>
              </>
            ) : null}
            {view === "settings" ? (
              <button className="toolbar-link" onClick={() => setView("timer")}>
                Back
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

            <section className="control-section">
              <div className="section-label">Session type</div>
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
              <div className="section-label">Main action</div>
              <button
                className={`action action-large primary-cta${isRunning ? " danger" : " primary"}`}
                onClick={() => void act({ type: isRunning ? "pause" : "start" })}
              >
                {primaryActionLabel}
              </button>
            </section>

            <section className="control-section secondary-section">
              <div className="section-label">More actions</div>
              <div className="controls controls-secondary">
                <button className="action" onClick={() => void act({ type: "start" })}>Restart</button>
                <button className="action" onClick={() => void act({ type: "skip" })}>Skip</button>
                <button className="action" onClick={() => void act({ type: "reset" })}>Reset</button>
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
              <p>{getWeekLabel()}</p>
            </div>
            <section className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">Today</span>
                <strong>{focusToday} min</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">This Week</span>
                <strong>{weeklyTotal} min</strong>
              </article>
              <article className="stat-card">
                <span className="stat-label">Completed</span>
                <strong>{state.timer.sessionCount}</strong>
              </article>
            </section>
            <div className="activity-chart compact-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
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
                  <Bar dataKey="minutes" fill="url(#popupActivityBars)" radius={[10, 10, 4, 4]} />
                  <defs>
                    <linearGradient id="popupActivityBars" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#f5f5f5" />
                      <stop offset="100%" stopColor="#6b7280" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {view === "settings" ? (
          <div className="popup-view settings-view">
            <div className="view-heading">
              <h1>Settings</h1>
              <p>Adjust the length of your focus and break sessions. You can also turn on auto break.</p>
            </div>
            <section className="settings-group">
              <div className="settings-row">
                <div className="settings-copy">
                  <span className="settings-label">Focus Session</span>
                  <p>How long each focus session lasts.</p>
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
                  <span className="settings-label">Break Session</span>
                  <p>How long each break lasts.</p>
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
                  <span className="settings-label">Auto Break</span>
                  <p>Start the break automatically when focus ends.</p>
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
              <span className="settings-hint">Changes only apply when you press save.</span>
              <button className="action primary action-save" disabled={!hasSettingsChanges} onClick={() => void saveSettings()}>
                Save Changes
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
