create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  greeting_style text not null default 'steady',
  custom_greeting text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  focus_minutes integer not null default 25 check (focus_minutes between 1 and 180),
  break_minutes integer not null default 5 check (break_minutes between 1 and 60),
  auto_start_breaks boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_session_id text,
  mode text not null check (mode in ('focus', 'break')),
  duration_ms integer not null check (duration_ms > 0),
  completed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, local_session_id)
);

create index if not exists sessions_user_completed_at_idx
  on public.sessions (user_id, completed_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists preferences_set_updated_at on public.preferences;
create trigger preferences_set_updated_at
before update on public.preferences
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read their own preferences" on public.preferences;
create policy "Users can read their own preferences"
on public.preferences
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own preferences" on public.preferences;
create policy "Users can insert their own preferences"
on public.preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own preferences" on public.preferences;
create policy "Users can update their own preferences"
on public.preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read their own sessions" on public.sessions;
create policy "Users can read their own sessions"
on public.sessions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sessions" on public.sessions;
create policy "Users can insert their own sessions"
on public.sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sessions" on public.sessions;
create policy "Users can update their own sessions"
on public.sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));

  insert into public.preferences (user_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
