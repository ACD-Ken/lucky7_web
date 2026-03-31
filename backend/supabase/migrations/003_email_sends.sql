-- Migration 003: Email sends log
-- Tracks weekly email quota (max 4 per user per rolling 7-day window)

CREATE TABLE IF NOT EXISTS email_sends (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL CHECK (email_type IN ('prediction','results','analytics','general')),
  subject    TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast weekly count queries
CREATE INDEX IF NOT EXISTS idx_email_sends_user_week
  ON email_sends (user_id, sent_at DESC);

-- Row-level security: users can only see their own sends
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_email_sends"
  ON email_sends FOR ALL
  USING (auth.uid()::text = user_id::text);
