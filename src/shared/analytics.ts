import type { SessionRecord } from "./types";

export interface WeeklyBucket {
  key: string;
  label: string;
  fullLabel: string;
  minutes: number;
}

export const buildWeeklyData = (sessions: SessionRecord[], weekOffset = 0): WeeklyBucket[] => {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);

  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseDate);
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

export const getWeekLabel = (weekOffset = 0): string => {
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
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

export interface MonthDay {
  key: string;
  day: number;
  minutes: number;
  isToday: boolean;
  isOutside: boolean;
}

export const buildMonthData = (sessions: SessionRecord[], monthOffset = 0): { label: string; days: MonthDay[]; totalMinutes: number; activeDays: number } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Build minute map from sessions
  const minuteMap = new Map<string, number>();
  for (const session of sessions) {
    if (session.mode === "focus") {
      const key = session.completedAt.slice(0, 10);
      minuteMap.set(key, (minuteMap.get(key) ?? 0) + Math.round(session.durationMs / 60_000));
    }
  }

  const days: MonthDay[] = [];

  // Pad start of month to align with Sunday
  const startDay = first.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, day: d.getDate(), minutes: minuteMap.get(key) ?? 0, isToday: false, isOutside: true });
  }

  // Days of the month
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month, d);
    const key = date.toISOString().slice(0, 10);
    days.push({ key, day: d, minutes: minuteMap.get(key) ?? 0, isToday: key === todayKey, isOutside: false });
  }

  // Pad end to complete the last week
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, day: d.getDate(), minutes: minuteMap.get(key) ?? 0, isToday: false, isOutside: true });
    }
  }

  const inMonthDays = days.filter((d) => !d.isOutside);
  const totalMinutes = inMonthDays.reduce((sum, d) => sum + d.minutes, 0);
  const activeDays = inMonthDays.filter((d) => d.minutes > 0).length;

  return { label, days, totalMinutes, activeDays };
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
