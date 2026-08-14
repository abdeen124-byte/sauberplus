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
const ALLOWED_ROLES = ["super_admin", "content_manager", "employee"];
const EMPLOYEE_REDIRECT_URL = "https://www.sauberplus.plus/mitarbeiter/";

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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function removeInvitedUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(userId),
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          Authorization: "Bearer " + serviceRoleKey
        }
      }
    );
    return response.ok;
  } catch (_error) {
    return false;
  }
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

  let payload: {
    email?: string;
    displayName?: string;
    role?: string;
    employeeNumber?: string;
    phone?: string;
    employmentStartDate?: string;
    employmentEndDate?: string;
    primaryWorkSiteId?: string;
  };
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse(request, 400, { error: "Invalid JSON body" });
  }

  const email = (payload.email || "").trim().toLowerCase();
  const displayName = (payload.displayName || "").trim();
  const role = payload.role || "";
  const employeeNumber = (payload.employeeNumber || "").trim();
  const phone = (payload.phone || "").trim();
  const employmentStartDate = (payload.employmentStartDate || "").trim();
  const employmentEndDate = (payload.employmentEndDate || "").trim();
  const primaryWorkSiteId = (payload.primaryWorkSiteId || "").trim();

  if (!isValidEmail(email)) {
    return jsonResponse(request, 400, { error: "Ungültige E-Mail-Adresse." });
  }
  if (!displayName || displayName.length > 120) {
    return jsonResponse(request, 400, { error: "Bitte einen Namen angeben." });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse(request, 400, { error: "Ungültige Rolle." });
  }
  if (role === "employee" && (!employeeNumber || employeeNumber.length > 40)) {
    return jsonResponse(request, 400, { error: "Bitte eine gültige Personalnummer angeben." });
  }
  if (phone.length > 50) {
    return jsonResponse(request, 400, { error: "Die Telefonnummer ist zu lang." });
  }
  if (employmentStartDate && !isValidIsoDate(employmentStartDate)) {
    return jsonResponse(request, 400, { error: "Das Eintrittsdatum ist ungültig." });
  }
  if (employmentEndDate && !isValidIsoDate(employmentEndDate)) {
    return jsonResponse(request, 400, { error: "Das Austrittsdatum ist ungültig." });
  }
  if (employmentStartDate && employmentEndDate && employmentEndDate < employmentStartDate) {
    return jsonResponse(request, 400, { error: "Das Austrittsdatum liegt vor dem Eintrittsdatum." });
  }
  if (primaryWorkSiteId && !isValidUuid(primaryWorkSiteId)) {
    return jsonResponse(request, 400, { error: "Der Einsatzort ist ungültig." });
  }
  if (
    role !== "employee" &&
    (employeeNumber || phone || employmentStartDate || employmentEndDate || primaryWorkSiteId)
  ) {
    return jsonResponse(request, 400, { error: "Mitarbeiterdaten benötigen die Rolle Mitarbeiter/in." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let invitedUserId: string | null = null;

  // 1) Authorization check: ask the database (with the caller's own,
  // independently-verified JWT) whether they're really a super admin.
  let isSuperAdmin = false;
  try {
    const isSuperAdminResponse = await fetch(supabaseUrl + "/rest/v1/rpc/is_super_admin", {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: "Bearer " + callerJwt,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    isSuperAdmin = isSuperAdminResponse.ok && (await isSuperAdminResponse.json()) === true;
  } catch (_error) {
    return jsonResponse(request, 503, { error: "Der Kontodienst ist vorübergehend nicht verfügbar." });
  }

  if (!isSuperAdmin) {
    return jsonResponse(request, 403, { error: "Nur Super Admins können Konten erstellen." });
  }

  // 2) Create the Auth user. Database profile provisioning happens in one
  // transaction immediately afterwards; failure compensates by deleting
  // this invited Auth user so no orphan account remains.
  const inviteUrl =
    supabaseUrl +
    "/auth/v1/invite" +
    (role === "employee" ? "?redirect_to=" + encodeURIComponent(EMPLOYEE_REDIRECT_URL) : "");
  let inviteResponse: Response;
  try {
    inviteResponse = await fetch(inviteUrl, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
  } catch (_error) {
    return jsonResponse(request, 503, { error: "Der Kontodienst ist vorübergehend nicht verfügbar." });
  }

  if (!inviteResponse.ok) {
    const errorBody = await inviteResponse.text();
    const alreadyExists = inviteResponse.status === 422 || errorBody.indexOf("already been registered") !== -1;
    return jsonResponse(request, inviteResponse.status, {
      error: alreadyExists ? "Diese E-Mail-Adresse ist bereits registriert." : "Konto konnte nicht erstellt werden."
    });
  }

  const inviteBody = await inviteResponse.text();
  let invitedUser: { id?: string };
  try {
    invitedUser = JSON.parse(inviteBody);
  } catch (_error) {
    const recoverableId = inviteBody.match(
      /"id"\s*:\s*"([0-9a-f-]{36})"/i
    );
    invitedUserId = recoverableId ? recoverableId[1] : null;
    const cleanupSucceeded = invitedUserId
      ? await removeInvitedUser(supabaseUrl, serviceRoleKey, invitedUserId)
      : false;
    return jsonResponse(request, 502, {
      error: cleanupSucceeded
        ? "Die Einladungsantwort war ungültig. Es wurden keine Teildaten gespeichert."
        : "Die Einladungsantwort war ungültig. Bitte SauberPlus-Entwickler kontaktieren."
    });
  }
  invitedUserId = typeof invitedUser.id === "string" ? invitedUser.id : null;
  if (!invitedUserId || !isValidUuid(invitedUserId)) {
    return jsonResponse(request, 502, { error: "Die Einladungsantwort war ungültig." });
  }

  let provisionResponse: Response;
  try {
    provisionResponse = await fetch(supabaseUrl + "/rest/v1/rpc/provision_user_profile", {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        p_user_id: invitedUserId,
        p_email: email,
        p_display_name: displayName,
        p_role: role,
        p_created_by: callerId,
        p_employee_number: role === "employee" ? employeeNumber : null,
        p_phone: role === "employee" ? phone : "",
        p_employment_start_date: employmentStartDate || null,
        p_employment_end_date: employmentEndDate || null,
        p_primary_work_site_id: primaryWorkSiteId || null
      })
    });
  } catch (_error) {
    const cleanupSucceeded = await removeInvitedUser(supabaseUrl, serviceRoleKey, invitedUserId);
    return jsonResponse(request, 503, {
      error: cleanupSucceeded
        ? "Der Kontodienst ist vorübergehend nicht verfügbar. Es wurden keine Teildaten gespeichert."
        : "Konto wurde möglicherweise unvollständig angelegt. Bitte SauberPlus-Entwickler kontaktieren."
    });
  }

  if (!provisionResponse.ok) {
    const cleanupSucceeded = await removeInvitedUser(supabaseUrl, serviceRoleKey, invitedUserId);
    const provisionError = await provisionResponse.text();
    const duplicateValue =
      provisionResponse.status === 409 ||
      provisionError.indexOf("duplicate key value") !== -1 ||
      provisionError.indexOf("23505") !== -1;
    return jsonResponse(request, duplicateValue ? 409 : 500, {
      error: duplicateValue
        ? "E-Mail-Adresse oder Personalnummer ist bereits vergeben."
        : cleanupSucceeded
          ? "Konto konnte nicht vollständig angelegt werden. Es wurden keine Teildaten gespeichert."
          : "Konto wurde unvollständig angelegt. Bitte SauberPlus-Entwickler kontaktieren."
    });
  }

  return jsonResponse(request, 200, {
    id: invitedUserId,
    email,
    displayName,
    role,
    employeeNumber: role === "employee" ? employeeNumber : null
  });
});
