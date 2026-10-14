-- Award NP remediation (founder-approved 2026-10-14, dev first).
--
-- Policy: retire daily_checkin and quick_start as earning
-- mechanisms (server-side refusal; historical rows preserved);
-- preserve the +20 help_confirmed award with ONE valid award per
-- (post, selected helper) enforced from the ledger and by a
-- partial unique index — independent of caller-supplied
-- idempotency keys.
--
-- Reconciliation: the single known duplicate pair (a legitimate
-- award plus a security-probe repeat award on a dev test
-- account) is resolved by marking the probe award 'reversed'
-- and inserting a compensating -20 'adjustment' entry that names
-- it. Nothing is deleted; balances end at legitimate totals.
--
-- Preflight gate (run read-only BEFORE this file; STOP unless
-- the only duplicate group is the known probe pair):
--   SELECT post_id, profile_id, COUNT(*) FROM public.np_ledger
--   WHERE reason = 'help_confirmed' AND post_id IS NOT NULL
--   GROUP BY post_id, profile_id HAVING COUNT(*) > 1;
--
-- This file is a single transaction: any failure rolls back
-- every step, including the balance correction.

BEGIN;

-- 1. Valid/reversed distinction (general ledger property).
ALTER TABLE public.np_ledger
  ADD COLUMN IF NOT EXISTS award_state TEXT NOT NULL DEFAULT 'valid'
  CHECK (award_state IN ('valid', 'reversed'));

-- 2. Mark the probe award reversed (guarded: aborts unless
--    exactly this row transitions, so this migration can never
--    be applied twice).
DO $$
BEGIN
  UPDATE public.np_ledger
  SET award_state = 'reversed'
  WHERE id = 'd35feb1d-e890-4363-bc47-0ffcdbcf2974'
    AND award_state = 'valid';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversal target not in valid state — migration already applied or inventory changed';
  END IF;
END $$;

-- 3. Compensating entry naming the reversed row (UNIQUE key is
--    a second once-only lock).
INSERT INTO public.np_ledger (profile_id, amount, reason, post_id, idempotency_key)
VALUES (
  'c3c9c550-8376-40cb-bcc9-f5b4363fb447',
  -20,
  'adjustment',
  'fbff5c5e-2d8c-46dc-ae97-23ff89022f46',
  'reversal:d35feb1d-e890-4363-bc47-0ffcdbcf2974'
);

-- 4. Balance correction under the standard NP bypass, inside
--    the same transaction as its reversal record.
SELECT pg_catalog.set_config('neighbloom.allow_np_update', 'true', true);
UPDATE public.profiles SET np = np - 20
WHERE id = 'c3c9c550-8376-40cb-bcc9-f5b4363fb447';

-- 5. One VALID award per (post, helper), database-enforced.
--    Reversed awards are excluded by the general award_state
--    rule — no row-specific exceptions.
CREATE UNIQUE INDEX np_ledger_help_once
  ON public.np_ledger (post_id, profile_id)
  WHERE reason = 'help_confirmed' AND award_state = 'valid';

-- 6. award_np final form.
--    Changes from the M5-era definition:
--    a. The idempotent-replay lookup is scoped to the award's
--       own parameters, only returns VALID rows, and only
--       returns a record to a caller authorized for that award
--       (the recipient themselves, or — for help_confirmed —
--       the owner of the post). A replay of a REVERSED award's
--       key is refused explicitly: reversed awards are final
--       and their keys are retired.
--    b. help_confirmed refuses a second VALID award for the
--       same (post, helper), whatever key the caller supplies.
--    c. daily_checkin and quick_start refuse all new awards.
CREATE OR REPLACE FUNCTION public.award_np(
  p_profile_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_post_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.np_ledger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_key TEXT;
  v_existing public.np_ledger%ROWTYPE;
  v_reversed public.np_ledger%ROWTYPE;
  v_entry public.np_ledger%ROWTYPE;
  v_post public.posts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason NOT IN ('help_confirmed', 'daily_checkin', 'quick_start', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid award reason: %', p_reason;
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Invalid award amount: %', p_amount;
  END IF;

  v_key := COALESCE(
    p_idempotency_key,
    p_reason || ':' || p_profile_id::TEXT || ':' || pg_catalog.date_part('epoch', pg_catalog.now())::TEXT
  );

  -- Idempotent replay, hardened:
  -- * scoped to this award's own parameters (a bare key
  --   collision returns nothing of another member's);
  -- * VALID rows only — a reversed award is never returned as
  --   a successful award;
  -- * authorization is established BEFORE any record is
  --   returned: the caller must be the award's recipient, or,
  --   for help_confirmed, the owner of the post.
  SELECT * INTO v_existing FROM public.np_ledger
  WHERE idempotency_key = v_key
    AND profile_id = p_profile_id
    AND reason = p_reason
    AND post_id IS NOT DISTINCT FROM p_post_id
    AND award_state = 'valid';
  IF FOUND THEN
    IF v_caller = p_profile_id
       OR (p_reason = 'help_confirmed' AND p_post_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.posts
             WHERE id = p_post_id AND owner_id = v_caller
           )) THEN
      RETURN v_existing;
    END IF;
    -- Caller is not authorized for this record. Fall through
    -- WITHOUT returning it: the branch checks below enforce
    -- authorization on their own terms, and a mismatched
    -- insert dies on the key's UNIQUE constraint.
  END IF;

  -- A reversed award's key is retired: replaying it is a
  -- refusal, never a resurrection and never a silent success.
  SELECT * INTO v_reversed FROM public.np_ledger
  WHERE idempotency_key = v_key AND award_state = 'reversed';
  IF FOUND THEN
    RAISE EXCEPTION 'This award was reversed; its idempotency key is retired';
  END IF;

  IF p_reason = 'help_confirmed' THEN
    IF p_post_id IS NULL THEN
      RAISE EXCEPTION 'post_id required for help_confirmed';
    END IF;
    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_post.owner_id != v_caller THEN
      RAISE EXCEPTION 'Only the post owner can confirm completion';
    END IF;
    IF v_post.stage NOT IN ('done', 'confirmed') THEN
      RAISE EXCEPTION 'Post must be in done stage to confirm (current: %)', v_post.stage;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
      WHERE (h->>'id')::UUID = p_profile_id
    ) THEN
      RAISE EXCEPTION 'NP can only be awarded to selected helpers';
    END IF;
    -- One VALID award per (post, helper), from the ledger —
    -- independent of the caller's key. Reversed awards do not
    -- block a legitimate re-award.
    IF EXISTS (
      SELECT 1 FROM public.np_ledger
      WHERE reason = 'help_confirmed'
        AND award_state = 'valid'
        AND post_id = p_post_id
        AND profile_id = p_profile_id
    ) THEN
      RAISE EXCEPTION 'Help already confirmed and awarded for this helper';
    END IF;
    IF p_amount != 20 THEN
      RAISE EXCEPTION 'help_confirmed awards exactly 20 NP';
    END IF;
    IF v_post.stage = 'done' THEN
      PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);
      UPDATE public.posts SET stage = 'confirmed', status = 'confirmed',
        updated_at = pg_catalog.now() WHERE id = p_post_id;
      INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
      VALUES (p_post_id, 'done', 'confirmed', v_caller);
    END IF;

  ELSIF p_reason = 'daily_checkin' THEN
    -- Retired as an earning mechanism (founder decision,
    -- 2026-10-13). Past awards remain in the ledger as history.
    RAISE EXCEPTION 'daily_checkin awards are no longer available';

  ELSIF p_reason = 'quick_start' THEN
    -- Retired as an earning mechanism (founder decision,
    -- 2026-10-13). The path was dormant in the client; the RPC
    -- now refuses it as well.
    RAISE EXCEPTION 'quick_start awards are no longer available';

  ELSIF p_reason = 'adjustment' THEN
    RAISE EXCEPTION 'adjustment awards are not available';
  END IF;

  PERFORM pg_catalog.set_config('neighbloom.allow_np_update', 'true', true);
  UPDATE public.profiles SET np = np + p_amount WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.np_ledger (profile_id, amount, reason, post_id, idempotency_key)
  VALUES (p_profile_id, p_amount, p_reason, p_post_id, v_key)
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

COMMIT;
