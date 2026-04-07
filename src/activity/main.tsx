import React from "react";
import ReactDOM from "react-dom/client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildWeeklyData, computeStreak, getWeekLabel } from "../shared/analytics";
import type { PersistedState } from "../shared/types";
import "../popup/styles.css";

const App = () => {
  const [state, setState] = React.useState<PersistedState | null>(null);

  React.useEffect(() => {
    void chrome.runtime.sendMessage({ type: "getState" }).then((nextState: PersistedState) => setState(nextState));
  }, []);

  if (!state) {
    return <main className="activity-shell">Loading activity...</main>;
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
        <div className="eyebrow">Forge Activity</div>
        <h1>Focus activity</h1>
        <p>{todayLabel}</p>
      </header>

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
          <span className="stat-label">Streak</span>
          <strong>{streak} {streak === 1 ? "day" : "days"}</strong>
        </article>
      </section>

      <section className="chart-panel">
        <div className="panel-header">
          <h2>{getWeekLabel()}</h2>
          <a href="popup.html" target="_blank" rel="noreferrer">
            Timer
          </a>
        </div>
        <div className="activity-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} />
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
              <Bar dataKey="minutes" fill="url(#activityBars)" radius={[10, 10, 4, 4]} />
              <defs>
                <linearGradient id="activityBars" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#f5f5f5" />
                  <stop offset="100%" stopColor="#6b7280" />
                </linearGradient>
              </defs>
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
                <div className="activity-subtle">{day.minutes > 0 ? "Focus tracked" : "No focus sessions logged"}</div>
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
