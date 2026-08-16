const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const migration = read("supabase/migrations/20260816000200_user_account_lifecycle.sql");
const managerUi = read("admin/js/admin-users.js");
const employeeUi = read("admin/js/admin-time-tracking.js");
const activityUi = read("admin/js/admin-activity.js");
const translations = read("admin/js/admin-i18n.js");

assert.match(migration, /create or replace function public\.manage_user_account/i);
assert.match(migration, /p_action not in \('enable', 'disable', 'delete', 'role'\)/i);
assert.match(migration, /user_profiles_guard_last_super_admin/i);
assert.match(migration, /Der letzte aktive Super Admin kann nicht deaktiviert/i);
assert.match(migration, /update public\.employees[\s\S]*employment_end_date/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(employees|time_entries|time_breaks)/i);

assert.match(managerUi, /\.in\("role", \["super_admin", "content_manager"\]\)/);
assert.match(managerUi, /rpc\("manage_user_account"/);
assert.match(managerUi, /data-action="delete"/);
assert.match(employeeUi, /\.eq\("role", "employee"\)/);
assert.match(employeeUi, /data-employee-delete/);
assert.match(employeeUi, /p_action: "delete"/);

assert.match(activityUi, /translatedOrFallback\("entityLabel\."/);
assert.match(translations, /employees: "Mitarbeiter"/);
assert.match(translations, /disabled: "Zugriff"/);

console.log("User account lifecycle contracts passed.");
