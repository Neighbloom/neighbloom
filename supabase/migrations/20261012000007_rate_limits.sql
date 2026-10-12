-- Milestone 2: Server-side rate limiting.
--
-- Client-side rate limits are trivially bypassable (clear localStorage).
-- These triggers enforce limits at the database level.
--
-- Limits:
--   - Posts: max 10 per hour, max 30 per day per user
--   - Replies: max 20 per hour, max 50 per day per user
--   - Messages: max 60 per hour, max 200 per day per user
--   - Reports: max 20 per day per user (prevent report spam)

-- Generic rate limit check function.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_table TEXT,
  p_hour_limit INT,
  p_day_limit INT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_hour_count INT;
  v_day_count INT;
BEGIN
  -- Count in the last hour.
  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE %s = $1 AND created_at > pg_catalog.now() - interval ''1 hour''',
    p_table,
    CASE WHEN p_table = 'posts' THEN 'owner_id'
         WHEN p_table = 'replies' THEN 'author_id'
         WHEN p_table = 'messages' THEN 'sender_id'
         WHEN p_table = 'reports' THEN 'reporter_id'
    END
  ) INTO v_hour_count USING p_user_id;

  IF v_hour_count >= p_hour_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many % in the last hour', p_table;
  END IF;

  -- Count in the last 24 hours.
  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE %s = $1 AND created_at > pg_catalog.now() - interval ''24 hours''',
    p_table,
    CASE WHEN p_table = 'posts' THEN 'owner_id'
         WHEN p_table = 'replies' THEN 'author_id'
         WHEN p_table = 'messages' THEN 'sender_id'
         WHEN p_table = 'reports' THEN 'reporter_id'
    END
  ) INTO v_day_count USING p_user_id;

  IF v_day_count >= p_day_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many % in the last 24 hours', p_table;
  END IF;
END;
$$;

-- Trigger functions per table.
CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.owner_id, 'posts', 10, 30);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_reply_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.author_id, 'replies', 20, 50);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.sender_id, 'messages', 60, 200);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.reporter_id, 'reports', 5, 20);
  RETURN NEW;
END; $$;

-- Attach triggers.
DROP TRIGGER IF EXISTS rate_limit_posts ON public.posts;
CREATE TRIGGER rate_limit_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_rate_limit();

DROP TRIGGER IF EXISTS rate_limit_replies ON public.replies;
CREATE TRIGGER rate_limit_replies
  BEFORE INSERT ON public.replies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reply_rate_limit();

DROP TRIGGER IF EXISTS rate_limit_messages ON public.messages;
CREATE TRIGGER rate_limit_messages
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_rate_limit();

DROP TRIGGER IF EXISTS rate_limit_reports ON public.reports;
CREATE TRIGGER rate_limit_reports
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_rate_limit();
