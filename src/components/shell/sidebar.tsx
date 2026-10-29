import { ACTIVE_STATUSES } from "@/lib/contracts/booking";
import { areasFor, homeFor, type AppArea } from "@/lib/domain/access";
import { signOut } from "@/lib/server/account";
import { adminQueue, inbox, managerQueue, ownerDesk } from "@/lib/server/queues";
import { createClient } from "@/lib/server/supabase";
import { requireViewer, type SessionViewer } from "@/lib/server/viewer";
import { SidebarFrame } from "./shell-context";
import { SidebarNav, type NavArea } from "./sidebar-nav";

const STATUS_LABEL = {
  pending_verification: "Awaiting verification",
  verified: "Verified student",
  suspended: "Booking suspended",
} as const;

const orgNames = (v: SessionViewer, role: "owner" | "manager") =>
  v.memberships.filter((m) => m.role === role).map((m) => m.orgName).join(" · ");

async function buildArea(area: AppArea, v: SessionViewer, unread: number): Promise<NavArea> {
  const notifications = { href: "/notifications", label: "Notifications", icon: "bell" as const, count: unread };
  if (area === "student") {
    if (v.status === "pending_verification")
      return {
        area,
        label: "Student",
        subtitle: STATUS_LABEL[v.status],
        items: [
          { href: "/student/browse", label: "Find a resource", icon: "search" },
          { href: "/pending", label: "Verification", icon: "verified" },
          notifications,
        ],
      };
    const { count } = await (await createClient())
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", v.id)
      .in("status", ACTIVE_STATUSES);
    return {
      area,
      label: "Student",
      subtitle: STATUS_LABEL[v.status],
      items: [
        { href: "/student", label: "Overview", icon: "grid" },
        { href: "/student/browse", label: "Find a resource", icon: "search" },
        { href: "/student/bookings", label: "My bookings", icon: "calendar", count: count ?? 0 },
        { href: "/student/wallet", label: "Credits wallet", icon: "wallet" },
        { href: "/student/scan", label: "Door check-in", icon: "scan" },
        notifications,
      ],
    };
  }
  if (area === "owner") {
    const desk = await ownerDesk(v);
    return {
      area,
      label: "Owner",
      subtitle: orgNames(v, "owner"),
      items: [
        { href: "/owner", label: "Overview", icon: "grid" },
        { href: "/owner/requests", label: "Requests", icon: "clipboard", count: desk.needsReview.length },
        { href: "/owner/handovers", label: "Handovers", icon: "handover", count: desk.pickupsToday.length + desk.returnsDue.length },
        { href: "/owner/scan", label: "Scan", icon: "scan" },
        { href: "/owner/resources", label: "My resources", icon: "building" },
        { href: "/owner/badges", label: "Certificates", icon: "verified", count: desk.certificates.length },
        notifications,
      ],
    };
  }
  if (area === "manager") {
    const q = await managerQueue(v);
    return {
      area,
      label: "Manager",
      subtitle: orgNames(v, "manager"),
      items: [
        { href: "/manager", label: "Overview", icon: "grid" },
        { href: "/manager/queue", label: "Decision queue", icon: "clipboard", count: q.items.length },
        { href: "/manager/cases", label: "Safety & disputes", icon: "shield", count: q.incidents.length + q.cases.length },
        { href: "/manager/insights", label: "Department insights", icon: "gauge" },
        notifications,
      ],
    };
  }
  const a = await adminQueue();
  return {
    area,
    label: "Admin",
    subtitle: "DVIT administration",
    items: [
      { href: "/admin", label: "Overview", icon: "grid" },
      { href: "/admin/verifications", label: "Verifications", icon: "verified", count: a.verifications.length },
      { href: "/admin/cases", label: "Cases & incidents", icon: "shield", count: a.cases.length + a.incidents.length },
      { href: "/admin/people", label: "People & roles", icon: "users" },
      { href: "/admin/policies", label: "Campus policies", icon: "scroll" },
      { href: "/admin/audit", label: "Audit log", icon: "clock" },
      notifications,
    ],
  };
}

export async function AppSidebar() {
  const viewer = await requireViewer();
  const { unread } = await inbox();
  const home = homeFor(viewer).split("/")[1] as AppArea;
  const areas = await Promise.all(areasFor(viewer).map((a) => buildArea(a, viewer, unread)));
  return (
    <SidebarFrame>
      <SidebarNav
        areas={areas}
        homeArea={areas.some((a) => a.area === home) ? home : areas[0]!.area}
        person={{ name: viewer.fullName || viewer.email, avatarUrl: viewer.avatarUrl }}
        signOut={signOut}
      />
    </SidebarFrame>
  );
}

export function SidebarSkeleton() {
  return <div aria-hidden className="fixed inset-y-0 left-0 z-20 hidden w-64 bg-pine-deep lg:block" />;
}
