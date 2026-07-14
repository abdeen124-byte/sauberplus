# SauberPlus Admin CMS — Setup

The admin dashboard at `/admin` is a static site (same as the public site — no build step) that talks directly to a dedicated Supabase project (Postgres + Auth + Storage + Row Level Security). This document is the one-time provisioning walkthrough. Do this in order; later steps depend on earlier ones.

## 1. Create the Supabase project

1. Go to `supabase.com`, sign in, and create a **new project**.
2. Name it something identifiable, e.g. `sauberplus-admin`. **Do not reuse or connect any other client project's Supabase account/organization to this one.**
3. Region: choose **EU (Frankfurt)**. This is a German company; picking an EU region now avoids a data-residency migration later (region can't be changed after creation without recreating the project).
4. Plan: the Free tier is sufficient to start (500MB database, 1GB file storage, 5GB egress, no automatic backups, projects auto-pause after 7 days of zero traffic — see "Known limits" below).
5. Save the database password Supabase generates somewhere safe. It's not needed for anything in this setup, but you'll want it if you ever need direct Postgres access.

## 2. Apply the schema

1. In the project dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) and run it once.
3. Confirm no errors. This creates all tables, security policies, helper functions, and triggers described in that file's header comment.

## 3. Create the storage bucket

Done via the dashboard UI, not SQL (see the comment in `schema.sql` for why):

1. **Storage → New bucket**.
2. Name: `cms-media` (must match exactly — the RLS policies in `schema.sql` reference this name).
3. Public bucket: **on**.
4. Restrict file upload MIME types: `image/jpeg, image/png, image/webp`.
5. File size limit: `5MB`.

## 4. Bootstrap the first Super Admin

Nothing can log in until one account exists, and account creation normally happens through the admin panel itself (which doesn't exist yet) — so the very first account is created by hand, once:

1. **Authentication → Users → Add user**. Email: `Abdeen124@gmail.com`. Set a temporary password, or use "send invite" if available on your plan (either way, treat it as temporary — sign in and change it immediately once the login screen is built).
2. Copy the new user's **UUID** from the users list.
3. Back in **SQL Editor**, run (replace the placeholder UUID):
   ```sql
   insert into public.user_profiles (id, email, display_name, role)
   values ('PASTE-THE-UUID-HERE', 'Abdeen124@gmail.com', 'Super Admin', 'super_admin');
   ```
4. This is a one-time step. Every account created afterward goes through the admin panel's Users page (Super Admin only), not this manual process.

## 5. Allow-list the password-reset redirect

The "Forgot Password" flow on `admin/index.html` sends the user an email via `resetPasswordForEmail`, linking to `admin/reset-password.html`. Supabase silently ignores (falls back to the default Site URL) any `redirectTo` that isn't explicitly allow-listed, so this step is easy to miss and fails quietly if skipped:

1. **Authentication → URL Configuration**.
2. Set **Site URL** to `https://www.sauberplus.plus/admin/`.
3. Under **Redirect URLs**, add `https://www.sauberplus.plus/admin/reset-password.html`.
4. Optional, for local testing before the admin panel is deployed: also add `http://localhost:PORT/admin/reset-password.html` for whatever port you serve the repo on locally.

While in **Authentication** settings, also worth setting **minimum password length to 8** (Authentication → Policies/Password) to match the client-side rule in `admin/reset-password.html` server-side — the client-side check is a UX nicety, this is the real enforcement, same principle as everywhere else in this system.

## 6. Get the API credentials

**Project Settings → API**. Copy two values:
- **Project URL** (`https://<project-ref>.supabase.co`)
- **`anon` `public` key** (a long JWT-looking string)

**Do not copy the `service_role` key anywhere in this repo or send it in chat.** It bypasses Row Level Security entirely. The one feature that needs it (creating new users from the Users page) will run inside a Supabase Edge Function and be stored only as a Supabase function secret when that phase is built — never in a committed file, never in the browser.

## 7. Deploy the admin-create-user Edge Function

This powers the "+ Neuer Partner" button on the Users page — the one operation in the whole system that needs the `service_role` key (creating a login for someone else). The key itself never needs to be typed in anywhere: Supabase injects it automatically into every Edge Function as `SUPABASE_SERVICE_ROLE_KEY`.

Via the dashboard (no command line needed):

1. **Edge Functions → Create a new function**.
2. Name it exactly `admin-create-user`.
3. Delete the placeholder starter code in the editor and paste the entire contents of [`supabase/functions/admin-create-user/index.ts`](../supabase/functions/admin-create-user/index.ts).
4. Deploy.
5. Confirm it shows as deployed at `https://<project-ref>.functions.supabase.co/admin-create-user` (or under **Edge Functions → admin-create-user → Details**, whichever your dashboard version shows — the URL is also just `{Project URL}/functions/v1/admin-create-user`).

No secrets to set by hand for this one — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are already available to it automatically.

## 8. Hand off

Send back the Project URL and the `anon` `public` key. They get filled into [`admin/js/admin-config.js`](../admin/js/admin-config.js) and [`js/sauberplus-config.js`](../js/sauberplus-config.js), and the `REPLACE_WITH_SUPABASE_PROJECT_REF` placeholder gets swapped for the real project ref in every CSP (every `admin/*.html`, `index.html`, `_headers`, `vercel.json`, `.htaccess`). Both config files are safe to commit as plaintext — the anon key is meant to be public; every permission it has is enforced by the RLS policies in `schema.sql`, the same way `js/sauberplus-config.js` already commits a public API URL for the visitor counter.

## Known limits (Free tier, current as of mid-2026)

- 500MB database, 1GB file storage, 5GB egress/month, 50,000 monthly active users, 2 active projects per account.
- **No automatic backups.** The admin panel's Settings page will include a manual export/import feature for `announcements` and `gallery_images` (not accounts) — that in-app export is the only backup mechanism unless the project is upgraded to a paid plan.
- **Projects auto-pause after 7 days with zero activity**, requiring a manual restart from the dashboard (roughly a minute of downtime for the admin panel and any live CMS content on the public site). The public site's own hardcoded content is unaffected either way — CMS-driven sections are built to fail silently (render nothing, not an error) if Supabase is unreachable.
- Upgrading to a paid plan later removes all three limits above without any schema or code changes.

## Status

**Everything below is done and live against the real `SauberPlus-CMS` project** (`kgkrgbkiqitnvntbyyct`, EU/Frankfurt), provisioned via the Supabase CLI (`supabase link`/`db query`/`functions deploy`/`config push`) once the user completed the one-time interactive `supabase login`:

- [x] Schema, RLS, helper functions, triggers applied — verified live (4 tables, 9 functions, correct policy counts per table).
- [x] Security hardening pass, found by Supabase's own `db advisors --type security` after the schema went live and fixed on the running project (also folded back into `supabase/schema.sql` for any future fresh apply — see `supabase/hardening_2026-07-14.sql` for the exact patch):
  - Every `SECURITY DEFINER` helper/trigger function had a broader `anon`/`authenticated` EXECUTE grant than intended (Supabase's own default-privileges setup on the `public` schema grants this at creation time; the original schema's grants were additive-only and never revoked that default). Fixed by revoking from `public, anon, authenticated` first, then re-granting only the intended precise set.
  - The storage `SELECT` policy allowed public bucket-listing (enumerate every file), not just individual-file access (which a public bucket already serves regardless of RLS). Replaced with a staff-only `SELECT` policy.
- [x] `cms-media` storage bucket verified (public, correct MIME allow-list, 5MB limit — was already created correctly).
- [x] `admin-create-user` Edge Function deployed and live at `{Project URL}/functions/v1/admin-create-user`, deployed with `--no-verify-jwt` (the function does its own precise `is_super_admin()` check; the platform-level blanket JWT gate was disabled after confirming it would otherwise 401 the CORS preflight). Verified live: OPTIONS → 204, missing/invalid auth → 401.
- [x] Auth Site URL, redirect URLs (both `sauberplus.plus` and `www`, admin login + reset-password pages, localhost for local testing), and minimum password length (8) configured via `supabase config push`. **Caught and fixed a side effect of that push**: `config push` overwrites the whole remote Auth config from the local `config.toml`, not just the changed fields — it also silently flipped `enable_confirmations` off, weakened the email rate limit, shortened the OTP length, disabled MFA TOTP, and corrupted two OTP email templates. All reverted to their original values in the same pass; a second `config push` confirmed "up to date" with no further drift.
- [x] Credentials wired into `admin/js/admin-config.js`, `js/sauberplus-config.js`, and every CSP placeholder (all `admin/*.html`, `index.html`, `_headers`, `vercel.json`, `.htaccess`) — using the project's `sb_publishable_...` key (Supabase's newer, non-JWT anon-equivalent key format) rather than the legacy anon JWT, since both are exposed by the project and the publishable key never required `--reveal` to retrieve.
- [x] Live-verified via direct REST calls (not just static policy review): anon can read published announcements/gallery, cannot write to any table, cannot list or upload to storage; `user_profiles`/`activity_log` correctly return zero rows to anon.
- [x] Bootstrap Super Admin created (`Abdeen124@gmail.com`, via Dashboard Add User + `user_profiles` insert — the one step with no CLI/API path that avoids the `service_role` key) and verified live: correct `is_super_admin()`/RLS behavior via JWT-claim simulation, full announcements/gallery CRUD + `activity_log` audit trail confirmed end-to-end against production, account-lockout RPCs confirmed via the real REST endpoint (and reset to unlocked afterward).
- [x] Full German/Arabic localization + RTL support added to the admin UI (`admin/js/admin-i18n.js` + `dir`-aware CSS overrides in `admin/css/admin.css`) — every page, every dynamic string, tested across desktop/tablet/mobile in both languages via Playwright. No schema/RLS/auth changes. See `CHANGELOG.md` (2026-07-14) for details.

**The Admin Dashboard is live and fully operational at `https://www.sauberplus.plus/admin/`.**
