import "server-only";
import { cache } from "react";
import { createServiceClient } from "./supabase";

// The simulated "now" (PRD 0, 17): app_now() from the database, once per request.
// Business logic in TypeScript uses this, never new Date() or Date.now().
export const appNow = cache(async (): Promise<Date> => {
  const { data, error } = await createServiceClient().rpc("app_now");
  if (error || !data) throw new Error(`app_now() failed: ${error?.message ?? "no value"}`);
  return new Date(data);
});
