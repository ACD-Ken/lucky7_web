-- Migration 007: Add token_version for JWT revocation
-- Incrementing this column instantly invalidates all existing tokens for a user
-- without changing the JWT secret (which would log out every user globally).

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Atomic increment function used by the logout endpoint
CREATE OR REPLACE FUNCTION increment_token_version(user_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE users SET token_version = token_version + 1 WHERE id = user_id;
$$;
