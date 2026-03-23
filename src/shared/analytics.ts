import type { SessionRecord } from "./types";

export interface WeeklyBucket {
  key: string;
  label: string;
  fullLabel: string;
  minutes: number;
}

export const buildWeeklyData = (sessions: SessionRecord[]): WeeklyBucket[] => {
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);

    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      fullLabel: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      minutes: 0
    };
  });

  for (const session of sessions) {
    const key = session.completedAt.slice(0, 10);
    const bucket = buckets.find((entry) => entry.key === key);

    if (bucket && session.mode === "focus") {
      bucket.minutes += Math.round(session.durationMs / 60_000);
    }
  }

  return buckets;
};

export const getWeekLabel = (): string => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());

  return `Week of ${start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
};
