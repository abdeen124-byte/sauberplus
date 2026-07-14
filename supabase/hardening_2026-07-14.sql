-- SauberPlus Admin CMS — security hardening patch, applied 2026-07-14
-- after Supabase's own security advisor flagged two real gaps once the
-- schema was live. Both fixes are folded into supabase/schema.sql for any
-- future fresh apply; this file is the incremental patch for the
-- already-provisioned project (schema.sql isn't idempotent enough to
-- safely re-run in full against a database that already has this schema).

-- 1) Every SECURITY DEFINER function had an explicit EXECUTE grant to
-- anon/authenticated beyond what schema.sql intended — Supabase's own
-- default-privileges setup on the public schema grants these at creation
-- time, so schema.sql's grants (additive only, never revoking) left the
-- broader default grant in place underneath. Revoking from every relevant
-- role first, then re-granting only the intended precise set, removes the
-- broader default rather than layering on top of it.
revoke execute on function public.is_super_admin() from public, anon, authenticated;
revoke execute on function public.is_content_manager() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
revoke execute on function public.is_locked_out(text) from public, anon, authenticated;
revoke execute on function public.register_failed_login(text) from public, anon, authenticated;
revoke execute on function public.register_successful_login(text) from public, anon, authenticated;
revoke execute on function public.log_activity(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.trg_log_content_change() from public, anon, authenticated;
revoke execute on function public.trg_touch_updated_at() from public, anon, authenticated;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_content_manager() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_locked_out(text) to anon, authenticated;
grant execute on function public.register_failed_login(text) to anon, authenticated;
grant execute on function public.register_successful_login(text) to authenticated;
grant execute on function public.log_activity(text, text, text, jsonb) to authenticated;
-- trg_log_content_change / trg_touch_updated_at: intentionally no grant to
-- anyone. Trigger firing does not require an EXECUTE grant; direct RPC
-- calls to these are not a supported/needed path.

-- 2) The public-read storage policy allowed LIST (SELECT on storage.objects
-- metadata), not just individual-file GET — broader than needed. A public
-- bucket already serves any file by its known URL regardless of RLS; SELECT
-- on storage.objects only governs bucket-listing/query access, which only
-- staff should have. (Already applied in the first pass of this file; kept
-- here, idempotent via IF EXISTS/OR REPLACE-equivalent guards, so this
-- whole file is safe to run again.)
drop policy if exists cms_media_public_read on storage.objects;
drop policy if exists cms_media_staff_read on storage.objects;

create policy cms_media_staff_read
on storage.objects for select
to authenticated
using (bucket_id = 'cms-media' and public.is_staff());
