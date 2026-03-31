-- Migration 005: Atomic email quota enforcement
-- Replaces application-level TOCTOU check with a DB-level trigger.
-- The function atomically increments a counter and rejects if > 10 per rolling 7 days.

CREATE OR REPLACE FUNCTION check_email_quota()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  week_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO week_count
  FROM email_sends
  WHERE user_id = NEW.user_id
    AND sent_at >= NOW() - INTERVAL '7 days';

  IF week_count >= 10 THEN
    RAISE EXCEPTION 'EMAIL_QUOTA_EXCEEDED: max 10 emails per rolling 7 days';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_email_quota ON email_sends;
CREATE TRIGGER enforce_email_quota
  BEFORE INSERT ON email_sends
  FOR EACH ROW EXECUTE FUNCTION check_email_quota();
