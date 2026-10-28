"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  DEMO_ACCOUNTS,
  membershipChangeSchema,
  onboardingInputSchema,
  verificationDecisionSchema,
  type ActionResult,
  type DemoAccount,
} from "../contracts/api";
import { homeFor } from "../domain/access";
import { friendlyError } from "./booking";
import { appNow } from "./clock";
import { createClient, createServiceClient } from "./supabase";
import { getViewer } from "./viewer";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_PASSWORD = "DvitDemo@2026"; // fictional seeded accounts; published in the testing instructions

const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Check the form.";

// Google sign-in (PRD 4). hd is only an account-picker hint; the database trigger enforces the domain.
export async function signInWithGoogle() {
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: DEMO_MODE ? undefined : { hd: process.env.ALLOWED_EMAIL_DOMAINS?.split(",")[0] ?? "" },
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signInDemo(account: DemoAccount) {
  if (!DEMO_MODE || !(account in DEMO_ACCOUNTS)) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_ACCOUNTS[account].email,
    password: DEMO_PASSWORD,
  });
  if (error) redirect("/login?error=demo");
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer) : "/login");
}

export async function signOut() {
  await (await createClient()).auth.signOut();
  redirect("/");
}

// Onboarding and resubmission. The ID photo is uploaded from the browser into the user's own
// id-proofs folder (storage RLS), so only its path comes through here.
export async function submitOnboarding(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Your session has ended. Sign in again." };
  const parsed = onboardingInputSchema.safeParse({
    fullName: form.get("fullName"),
    department: form.get("department"),
    year: form.get("year"),
    rollNumber: form.get("rollNumber"),
    phone: form.get("phone") || undefined,
    idProofPath: form.get("idProofPath"),
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;
  const { error } = await createServiceClient().rpc("submit_verification", {
    p_user: viewer.id,
    p_full_name: d.fullName,
    p_department: d.department,
    p_year: d.year,
    p_roll: d.rollNumber,
    p_phone: d.phone ?? "",
    p_id_path: d.idProofPath,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  redirect("/pending");
}

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Only an Admin can do this.");
  return viewer;
}

export async function decideVerification(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = verificationDecisionSchema.safeParse({
    userId: form.get("userId"),
    approve: form.get("decision") === "approve",
    reason: form.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const service = createServiceClient();
  const { data: idPath, error } = await service.rpc("decide_verification", {
    p_admin: admin.id,
    p_user: parsed.data.userId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  // PRD 4: the ID photo is deleted on either decision. A failed delete never undoes the decision.
  if (idPath) await service.storage.from("id-proofs").remove([idPath]);
  revalidatePath("/admin", "layout"); // overview, queue and the sidebar count
  return { ok: true, message: parsed.data.approve ? "Student verified." : "Verification rejected." };
}

export async function changeMembership(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = membershipChangeSchema.safeParse({
    userId: form.get("userId"),
    orgId: form.get("orgId"),
    role: form.get("role"),
    grant: form.get("grant") === "true",
    reason: form.get("reason"),
    replacementUserId: form.get("replacementUserId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;
  const { error } = await createServiceClient().rpc("set_membership", {
    p_admin: admin.id,
    p_user: d.userId,
    p_org: d.orgId,
    p_role: d.role,
    p_grant: d.grant,
    p_reason: d.reason,
    p_replacement: d.replacementUserId,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/admin/people");
  return { ok: true, message: d.grant ? "Role granted." : "Role revoked." };
}

export async function markNotificationsRead() {
  const viewer = await getViewer();
  if (!viewer) return;
  const supabase = await createClient();
  const now = (await appNow()).toISOString();
  await supabase.from("notifications").update({ read_at: now }).is("read_at", null).eq("user_id", viewer.id);
  revalidatePath("/", "layout"); // the bell in every page header shows the unread count
}
