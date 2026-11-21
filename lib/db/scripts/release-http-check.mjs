// Checks the public release surface without following the OAuth redirect.
import assert from "node:assert/strict";

export async function checkReleaseHttp(base, origin) {
  const request = (path, options) => fetch(base + path, {
    signal: AbortSignal.timeout(15_000), redirect: "manual", ...options,
  });

  for (const [path, status] of [["/api/healthz", "ok"], ["/api/readyz", "ready"]]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal((await response.json()).status, status, path);
  }
  const page = await request("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const asset = (await page.text()).match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(asset, "Landing page must link to a same-origin bundle");
  const bundle = await request(asset);
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get("content-type"), /javascript/);
  for (const path of ["/demo", "/privacy", "/terms"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/, path);
  }
  const me = await request("/api/auth/me");
  assert.equal(me.status, 200);
  const auth = await me.json();
  assert.ok(auth?.user === null && auth.configured === true, "Expected anonymous access and configured Google sign-in");

  const callback = await request("/api/auth/google");
  assert.equal(callback.status, 302);
  const redirect = new URL(callback.headers.get("location"));
  assert.equal(redirect.origin, "https://accounts.google.com");
  assert.equal(redirect.searchParams.get("redirect_uri"), origin + "/api/auth/google/callback");
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
  const cookies = callback.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const name of ["focus_oauth", "focus_oauth_verifier"]) {
    const cookie = cookies.find(value => value.startsWith(name + "="));
    assert.ok(cookie && ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=600"].every(flag => cookie.includes(flag)),
      "Required OAuth cookie flags missing");
  }
  assert.equal((await request("/api/auth/google/callback")).status, 400);
  for (const path of ["/projects", "/tasks", "/extractions", "/documents", "/plans", "/action-threads", "/missing"]) {
    const response = await request("/api" + path);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }
  const write = await request("/api/documents", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(write.status, 401);
  assert.equal((await request("/.env")).status, 404);
  assert.equal((await request("/.local/threadline-gemini-authorization.json")).status, 404);
}

if (import.meta.main) {
  const url = new URL(process.argv[2] ?? "");
  assert.match(url.protocol, /^https:$/, "Use the final HTTPS origin");
  assert.equal(url.href, url.origin + "/", "Pass the origin without a path, query, or credentials");
  await checkReleaseHttp(url.origin, url.origin);
  console.log("PASS: public release HTTP checks, including health, readiness, OAuth redirect, cookies and anonymous API denial");
}
