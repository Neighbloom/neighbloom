-- Milestone 1: Protect the np column from direct user manipulation.
--
-- Problem: RLS restricts which ROWS a user can update, not which COLUMNS.
-- The profiles_update_own policy lets users update their own row, which
-- means a user could run UPDATE profiles SET np = 999999 WHERE id = auth.uid().
--
-- Fix: A trigger blocks any direct change to np. Only the award_np()
-- SECURITY DEFINER function (called server-side) can change balances.
-- There is no DELETE policy on profiles, so users cannot delete/recreate
-- to reset np either.

-- 1. Trigger: block direct np modification -------------------------------
CREATE OR REPLACE FUNCTION prevent_np_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.np IS DISTINCT FROM NEW.np THEN
    -- Only allow when the trusted award function has set the session flag.
    IF current_setting('app.allow_np_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct NP modification is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_np_column ON profiles;
CREATE TRIGGER protect_np_column
  BEFORE UPDATE OF np ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_np_tampering();

-- 2. Trusted award function (Milestone 2 will call this server-side) ------
-- SECURITY DEFINER: runs as the function owner, bypasses RLS.
-- Sets a transaction-local flag so the trigger allows this one change.
CREATE OR REPLACE FUNCTION award_np(target_user_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  IF amount IS NULL OR amount = 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('app.allow_np_change', 'true', true);
  UPDATE profiles SET np = np + amount WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only authenticated users can call award_np directly (Milestone 2 will
-- restrict this further via a dedicated service role or tighter logic).
-- For Milestone 1, the function exists but the app does not call it;
-- NP awards remain client-side demo until Milestone 2 migrates them.
--
-- SECURITY: Revoked from everyone. No ordinary user can invoke this via RPC.
-- Milestone 2 will introduce a properly authorized, transaction-safe,
-- exactly-once award mechanism with its own GRANT.
REVOKE ALL ON FUNCTION award_np(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION award_np(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION award_np(UUID, INTEGER) FROM authenticated;
-- No GRANT. Only service_role and postgres superuser can execute.
