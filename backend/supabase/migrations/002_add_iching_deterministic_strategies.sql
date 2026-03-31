-- Migration: extend strategy CHECK constraints to include iching and deterministic
-- Run in Supabase SQL Editor

-- 1. predictions table
ALTER TABLE predictions
  DROP CONSTRAINT IF EXISTS predictions_strategy_check;

ALTER TABLE predictions
  ADD CONSTRAINT predictions_strategy_check
    CHECK (strategy IN ('bazi','frequency','gap','numerology','lunar','iching','deterministic','hybrid'));

-- 2. strategy_stats table
ALTER TABLE strategy_stats
  DROP CONSTRAINT IF EXISTS strategy_stats_strategy_check;

ALTER TABLE strategy_stats
  ADD CONSTRAINT strategy_stats_strategy_check
    CHECK (strategy IN ('bazi','frequency','gap','numerology','lunar','iching','deterministic','hybrid'));
