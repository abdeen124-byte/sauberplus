const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260829000200_legacy_invoice_archive.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");

assert.match(migration, /^begin;/i);
assert.match(migration, /commit;\s*$/i);
assert.match(migration, /add column numbering_scheme text not null default 'native'/i);
assert.match(migration, /add column source_pdf_sha256 text[\s\S]*'\^\[0-9a-f\]\{64\}\$'/i);
assert.match(migration, /drop constraint if exists invoices_invoice_number_check/i);
assert.match(migration, /add constraint invoices_numbering_scheme_check/i);
assert.match(migration, /status = 'draft'[\s\S]*numbering_scheme = 'native'[\s\S]*invoice_number is null/i);
assert.match(migration, /invoice_number = 'SP-' \|\| sequence_year::text \|\| '-' \|\| lpad\(sequence_number::text, 4, '0'\)/i);
assert.match(migration, /numbering_scheme = 'legacy'[\s\S]*sequence_number between 1 and 999[\s\S]*sequence_year = extract\(year from invoice_date\)::smallint[\s\S]*to_char\(invoice_date, 'MMDD'\)[\s\S]*lpad\(sequence_number::text, 3, '0'\)/i);
assert.match(migration, /new\.numbering_scheme is distinct from old\.numbering_scheme/i);
assert.match(migration, /new\.source_pdf_sha256 is distinct from old\.source_pdf_sha256/i);

const importStart = migration.indexOf("function public.import_legacy_invoice");
assert.ok(importStart >= 0, "legacy import RPC must exist");
const importBody = migration.slice(importStart, migration.indexOf("create or replace function public.record_invoice_pdf", importStart));
assert.match(importBody, /security definer/i);
assert.match(importBody, /set search_path = public, pg_temp/i);
assert.match(importBody, /auth\.role\(\)[\s\S]*<> 'service_role'/i);
assert.match(importBody, /p_payload ->> 'actor_id'[\s\S]*v_actor :=[\s\S]*where id = v_actor[\s\S]*role = 'super_admin'[\s\S]*disabled = false[\s\S]*archived_at is null/i);
assert.match(importBody, /octet_length\(p_payload::text\) > 40000/i);
assert.match(importBody, /v_subtotal_cents <> \(v_total_cents \* 10000 \+ 5950\) \/ 11900/i);
assert.match(importBody, /v_item_net_cents <> v_subtotal_cents or v_item_gross_cents <> v_total_cents/i);

const sequenceLock = importBody.indexOf("insert into public.invoice_number_sequences");
const sequenceReject = importBody.indexOf("v_previous_sequence >= v_sequence_number");
const invoiceInsert = importBody.indexOf("insert into public.invoices");
const itemInsert = importBody.indexOf("insert into public.invoice_items", invoiceInsert);
const invoiceIssue = importBody.indexOf("update public.invoices set", itemInsert);
const sequenceAdvance = importBody.indexOf("update public.invoice_number_sequences", invoiceInsert);
assert.ok(sequenceLock >= 0 && sequenceLock < sequenceReject && sequenceReject < invoiceInsert
  && invoiceInsert < itemInsert && itemInsert < invoiceIssue && invoiceIssue < sequenceAdvance,
"legacy import must lock, reject stale sequences, create a draft, insert items, issue it, then advance the annual counter");
assert.match(importBody.slice(invoiceInsert, itemInsert), /'draft'[\s\S]*'\{\}'::jsonb[\s\S]*0, 1900, 0, 0/i);
assert.match(importBody.slice(invoiceIssue, sequenceAdvance), /numbering_scheme = 'legacy'[\s\S]*source_pdf_sha256 = v_source_sha256[\s\S]*status = 'open'/i);
assert.match(importBody, /on conflict \(sequence_year\) do update[\s\S]*last_number = public\.invoice_number_sequences\.last_number[\s\S]*returning last_number into v_previous_sequence/i);
assert.match(importBody, /invoice_number = v_invoice_number[\s\S]*sequence_year = v_sequence_year and sequence_number = v_sequence_number/i);
assert.match(importBody, /'legacy_import'[\s\S]*jsonb_build_object\([\s\S]*'source_sha256'/i);
assert.doesNotMatch(importBody, /new_value\s*\)[\s\S]{0,400}\bp_payload\b/i);

assert.match(migration, /revoke all on function public\.import_legacy_invoice\(jsonb\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.import_legacy_invoice\(jsonb\) to service_role/i);

const recordStart = migration.indexOf("function public.record_invoice_pdf");
const recordBody = migration.slice(recordStart);
assert.match(recordBody, /public\.is_super_admin\(\)[\s\S]*auth\.role\(\)[\s\S]*'service_role'/i);
assert.match(recordBody, /select 1 from storage\.objects[\s\S]*bucket_id = 'invoice-pdfs'[\s\S]*name = v_expected_path/i);
assert.match(recordBody, /v_invoice\.source_pdf_sha256 is not null[\s\S]*p_sha256 <> v_invoice\.source_pdf_sha256/i);
assert.match(recordBody, /pdf_storage_path = v_expected_path[\s\S]*pdf_sha256 = p_sha256/i);
assert.match(migration, /grant execute on function public\.record_invoice_pdf\(uuid, text, text\) to authenticated, service_role/i);

const body = migration.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trim();
assert.ok(schema.includes(body), "Fresh-install schema.sql must contain the legacy archive migration final state");

console.log("Legacy invoice numbering, import authorization, sequence locking, and private archive contracts passed.");
