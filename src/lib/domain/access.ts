// Route guards (PRD 4): signed in → onboarding complete → account status → role for the area.
// Pure so the proxy and the auth callback share it and it can be tested.
import type { Database } from "../contracts/database";

export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type AppArea = "student" | "owner" | "manager" | "admin";

export interface Viewer {
  id: string;
  status: AccountStatus;
  onboardingComplete: boolean;
  verificationSubmitted: boolean;
  isAdmin: boolean;
  roles: { owner: boolean; manager: boolean };
}

const PUBLIC_PATHS = ["/", "/login"];
const PUBLIC_PREFIXES = ["/auth/", "/api/"]; // route handlers check auth themselves

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

// Areas this viewer may open, in the order the role switcher shows them. Admins do not book (PRD 3).
export function areasFor(v: Viewer): AppArea[] {
  const areas: AppArea[] = [];
  if (!v.isAdmin || v.roles.owner || v.roles.manager) areas.push("student");
  if (v.roles.owner) areas.push("owner");
  if (v.roles.manager) areas.push("manager");
  if (v.isAdmin) areas.push("admin");
  return areas;
}

export function homeFor(v: Viewer): string {
  if (needsOnboarding(v)) return "/onboarding";
  if (v.isAdmin) return "/admin";
  if (v.roles.manager) return "/manager";
  if (v.roles.owner) return "/owner";
  return v.status === "pending_verification" ? "/pending" : "/student";
}

// Staff and admin accounts are set up by an Admin and skip student onboarding.
const needsOnboarding = (v: Viewer) =>
  !v.onboardingComplete && !v.isAdmin && !v.roles.owner && !v.roles.manager;

// Where to send this request instead, or null to let it through.
export function redirectFor(path: string, v: Viewer | null): string | null {
  if (isPublicPath(path) && path !== "/login") return null;
  if (!v) return path === "/login" ? null : "/login";
  if (path === "/login") return homeFor(v);

  if (path === "/onboarding") {
    // Open for first-time onboarding and for resubmitting after a rejection.
    const canSubmit = v.status === "pending_verification" && !v.verificationSubmitted;
    return needsOnboarding(v) || canSubmit ? null : homeFor(v);
  }
  if (needsOnboarding(v)) return "/onboarding";
  if (path === "/pending") return v.status === "pending_verification" ? null : homeFor(v);

  const area = path.split("/")[1] as AppArea;
  if (area === "student") {
    if (!areasFor(v).includes("student")) return homeFor(v);
    // Pending users may browse only; suspended users see history but cannot request (PRD 4).
    if (v.status === "pending_verification" && !path.startsWith("/student/browse")) return "/pending";
    if (v.status === "suspended" && path.startsWith("/student/request")) return "/student";
    return null;
  }
  if (area === "owner" || area === "manager" || area === "admin") {
    return areasFor(v).includes(area) ? null : homeFor(v);
  }
  return null; // shared signed-in pages such as /notifications
}
