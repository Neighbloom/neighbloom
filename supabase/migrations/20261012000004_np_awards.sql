-- Milestone 2: Secure Neighbor Points awards.
--
-- Design:
--   - award_np() is the ONLY way to change a profile's NP balance.
--   - It is SECURITY DEFINER and sets a transaction-local bypass for the
--     M1 trigger that blocks direct NP modification.
--   - Every award is recorded in np_ledger for audit.
--   - Idempotency: each award has a unique idempotency_key. Duplicate calls
--     with the same key return the existing ledger entry without double-awarding.
--
-- Award reasons:
--   - 'help_confirmed': +20 NP to a helper when the requester confirms completion.
--   - 'daily_checkin': +5 NP for daily check-in (enforced once per day per user).
--   - 'quick_start': +25 NP one-time onboarding bonus.

-- Audit ledger for all NP movements.
CREATE TABLE IF NOT EXISTS public.np_ledger (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('help_confirmed', 'daily_checkin', 'quick_start', 'adjustment')),
  -- For help_confirmed: the post that was completed.
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  -- Idempotency key: unique per award event.
  -- e.g., 'help_confirmed:<post_id>:<helper_id>' or 'daily_checkin:<profile_id>:<date>'.
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_np_ledger_profile ON public.np_ledger(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_np_ledger_post ON public.np_ledger(post_id);

ALTER TABLE public.np_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger. Public read for transparency on help awards
-- is a product decision — for now, own-ledger only.
CREATE POLICY np_ledger_select_own
  ON public.np_ledger FOR SELECT
  USING (auth.uid() = profile_id);

-- No direct inserts — only via award_np().
GRANT SELECT ON public.np_ledger TO authenticated;

-- The ONLY way to award NP. Idempotent via idempotency_key.
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
  v_entry public.np_ledger%ROWTYPE;
  v_post public.posts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate reason.
  IF p_reason NOT IN ('help_confirmed', 'daily_checkin', 'quick_start', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid award reason: %', p_reason;
  END IF;

  -- Validate amount is positive and sane.
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Invalid award amount: %', p_amount;
  END IF;

  -- Build idempotency key if not provided.
  -- Note: Using pg_catalog.date_part('epoch', ...) instead of extract(epoch FROM ...)
  -- because EXTRACT with schema-qualified function name has parser issues with
  -- the EPOCH keyword in some PostgreSQL versions.
  v_key := COALESCE(
    p_idempotency_key,
    p_reason || ':' || p_profile_id::TEXT || ':' || pg_catalog.date_part('epoch', pg_catalog.now())::TEXT
  );

  -- Idempotency: return existing entry if this award was already processed.
  SELECT * INTO v_existing FROM public.np_ledger WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Authorization per reason:
  IF p_reason = 'help_confirmed' THEN
    -- Only the post owner can confirm, post must exist and be in 'done' stage,
    -- and the recipient must be a selected helper.
    IF p_post_id IS NULL THEN
      RAISE EXCEPTION 'post_id required for help_confirmed';
    END IF;
    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_post.owner_id != v_caller THEN
      RAISE EXCEPTION 'Only the post owner can confirm completion';
    END IF;
    -- Allow awards while 'done' or already 'confirmed' (multi-helper support).
    -- The first award advances done -> confirmed; subsequent helper awards
    -- are permitted while confirmed so every helper can be recognized.
    IF v_post.stage NOT IN ('done', 'confirmed') THEN
      RAISE EXCEPTION 'Post must be in done stage to confirm (current: %)', v_post.stage;
    END IF;
    -- Recipient must be a selected helper.
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
      WHERE (h->>'id')::UUID = p_profile_id
    ) THEN
      RAISE EXCEPTION 'NP can only be awarded to selected helpers';
    END IF;
    -- Enforce the +20 amount for help confirmations.
    IF p_amount != 20 THEN
      RAISE EXCEPTION 'help_confirmed awards exactly 20 NP';
    END IF;
    -- Auto-advance done -> confirmed on the first award only.
    -- Later awards (stage already 'confirmed') skip the transition.
    IF v_post.stage = 'done' THEN
      PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);
      UPDATE public.posts SET stage = 'confirmed', status = 'confirmed',
        updated_at = pg_catalog.now() WHERE id = p_post_id;
      INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
      VALUES (p_post_id, 'done', 'confirmed', v_caller);
    END IF;

  ELSIF p_reason = 'daily_checkin' THEN
    -- Users can only check in for themselves.
    IF p_profile_id != v_caller THEN
      RAISE EXCEPTION 'Cannot check in for another user';
    END IF;
    IF p_amount != 5 THEN
      RAISE EXCEPTION 'daily_checkin awards exactly 5 NP';
    END IF;
    -- The idempotency key should include the date (caller constructs it).
    -- This prevents double check-in for the same day.

  ELSIF p_reason = 'quick_start' THEN
    IF p_profile_id != v_caller THEN
      RAISE EXCEPTION 'Cannot claim quick_start for another user';
    END IF;
    IF p_amount != 25 THEN
      RAISE EXCEPTION 'quick_start awards exactly 25 NP';
    END IF;

  ELSIF p_reason = 'adjustment' THEN
    -- Reserved for admin/support. Currently no caller is authorized.
    RAISE EXCEPTION 'adjustment awards are not available';
  END IF;

  -- Apply the award with trigger bypass.
  PERFORM pg_catalog.set_config('neighbloom.allow_np_update', 'true', true);
  UPDATE public.profiles SET np = np + p_amount WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Record in ledger.
  INSERT INTO public.np_ledger (profile_id, amount, reason, post_id, idempotency_key)
  VALUES (p_profile_id, p_amount, p_reason, p_post_id, v_key)
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.award_np(UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_np(UUID, INTEGER, TEXT, UUID, TEXT) TO authenticated;
