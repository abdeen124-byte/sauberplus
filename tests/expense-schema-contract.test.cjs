"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260830000100_expense_partner_finance.sql"), "utf8");
const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");

test("expense and partner finance entities are present in migration and canonical schema", () => {
  ["expense_categories", "expense_receipts", "expenses", "expense_number_sequences", "partner_financial_profiles", "partner_transactions"].forEach((name) => {
    assert.match(migration, new RegExp(`create table public\\.${name}`));
    assert.match(schema, new RegExp(`create table public\\.${name}`));
  });
});

test("expense numbering is atomic and formatted EXP-YYYY-NNNN", () => {
  assert.match(migration, /on conflict\(sequence_year\) do update set last_number=public\.expense_number_sequences\.last_number\+1/);
  assert.match(migration, /'EXP-'\|\|v_year::text\|\|'-'\|\|lpad\(v_sequence::text,4,'0'\)/);
});

test("RLS, private storage, immutable ledgers, and Super Admin RPC checks exist", () => {
  assert.match(migration, /alter table public\.expenses enable row level security/);
  assert.match(migration, /values\('expense-receipts','expense-receipts',false/);
  assert.match(migration, /partner_transactions_immutable/);
  assert.match(migration, /Finalized partner transactions are immutable/);
  assert.ok((migration.match(/if not public\.is_super_admin\(\)/g) || []).length >= 7);
  assert.match(migration, /transaction_type='contribution'/);
  assert.match(migration, /transaction_type='expense_advance'/);
  assert.match(migration, /Expense totals do not match the declared tax rate/);
  assert.match(migration, /finalize_expense_draft/);
  assert.match(migration, /transaction_type in \('opening_contribution','contribution','adjustment','reimbursement'\)/);
  assert.match(migration, /r\.created_by=\(select auth\.uid\(\)\)/);
});

test("opening balances are runtime bootstrap data, not committed names or values", () => {
  ["Mujahid", "Mohamed Abdeen", "Mohamed Al-Tayeb", "21000", "6000"].forEach((value) => assert.doesNotMatch(migration, new RegExp(value, "i")));
  assert.match(migration, /bootstrap_partner_finances/);
  assert.match(migration, /unknown_opening/);
});

test("migration is synchronized into schema without transaction wrapper", () => {
  const body = migration.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trim();
  assert.ok(schema.includes(body));
});
