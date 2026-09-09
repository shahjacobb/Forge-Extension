alter table public.preferences
  add column if not exists extras jsonb not null default '{}'::jsonb;
