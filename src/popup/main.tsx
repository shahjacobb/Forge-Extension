import React from "react";
import ReactDOM from "react-dom/client";
import { buildWeeklyData } from "../shared/analytics";
import type { PersistedState, TimerCommand, TimerMode } from "../shared/types";
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

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);
  const [now, setNow] = React.useState(Date.now());

  const refresh = React.useCallback(async () => {
    const nextState = await sendMessage<PersistedState>({ type: "getState" });
    setState(nextState);
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!state) {
    return <main className="shell loading">Loading control surface...</main>;
  }

  const remainingMs =
    state.timer.status === "running" && state.timer.endsAt
      ? Math.max(0, state.timer.endsAt - now)
      : state.timer.remainingMs;

  const weeklyData = buildWeeklyData(state.sessions);
  const focusToday = weeklyData.at(-1)?.minutes ?? 0;
  const currentDate = formatDate(new Date(now));
  const activeModeLabel = state.timer.mode === "focus" ? "Focus Session" : "Break Session";
  const isRunning = state.timer.status === "running";

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

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="topbar">
          <div>
            <div className="eyebrow">Forge</div>
            <div className="date-line">{currentDate}</div>
          </div>
          <div className="topbar-actions">
            <a className="toolbar-link" href="activity.html" target="_blank" rel="noreferrer">
              Activity
            </a>
            <a className="toolbar-link" href="options.html" target="_blank" rel="noreferrer">
              Settings
            </a>
          </div>
        </div>
        <div className="mode-row">
          <span className="mode-pill">{activeModeLabel}</span>
          <span className="session-count">{focusToday} min today</span>
        </div>
        <div className="status-row">
          <span className={`status-dot${isRunning ? " live" : ""}`} />
          <span className="status-line">{isRunning ? "Session active" : "Ready to start"}</span>
        </div>
        <div className="clock">{formatClock(remainingMs)}</div>
        <section className="control-section">
          <div className="section-label">Mode</div>
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
            <button className="mode-launch" onClick={() => void switchMode(state.timer.mode, true)}>
              Quick Start
            </button>
          </div>
        </section>

        <section className="control-section">
          <div className="section-label">Controls</div>
          <div className="controls">
            <button
              className={`action${isRunning ? " danger" : ""}`}
              onClick={() => void act({ type: isRunning ? "pause" : "start" })}
            >
              {isRunning ? "Pause" : state.timer.status === "paused" ? "Resume" : "Start"}
            </button>
            <button className="action primary" onClick={() => void act({ type: "start" })}>Restart</button>
            <button className="action" onClick={() => void act({ type: "skip" })}>Skip</button>
            <button className="action" onClick={() => void act({ type: "reset" })}>Reset</button>
          </div>
        </section>

        <div className="meta-strip">
          <span>{state.settings.focusMinutes} min focus</span>
          <span>{state.settings.breakMinutes} min break</span>
          <span>{state.timer.sessionCount} completed</span>
        </div>
      </section>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
