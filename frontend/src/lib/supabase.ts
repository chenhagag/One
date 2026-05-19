import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const hasSupabase = !!(supabaseUrl && supabaseAnonKey);

if (!hasSupabase) {
  console.warn(
    "Supabase env vars not set (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). OAuth login will not work."
  );
}

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null;
