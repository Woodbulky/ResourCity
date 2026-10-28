import { NextResponse, type NextRequest } from "next/server";
import { homeFor } from "@/lib/domain/access";
import { createClient } from "@/lib/server/supabase";
import { getViewer } from "@/lib/server/viewer";

// Google OAuth return (PRD 4). If the domain trigger refused the account, Supabase sends the
// error here instead of a code; the login page turns it into a plain message.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  if (!code) {
    const description = url.searchParams.get("error_description") ?? "";
    const reason = /database error|google account/i.test(description) ? "domain" : "oauth";
    return NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));

  const viewer = await getViewer();
  return NextResponse.redirect(new URL(viewer ? homeFor(viewer) : "/login?error=oauth", url.origin));
}
