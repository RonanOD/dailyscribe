import { NextResponse, type NextRequest } from "next/server";
import { REF_COOKIE } from "@/lib/signup-ref";

export const runtime = "nodejs";

/**
 * Front door from the marketing site: remembers the ?ref= campaign tag in a
 * cookie (read when Auth.js creates the user, see auth.ts) and sends the
 * visitor on to the sign-in page. Replaces the waitlist form's `ref` field now
 * that anyone can sign up.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  const ref = request.nextUrl.searchParams.get("ref")?.trim().slice(0, 64);
  if (ref && /^[\w.-]+$/.test(ref)) {
    response.cookies.set(REF_COOKIE, ref, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
  }
  return response;
}
