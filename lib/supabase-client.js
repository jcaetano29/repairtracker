import { createClient } from "@supabase/supabase-js";

let _supabaseClient;
export function getSupabaseClient() {
  if (!_supabaseClient) {
    _supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabaseClient;
}
