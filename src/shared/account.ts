import type { Session, User } from "@supabase/supabase-js";
import { defaultSettings, getState, modeDurationMs, normalizeState, setState, trimSessions } from "./storage";
import { supabase } from "./supabase";
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
}

interface RemoteSession {
  local_session_id: string | null;
  mode: SessionRecord["mode"];
  duration_ms: number;
  completed_at: string;
}

export interface AccountSnapshot {
  user: User | null;
  session: Session | null;
  profile: RemoteProfile | null;
}

const settingsEqual = (left: TimerSettings, right: TimerSettings): boolean =>
  left.focusMinutes === right.focusMinutes &&
  left.breakMinutes === right.breakMinutes &&
  left.autoStartBreaks === right.autoStartBreaks;

const isDefaultSettings = (settings: TimerSettings): boolean => settingsEqual(settings, defaultSettings);

const mapRemotePreferences = (preferences: RemotePreferences | null): TimerSettings =>
  preferences
    ? {
        focusMinutes: preferences.focus_minutes,
        breakMinutes: preferences.break_minutes,
        autoStartBreaks: preferences.auto_start_breaks
      }
    : defaultSettings;

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

export const getAccountSnapshot = async (): Promise<AccountSnapshot> => {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;

  if (!user) {
    return { user: null, session: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, greeting_style, custom_greeting")
    .eq("id", user.id)
    .maybeSingle();

  return { user, session, profile: profile ?? null };
};

export const signUpWithEmail = async (email: string, password: string, displayName: string) =>
  supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0]
      }
    }
  });

export const signInWithEmail = async (email: string, password: string) =>
  supabase.auth.signInWithPassword({
    email,
    password
  });

export const signOutAccount = async () => supabase.auth.signOut();

export const updateProfileName = async (userId: string, displayName: string) =>
  supabase.from("profiles").upsert(
    {
      id: userId,
      display_name: displayName
    },
    { onConflict: "id" }
  );

export const syncAccountState = async (user: User): Promise<PersistedState> => {
  const localState = await getState();

  const [{ data: preferences }, { data: remoteSessions }] = await Promise.all([
    supabase
      .from("preferences")
      .select("focus_minutes, break_minutes, auto_start_breaks")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("local_session_id, mode, duration_ms, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: true })
  ]);

  const remoteSettings = mapRemotePreferences(preferences as RemotePreferences | null);
  const mergedSettings = chooseSettings(localState.settings, remoteSettings);
  const mergedSessions = mergeSessions(localState.sessions, (remoteSessions ?? []) as RemoteSession[]);

  await Promise.all([
    supabase.from("preferences").upsert(
      {
        user_id: user.id,
        focus_minutes: mergedSettings.focusMinutes,
        break_minutes: mergedSettings.breakMinutes,
        auto_start_breaks: mergedSettings.autoStartBreaks
      },
      { onConflict: "user_id" }
    ),
    mergedSessions.length > 0
      ? supabase.from("sessions").upsert(mergedSessions.map((session) => toRemoteSession(user.id, session)), {
          onConflict: "user_id,local_session_id"
        })
      : Promise.resolve()
  ]);

  return applyMergedState(localState, mergedSettings, mergedSessions);
};

export const syncSettingsToAccount = async (userId: string, settings: TimerSettings) => {
  await supabase.from("preferences").upsert(
    {
      user_id: userId,
      focus_minutes: settings.focusMinutes,
      break_minutes: settings.breakMinutes,
      auto_start_breaks: settings.autoStartBreaks
    },
    { onConflict: "user_id" }
  );
};

export const syncSessionsToAccount = async (userId: string, sessions: SessionRecord[]) => {
  if (sessions.length === 0) {
    return;
  }

  await supabase.from("sessions").upsert(sessions.map((session) => toRemoteSession(userId, session)), {
    onConflict: "user_id,local_session_id"
  });
};
