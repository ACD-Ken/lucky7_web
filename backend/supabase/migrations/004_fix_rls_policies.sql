-- Migration 004: Restore user-scoped RLS policies
-- Replaces the overly permissive "Anyone read" policies from 003_open_read_policies.sql
-- All reads are now scoped to the authenticated user's own rows.
-- Note: backend uses supabaseAdmin (service key) so RLS does not block server-side queries.
--       These policies protect direct Supabase client access (e.g., future web app).

-- ── strategy_stats ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone read strategy_stats" ON strategy_stats;
CREATE POLICY "Users read own strategy_stats" ON strategy_stats
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- ── predictions ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone read predictions" ON predictions;
CREATE POLICY "Users read own predictions" ON predictions
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- ── matches ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone read matches" ON matches;
-- matches links to predictions via prediction_id — use a subquery to scope
CREATE POLICY "Users read own matches" ON matches
  FOR SELECT USING (
    prediction_id IN (
      SELECT id FROM predictions WHERE user_id::text = auth.uid()::text
    )
  );

-- ── draws ──────────────────────────────────────────────────────────────────
-- Draws are public lottery results — keep open reads (no PII)
DROP POLICY IF EXISTS "Anyone reads draws" ON draws;
CREATE POLICY "Anyone reads draws" ON draws FOR SELECT USING (true);

-- ── email_sends ────────────────────────────────────────────────────────────
-- Already user-scoped in 003_email_sends.sql — reconfirm it is tight
DROP POLICY IF EXISTS "users_own_email_sends" ON email_sends;
CREATE POLICY "users_own_email_sends" ON email_sends
  FOR ALL USING (user_id::text = auth.uid()::text);
