# SauberPlus project guidance

- This is a static HTML/CSS/JavaScript site. The authenticated Admin lives under `admin/` and uses Supabase Auth, Postgres, Storage, RLS, and RPCs.
- Treat RLS and server-side RPCs as the authorization boundary; client-side role gating is UX only.
- Preserve the public website, `/mitarbeiter/`, existing authentication, workforce tables, and unrelated Admin features unless explicitly in scope.
- Financial invoice data is Super Admin only. Store money as integer cents, issue invoice numbers only through the database, and keep issued invoice snapshots immutable.
- Apply schema changes through timestamped files under `supabase/migrations/` and keep `supabase/schema.sql` aligned for fresh installs.
- Keep invoice PDFs in a private Storage bucket and never commit legal, bank, tax, or customer values to public JavaScript or fixtures.
- Admin UI supports German and Arabic. Preserve RTL, keyboard access, mobile behavior, and the navy/green SauberPlus identity.
- Validate focused JavaScript with `node --check`, run the relevant `tests/*.test.cjs` files, and visually inspect changed Admin pages and generated PDFs at desktop and mobile sizes.
- Never run a production migration, deploy, commit, or push without explicit approval.
