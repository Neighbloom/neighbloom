import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    '[Neighbloom] Supabase credentials missing. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local. ' +
    'App will run in local-demo mode.'
  );
}

// Publishable key only — never the service-role key.
// All data access is governed by Row Level Security policies.
export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

export const isSupabaseConfigured = () => Boolean(supabase);
