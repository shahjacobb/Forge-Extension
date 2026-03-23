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
      <section className="settings-card">
        <header>
          <div className="eyebrow">Forge</div>
          <h1>Settings</h1>
          <p>Adjust timer lengths for this Chrome profile.</p>
        </header>

        <section className="settings-group">
          <div className="settings-row">
            <div className="settings-copy">
              <span className="settings-label">Focus Session</span>
              <p>Primary concentration block.</p>
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
              <p>Recovery block between focus rounds.</p>
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
              <p>Start breaks automatically when focus ends.</p>
            </div>
            <input
              className="settings-toggle"
              type="checkbox"
              checked={state.settings.autoStartBreaks}
              onChange={(event) => void update({ autoStartBreaks: event.target.checked })}
            />
          </div>
        </section>
      </section>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
