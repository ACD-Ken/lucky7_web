-- Migration 003: Add birth_time column to users table
-- Required for accurate Bazi Hour Pillar calculation

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_time text NOT NULL DEFAULT '';

COMMENT ON COLUMN users.birth_time IS 'Birth time in HH:MM (24h) format, required for Hour Pillar calculation';
