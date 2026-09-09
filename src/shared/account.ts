import type { Session, User } from "@supabase/supabase-js";
import { defaultSettings, getState, modeDurationMs, normalizeSettings, normalizeState, setState, trimSessions } from "./storage";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { PersistedState, SessionRecord, TimerSettings } from "./types";

interface RemoteProfile {
  id: string;
  display_name: string | null;
  greeting_style: string;
  custom_greeting: string | null;
}

interface RemotePreferences {
  focus_minutes: number;
  break_minutes: number;
  auto_start_breaks: boolean;
  extras?: Record<string, unknown> | null;
}

interface RemoteSession {
  local_session_id: string | null;
  mode: SessionRecord["mode"];
  duration_ms: number;
  completed_at: string;
}

export interface AccountSnapshot {
  configured: boolean;
  user: User | null;
  session: Session | null;
  profile: RemoteProfile | null;
}

const settingsEqual = (left: TimerSettings, right: TimerSettings): boolean =>
  left.focusMinutes === right.focusMinutes &&
  left.breakMinutes === right.breakMinutes &&
  left.longBreakMinutes === right.longBreakMinutes &&
  left.sessionsUntilLongBreak === right.sessionsUntilLongBreak &&
  left.autoStartBreaks === right.autoStartBreaks &&
  left.autoStartFocus === right.autoStartFocus &&
  left.soundEnabled === right.soundEnabled &&
  left.soundVolume === right.soundVolume &&
  left.dailyGoalMinutes === right.dailyGoalMinutes &&
  left.theme === right.theme;

const isDefaultSettings = (settings: TimerSettings): boolean => settingsEqual(settings, defaultSettings);

const extrasFromSettings = (settings: TimerSettings) => ({
  longBreakMinutes: settings.longBreakMinutes,
  sessionsUntilLongBreak: settings.sessionsUntilLongBreak,
  autoStartFocus: settings.autoStartFocus,
  soundEnabled: settings.soundEnabled,
  soundVolume: settings.soundVolume,
  dailyGoalMinutes: settings.dailyGoalMinutes,
  theme: settings.theme
});

const mapRemotePreferences = (preferences: RemotePreferences | null): TimerSettings => {
  if (!preferences) {
    return defaultSettings;
  }

  const extras = preferences.extras ?? {};

  return normalizeSettings({
    focusMinutes: preferences.focus_minutes,
    breakMinutes: preferences.break_minutes,
    autoStartBreaks: preferences.auto_start_breaks,
    longBreakMinutes: typeof extras.longBreakMinutes === "number" ? extras.longBreakMinutes : undefined,
    sessionsUntilLongBreak:
      typeof extras.sessionsUntilLongBreak === "number" ? extras.sessionsUntilLongBreak : undefined,
    autoStartFocus: typeof extras.autoStartFocus === "boolean" ? extras.autoStartFocus : undefined,
    soundEnabled: typeof extras.soundEnabled === "boolean" ? extras.soundEnabled : undefined,
    soundVolume: typeof extras.soundVolume === "number" ? extras.soundVolume : undefined,
    dailyGoalMinutes: typeof extras.dailyGoalMinutes === "number" ? extras.dailyGoalMinutes : undefined,
    theme: extras.theme === "light" || extras.theme === "dark" ? extras.theme : undefined
  });
};

const toRemoteSession = (userId: string, session: SessionRecord) => ({
  user_id: userId,
  local_session_id: session.id,
  mode: session.mode,
  duration_ms: session.durationMs,
  completed_at: session.completedAt
});

const mergeSessions = (localSessions: SessionRecord[], remoteSessions: RemoteSession[]): SessionRecord[] => {
  const merged = new Map<string, SessionRecord>();

  for (const session of localSessions) {
    merged.set(session.id, session);
  }

  for (const session of remoteSessions) {
    if (!session.local_session_id) {
      continue;
    }

    merged.set(session.local_session_id, {
      id: session.local_session_id,
      mode: session.mode,
      durationMs: session.duration_ms,
      completedAt: session.completed_at
    });
  }

  return trimSessions(
    Array.from(merged.values()).sort((left, right) => left.completedAt.localeCompare(right.completedAt))
  );
};

const chooseSettings = (localSettings: TimerSettings, remoteSettings: TimerSettings): TimerSettings => {
  if (isDefaultSettings(remoteSettings) && !isDefaultSettings(localSettings)) {
    return localSettings;
  }

  return remoteSettings;
};

const applyMergedState = async (localState: PersistedState, settings: TimerSettings, sessions: SessionRecord[]) => {
  const focusCount = sessions.filter((session) => session.mode === "focus").length;

  const nextState = normalizeState({
    settings,
    timer: {
      ...localState.timer,
      sessionCount: focusCount,
      remainingMs:
        localState.timer.status === "idle"
          ? modeDurationMs(localState.timer.mode, settings)
          : localState.timer.remainingMs
    },
    sessions
  });

  await setState(nextState);
  return nextState;
};

const requireClient = () => {
  if (!supabase) {
    throw new Error("Cloud sync is not configured.");
  }

  return supabase;
};

export const getAccountSnapshot = async (): Promise<AccountSnapshot> => {
  if (!isSupabaseConfigured || !supabase) {
    return { configured: false, user: null, session: null, profile: null };
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;

  if (!user) {
    return { configured: true, user: null, session: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, greeting_style, custom_greeting")
    .eq("id", user.id)
    .maybeSingle();

  return { configured: true, user, session, profile: profile ?? null };
};

export const signUpWithEmail = async (email: string, password: string, displayName: string) =>
  requireClient().auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0]
      }
    }
  });

export const signInWithEmail = async (email: string, password: string) =>
  requireClient().auth.signInWithPassword({
    email,
    password
  });

export const requestPasswordReset = async (email: string) =>
  requireClient().auth.resetPasswordForEmail(email);

export const signOutAccount = async () => requireClient().auth.signOut();

export const updateProfileName = async (userId: string, displayName: string) =>
  requireClient().from("profiles").upsert(
    {
      id: userId,
      display_name: displayName
    },
    { onConflict: "id" }
  );

const upsertPreferences = async (userId: string, settings: TimerSettings) => {
  const payload = {
    user_id: userId,
    focus_minutes: settings.focusMinutes,
    break_minutes: settings.breakMinutes,
    auto_start_breaks: settings.autoStartBreaks,
    extras: extrasFromSettings(settings)
  };

  const withExtras = await requireClient().from("preferences").upsert(payload, { onConflict: "user_id" });

  if (!withExtras.error) {
    return withExtras;
  }

  const { extras: _extras, ...legacy } = payload;
  return requireClient().from("preferences").upsert(legacy, { onConflict: "user_id" });
};

export const syncAccountState = async (user: User): Promise<PersistedState> => {
  const localState = await getState();
  const client = requireClient();

  const loadPreferences = async () => {
    const withExtras = await client
      .from("preferences")
      .select("focus_minutes, break_minutes, auto_start_breaks, extras")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!withExtras.error) {
      return withExtras.data;
    }

    const legacy = await client
      .from("preferences")
      .select("focus_minutes, break_minutes, auto_start_breaks")
      .eq("user_id", user.id)
      .maybeSingle();

    return legacy.data;
  };

  const [preferences, { data: remoteSessions }] = await Promise.all([
    loadPreferences(),
    client
      .from("sessions")
      .select("local_session_id, mode, duration_ms, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: true })
  ]);

  const remoteSettings = mapRemotePreferences(preferences as RemotePreferences | null);
  const mergedSettings = chooseSettings(localState.settings, remoteSettings);
  const mergedSessions = mergeSessions(localState.sessions, (remoteSessions ?? []) as RemoteSession[]);

  await Promise.all([
    upsertPreferences(user.id, mergedSettings),
    mergedSessions.length > 0
      ? client.from("sessions").upsert(mergedSessions.map((session) => toRemoteSession(user.id, session)), {
          onConflict: "user_id,local_session_id"
        })
      : Promise.resolve()
  ]);

  return applyMergedState(localState, mergedSettings, mergedSessions);
};

export const syncSettingsToAccount = async (userId: string, settings: TimerSettings) => {
  await upsertPreferences(userId, settings);
};

export const syncSessionsToAccount = async (userId: string, sessions: SessionRecord[]) => {
  if (sessions.length === 0) {
    return;
  }

  await requireClient().from("sessions").upsert(sessions.map((session) => toRemoteSession(userId, session)), {
    onConflict: "user_id,local_session_id"
  });
};

export const maybeSyncCompletedSessions = async (sessions: SessionRecord[]) => {
  try {
    const account = await getAccountSnapshot();
    if (account.user) {
      await syncSessionsToAccount(account.user.id, sessions);
    }
  } catch {
    // keep the timer working even if sync is offline
  }
};
