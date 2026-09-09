import React from "react";
import ReactDOM from "react-dom/client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { installChromeMock } from "../shared/chrome-mock";
import { buildWeeklyData, computeStreak, getWeekLabel } from "../shared/analytics";
import type { PersistedState } from "../shared/types";
import "../popup/styles.css";

installChromeMock();

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);

  React.useEffect(() => {
    void chrome.runtime.sendMessage({ type: "getState" }).then((nextState: PersistedState) => {
      setState(nextState);
      document.documentElement.removeAttribute("data-theme");
    });
  }, []);

  if (!state) {
    return <main className="activity-shell">Loading activity…</main>;
  }

  const weeklyData = buildWeeklyData(state.sessions);
  const focusToday = weeklyData.at(-1)?.minutes ?? 0;
  const weeklyTotal = weeklyData.reduce((sum, day) => sum + day.minutes, 0);
  const streak = computeStreak(state.sessions);
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <main className="activity-shell">
      <header className="chart-panel">
        <div className="eyebrow">Sukoon</div>
        <h1>Focus activity</h1>
        <p className="lede">{todayLabel}</p>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-label">Today</span>
          <strong>{focusToday} min</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">This week</span>
          <strong>{weeklyTotal} min</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Streak</span>
          <strong>{streak} {streak === 1 ? "day" : "days"}</strong>
        </article>
      </section>

      <section className="chart-panel">
        <div className="panel-header">
          <h2>{getWeekLabel()}</h2>
        </div>
        <div className="activity-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "currentColor" }} />
              <YAxis axisLine={false} tickLine={false} width={32} tick={{ fill: "currentColor", fontSize: 10 }} tickFormatter={(value: number) => `${value}m`} />
              <Tooltip
                cursor={{ fill: "var(--primary-soft)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 8 }}
                formatter={(value: number) => [`${value} min`, "Focus"]}
              />
              <Bar dataKey="minutes" fill="#9a9588" radius={[6, 6, 2, 2]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="chart-panel">
        <div className="panel-header">
          <h2>Daily breakdown</h2>
          <span className="activity-subtle">Last 7 days</span>
        </div>
        <div className="activity-list">
          {weeklyData.map((day) => (
            <article className="activity-row" key={day.key}>
              <div>
                <strong>{day.fullLabel}</strong>
                <div className="activity-subtle">
                  {day.sessions > 0 ? `${day.sessions} focus session${day.sessions === 1 ? "" : "s"}` : "No focus sessions"}
                </div>
              </div>
              <strong>{day.minutes} min</strong>
            </article>
          ))}
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
