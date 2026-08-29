const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "20260814000100_employee_time_tracking.sql"
);
const lintFixMigrationPath = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "20260814000200_time_tracking_lint_fixes.sql"
);
const lintCompletionMigrationPath = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "20260814000300_time_tracking_lint_completion.sql"
);
const manualEntryMigrationPath = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "20260816000100_employee_manual_time_entry.sql"
);
const edgeFunctionPath = path.join(
  projectRoot,
  "supabase",
  "functions",
  "admin-create-user",
  "index.ts"
);
const schemaPath = path.join(projectRoot, "supabase", "schema.sql");
const supabaseConfigPath = path.join(projectRoot, "supabase", "config.toml");

const migration = fs.readFileSync(migrationPath, "utf8");
const lintFixMigration = fs.readFileSync(lintFixMigrationPath, "utf8");
const lintCompletionMigration = fs.readFileSync(lintCompletionMigrationPath, "utf8");
const manualEntryMigration = fs.readFileSync(manualEntryMigrationPath, "utf8");
const edgeFunction = fs.readFileSync(edgeFunctionPath, "utf8");
const schema = fs.readFileSync(schemaPath, "utf8");
const supabaseConfig = fs.readFileSync(supabaseConfigPath, "utf8");

function requireMatch(source, expression, message) {
  assert.match(source, expression, message);
}

function requireNoMatch(source, expression, message) {
  assert.doesNotMatch(source, expression, message);
}

requireMatch(migration, /^begin;[\s\S]*commit;\s*$/i, "Migration must be atomic");

[
  "work_sites",
  "employees",
  "employee_work_sites",
  "work_shifts",
  "employee_absences",
  "time_entries",
  "time_breaks",
  "time_entry_events"
].forEach((tableName) => {
  requireMatch(
    migration,
    new RegExp(`create table public\\.${tableName}\\s*\\(`, "i"),
    `Missing ${tableName} table`
  );
  requireMatch(
    migration,
    new RegExp(`alter table public\\.${tableName} enable row level security`, "i"),
    `RLS is not enabled for ${tableName}`
  );
});

[
  "is_employee",
  "employee_can_read_work_site",
  "employee_can_clock_at_work_site",
  "provision_user_profile",
  "record_time_event",
  "get_my_time_state",
  "update_own_time_entry_note",
  "get_time_summary",
  "update_employee_account",
  "get_public_server_time"
].forEach((functionName) => {
  requireMatch(
    migration,
    new RegExp(`create or replace function public\\.${functionName}\\s*\\(`, "i"),
    `Missing ${functionName} function`
  );
});

const functionDefinitions = migration.match(
  /create or replace function public\.[\s\S]*?\n\$\$;/gi
) || [];
functionDefinitions.forEach((definition) => {
  if (/security definer/i.test(definition)) {
    requireMatch(
      definition,
      /set search_path = public, pg_temp/i,
      "Every SECURITY DEFINER function must pin search_path"
    );
  }
});

requireMatch(
  migration,
  /where id = v_user_id\s+returning email into v_email/i,
  "Successful login must update the authenticated profile"
);
requireNoMatch(
  migration,
  /grant\s+(?:insert|update|delete|[^;]*,\s*(?:insert|update|delete))[^;]*on public\.(?:time_entries|time_breaks|time_entry_events)/i,
  "Clock tables must not allow direct writes"
);
requireNoMatch(
  migration,
  /grant[^;]+on public\.(?:work_sites|employees|employee_work_sites|work_shifts|employee_absences|time_entries|time_breaks|time_entry_events)[^;]+to anon/i,
  "Anonymous users must not receive workforce access"
);
requireMatch(
  migration,
  /time_entries_one_open_per_employee_idx[\s\S]*?where status in \('working', 'paused'\)/i,
  "Missing single-open-entry concurrency guard"
);
requireMatch(
  migration,
  /time_entry_events_request_unique unique \(employee_id, request_id\)/i,
  "Missing idempotency constraint"
);
requireMatch(
  migration,
  /perform pg_advisory_xact_lock\(hashtextextended\(v_employee_id::text, 0\)\)/i,
  "Clock transitions must serialize per employee"
);
requireMatch(
  migration,
  /v_now := clock_timestamp\(\)/i,
  "Clock transitions must use a database timestamp"
);
requireMatch(
  migration,
  /record_time_event[\s\S]*?server_now timestamptz/i,
  "Clock responses must expose server time"
);
requireMatch(
  migration,
  /if v_action = 'start'[\s\S]*?from public\.employee_absences[\s\S]*?approval_status = 'approved'/i,
  "Approved absences must prevent starting a work session"
);
requireMatch(
  migration,
  /update_employee_account[\s\S]*?if not public\.is_super_admin\(\)[\s\S]*?update public\.user_profiles[\s\S]*?update public\.employees/i,
  "Employee account edits must be transactional and Super Admin only"
);
requireMatch(
  migration,
  /add column if not exists countdown_enabled boolean not null default false[\s\S]*?add column if not exists auto_hide_after_end boolean not null default true[\s\S]*?discount_percentage numeric\(5, 2\)/i,
  "Announcements must include the timed offer fields"
);
requireMatch(
  migration,
  /announcements_public_read[\s\S]*?start_date is null or start_date <= now\(\)[\s\S]*?auto_hide_after_end = false/i,
  "Public announcement visibility must enforce start time and auto-hide semantics"
);
requireMatch(
  migration,
  /revoke all on function public\.get_public_server_time\(\) from public;[\s\S]*?grant execute on function public\.get_public_server_time\(\) to anon, authenticated/i,
  "The public server clock must expose only explicit execute access"
);
requireMatch(
  migration,
  /trg_log_absence_change[\s\S]*?jsonb_build_object[\s\S]*?'approval_status'/i,
  "Absence audit records must use the redacted trigger"
);
requireNoMatch(migration, /\badmin_note\b/i, "Time entries must not expose private admin notes");
const employeesTableDefinition = migration.match(
  /create table public\.employees[\s\S]*?\n\);\n\ncreate table public\.employee_work_sites/i
);
assert.ok(employeesTableDefinition, "Employees table definition could not be inspected");
requireNoMatch(
  employeesTableDefinition[0],
  /\bnotes text/i,
  "Employee rows must not expose private admin notes"
);
requireMatch(
  migration,
  /employees_read_own_or_admin[\s\S]*?id = \(select auth\.uid\(\)\) and public\.is_employee\(\)/i,
  "Disabled employees must not retain direct profile reads"
);
requireMatch(
  migration,
  /employee_work_sites_validate_overlap/i,
  "Work-site assignments must reject overlapping periods"
);
requireMatch(migration, /work_shifts_validate_overlap/i, "Schedules must reject overlaps");
requireMatch(
  migration,
  /employee_absences_validate_overlap/i,
  "Absences must reject overlaps"
);

const migrationBody = migration
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "")
  .split(/\r?\n/)
  .filter(Boolean);
const schemaWorkforceStart = schema.indexOf(
  "-- Existing authentication hardening required before employee accounts exist"
);
assert.notEqual(schemaWorkforceStart, -1, "Fresh-install schema is missing workforce definitions");
const schemaLintFixHeading = schema.indexOf("-- PostgreSQL lint corrections for time tracking");
assert.notEqual(schemaLintFixHeading, -1, "Fresh-install schema is missing time-tracking lint fixes");
const schemaLintFixSeparator = schema.lastIndexOf(
  "-- ---------------------------------------------------------------------------",
  schemaLintFixHeading
);
const schemaWorkforceBody = schema
  .slice(
    schema.lastIndexOf("-- ---------------------------------------------------------------------------", schemaWorkforceStart),
    schemaLintFixSeparator
  )
  .split(/\r?\n/)
  .filter(Boolean);
assert.deepEqual(
  schemaWorkforceBody,
  migrationBody,
  "schema.sql and the incremental migration must stay synchronized"
);

requireMatch(lintFixMigration, /^begin;[\s\S]*commit;\s*$/i, "Lint-fix migration must be atomic");
requireMatch(
  lintFixMigration,
  /update public\.time_breaks as open_break[\s\S]*?open_break\.ended_at is null/i,
  "Break updates must qualify ended_at"
);
requireMatch(
  lintFixMigration,
  /alter function public\.get_my_time_state\(\) volatile;[\s\S]*?alter function public\.get_time_summary\(uuid, date, date, text, uuid\) volatile;/i,
  "Clock-reading functions must be VOLATILE"
);
const lintFixBody = lintFixMigration
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "")
  .split(/\r?\n/)
  .filter(Boolean);
const schemaLintVolatileStart = schema.indexOf("-- Both functions read clock_timestamp()");
const schemaLintCompletionHeading = schema.indexOf("-- PostgreSQL lint completion for time tracking");
const schemaLifecycleHeading = schema.indexOf(
  "-- ============================================================\n-- User account lifecycle",
  schemaLintFixHeading
);
const schemaInvoiceHeading = schema.indexOf("-- Invoice management", schemaLintFixHeading);
const schemaInvoiceSectionStart = schemaInvoiceHeading < 0
  ? -1
  : schema.lastIndexOf("-- ============================================================", schemaInvoiceHeading);
const schemaLintPrimaryEnd = schemaInvoiceSectionStart > schemaLintFixHeading && schemaInvoiceSectionStart < schemaLifecycleHeading
  ? schemaInvoiceSectionStart
  : schemaLifecycleHeading;
const schemaLintFixBody = schema
  .slice(
    schema.indexOf("-- PostgreSQL treats", schemaLintFixHeading),
    schemaLintPrimaryEnd
  )
  .split(/\r?\n/)
  .filter(Boolean)
  .concat(
    schema
      .slice(
        schemaLintVolatileStart,
        schema.lastIndexOf("-- ---------------------------------------------------------------------------", schemaLintCompletionHeading)
      )
      .split(/\r?\n/)
      .filter(Boolean)
  );
assert.deepEqual(
  schemaLintFixBody,
  lintFixBody,
  "schema.sql and the lint-fix migration must stay synchronized"
);

requireMatch(manualEntryMigration, /^begin;[\s\S]*commit;\s*$/i, "Manual-entry migration must be atomic");
requireMatch(manualEntryMigration, /create or replace function public\.submit_manual_time_entry\s*\(/i, "Manual-entry RPC is missing");
requireMatch(manualEntryMigration, /security definer[\s\S]*set search_path = public, pg_temp/i, "Manual-entry RPC must pin search_path");
requireMatch(manualEntryMigration, /pg_advisory_xact_lock[\s\S]*request_id = p_request_id/i, "Manual submissions must be serialized and idempotent");
requireMatch(manualEntryMigration, /p_work_date > \(v_now at time zone v_timezone_name\)::date/i, "Future manual entries must be rejected");
requireMatch(manualEntryMigration, /submitted shift overlaps an existing entry/i, "Overlapping manual entries must be rejected");
requireMatch(manualEntryMigration, /signature_data_url[\s\S]*confirmed[\s\S]*true/i, "Manual submissions must persist signature evidence and confirmation");
requireMatch(manualEntryMigration, /insert into public\.time_breaks/i, "Manual breaks must use the existing time_breaks table");

const schemaManualStart = schema.indexOf("create or replace function public.submit_manual_time_entry");
const schemaManualEnd = schema.indexOf("-- PostgreSQL lint completion for time tracking");
assert.notEqual(schemaManualStart, -1, "Fresh-install schema is missing the manual-entry RPC");
assert.notEqual(schemaManualEnd, -1, "Fresh-install schema is missing the manual-entry boundary");
requireMatch(schema.slice(schemaManualStart, schemaManualEnd), /signature_data_url[\s\S]*grant execute on function public\.submit_manual_time_entry/i, "Fresh-install schema has an incomplete manual-entry RPC");

requireMatch(lintCompletionMigration, /^begin;[\s\S]*commit;\s*$/i, "Lint-completion migration must be atomic");
requireMatch(
  lintCompletionMigration,
  /update public\.time_breaks as open_break[\s\S]*?open_break\.ended_at is null/i,
  "Paused-end break updates must qualify ended_at"
);
requireMatch(
  lintCompletionMigration,
  /perform p_email;/i,
  "The retained successful-login parameter must be explicitly ignored"
);
const lintCompletionBody = lintCompletionMigration
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "")
  .split(/\r?\n/)
  .filter(Boolean);
assert.notEqual(schemaLintCompletionHeading, -1, "Fresh-install schema is missing lint completion");
const schemaLintCompletionBody = schema
  .slice(schema.indexOf("-- The paused -> Ende branch", schemaLintCompletionHeading))
  .split(/\r?\n/)
  .filter(Boolean);
assert.deepEqual(
  schemaLintCompletionBody,
  lintCompletionBody,
  "schema.sql and the lint-completion migration must stay synchronized"
);

requireMatch(
  edgeFunction,
  /const ALLOWED_ROLES = \["super_admin", "content_manager", "employee"\]/,
  "Edge Function must allow employee provisioning"
);
requireMatch(
  edgeFunction,
  /\/rest\/v1\/rpc\/provision_user_profile/,
  "Edge Function must use transactional profile provisioning"
);
requireMatch(
  edgeFunction,
  /\/auth\/v1\/admin\/users\//,
  "Edge Function must compensate failed provisioning"
);
requireMatch(
  edgeFunction,
  /let provisionResponse: Response;[\s\S]*?catch \(_error\) \{[\s\S]*?removeInvitedUser\(supabaseUrl, serviceRoleKey, invitedUserId\)/,
  "Edge Function must clean up after provisioning exceptions"
);
requireMatch(
  supabaseConfig,
  /"https:\/\/www\.sauberplus\.plus\/mitarbeiter\/"/,
  "Employee invite redirect must be allow-listed"
);
requireMatch(
  supabaseConfig,
  /"https:\/\/sauberplus\.plus\/mitarbeiter\/"/,
  "Non-www employee invite redirect must be allow-listed"
);

console.log("Time-tracking schema contract checks passed.");
