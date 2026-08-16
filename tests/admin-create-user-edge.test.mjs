import assert from "node:assert/strict";

const callerId = "11111111-1111-4111-8111-111111111111";
const invitedUserId = "22222222-2222-4222-8222-222222222222";
const encodedPayload = Buffer.from(JSON.stringify({ sub: callerId })).toString("base64url");
const authorization = `Bearer header.${encodedPayload}.signature`;

let edgeHandler;
globalThis.Deno = {
  env: {
    get(name) {
      return {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      }[name];
    }
  },
  serve(handler) {
    edgeHandler = handler;
  }
};

await import("../supabase/functions/admin-create-user/index.ts");
assert.equal(typeof edgeHandler, "function", "Edge Function handler was not registered");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeRequest(payload) {
  return new Request("https://example.supabase.co/functions/v1/admin-create-user", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Origin: "https://www.sauberplus.plus"
    },
    body: JSON.stringify(payload)
  });
}

async function runScenario(fetchImplementation, payload) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return fetchImplementation(String(url), options, calls.length);
  };

  const response = await edgeHandler(makeRequest(payload));
  const body = await response.json();
  return { response, body, calls };
}

const employeePayload = {
  email: "employee@example.com",
  displayName: "Test Employee",
  role: "employee",
  employeeNumber: "SP-001",
  phone: "+49 123 4567",
  employmentStartDate: "2026-08-14",
  primaryWorkSiteId: "33333333-3333-4333-8333-333333333333"
};

const successful = await runScenario((url) => {
  if (url.endsWith("/rest/v1/rpc/is_super_admin")) {
    return jsonResponse(true);
  }
  if (url.includes("/auth/v1/invite")) {
    return jsonResponse({ id: invitedUserId });
  }
  if (url.endsWith("/rest/v1/rpc/provision_user_profile")) {
    return jsonResponse([{ profile_id: invitedUserId }]);
  }
  throw new Error(`Unexpected request: ${url}`);
}, employeePayload);

assert.equal(successful.response.status, 200);
assert.equal(successful.body.id, invitedUserId);
assert.equal(successful.body.employeeNumber, "SP-001");
assert.match(successful.calls[1].url, /redirect_to=.*mitarbeiter/i);
const provisionBody = JSON.parse(successful.calls[2].options.body);
assert.equal(provisionBody.p_user_id, invitedUserId);
assert.equal(provisionBody.p_created_by, callerId);
assert.equal(provisionBody.p_role, "employee");
assert.equal(provisionBody.p_employee_number, "SP-001");

const existingAdminFlow = await runScenario((url) => {
  if (url.endsWith("/rest/v1/rpc/is_super_admin")) {
    return jsonResponse(true);
  }
  if (url.endsWith("/auth/v1/invite")) {
    return jsonResponse({ id: invitedUserId });
  }
  if (url.endsWith("/rest/v1/rpc/provision_user_profile")) {
    return jsonResponse([{ profile_id: invitedUserId }]);
  }
  throw new Error(`Unexpected request: ${url}`);
}, {
  email: "manager@example.com",
  displayName: "Content Manager",
  role: "content_manager"
});

assert.equal(existingAdminFlow.response.status, 200);
assert.equal(existingAdminFlow.calls[1].url.endsWith("/auth/v1/invite"), true);
const existingAdminProvisionBody = JSON.parse(existingAdminFlow.calls[2].options.body);
assert.equal(existingAdminProvisionBody.p_role, "content_manager");
assert.equal(existingAdminProvisionBody.p_employee_number, null);
assert.equal(existingAdminProvisionBody.p_primary_work_site_id, null);

const duplicateEmployee = await runScenario((url) => {
  if (url.endsWith("/rest/v1/rpc/is_super_admin")) {
    return jsonResponse(true);
  }
  if (url.includes("/auth/v1/invite")) {
    return jsonResponse({ code: "user_already_exists", message: "User already registered" }, 422);
  }
  if (url.includes("/rest/v1/user_profiles?")) {
    return jsonResponse([{ id: invitedUserId, role: "employee" }]);
  }
  if (url.includes("/rest/v1/employees?")) {
    return jsonResponse([{ id: invitedUserId }]);
  }
  throw new Error(`Unexpected request: ${url}`);
}, employeePayload);

assert.equal(duplicateEmployee.response.status, 409);
assert.equal(duplicateEmployee.body.error, "Diese E-Mail-Adresse ist bereits registriert.");
assert.equal(duplicateEmployee.calls.some((call) => call.url.includes("/rest/v1/employees?")), true);
assert.equal(duplicateEmployee.calls.some((call) => call.url.endsWith("/rest/v1/rpc/provision_user_profile")), false);

const rejectedProvision = await runScenario((url) => {
  if (url.endsWith("/rest/v1/rpc/is_super_admin")) {
    return jsonResponse(true);
  }
  if (url.includes("/auth/v1/invite")) {
    return jsonResponse({ id: invitedUserId });
  }
  if (url.endsWith("/rest/v1/rpc/provision_user_profile")) {
    return jsonResponse({ code: "23505", message: "duplicate key value" }, 409);
  }
  if (url.includes(`/auth/v1/admin/users/${invitedUserId}`)) {
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected request: ${url}`);
}, employeePayload);

assert.equal(rejectedProvision.response.status, 409);
assert.ok(
  rejectedProvision.calls.some(
    (call) =>
      call.url.includes(`/auth/v1/admin/users/${invitedUserId}`) &&
      call.options.method === "DELETE"
  ),
  "Failed provisioning did not remove the invited Auth user"
);

const networkFailure = await runScenario((url) => {
  if (url.endsWith("/rest/v1/rpc/is_super_admin")) {
    return jsonResponse(true);
  }
  if (url.includes("/auth/v1/invite")) {
    return jsonResponse({ id: invitedUserId });
  }
  if (url.endsWith("/rest/v1/rpc/provision_user_profile")) {
    throw new Error("network unavailable");
  }
  if (url.includes(`/auth/v1/admin/users/${invitedUserId}`)) {
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected request: ${url}`);
}, employeePayload);

assert.equal(networkFailure.response.status, 503);
assert.ok(
  networkFailure.calls.some(
    (call) =>
      call.url.includes(`/auth/v1/admin/users/${invitedUserId}`) &&
      call.options.method === "DELETE"
  ),
  "Network failure did not trigger compensating Auth cleanup"
);

const invalidEmployee = await runScenario(() => {
  throw new Error("Validation failures must not call Supabase");
}, {
  email: "employee@example.com",
  displayName: "Test Employee",
  role: "employee",
  employeeNumber: ""
});

assert.equal(invalidEmployee.response.status, 400);
assert.equal(invalidEmployee.calls.length, 0);

console.log("Admin-create-user Edge Function scenarios passed.");
