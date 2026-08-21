import { NextResponse } from "next/server";

// Step 2 of Decap CMS's github backend OAuth dance (see ../auth/route.ts for
// step 1). GitHub redirects the popup here with ?code&state. This exchanges
// the code for a token server-side (the client secret never reaches the
// browser) and hands the result back to the admin page via the postMessage
// handshake decap-cms.js's github backend expects: the popup announces
// "authorizing:github", the opener echoes it back to prove it's listening,
// and only then does the popup send the real "authorization:github:success:…"
// (or "…:error:…") payload, targeted at the opener's own origin.
function resultPage(message: string) {
  const html = `<!doctype html>
<html><body>
<script>
(function() {
  function receiveMessage(e) {
    window.opener.postMessage(${JSON.stringify(message)}, e.origin);
    window.removeEventListener("message", receiveMessage, false);
  }
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "*");
})();
</script>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith("decap_oauth_state="))
    ?.split("=")[1];

  const clientId = process.env.DECAP_OAUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.DECAP_OAUTH_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return resultPage(
      `authorization:github:error:${JSON.stringify({ message: "decap_oauth_not_configured" })}`,
    );
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return resultPage(
      `authorization:github:error:${JSON.stringify({ message: "invalid_state" })}`,
    );
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${url.origin}/api/decap-oauth/callback`,
    }),
  });
  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    return resultPage(
      `authorization:github:error:${JSON.stringify({
        message: tokenData.error_description ?? tokenData.error ?? "github_token_exchange_failed",
      })}`,
    );
  }

  const response = resultPage(
    `authorization:github:success:${JSON.stringify({ token: tokenData.access_token, provider: "github" })}`,
  );
  // One-time use: clear the state cookie now that the flow completed.
  response.cookies.set("decap_oauth_state", "", { maxAge: 0, path: "/api/decap-oauth" });
  return response;
}
