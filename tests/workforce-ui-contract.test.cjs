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

["start", "pause", "resume", "end"].forEach((action) => {
  requireMatch(employeeHtml, new RegExp(`data-action="${action}"`), `Missing ${action} employee action`);
});
requireMatch(employeeJs, /rpc\("record_time_event"/, "Employee actions must use record_time_event");
requireMatch(employeeJs, /rpc\("get_my_time_state"/, "Employee state must reload from the database");
requireMatch(employeeJs, /rpc\("get_time_summary"/, "Employee daily total must come from the database");
requireMatch(employeeJs, /rpc\("update_own_time_entry_note"/, "Employee notes must persist through the RPC");
requireMatch(employeeJs, /crypto\.randomUUID/, "Clock requests must carry unique idempotency IDs");
requireMatch(employeeJs, /server_now/, "The employee timer must synchronize with server time");
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
