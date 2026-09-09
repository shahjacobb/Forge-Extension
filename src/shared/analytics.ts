import type { SessionRecord, TimerMode } from "./types";

export interface WeeklyBucket {
  key: string;
  label: string;
  fullLabel: string;
  minutes: number;
  sessions: number;
}

const dayKey = (date: Date): string => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const offset = copy.getTimezoneOffset();
  const local = new Date(copy.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
};

export const buildWeeklyData = (sessions: SessionRecord[], weekOffset = 0): WeeklyBucket[] => {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);

  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - (6 - index));
    const key = dayKey(date);

    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      fullLabel: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      minutes: 0,
      sessions: 0
    };
  });

  for (const session of sessions) {
    const key = session.completedAt.slice(0, 10);
    const bucket = buckets.find((entry) => entry.key === key);

    if (bucket && session.mode === "focus") {
      bucket.minutes += Math.round(session.durationMs / 60_000);
      bucket.sessions += 1;
    }
  }

  return buckets;
};

export const getWeekLabel = (weekOffset = 0): string => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + weekOffset * 7);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  if (weekOffset === 0) {
    return "Last 7 days";
  }

  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
};

export const computeStreak = (sessions: SessionRecord[]): number => {
  const focusDays = new Set<string>();

  for (const session of sessions) {
    if (session.mode === "focus") {
      focusDays.add(session.completedAt.slice(0, 10));
    }
  }

  if (focusDays.size === 0) {
    return 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayKey = dayKey(today);
  let streak = 0;
  const cursor = new Date(today);

  if (!focusDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (focusDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

export const computeFocusMinutes = (sessions: SessionRecord[], since?: Date): number =>
  sessions.reduce((sum, session) => {
    if (session.mode !== "focus") {
      return sum;
    }

    if (since && new Date(session.completedAt) < since) {
      return sum;
    }

    return sum + Math.round(session.durationMs / 60_000);
  }, 0);

export interface MonthDay {
  key: string;
  day: number;
  minutes: number;
  isToday: boolean;
  isOutside: boolean;
}

export const buildMonthData = (
  sessions: SessionRecord[],
  monthOffset = 0
): { label: string; days: MonthDay[]; totalMinutes: number; activeDays: number } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const todayKey = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const minuteMap = new Map<string, number>();
  for (const session of sessions) {
    if (session.mode === "focus") {
      const key = session.completedAt.slice(0, 10);
      minuteMap.set(key, (minuteMap.get(key) ?? 0) + Math.round(session.durationMs / 60_000));
    }
  }

  const days: MonthDay[] = [];

  const startDay = first.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    const key = dayKey(d);
    days.push({ key, day: d.getDate(), minutes: minuteMap.get(key) ?? 0, isToday: false, isOutside: true });
  }

  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month, d);
    const key = dayKey(date);
    days.push({ key, day: d, minutes: minuteMap.get(key) ?? 0, isToday: key === todayKey, isOutside: false });
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = dayKey(d);
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
  mode: "focus" | "milestone" | "break" | "longBreak";
}): { title: string; subtitle: string } => {
  if (opts.mode === "longBreak") {
    return { title: "Long break over.", subtitle: "Four rounds in. Ready when you are." };
  }

  if (opts.mode === "break") {
    return { title: "Break over.", subtitle: "Back to the work that matters." };
  }

  if (opts.mode === "milestone") {
    if (opts.streak >= 5) {
      return { title: "Four sessions done.", subtitle: `${opts.streak} days in a row. Take the long break.` };
    }
    return { title: "Four sessions done.", subtitle: "Serious work. Step away for 15 to 20 minutes." };
  }

  if (opts.streak >= 7) {
    return { title: "Focus complete.", subtitle: `${opts.streak}-day streak. Consistency is compounding.` };
  }
  if (opts.streak >= 3) {
    return { title: "Focus complete.", subtitle: `${opts.streak} days in a row. Keep the momentum.` };
  }
  return { title: "Focus complete.", subtitle: "Time to step away for a bit." };
};

export const modeLabel = (mode: TimerMode): string => {
  if (mode === "longBreak") {
    return "Long break";
  }

  if (mode === "break") {
    return "Break";
  }

  return "Focus";
};
