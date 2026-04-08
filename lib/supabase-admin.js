import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. Only use in server-side code (API routes, server components).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client.
let _supabaseAdmin;
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    }
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabaseAdmin;
}
