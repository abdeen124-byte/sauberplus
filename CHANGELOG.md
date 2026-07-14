# Changelog

All notable SauberPlus website changes should be recorded here.

## 2026-07-14

- Started the Admin Dashboard / CMS build (see `docs/admin-cms-setup.md` for the full design and provisioning steps). Public site (`index.html`, `impressum.html`, `datenschutz.html`) is untouched so far — everything below is new, additive files under `admin/` and `supabase/`.
- Added `supabase/schema.sql`: tables, Row Level Security policies, helper functions, and activity-log triggers for the new Supabase-backed backend (Postgres + Auth + Storage). Not yet applied to a live project — pending provisioning.
- Vendored `@supabase/supabase-js` v2.110.5 (UMD build) at `admin/js/vendor/supabase.js`, committed rather than loaded from a CDN, so the site's CSP can stay `script-src 'self'` with no third-party script hosts trusted.
- Built the admin login screen (`admin/index.html`) and forgot/reset-password flow (`admin/reset-password.html`).
- Added root `.nojekyll` (the site is Jekyll-processed by GitHub Pages per `_config.yml`; this avoids Jekyll touching anything under the new `admin/` directory).
- Built the full admin shell (sidebar nav, role-gated links, modal/toast/confirm-dialog helpers in `admin/js/admin-ui.js`) and a shared image upload helper (`admin/js/admin-image-upload.js`: magic-byte validation, client-side WebP resize, Storage upload).
- Built Announcements (`admin/announcements.html`) — the unified table/editor covering all 5 placements from the brief (top bar, homepage banner, promo section, popup, seasonal), with draft/publish/hide, scheduling, image upload, and a live preview.
- Built Gallery (`admin/gallery.html`) — single and before/after images, drag-and-drop reorder (gap-based `sort_order`), hide/replace/delete.
- Built the public-site integration: `js/sauberplus-content.js` (plain REST fetch against Supabase, no SDK needed for read-only public queries) renders published announcements/gallery into new, empty-by-default mount points added to `index.html` (`#cms-top-bar`, `#cms-homepage-banner`, `#cms-seasonal`, `#cms-promo-section`, `#cms-popup-root`). Public site is visually and behaviorally identical if Supabase has no data or is unreachable. CSP (`index.html`, every `admin/*.html`, `_headers`, `vercel.json`, `.htaccess`) widened to allow the Supabase project host for `connect-src`/`img-src` once real credentials are wired in.
- Built User management (`admin/users.html`) — invite/create, role change, disable/enable, password reset — backed by a new `supabase/functions/admin-create-user` Edge Function, the only place in the system that uses the `service_role` key (never committed, injected automatically by Supabase).
- Built the Activity Log viewer (`admin/activity-log.html`, Super Admin only) and Settings (`admin/settings.html`): export/import backup scoped to `announcements`/`gallery_images` only — accounts are deliberately excluded from both directions.
- Real dashboard home (`admin/dashboard.html`): stat cards (active/draft announcements, gallery totals, before/after count, recent uploads) and a recent-activity panel (Super Admin only).
- **Provisioned the live `SauberPlus-CMS` Supabase project** (EU/Frankfurt) via the Supabase CLI: linked the repo, applied and verified the schema live, deployed `admin-create-user` (with `--no-verify-jwt`, since the function does its own precise authorization check and the platform JWT gate would otherwise block the CORS preflight), configured Auth Site URL/redirect URLs/password policy, and wired the real Project URL + `sb_publishable_...` key into every config file and CSP placeholder.
- Ran Supabase's own security advisor against the live schema and fixed two real findings: every `SECURITY DEFINER` function had a broader `anon`/`authenticated` execute grant than intended (Supabase's default-privileges setup grants this at creation time; the original grants were additive-only and never revoked it), and the storage `SELECT` policy allowed public bucket-listing rather than just individual-file access. Both fixed live and folded back into `supabase/schema.sql`; see `supabase/hardening_2026-07-14.sql` for the exact patch.
- Caught and reverted a side effect of `supabase config push`: pushing the Auth URL/password-policy change also silently overwrote unrelated Auth settings (email confirmation requirement, email rate limit, OTP length, MFA TOTP, two OTP templates) from the local `config.toml`'s generic `init` defaults. Restored all of them; verified clean with a follow-up push showing no remaining diff.
- Live-verified end-to-end via direct REST calls: anon can read published content and nothing else, writes/uploads are correctly rejected, the Edge Function correctly rejects missing/invalid auth.
- **Remaining, and confirmed to have no CLI/API path that avoids the `service_role` key:** bootstrapping the first Super Admin (`auth.users` row creation is only possible via the GoTrue Admin API or the Dashboard's Add User screen). See `docs/admin-cms-setup.md` for the exact remaining step.

## 2026-07-06

- Created a clean project baseline for future SauberPlus maintenance.
- Legal pages are maintained as root `impressum.html` and `datenschutz.html`, with compatibility redirects for older paths.
- Moved production images to `images/sauberplus/`.
- Removed obsolete duplicate HTML page copies.
- Added project documentation and maintenance notes.
- Kept existing GitHub Pages deployment configuration.
