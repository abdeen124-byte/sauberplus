const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMatch = (source, expression, message) => assert.match(source, expression, message);

const adminHtml = read("admin/time-tracking.html");
const adminJs = read("admin/js/admin-time-tracking.js");
const employeeHtml = read("mitarbeiter/index.html");
const employeeJs = read("mitarbeiter/js/employee-app.js");
const announcementHtml = read("admin/announcements.html");
const announcementJs = read("admin/js/admin-announcements.js");
const publicHtml = read("index.html");
const publicJs = read("js/sauberplus-content.js");

function requireUniqueIds(html, pageName) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${pageName} contains duplicate IDs`);
}

requireUniqueIds(adminHtml, "Workforce admin");
requireUniqueIds(employeeHtml, "Employee portal");
requireUniqueIds(announcementHtml, "Announcement editor");

const adminReferencedIds = [...adminJs.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]);
new Set(adminReferencedIds).forEach((id) => {
  assert.ok(
    new RegExp(`id="${id}"`).test(adminHtml) || new RegExp(`id="${id}"`).test(adminJs),
    `Admin JavaScript references missing #${id}`
  );
});

const employeeElementNames = [...employeeJs.matchAll(/elements\.([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]);
new Set(employeeElementNames).forEach((id) => {
  requireMatch(employeeHtml, new RegExp(`id="${id}"`), `Employee JavaScript references missing #${id}`);
});

["overview", "employees", "sites", "schedule", "absences", "reports"].forEach((panel) => {
  requireMatch(adminHtml, new RegExp(`data-panel-name="${panel}"`), `Missing ${panel} admin panel`);
});

requireMatch(adminJs, /requireRole\(profile, "super_admin"\)/, "Workforce admin must require Super Admin");
["employees", "work_sites", "employee_work_sites", "work_shifts", "employee_absences", "time_entry_totals"].forEach((table) => {
  requireMatch(adminJs, new RegExp(`from\\("${table}"\\)`), `Admin UI does not use ${table}`);
});
requireMatch(adminJs, /rpc\("update_employee_account"/, "Employee edits must use the transactional RPC");
requireMatch(adminJs, /admin-create-user/, "Employee creation must use the existing Edge Function");

[
  ["workDate", "date"],
  ["startTime", "time"],
  ["endTime", "time"],
  ["breakMinutes", "number"]
].forEach(([id, type]) => {
  requireMatch(employeeHtml, new RegExp(`type="${type}"[^>]*id="${id}"|id="${id}"[^>]*type="${type}"`), `Missing native ${type} field #${id}`);
});
[
  "workDate", "workSite", "startTime", "endTime", "breakMinutes", "workNote",
  "signatureCanvas", "confirmEntry", "submitTimeButton"
].reduce((previousIndex, id) => {
  const currentIndex = employeeHtml.indexOf(`id="${id}"`);
  assert.ok(currentIndex > previousIndex, `Employee form field #${id} is out of order`);
  return currentIndex;
}, -1);
requireMatch(employeeHtml, /<canvas id="signatureCanvas"/, "Employee portal must include a signature canvas");
requireMatch(employeeJs, /pointerdown[\s\S]*pointermove[\s\S]*pointerup/, "Signature pad must support pointer input");
requireMatch(employeeJs, /rpc\("submit_manual_time_entry"/, "Employee submissions must use the manual-entry RPC");
requireMatch(employeeJs, /rpc\("get_my_time_state"/, "Employee state must reload from the database");
requireMatch(employeeJs, /rpc\("get_time_summary"/, "Employee monthly total must come from the database");
requireMatch(employeeJs, /p_signature_data_url: signatureDataUrl/, "Employee signature must be submitted through the RPC");
requireMatch(employeeJs, /crypto\.randomUUID/, "Employee submissions must carry unique idempotency IDs");
requireMatch(employeeJs, /server_now/, "The employee timer must synchronize with server time");
requireMatch(employeeJs, /document\.documentElement\.dir = currentLanguage === "ar" \? "rtl" : "ltr"/, "Arabic must switch the employee portal to RTL");
requireMatch(employeeHtml, /id="inviteView"[\s\S]*id="invitePassword"[\s\S]*id="invitePasswordConfirm"/, "Employee invitations must include a password setup view");
requireMatch(employeeJs, /auth\.updateUser\(\{ password: password \}\)/, "Employee invitation passwords must be persisted through Supabase Auth");

["fieldStartDate", "fieldStartTime", "fieldEndDate", "fieldEndTime", "fieldCountdownEnabled", "fieldAutoHideAfterEnd", "fieldDiscountPercentage"].forEach((id) => {
  requireMatch(announcementHtml, new RegExp(`id="${id}"`), `Missing announcement field ${id}`);
});
["countdown_enabled", "auto_hide_after_end", "discount_percentage", "start_date", "end_date"].forEach((field) => {
  requireMatch(announcementJs, new RegExp(field), `Announcement editor does not persist ${field}`);
  requireMatch(publicJs, new RegExp(field), `Public announcement renderer does not consume ${field}`);
});
requireMatch(publicJs, /rpc\/get_public_server_time|rpcFetch\("get_public_server_time"\)/, "Countdown must synchronize with the database clock");
requireMatch(publicHtml, /js\/sauberplus-countdown\.js[\s\S]*js\/sauberplus-content\.js/, "Countdown helper must load before public content");

["dashboard.html", "announcements.html", "gallery.html", "users.html", "activity-log.html", "settings.html"].forEach((file) => {
  requireMatch(read(`admin/${file}`), /href="time-tracking\.html"/, `${file} is missing workforce navigation`);
});

console.log("Workforce and timed-announcement UI contract checks passed.");
