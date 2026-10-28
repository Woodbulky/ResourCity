import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../contracts/database";

// Browser client: anon key only, every read and write goes through RLS.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
