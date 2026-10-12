-- Milestone 2: Allow authorized server-side functions to update
-- post system fields (stage, status, helpers) via a transaction-local bypass.
--
-- The M1 trigger `protect_post_system_fields` blocks ALL direct updates.
-- M2's transition_post() and select_helpers() are SECURITY DEFINER functions
-- that need to update these fields legitimately. They set a transaction-local
-- GUC that the trigger checks before rejecting.
--
-- This preserves the security model: only code running inside those specific
-- SECURITY DEFINER functions (which enforce their own authorization) can
-- bypass the trigger. Raw API calls cannot set this GUC.

-- Update the trigger function to respect the bypass.
CREATE OR REPLACE FUNCTION public.prevent_post_system_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  -- Allow updates from authorized SECURITY DEFINER functions.
  IF pg_catalog.current_setting('neighbloom.allow_system_field_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    RAISE EXCEPTION 'Direct stage modification is not allowed';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Direct status modification is not allowed';
  END IF;
  IF OLD.helpers IS DISTINCT FROM NEW.helpers THEN
    RAISE EXCEPTION 'Direct helpers modification is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

-- Update the NP trigger similarly for award_np().
CREATE OR REPLACE FUNCTION public.prevent_np_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('neighbloom.allow_np_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.np IS DISTINCT FROM NEW.np THEN
    RAISE EXCEPTION 'Direct NP modification is not allowed';
  END IF;
  RETURN NEW;
END;
$$;
