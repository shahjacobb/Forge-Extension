import React from "react";
import ReactDOM from "react-dom/client";
import { installChromeMock } from "../shared/chrome-mock";
import type { PersistedState, TimerSettings } from "../shared/types";
import "../popup/styles.css";

installChromeMock();

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);
  const [draft, setDraft] = React.useState<TimerSettings | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    void chrome.runtime.sendMessage({ type: "getState" }).then((nextState: PersistedState) => {
      setState(nextState);
      setDraft(nextState.settings);
    });
  }, []);

  const save = async () => {
    if (!draft) {
      return;
    }

    const nextState = (await chrome.runtime.sendMessage({
      type: "updateSettings",
      payload: draft
    })) as PersistedState;
    setState(nextState);
    setDraft(nextState.settings);
    setNotice("Saved. Open Sukoon on another Chrome profile and sign in to take these with you.");
  };

  if (!state || !draft) {
    return <main className="settings-shell">Loading Sukoon settings…</main>;
  }

  const patch = (partial: Partial<TimerSettings>) => setDraft((current) => ({ ...(current ?? state.settings), ...partial }));

  return (
    <main className="settings-shell">
      <section className="settings-card">
        <header>
          <div className="eyebrow">Sukoon</div>
          <h1>Settings</h1>
          <p>Timer lengths and sound for this Chrome profile.</p>
        </header>

        <section className="settings-group">
          <label className="settings-row">
            <div className="settings-copy">
              <span className="settings-label">Focus</span>
              <p>Primary concentration block.</p>
            </div>
            <input className="settings-input" type="number" min={1} value={draft.focusMinutes} onChange={(event) => patch({ focusMinutes: Number(event.target.value) || 1 })} />
          </label>
          <label className="settings-row">
            <div className="settings-copy">
              <span className="settings-label">Break</span>
              <p>Short recovery between rounds.</p>
            </div>
            <input className="settings-input" type="number" min={1} value={draft.breakMinutes} onChange={(event) => patch({ breakMinutes: Number(event.target.value) || 1 })} />
          </label>
          <label className="settings-row">
            <div className="settings-copy">
              <span className="settings-label">Long break</span>
              <p>After a full set of focus sessions.</p>
            </div>
            <input className="settings-input" type="number" min={1} value={draft.longBreakMinutes} onChange={(event) => patch({ longBreakMinutes: Number(event.target.value) || 1 })} />
          </label>
          <label className="settings-row">
            <div className="settings-copy">
              <span className="settings-label">Sound</span>
              <p>Play chimes when sessions start and finish.</p>
            </div>
            <input className="settings-toggle" type="checkbox" checked={draft.soundEnabled} onChange={(event) => patch({ soundEnabled: event.target.checked })} />
          </label>
        </section>

        <button className="cta full" onClick={() => void save()}>
          Save settings
        </button>
        {notice ? <div className="account-notice">{notice}</div> : null}
      </section>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
