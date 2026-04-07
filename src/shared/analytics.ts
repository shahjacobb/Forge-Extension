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

export const computeStreak = (sessions: SessionRecord[]): number => {
  const focusDays = new Set<string>();

  for (const session of sessions) {
    if (session.mode === "focus") {
      focusDays.add(session.completedAt.slice(0, 10));
    }
  }

  if (focusDays.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayKey = today.toISOString().slice(0, 10);
  let streak = 0;
  const cursor = new Date(today);

  // If today has no sessions, start from yesterday (streak not yet broken today)
  if (!focusDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (focusDays.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

export const getCompletionMessage = (opts: {
  streak: number;
  sessionCount: number;
  mode: "focus" | "milestone";
}): { title: string; subtitle: string } => {
  if (opts.mode === "milestone") {
    if (opts.streak >= 5) {
      return { title: "4 sessions done.", subtitle: `${opts.streak} days in a row. You're locked in.` };
    }
    return { title: "4 sessions done.", subtitle: "Serious work. Take a long break — 15 to 20 minutes." };
  }

  if (opts.streak >= 7) {
    return { title: "Focus session done.", subtitle: `${opts.streak}-day streak. Consistency is compounding.` };
  }
  if (opts.streak >= 3) {
    return { title: "Focus session done.", subtitle: `${opts.streak} days in a row. Keep the momentum.` };
  }
  return { title: "Focus session done.", subtitle: "Time to step away for a bit." };
};
