-- Allow anon reads (web app reads directly from Supabase without backend)
-- strategy_stats, predictions, matches, draws are not sensitive (lottery predictions only)

-- strategy_stats: open reads, filter by user_id in query
DROP POLICY IF EXISTS "Users read own strategy_stats" ON strategy_stats;
CREATE POLICY "Anyone read strategy_stats" ON strategy_stats
  FOR SELECT USING (true);

-- predictions: open reads
DROP POLICY IF EXISTS "Users read own predictions" ON predictions;
CREATE POLICY "Anyone read predictions" ON predictions
  FOR SELECT USING (true);

-- matches: open reads
DROP POLICY IF EXISTS "Users read own matches" ON matches;
CREATE POLICY "Anyone read matches" ON matches
  FOR SELECT USING (true);

-- draws: open reads (already may exist)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone reads draws" ON draws;
  CREATE POLICY "Anyone reads draws" ON draws FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
