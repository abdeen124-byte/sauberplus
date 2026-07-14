// SauberPlus Admin CMS — admin-create-user Edge Function
//
// The ONLY operation in this whole system that needs the service_role key
// (creating a new auth.users row for someone else — there is no anon-key-safe
// way to do that). The key never leaves this function: Supabase injects
// SUPABASE_SERVICE_ROLE_KEY automatically as a built-in secret for every
// Edge Function, so nothing needs to be configured by hand beyond deploying
// this file. See docs/admin-cms-setup.md for the deployment steps.
//
// Deliberately does NOT trust any role claim the client sends. Authorization
// is decided by calling the same is_super_admin() Postgres function the RLS
// policies use, via a REST call carrying the caller's own JWT — Supabase
// verifies that JWT's signature independently server-side, so a Content
// Manager cannot talk this function into creating accounts no matter what
// their request body claims.

const ALLOWED_ORIGINS = ["https://www.sauberplus.plus", "https://sauberplus.plus"];
const ALLOWED_ROLES = ["super_admin", "content_manager"];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin"
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request.headers.get("origin"))
    }
  });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Reads the `sub` (user id) claim out of the JWT payload without verifying
 * its signature. This is safe here because it's only used to build a query
 * filter ("show me the row whose id equals this") — the actual security
 * boundary is that Supabase independently verifies the JWT's signature
 * server-side when the REST call is made, and RLS governs what's actually
 * returned regardless of what filter was requested.
 */
function decodeJwtSubject(jwt: string): string | null {
  try {
    const payloadSegment = jwt.split(".")[1];
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (_error) {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const authHeader = request.headers.get("authorization") || "";
  const callerJwt = authHeader.replace(/^Bearer\s+/i, "");
  const callerId = callerJwt ? decodeJwtSubject(callerJwt) : null;
  if (!callerJwt || !callerId) {
    return jsonResponse(request, 401, { error: "Missing or invalid Authorization header" });
  }

  let payload: { email?: string; displayName?: string; role?: string };
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse(request, 400, { error: "Invalid JSON body" });
  }

  const email = (payload.email || "").trim().toLowerCase();
  const displayName = (payload.displayName || "").trim();
  const role = payload.role || "";

  if (!isValidEmail(email)) {
    return jsonResponse(request, 400, { error: "Ungültige E-Mail-Adresse." });
  }
  if (!displayName) {
    return jsonResponse(request, 400, { error: "Bitte einen Namen angeben." });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse(request, 400, { error: "Ungültige Rolle." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Authorization check: ask the database (with the caller's own,
  // independently-verified JWT) whether they're really a super admin.
  const isSuperAdminResponse = await fetch(supabaseUrl + "/rest/v1/rpc/is_super_admin", {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: "Bearer " + callerJwt,
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  if (!isSuperAdminResponse.ok || (await isSuperAdminResponse.json()) !== true) {
    return jsonResponse(request, 403, { error: "Nur Super Admins können Konten erstellen." });
  }

  // Caller's own email, for the activity_log entry below. RLS lets any
  // authenticated user read their own row, so this is safe with the anon
  // key + caller JWT (no service role needed for this read).
  const callerProfileResponse = await fetch(
    supabaseUrl + "/rest/v1/user_profiles?select=email&id=eq." + encodeURIComponent(callerId),
    { headers: { apikey: anonKey, Authorization: "Bearer " + callerJwt } }
  );
  const callerProfileRows = callerProfileResponse.ok ? await callerProfileResponse.json() : [];
  const callerEmail = callerProfileRows[0] ? callerProfileRows[0].email : null;

  // 2) Privileged step: create the auth user (sends a Supabase invite email
  // with a set-your-own-password link) and the matching profile row, using
  // the service role. This is the only place in the whole system this key
  // is used, and it never leaves this function.
  const inviteResponse = await fetch(supabaseUrl + "/auth/v1/invite", {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });

  if (!inviteResponse.ok) {
    const errorBody = await inviteResponse.text();
    const alreadyExists = inviteResponse.status === 422 || errorBody.indexOf("already been registered") !== -1;
    return jsonResponse(request, inviteResponse.status, {
      error: alreadyExists ? "Diese E-Mail-Adresse ist bereits registriert." : "Konto konnte nicht erstellt werden."
    });
  }

  const invitedUser = await inviteResponse.json();

  const profileInsertResponse = await fetch(supabaseUrl + "/rest/v1/user_profiles", {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      id: invitedUser.id,
      email,
      display_name: displayName,
      role,
      created_by: callerId
    })
  });

  if (!profileInsertResponse.ok) {
    return jsonResponse(request, 500, {
      error: "Konto wurde angelegt, Profil konnte aber nicht gespeichert werden. Bitte SauberPlus-Entwickler kontaktieren."
    });
  }

  // Logged explicitly (not by the generic content-table trigger, which only
  // covers UPDATE on user_profiles) since this insert runs under the
  // service role with no auth.uid() JWT context to attribute it to — this
  // function already verified the real caller above, so it logs them here.
  await fetch(supabaseUrl + "/rest/v1/activity_log", {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      actor_user_id: callerId,
      actor_email: callerEmail,
      action: "create",
      entity_type: "user_profiles",
      entity_id: invitedUser.id,
      new_value: { email, display_name: displayName, role }
    })
  });

  return jsonResponse(request, 200, { id: invitedUser.id, email, displayName, role });
});
