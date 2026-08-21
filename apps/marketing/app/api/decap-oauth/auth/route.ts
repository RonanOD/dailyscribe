import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

// Step 1 of Decap CMS's github backend OAuth dance: redirect the admin UI's
// popup to GitHub's authorize screen. See ../callback/route.ts for step 2.
// This app registers its OWN GitHub OAuth App for this (repo-write scope) —
// deliberately separate from apps/web's Auth.js login-only OAuth App.
export function GET(request: Request) {
  const clientId = process.env.DECAP_OAUTH_GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "decap_oauth_not_configured" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const state = randomBytes(16).toString("hex");

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/decap-oauth/callback`);
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  // Short-lived, httpOnly state cookie — checked by the callback to close the
  // CSRF gap in the reference implementations of this flow.
  response.cookies.set("decap_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/api/decap-oauth",
  });
  return response;
}
