-- Milestone 2: Private messaging for help posts.
--
-- Design:
--   - A conversation is created per (post, helper) when the owner selects helpers.
--   - Only the post owner and the selected helper can read/write in that conversation.
--   - The public `replies` table is NOT reused (it's public by design).
--   - Conversations are scoped to a single post and a single helper.

-- Conversations: one per (post, helper) pair.
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  -- The two participants: post owner + selected helper.
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  -- One conversation per (post, helper). No duplicates.
  UNIQUE (post_id, helper_id),
  -- Owner and helper must be different people.
  CHECK (owner_id != helper_id)
);

-- Messages within a conversation.
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (pg_catalog.char_length(body) >= 1 AND pg_catalog.char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Indexes for message listing.
CREATE INDEX IF NOT EXISTS idx_conversations_post ON public.conversations(post_id);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON public.conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_helper ON public.conversations(helper_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations: only participants can see them.
CREATE POLICY conversations_select_participants
  ON public.conversations FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() = helper_id);

-- Conversations are created by the system (via create_conversation RPC), not directly.
-- No INSERT/UPDATE/DELETE policies = denied by default.

-- Messages: only participants of the parent conversation can read.
CREATE POLICY messages_select_participants
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.owner_id = auth.uid() OR c.helper_id = auth.uid())
    )
  );

-- Messages: only participants can send, and sender_id must match.
CREATE POLICY messages_insert_participants
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.owner_id = auth.uid() OR c.helper_id = auth.uid())
    )
  );

-- No message editing or deletion (immutable chat history for trust).
-- No UPDATE/DELETE policies = denied by default.

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
-- Note: anon gets nothing — private messaging requires authentication.

-- RPC: Create a conversation for a selected helper.
-- Called automatically when helpers are selected, or manually by the post owner.
-- Only the post owner can create conversations, and only for selected helpers.
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_post_id UUID,
  p_helper_id UUID
)
RETURNS public.conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_conv public.conversations%ROWTYPE;
  v_is_selected BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can create conversations';
  END IF;

  IF p_helper_id = v_caller THEN
    RAISE EXCEPTION 'Cannot create a conversation with yourself';
  END IF;

  -- Helper must be in the selected helpers list.
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
    WHERE (h->>'id')::UUID = p_helper_id
  ) INTO v_is_selected;

  IF NOT v_is_selected THEN
    RAISE EXCEPTION 'Helper must be selected before messaging';
  END IF;

  -- Idempotent: return existing conversation if already created.
  SELECT * INTO v_conv FROM public.conversations
  WHERE post_id = p_post_id AND helper_id = p_helper_id;

  IF FOUND THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations (post_id, owner_id, helper_id)
  VALUES (p_post_id, v_caller, p_helper_id)
  RETURNING * INTO v_conv;

  RETURN v_conv;
END;
$$;

REVOKE ALL ON FUNCTION public.create_conversation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, UUID) TO authenticated;
