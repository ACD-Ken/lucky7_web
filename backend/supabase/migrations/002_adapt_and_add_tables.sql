-- Lucky7 TOTO AI — Migration 002
-- Adapts existing draws table + creates all new tables
-- Safe to run: uses IF NOT EXISTS / IF EXISTS guards throughout

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Adapt existing draws table ───────────────────────────────────────────────
-- Existing: id bigint, draw_no text, date date, winning_numbers text, additional_number text
-- We add typed columns alongside, populate them, then our app reads the new columns

ALTER TABLE draws
  ADD COLUMN IF NOT EXISTS draw_date  timestamptz,
  ADD COLUMN IF NOT EXISTS win_nums   integer[],
  ADD COLUMN IF NOT EXISTS add_num    integer,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz DEFAULT now();

-- Populate draw_date from the existing date column
UPDATE draws
  SET draw_date = date::timestamptz
  WHERE draw_date IS NULL AND date IS NOT NULL;

-- Populate win_nums from space-separated winning_numbers text
UPDATE draws
  SET win_nums = ARRAY(
    SELECT unnest(string_to_array(trim(winning_numbers), ' '))::integer
  )
  WHERE win_nums IS NULL AND winning_numbers IS NOT NULL AND trim(winning_numbers) <> '';

-- Populate add_num from additional_number text
UPDATE draws
  SET add_num = additional_number::integer
  WHERE add_num IS NULL AND additional_number IS NOT NULL AND trim(additional_number) <> '';

-- ─── New tables (all reference draws.id as bigint) ────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  email       text UNIQUE NOT NULL,
  dob         text NOT NULL,
  gender      text NOT NULL CHECK (gender IN ('M', 'F')),
  bazi_profile_json jsonb,
  fcm_token   text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS predictions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draw_id     bigint  NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  strategy    text    NOT NULL CHECK (strategy IN ('bazi','frequency','gap','numerology','lunar','hybrid')),
  numbers     integer[] NOT NULL DEFAULT '{}',
  confidence  float DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, draw_id, strategy)
);

CREATE TABLE IF NOT EXISTS matches (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id uuid UNIQUE NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  match_count   integer DEFAULT 0,
  has_additional boolean DEFAULT false,
  scored_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_stats (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy    text NOT NULL CHECK (strategy IN ('bazi','frequency','gap','numerology','lunar','hybrid')),
  avg_match   float DEFAULT 0,
  max_match   integer DEFAULT 0,
  total_draws integer DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, strategy)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_stats  ENABLE ROW LEVEL SECURITY;

-- Users: own row only
DO $$ BEGIN
  CREATE POLICY "Users see own profile"    ON users FOR SELECT USING (auth.uid()::text = id::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own profile" ON users FOR UPDATE USING (auth.uid()::text = id::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users insert own"         ON users FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Draws: already has RLS or none — ensure public read
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Draws public read" ON draws FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Predictions: own only
DO $$ BEGIN
  CREATE POLICY "Predictions own" ON predictions FOR ALL USING (auth.uid()::text = user_id::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Matches: own via prediction
DO $$ BEGIN
  CREATE POLICY "Matches own" ON matches FOR ALL USING (
    prediction_id IN (SELECT id FROM predictions WHERE user_id::text = auth.uid()::text)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Chat messages: own only
DO $$ BEGIN
  CREATE POLICY "Chat own" ON chat_messages FOR ALL USING (auth.uid()::text = user_id::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Strategy stats: own only
DO $$ BEGIN
  CREATE POLICY "Stats own" ON strategy_stats FOR ALL USING (auth.uid()::text = user_id::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_predictions_user_draw ON predictions(user_id, draw_id);
CREATE INDEX IF NOT EXISTS idx_chat_user              ON chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draws_date             ON draws(draw_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_strategy_stats_user    ON strategy_stats(user_id, strategy);

-- ─── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE draws;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS strategy_stats_updated_at ON strategy_stats;
CREATE TRIGGER strategy_stats_updated_at BEFORE UPDATE ON strategy_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
