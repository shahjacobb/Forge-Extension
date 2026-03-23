import React from "react";
import ReactDOM from "react-dom/client";
import type { PersistedState, TimerSettings } from "../shared/types";
import "../popup/styles.css";

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);

  React.useEffect(() => {
    void chrome.runtime.sendMessage({ type: "getState" }).then((nextState: PersistedState) => setState(nextState));
  }, []);

  const update = async (patch: Partial<TimerSettings>) => {
    const nextState = await chrome.runtime.sendMessage({
      type: "updateSettings",
      payload: patch
    });
    setState(nextState as PersistedState);
  };

  if (!state) {
    return <main className="settings-shell">Loading settings...</main>;
  }

  return (
    <main className="settings-shell">
      <header>
        <div className="eyebrow">Forge</div>
        <h1>Cycle Settings</h1>
        <p>Adjust your pomodoro timer and session tracking rules for this profile.</p>
      </header>

      <section className="settings-group">
        <div className="settings-row">
          <div className="settings-copy">
            <span className="settings-label">Focus Session</span>
            <p>Primary concentration block length.</p>
          </div>
          <input
            className="settings-input"
            type="number"
            min={1}
            value={state.settings.focusMinutes}
            onChange={(event) => void update({ focusMinutes: Number(event.target.value) || 1 })}
          />
        </div>

        <div className="settings-row">
          <div className="settings-copy">
            <span className="settings-label">Break Session</span>
            <p>Recovery interval after each focus block.</p>
          </div>
          <input
            className="settings-input"
            type="number"
            min={1}
            value={state.settings.breakMinutes}
            onChange={(event) => void update({ breakMinutes: Number(event.target.value) || 1 })}
          />
        </div>

        <div className="settings-row">
          <div className="settings-copy">
            <span className="settings-label">Auto Break</span>
            <p>Launch break cycles automatically after focus completion.</p>
          </div>
          <input
            className="settings-toggle"
            type="checkbox"
            checked={state.settings.autoStartBreaks}
            onChange={(event) => void update({ autoStartBreaks: event.target.checked })}
          />
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
