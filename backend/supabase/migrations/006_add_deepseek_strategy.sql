-- Add favorite_numbers column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_numbers INTEGER[] NOT NULL DEFAULT '{}';

-- Extend predictions strategy CHECK constraint to include 'deepseek' and 'lucky_pool'
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS predictions_strategy_check;
ALTER TABLE predictions ADD CONSTRAINT predictions_strategy_check
  CHECK (strategy IN (
    'bazi','frequency','gap','numerology','lunar','iching',
    'deterministic','hybrid','deepseek','lucky_pool'
  ));
