-- SauberPlus Admin CMS — Supabase schema
--
-- Apply once, in full, via the Supabase SQL Editor on a dedicated SauberPlus
-- project (never share this project with any other client project).
-- See docs/admin-cms-setup.md for the full provisioning walkthrough.
--
-- Design principles (see docs/admin-cms-setup.md for the full rationale):
--   - Row Level Security is the real permission boundary. Client-side role
--     checks in the dashboard are UX only.
--   - activity_log is only ever written by SECURITY DEFINER functions/triggers
--     below — no client role has direct INSERT/UPDATE/DELETE on it, so it
--     cannot be skipped or forged by the client.
--   - user_profiles has no INSERT/DELETE policy at all: new rows are created
--     only by the admin-create-user Edge Function (service role, bypasses
--     RLS by design); accounts are disabled, never hard-deleted.

-- ============================================================
-- Extensions
-- ============================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- Tables
-- ============================================================

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'content_manager' check (role in ('super_admin', 'content_manager')),
  disabled boolean not null default false,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_profiles is 'One row per admin/partner account, mirrors auth.users. Created only via the admin-create-user Edge Function.';

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('top_bar', 'homepage_banner', 'promo_section', 'popup', 'seasonal')),
  title text not null,
  description text not null default '',
  image_path text,
  button_label text,
  button_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'hidden')),
  start_date timestamptz,
  end_date timestamptz,
  sort_order integer not null default 1000,
  campaign_label text,
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A published (active) announcement can't have a button with no destination
  -- (or vice versa). Drafts are exempt so partial work-in-progress can be saved.
  constraint announcements_button_pair_check check (
    status = 'draft'
    or (button_label is null and button_url is null)
    or (button_label is not null and button_url is not null)
  )
);

comment on table public.announcements is 'Unified announcement/banner/popup/seasonal-campaign content. placement selects where it renders on the public site.';

create table public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('single', 'before_after')),
  image_path text,
  before_path text,
  after_path text,
  caption text,
  hidden boolean not null default false,
  sort_order integer not null default 1000,
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gallery_images_kind_paths_check check (
    (kind = 'single' and image_path is not null and before_path is null and after_path is null)
    or
    (kind = 'before_after' and image_path is null and before_path is not null and after_path is not null)
  )
);

comment on table public.gallery_images is 'Partner-managed gallery, separate from the existing hardcoded before/after grid in index.html#gallery (not migrated in v1).';

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

comment on table public.activity_log is 'Append-only audit trail. Only written by SECURITY DEFINER functions/triggers — no direct client grants.';

-- ============================================================
-- Helper functions (SECURITY DEFINER, search_path pinned)
-- ============================================================
-- Pinning search_path on every SECURITY DEFINER function is not optional
-- polish: an unpinned search_path on a SECURITY DEFINER function is a known
-- Postgres privilege-escalation vector (a caller could shadow an unqualified
-- identifier with an object in a schema they control).

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = (select auth.uid()) and role = 'super_admin' and disabled = false
  );
$$;

create or replace function public.is_content_manager()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = (select auth.uid()) and role = 'content_manager' and disabled = false
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.is_super_admin() or public.is_content_manager();
$$;

-- Account lockout — callable pre-authentication (anon), so must never error
-- and must never reveal whether an email exists (uniform shape either way).

create or replace function public.is_locked_out(p_email text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    (select locked_until > now() from public.user_profiles where lower(email) = lower(p_email)),
    false
  );
$$;

create or replace function public.register_failed_login(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.user_profiles
  set failed_login_count = failed_login_count + 1,
      updated_at = now()
  where lower(email) = lower(p_email)
  returning failed_login_count into v_count;

  -- 15 minutes, deliberately short: partner emails are already public on
  -- impressum.html, so a long lockout window would let anyone lock a real
  -- partner out of their own panel via their public email address.
  if v_count is not null and v_count >= 5 then
    update public.user_profiles
    set locked_until = now() + interval '15 minutes'
    where lower(email) = lower(p_email);
  end if;
end;
$$;

create or replace function public.register_successful_login(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  update public.user_profiles
  set failed_login_count = 0,
      locked_until = null,
      updated_at = now()
  where lower(email) = lower(p_email)
  returning id into v_user_id;

  if v_user_id is not null then
    insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id)
    values (v_user_id, p_email, 'login', 'user_profiles', v_user_id::text);
  end if;
end;
$$;

-- General-purpose logger for non-DDL events (logout, password-reset request,
-- bulk export/import) that the content-table triggers below don't cover.
-- The actor is always derived from auth.uid() server-side, never from a
-- client-supplied parameter, so a caller can log an event but can't forge
-- who performed it.
create or replace function public.log_activity(p_action text, p_entity_type text, p_entity_id text, p_new_value jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (
    (select auth.uid()),
    (select email from public.user_profiles where id = (select auth.uid())),
    p_action,
    p_entity_type,
    p_entity_id,
    p_new_value
  );
end;
$$;

-- Supabase's own default-privileges setup on the public schema grants
-- EXECUTE on new functions to anon/authenticated/service_role at creation
-- time — broader than several of these are meant to have (every single RLS
-- policy below also depends on is_staff()/is_super_admin() being callable
-- by `authenticated` specifically, which is not something to leave
-- implicit either way). Revoke from everyone first, then grant only the
-- intended precise set, so these are the actual effective permissions
-- rather than additions layered on top of a wider default.
revoke execute on function public.is_super_admin() from public, anon, authenticated;
revoke execute on function public.is_content_manager() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
revoke execute on function public.is_locked_out(text) from public, anon, authenticated;
revoke execute on function public.register_failed_login(text) from public, anon, authenticated;
revoke execute on function public.register_successful_login(text) from public, anon, authenticated;
revoke execute on function public.log_activity(text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_content_manager() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_locked_out(text) to anon, authenticated;
grant execute on function public.register_failed_login(text) to anon, authenticated;
grant execute on function public.register_successful_login(text) to authenticated;
grant execute on function public.log_activity(text, text, text, jsonb) to authenticated;

-- ============================================================
-- Activity log triggers (content tables)
-- ============================================================
-- AFTER-trigger, SECURITY DEFINER: fires on every insert/update/delete
-- regardless of who made the change or whether the calling admin page
-- remembered to log it, and can write to activity_log despite the caller
-- having no direct grant on that table.

create or replace function public.trg_log_content_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
begin
  select email into v_email from public.user_profiles where id = v_actor;

  if tg_op = 'INSERT' then
    insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
    values (v_actor, v_email, 'create', tg_table_name, new.id::text, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, previous_value, new_value)
    values (v_actor, v_email, 'update', tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, previous_value)
    values (v_actor, v_email, 'delete', tg_table_name, old.id::text, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

-- Trigger firing never needs an EXECUTE grant, and this should never be
-- callable directly via RPC (Supabase's default-privileges setup grants it
-- to anon/authenticated at creation time same as any other function, same
-- as the helper functions above — revoke it here too).
revoke execute on function public.trg_log_content_change() from public, anon, authenticated;

create trigger announcements_activity_log
after insert or update or delete on public.announcements
for each row execute function public.trg_log_content_change();

create trigger gallery_images_activity_log
after insert or update or delete on public.gallery_images
for each row execute function public.trg_log_content_change();

-- user_profiles: UPDATE only (role/disabled/display_name changes made by a
-- super admin through the normal RLS-guarded path). Row creation is logged
-- explicitly by the admin-create-user Edge Function instead, because that
-- insert runs under the service role (no auth.uid() JWT context to attribute
-- it to) — the function already validated the calling super admin's JWT
-- before invoking the service role, so it logs the real actor itself.
create trigger user_profiles_activity_log
after update on public.user_profiles
for each row execute function public.trg_log_content_change();

create or replace function public.trg_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.trg_touch_updated_at() from public, anon, authenticated;

create trigger announcements_touch_updated_at
before update on public.announcements
for each row execute function public.trg_touch_updated_at();

create trigger gallery_images_touch_updated_at
before update on public.gallery_images
for each row execute function public.trg_touch_updated_at();

create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row execute function public.trg_touch_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.user_profiles enable row level security;
alter table public.announcements enable row level security;
alter table public.gallery_images enable row level security;
alter table public.activity_log enable row level security;

-- Base table grants. RLS only restricts *rows* within whatever the base
-- GRANT already allows — without these, the roles below would be denied
-- entirely regardless of how permissive the policies are.
grant select on public.user_profiles to authenticated;
grant update on public.user_profiles to authenticated;
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant select on public.gallery_images to anon, authenticated;
grant insert, update, delete on public.gallery_images to authenticated;
grant select on public.activity_log to authenticated;
-- Deliberately no grant of any kind on activity_log INSERT/UPDATE/DELETE,
-- and no INSERT/DELETE grant on user_profiles, to anon or authenticated.

-- user_profiles ------------------------------------------------------------
create policy user_profiles_select_own_or_admin
on public.user_profiles for select
to authenticated
using (id = (select auth.uid()) or public.is_super_admin());

create policy user_profiles_update_admin_only
on public.user_profiles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- announcements --------------------------------------------------------------
create policy announcements_public_read
on public.announcements for select
to anon, authenticated
using (
  status = 'active'
  and (start_date is null or start_date <= now())
  and (end_date is null or end_date >= now())
);

create policy announcements_staff_read_all
on public.announcements for select
to authenticated
using (public.is_staff());

create policy announcements_staff_insert
on public.announcements for insert
to authenticated
with check (public.is_staff());

create policy announcements_staff_update
on public.announcements for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy announcements_staff_delete
on public.announcements for delete
to authenticated
using (public.is_staff());

-- gallery_images ---------------------------------------------------------------
create policy gallery_public_read
on public.gallery_images for select
to anon, authenticated
using (hidden = false);

create policy gallery_staff_read_all
on public.gallery_images for select
to authenticated
using (public.is_staff());

create policy gallery_staff_insert
on public.gallery_images for insert
to authenticated
with check (public.is_staff());

create policy gallery_staff_update
on public.gallery_images for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy gallery_staff_delete
on public.gallery_images for delete
to authenticated
using (public.is_staff());

-- activity_log ------------------------------------------------------------------
create policy activity_log_admin_read
on public.activity_log for select
to authenticated
using (public.is_super_admin());

-- ============================================================
-- Storage RLS policies
-- ============================================================
-- Create the 'cms-media' bucket itself via the Supabase Dashboard first
-- (Storage → New bucket → public, allowed MIME types image/jpeg,image/png,
-- image/webp, file size limit 5MB) — see docs/admin-cms-setup.md. Bucket
-- creation is deliberately done via the Dashboard/JS client, not raw SQL
-- insert into storage.buckets, since allowedMimeTypes/fileSizeLimit are the
-- officially documented, stable configuration surface; the policies below
-- reference the bucket by name and work regardless of how it was created.

-- No public SELECT policy: a public bucket already serves any object by
-- its known URL regardless of RLS (that's what "public bucket" means at
-- the Storage-API level) — SELECT on storage.objects only governs
-- bucket-listing/query access, which should be staff-only, not world-
-- readable (Supabase's own security advisor flags a public SELECT policy
-- here as "public bucket allows listing").
create policy cms_media_staff_read
on storage.objects for select
to authenticated
using (bucket_id = 'cms-media' and public.is_staff());

create policy cms_media_staff_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'cms-media' and public.is_staff());

create policy cms_media_staff_update
on storage.objects for update
to authenticated
using (bucket_id = 'cms-media' and public.is_staff())
with check (bucket_id = 'cms-media' and public.is_staff());

create policy cms_media_staff_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'cms-media' and public.is_staff());

-- ============================================================
-- Indexes
-- ============================================================

create index announcements_placement_status_idx on public.announcements (placement, status);
create index announcements_sort_order_idx on public.announcements (placement, sort_order);
create index gallery_images_sort_order_idx on public.gallery_images (sort_order);
create index activity_log_created_at_idx on public.activity_log (created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);
