import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../contracts/database";
import type { Viewer } from "../domain/access";
import { createClient } from "./supabase";

export interface SessionViewer extends Viewer {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  statusReason: string | null;
  suspendedUntil: string | null;
  verificationSubmittedAt: string | null;
  memberships: { orgId: string; orgName: string; role: "owner" | "manager" }[];
}

// The signed-in user's profile and roles, read through RLS as that user.
export async function loadViewer(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SessionViewer | null> {
  const [{ data: p }, { data: m }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, avatar_url, status, status_reason, suspended_until, is_admin, onboarding_complete, verification_submitted_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("memberships").select("org_id, role, organizations(name)").eq("user_id", userId),
  ]);
  if (!p) return null;
  const memberships = (m ?? []).map((r) => ({ orgId: r.org_id, orgName: r.organizations?.name ?? "", role: r.role }));
  return {
    id: userId,
    status: p.status,
    onboardingComplete: p.onboarding_complete,
    verificationSubmitted: p.verification_submitted_at !== null,
    verificationSubmittedAt: p.verification_submitted_at,
    isAdmin: p.is_admin,
    roles: {
      owner: memberships.some((r) => r.role === "owner"),
      manager: memberships.some((r) => r.role === "manager"),
    },
    fullName: p.full_name,
    email: p.email,
    avatarUrl: p.avatar_url,
    statusReason: p.status_reason,
    suspendedUntil: p.suspended_until,
    memberships,
  };
}

// Current viewer for Server Components and Server Actions, once per request. getUser() checks
// the session with the Auth server, so the id can be trusted.
export const getViewer = cache(async (): Promise<SessionViewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? loadViewer(supabase, data.user.id) : null;
});

// For pages behind the proxy: the viewer, or back to login if the session vanished mid-request.
export async function requireViewer(): Promise<SessionViewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}
