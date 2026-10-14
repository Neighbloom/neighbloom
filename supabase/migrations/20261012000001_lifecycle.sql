-- Milestone 2: Server-authorized help lifecycle transitions.
--
-- The posts.stage column is locked by trigger (see 20261011000003).
-- This migration adds a SECURITY DEFINER function that is the ONLY way
-- to advance a post through its lifecycle:
--
--   open -> booked -> started -> done -> confirmed
--   (any stage -> cancelled, owner only)
--
-- Rules enforced server-side:
--   1. Only the post owner can transition.
--   2. Only valid forward transitions (or cancel) are allowed.
--   3. 'booked' requires at least one helper selected.
--   4. 'confirmed' requires stage = 'done' (requester confirms completion).
--   5. Every transition is logged to post_transitions for audit.
--   6. Helpers can only be selected while stage = 'open'.

-- Audit log for all lifecycle transitions.
CREATE TABLE IF NOT EXISTS public.post_transitions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.post_transitions ENABLE ROW LEVEL SECURITY;

-- Anyone can read transition history (transparency for trust).
DROP POLICY IF EXISTS post_transitions_select_all ON public.post_transitions;
CREATE POLICY post_transitions_select_all
  ON public.post_transitions FOR SELECT USING (true);
-- No direct inserts — only via transition_post().
-- (No INSERT/UPDATE/DELETE policies = denied by default with RLS on.)

GRANT SELECT ON public.post_transitions TO anon, authenticated;

-- Valid transitions map.
CREATE OR REPLACE FUNCTION public.valid_transition(from_stage TEXT, to_stage TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN from_stage = 'open'     AND to_stage IN ('booked', 'cancelled') THEN true
    WHEN from_stage = 'booked'   AND to_stage IN ('started', 'cancelled') THEN true
    WHEN from_stage = 'started'  AND to_stage IN ('done', 'cancelled') THEN true
    WHEN from_stage = 'done'     AND to_stage IN ('confirmed', 'cancelled') THEN true
    ELSE false
  END;
$$;

-- The ONLY way to change a post's stage. Called by the post owner.
CREATE OR REPLACE FUNCTION public.transition_post(
  p_post_id UUID,
  p_to_stage TEXT
)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_helper_count INT;
  v_from_stage TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can transition lifecycle';
  END IF;

  IF NOT public.valid_transition(v_post.stage, p_to_stage) THEN
    RAISE EXCEPTION 'Invalid transition: % -> %', v_post.stage, p_to_stage;
  END IF;

  -- 'booked' requires at least one selected helper.
  IF p_to_stage = 'booked' THEN
    SELECT pg_catalog.jsonb_array_length(v_post.helpers) INTO v_helper_count;
    IF v_helper_count IS NULL OR v_helper_count < 1 THEN
      RAISE EXCEPTION 'Cannot book: select at least one helper first';
    END IF;
  END IF;

  -- Capture the source stage BEFORE the update overwrites v_post.
  v_from_stage := v_post.stage;

  -- Perform the transition (bypasses the lock trigger via SECURITY DEFINER).
  -- Set transaction-local bypass that the trigger checks.
  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET stage = p_to_stage,
      status = p_to_stage,
      updated_at = pg_catalog.now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  -- Audit log with the true source stage.
  INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
  VALUES (p_post_id, v_from_stage, p_to_stage, v_caller);

  RETURN v_post;
END;
$$;

-- Owner-only helper selection. Only while stage = 'open'.
-- p_helper_ids: array of profile UUIDs (must have volunteered via replies).
CREATE OR REPLACE FUNCTION public.select_helpers(
  p_post_id UUID,
  p_helper_ids UUID[]
)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_helpers_jsonb JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can select helpers';
  END IF;

  IF v_post.stage != 'open' THEN
    RAISE EXCEPTION 'Helpers can only be selected while the post is open';
  END IF;

  IF pg_catalog.array_length(p_helper_ids, 1) IS NULL
     OR pg_catalog.array_length(p_helper_ids, 1) < 1 THEN
    RAISE EXCEPTION 'Select at least one helper';
  END IF;

  IF pg_catalog.array_length(p_helper_ids, 1) > v_post.helpers_needed THEN
    RAISE EXCEPTION 'Cannot select more helpers than requested (%)', v_post.helpers_needed;
  END IF;

  -- Every selected helper must have volunteered (a 'volunteer' reply on this post).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_helper_ids) AS h(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.replies r
      WHERE r.post_id = p_post_id
        AND r.author_id = h.id
        AND r.kind = 'volunteer'
    )
  ) THEN
    RAISE EXCEPTION 'All selected helpers must have volunteered first';
  END IF;

  -- Owner cannot select themselves.
  IF v_caller = ANY (p_helper_ids) THEN
    RAISE EXCEPTION 'You cannot select yourself as a helper';
  END IF;

  -- Build helpers JSONB: [{id, selected_at}].
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id', h.id, 'selected_at', pg_catalog.now())
  ) INTO v_helpers_jsonb
  FROM pg_catalog.unnest(p_helper_ids) AS h(id);

  -- Set transaction-local bypass for the trigger.
  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET helpers = v_helpers_jsonb,
      updated_at = pg_catalog.now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

-- Revoke direct execution from anon; authenticated users call via RLS context.
REVOKE ALL ON FUNCTION public.valid_transition(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_transition(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.transition_post(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_post(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.select_helpers(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_helpers(UUID, UUID[]) TO authenticated;
