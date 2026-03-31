-- Lucky7 TOTO AI — Initial Supabase Schema
-- Run this in your Supabase SQL editor or via supabase db push

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enable pg_cron (requires Supabase Pro or manual setup)
-- create extension if not exists pg_cron;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  dob text not null,                    -- YYYY/MM/DD
  gender text not null check (gender in ('M', 'F')),
  bazi_profile_json jsonb,
  fcm_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists draws (
  id uuid primary key default uuid_generate_v4(),
  draw_no text unique not null,
  draw_date timestamptz not null,
  winning_numbers integer[] not null default '{}',
  additional_number integer not null default 0,
  fetched_at timestamptz default now()
);

create table if not exists predictions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  draw_id uuid not null references draws(id) on delete cascade,
  strategy text not null check (strategy in ('bazi','frequency','gap','numerology','lunar','hybrid')),
  numbers integer[] not null default '{}',
  confidence float default 0,
  created_at timestamptz default now(),
  unique(user_id, draw_id, strategy)
);

create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  prediction_id uuid unique not null references predictions(id) on delete cascade,
  match_count integer default 0,
  has_additional boolean default false,
  scored_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create table if not exists strategy_stats (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  strategy text not null check (strategy in ('bazi','frequency','gap','numerology','lunar','hybrid')),
  avg_match float default 0,
  max_match integer default 0,
  total_draws integer default 0,
  updated_at timestamptz default now(),
  unique(user_id, strategy)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table users enable row level security;
alter table draws enable row level security;
alter table predictions enable row level security;
alter table matches enable row level security;
alter table chat_messages enable row level security;
alter table strategy_stats enable row level security;

-- Users: can only see/edit their own row
create policy "Users see own profile" on users for select using (auth.uid()::text = id::text);
create policy "Users update own profile" on users for update using (auth.uid()::text = id::text);

-- Draws: public read, service role write
create policy "Draws public read" on draws for select to anon, authenticated using (true);

-- Predictions: users see only their own
create policy "Predictions own" on predictions for all using (auth.uid()::text = user_id::text);

-- Matches: users see only their own (via prediction)
create policy "Matches own" on matches for all using (
  prediction_id in (select id from predictions where user_id::text = auth.uid()::text)
);

-- Chat messages: users see only their own
create policy "Chat own" on chat_messages for all using (auth.uid()::text = user_id::text);

-- Strategy stats: users see only their own
create policy "Stats own" on strategy_stats for all using (auth.uid()::text = user_id::text);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_predictions_user_draw on predictions(user_id, draw_id);
create index if not exists idx_chat_user on chat_messages(user_id, created_at desc);
create index if not exists idx_draws_date on draws(draw_date desc);
create index if not exists idx_strategy_stats_user on strategy_stats(user_id, strategy);

-- ─── Realtime ─────────────────────────────────────────────────────────────────

-- Enable Realtime for draws table (broadcasts new draw to all clients)
alter publication supabase_realtime add table draws;

-- ─── pg_cron: Draw Fetch (Mon 21:35 SGT = 13:35 UTC, Thu 21:35 SGT = 13:35 UTC) ───
-- Uncomment after enabling pg_cron extension:
-- select cron.schedule(
--   'fetch-toto-draw',
--   '35 13 * * 1,4',
--   $$select net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/fetch-draw',
--     headers := json_build_object('x-trigger-source', 'pg_cron')::jsonb
--   )$$
-- );

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at before update on users
  for each row execute function update_updated_at();

create trigger strategy_stats_updated_at before update on strategy_stats
  for each row execute function update_updated_at();
