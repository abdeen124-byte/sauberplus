const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260829000100_invoice_management.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");

assert.match(migration, /^begin;/i);
assert.match(migration, /commit;\s*$/i);

for (const table of ["invoice_customers", "invoice_settings", "invoice_number_sequences", "invoices", "invoice_items"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
}

assert.match(migration, /subtotal_cents bigint/i);
assert.match(migration, /vat_cents bigint/i);
assert.match(migration, /total_cents bigint/i);
assert.doesNotMatch(migration, /(real|double precision|money)\s+(not null|default)/i);
assert.match(migration, /default_vat_bps integer not null default 1900/i);
assert.match(migration, /total_cents = subtotal_cents \+ vat_cents/i);
assert.match(migration, /invoices_pdf_metadata_check[\s\S]*pdf_storage_path is null[\s\S]*pdf_generated_at is not null/i);
assert.match(migration, /customer_snapshot jsonb not null/i);
assert.match(migration, /issuer_snapshot jsonb not null/i);

for (const rpc of ["save_invoice_settings", "save_invoice_draft", "issue_invoice", "mark_invoice_paid", "cancel_invoice", "duplicate_invoice", "record_invoice_pdf"]) {
  const start = migration.indexOf(`function public.${rpc}`);
  assert.ok(start >= 0, `${rpc} must exist`);
  const body = migration.slice(start, start + 20000);
  assert.match(body, /security definer/i, `${rpc} must be SECURITY DEFINER`);
  assert.match(body, /set search_path = public, pg_temp/i, `${rpc} must pin search_path`);
  assert.match(body, /if not public\.is_super_admin\(\)/i, `${rpc} must enforce Super Admin`);
  assert.match(migration, new RegExp(`revoke all on function public\\.${rpc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
}

assert.match(migration, /select \* into v_invoice from public\.invoices where id = p_invoice_id for update/i);
assert.match(migration, /if v_invoice\.status <> 'draft'[\s\S]*return v_invoice/i);
assert.match(migration, /insert into public\.invoice_number_sequences[\s\S]*on conflict \(sequence_year\) do update[\s\S]*last_number = public\.invoice_number_sequences\.last_number \+ 1/i);
assert.match(migration, /'SP-' \|\| v_year::text \|\| '-' \|\| lpad\(v_sequence::text, 4, '0'\)/i);
assert.match(migration, /unique \(sequence_year, sequence_number\)/i);
assert.match(migration, /invoice_number text unique/i);

assert.match(migration, /create trigger invoices_protect_history/i);
assert.match(migration, /Issued invoice identity and financial values are immutable/i);
assert.match(migration, /create trigger invoice_items_protect_history/i);
assert.match(migration, /Issued invoice items are immutable/i);
assert.match(migration, /Archived invoice PDFs are immutable/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.invoices/i);

assert.match(migration, /revoke all on public\.invoice_customers,[\s\S]*from public, anon, authenticated/i);
assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[^;]*invoice/i);
assert.match(migration, /using \(public\.is_super_admin\(\)\)/i);

assert.match(migration, /values \('invoice-pdfs', 'invoice-pdfs', false/i);
assert.match(migration, /bucket_id = 'invoice-pdfs' and public\.invoice_pdf_path_is_allowed\(name\)/i);
assert.doesNotMatch(migration, /invoice-pdfs'[\s\S]{0,120}public\s*=\s*true/i);
assert.doesNotMatch(migration, /invoice_pdfs[^;]*for delete/i);
assert.doesNotMatch(migration, /invoice_pdfs[^;]*for update/i);
assert.match(migration, /v_running_net_cents := v_running_net_cents \+ v_line_net_cents[\s\S]*v_line_gross_cents := v_line_net_cents \+ v_cumulative_vat_cents - v_allocated_vat_cents/i);

const body = migration.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trim();
assert.ok(schema.includes(body), "Fresh-install schema.sql must contain the invoice migration final state");

console.log("Invoice schema, RLS, RPC, numbering, immutability, and private-storage contracts passed.");
