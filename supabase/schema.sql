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
  archived_at timestamptz,
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
-- ============================================================
-- Employee time tracking, schedules and absences
-- ============================================================

-- ---------------------------------------------------------------------------
-- Existing authentication hardening required before employee accounts exist
-- ---------------------------------------------------------------------------

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('super_admin', 'content_manager', 'employee'));

-- Preserve the current client signature but derive identity exclusively from
-- auth.uid(). A caller-supplied email must not clear another account's lockout.
create or replace function public.register_successful_login(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  update public.user_profiles
  set failed_login_count = 0,
      locked_until = null,
      updated_at = now()
  where id = v_user_id
  returning email into v_email;

  if v_email is null then
    raise exception using errcode = 'P0002', message = 'The authenticated profile could not be found.';
  end if;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id)
  values (v_user_id, v_email, 'login', 'user_profiles', v_user_id::text);
end;
$$;

-- Employees are authenticated users but are not CMS staff. Prevent them from
-- creating arbitrary audit records through this existing general-purpose RPC.
create or replace function public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_new_value jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;

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

-- ---------------------------------------------------------------------------
-- Workforce data model
-- ---------------------------------------------------------------------------

create table public.work_sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text not null default '',
  timezone_name text not null default 'Europe/Berlin',
  active boolean not null default true,
  notes text not null default '',
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_sites_code_check check (char_length(btrim(code)) between 1 and 40),
  constraint work_sites_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint work_sites_address_check check (char_length(address) <= 500),
  constraint work_sites_timezone_check check (timezone_name = 'Europe/Berlin'),
  constraint work_sites_notes_check check (char_length(notes) <= 2000)
);

create table public.employees (
  id uuid primary key references public.user_profiles (id) on delete cascade,
  employee_number text not null unique,
  phone text not null default '',
  employment_start_date date,
  employment_end_date date,
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_number_check check (char_length(btrim(employee_number)) between 1 and 40),
  constraint employees_phone_check check (char_length(phone) <= 50),
  constraint employees_employment_dates_check check (
    employment_end_date is null
    or employment_start_date is null
    or employment_end_date >= employment_start_date
  )
);

create table public.employee_work_sites (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_site_id uuid not null references public.work_sites (id) on delete restrict,
  is_primary boolean not null default false,
  valid_from date,
  valid_until date,
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_work_sites_dates_check check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  )
);

create table public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  work_site_id uuid not null references public.work_sites (id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes text not null default '',
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_shifts_time_check check (scheduled_end > scheduled_start),
  constraint work_shifts_notes_check check (char_length(notes) <= 1000),
  constraint work_shifts_identity_unique unique (id, employee_id, work_site_id)
);

create table public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  absence_type text not null check (absence_type in ('vacation', 'sick')),
  start_date date not null,
  end_date date not null,
  approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected', 'cancelled')),
  notes text not null default '',
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_absences_dates_check check (end_date >= start_date),
  constraint employee_absences_notes_check check (char_length(notes) <= 1000)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  work_site_id uuid not null references public.work_sites (id) on delete restrict,
  shift_id uuid,
  work_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('working', 'paused', 'completed')),
  note text not null default '',
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_shift_match_fk
    foreign key (shift_id, employee_id, work_site_id)
    references public.work_shifts (id, employee_id, work_site_id),
  constraint time_entries_state_check check (
    (status in ('working', 'paused') and ended_at is null)
    or (status = 'completed' and ended_at is not null)
  ),
  constraint time_entries_time_check check (ended_at is null or ended_at >= started_at),
  constraint time_entries_note_check check (char_length(note) <= 1000)
);

create table public.time_breaks (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_by uuid references public.user_profiles (id),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_breaks_time_check check (ended_at is null or ended_at >= started_at)
);

create table public.time_entry_events (
  id bigint generated always as identity primary key,
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  request_id uuid not null,
  event_type text not null check (event_type in ('start', 'pause', 'resume', 'end', 'note_update')),
  recorded_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid not null references public.user_profiles (id),
  metadata jsonb not null default '{}'::jsonb,
  constraint time_entry_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint time_entry_events_request_unique unique (employee_id, request_id)
);

comment on table public.work_sites is 'Cleaning objects and Einsatzorte used by schedules and time entries.';
comment on table public.employees is 'Workforce data for an Auth-backed user with the employee application role.';
comment on table public.employee_work_sites is 'Date-bounded employee-to-work-site assignments.';
comment on table public.work_shifts is 'Planned Dienstplan shifts stored as absolute timestamps.';
comment on table public.employee_absences is 'Vacation and sickness periods without medical documents or diagnoses.';
comment on table public.time_entries is 'Actual work sessions changed only through audited database RPCs.';
comment on table public.time_breaks is 'Pause intervals belonging to an actual work session.';
comment on table public.time_entry_events is 'Append-only, idempotent audit events for clock actions.';

create unique index employee_work_sites_unique_assignment_idx
  on public.employee_work_sites (
    employee_id,
    work_site_id,
    coalesce(valid_from, '-infinity'::date)
  );

create unique index employee_work_sites_one_current_primary_idx
  on public.employee_work_sites (employee_id)
  where is_primary = true and valid_until is null;

create unique index time_entries_one_open_per_employee_idx
  on public.time_entries (employee_id)
  where status in ('working', 'paused');
create unique index time_breaks_one_open_per_entry_idx
  on public.time_breaks (time_entry_id)
  where ended_at is null;

create index employee_work_sites_employee_dates_idx
  on public.employee_work_sites (employee_id, valid_from, valid_until);
create index employee_work_sites_site_employee_idx
  on public.employee_work_sites (work_site_id, employee_id);
create index work_shifts_employee_start_idx
  on public.work_shifts (employee_id, scheduled_start);
create index work_shifts_site_start_idx
  on public.work_shifts (work_site_id, scheduled_start);
create index employee_absences_employee_dates_idx
  on public.employee_absences (employee_id, start_date, end_date);
create index time_entries_employee_date_idx
  on public.time_entries (employee_id, work_date desc);
create index time_entries_site_date_idx
  on public.time_entries (work_site_id, work_date desc);
create index time_entry_events_entry_time_idx
  on public.time_entry_events (time_entry_id, recorded_at);

-- ---------------------------------------------------------------------------
-- Role, access and integrity helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_employee()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.employees employee on employee.id = profile.id
    where profile.id = (select auth.uid())
      and profile.role = 'employee'
      and profile.disabled = false
      and (
        employee.employment_start_date is null
        or employee.employment_start_date <= (clock_timestamp() at time zone 'Europe/Berlin')::date
      )
      and (
        employee.employment_end_date is null
        or employee.employment_end_date >= (clock_timestamp() at time zone 'Europe/Berlin')::date
      )
  );
$$;

create or replace function public.employee_can_read_work_site(p_work_site_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.is_super_admin()
    or (
      public.is_employee()
      and (
        exists (
          select 1
          from public.employee_work_sites assignment
          where assignment.employee_id = (select auth.uid())
            and assignment.work_site_id = p_work_site_id
        )
        or exists (
          select 1
          from public.work_shifts shift
          where shift.employee_id = (select auth.uid())
            and shift.work_site_id = p_work_site_id
        )
        or exists (
          select 1
          from public.time_entries entry
          where entry.employee_id = (select auth.uid())
            and entry.work_site_id = p_work_site_id
        )
      )
    );
$$;

create or replace function public.employee_can_clock_at_work_site(p_work_site_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.is_employee()
    and exists (
      select 1
      from public.work_sites site
      where site.id = p_work_site_id
        and site.active = true
        and (
          exists (
            select 1
            from public.employee_work_sites assignment
            where assignment.employee_id = (select auth.uid())
              and assignment.work_site_id = site.id
              and (
                assignment.valid_from is null
                or assignment.valid_from <= (clock_timestamp() at time zone site.timezone_name)::date
              )
              and (
                assignment.valid_until is null
                or assignment.valid_until >= (clock_timestamp() at time zone site.timezone_name)::date
              )
          )
          or exists (
            select 1
            from public.work_shifts shift
            where shift.employee_id = (select auth.uid())
              and shift.work_site_id = site.id
              and shift.status = 'scheduled'
              and (shift.scheduled_start at time zone site.timezone_name)::date =
                  (clock_timestamp() at time zone site.timezone_name)::date
          )
        )
    );
$$;

create or replace function public.trg_validate_employee_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = new.id and profile.role = 'employee'
  ) then
    raise exception using errcode = '23514', message = 'Employee records require an employee user profile.';
  end if;
  return new;
end;
$$;

create or replace function public.trg_prevent_employee_role_mismatch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role <> 'employee' and new.role = 'employee' then
    raise exception using errcode = '23514', message = 'Use employee provisioning instead of changing an account role directly.';
  end if;

  if new.role <> 'employee'
    and exists (select 1 from public.employees employee where employee.id = new.id) then
    raise exception using errcode = '23514', message = 'Remove the employee record before changing this account role.';
  end if;
  return new;
end;
$$;

create or replace function public.trg_validate_employee_work_site_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_period daterange := daterange(
    coalesce(new.valid_from, '-infinity'::date),
    coalesce(new.valid_until, 'infinity'::date),
    '[]'
  );
begin
  perform pg_advisory_xact_lock(hashtextextended('work-site-assignment:' || new.employee_id::text, 0));

  if exists (
    select 1
    from public.employee_work_sites existing
    where existing.employee_id = new.employee_id
      and existing.id <> new.id
      and existing.work_site_id = new.work_site_id
      and daterange(
        coalesce(existing.valid_from, '-infinity'::date),
        coalesce(existing.valid_until, 'infinity'::date),
        '[]'
      ) && v_new_period
  ) then
    raise exception using errcode = '23P01', message = 'The employee already has an overlapping assignment for this work site.';
  end if;

  if new.is_primary and exists (
    select 1
    from public.employee_work_sites existing
    where existing.employee_id = new.employee_id
      and existing.id <> new.id
      and existing.is_primary = true
      and daterange(
        coalesce(existing.valid_from, '-infinity'::date),
        coalesce(existing.valid_until, 'infinity'::date),
        '[]'
      ) && v_new_period
  ) then
    raise exception using errcode = '23P01', message = 'The employee already has a primary work site for this period.';
  end if;

  return new;
end;
$$;

create or replace function public.trg_validate_work_shift_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('work-shift:' || new.employee_id::text, 0));

  if new.status = 'scheduled' and exists (
    select 1
    from public.work_shifts existing
    where existing.employee_id = new.employee_id
      and existing.id <> new.id
      and existing.status = 'scheduled'
      and tstzrange(existing.scheduled_start, existing.scheduled_end, '[)')
          && tstzrange(new.scheduled_start, new.scheduled_end, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'The employee already has an overlapping scheduled shift.';
  end if;

  return new;
end;
$$;

create or replace function public.trg_validate_employee_absence_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('absence:' || new.employee_id::text, 0));

  if new.approval_status in ('pending', 'approved') and exists (
    select 1
    from public.employee_absences existing
    where existing.employee_id = new.employee_id
      and existing.id <> new.id
      and existing.approval_status in ('pending', 'approved')
      and daterange(existing.start_date, existing.end_date, '[]')
          && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception using errcode = '23P01', message = 'The employee already has an overlapping absence.';
  end if;

  return new;
end;
$$;

create or replace function public.trg_log_workforce_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_previous jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_current jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_entity_id text := coalesce(v_current ->> 'id', v_previous ->> 'id');
begin
  if v_actor is null then
    v_actor := coalesce(
      nullif(v_current ->> 'updated_by', '')::uuid,
      nullif(v_current ->> 'created_by', '')::uuid,
      nullif(v_previous ->> 'updated_by', '')::uuid,
      nullif(v_previous ->> 'created_by', '')::uuid
    );
  end if;

  select email into v_email from public.user_profiles where id = v_actor;

  insert into public.activity_log (
    actor_user_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  ) values (
    v_actor,
    v_email,
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    tg_table_name,
    v_entity_id,
    v_previous,
    v_current
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Krank notes may contain sensitive health context. Audit only structured
-- fields and never duplicate the free-text note into activity_log.
create or replace function public.trg_log_absence_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_previous jsonb;
  v_current jsonb;
begin
  if tg_op <> 'INSERT' then
    v_previous := jsonb_build_object(
      'id', old.id,
      'employee_id', old.employee_id,
      'absence_type', old.absence_type,
      'start_date', old.start_date,
      'end_date', old.end_date,
      'approval_status', old.approval_status
    );
  end if;

  if tg_op <> 'DELETE' then
    v_current := jsonb_build_object(
      'id', new.id,
      'employee_id', new.employee_id,
      'absence_type', new.absence_type,
      'start_date', new.start_date,
      'end_date', new.end_date,
      'approval_status', new.approval_status
    );
  end if;

  if v_actor is null then
    if tg_op = 'INSERT' then
      v_actor := coalesce(new.updated_by, new.created_by);
    elsif tg_op = 'DELETE' then
      v_actor := coalesce(old.updated_by, old.created_by);
    else
      v_actor := coalesce(new.updated_by, new.created_by, old.updated_by, old.created_by);
    end if;
  end if;
  select email into v_email from public.user_profiles where id = v_actor;

  insert into public.activity_log (
    actor_user_id, actor_email, action, entity_type, entity_id, previous_value, new_value
  ) values (
    v_actor,
    v_email,
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    tg_table_name,
    case when tg_op = 'DELETE' then old.id::text else new.id::text end,
    v_previous,
    v_current
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactional account provisioning used by the existing Edge Function
-- ---------------------------------------------------------------------------

create or replace function public.provision_user_profile(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_created_by uuid,
  p_employee_number text default null,
  p_phone text default '',
  p_employment_start_date date default null,
  p_employment_end_date date default null,
  p_primary_work_site_id uuid default null
)
returns table (
  profile_id uuid,
  profile_email text,
  display_name text,
  profile_role text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_employee_number text := btrim(coalesce(p_employee_number, ''));
begin
  if not exists (
    select 1
    from public.user_profiles creator
    where creator.id = p_created_by
      and creator.role = 'super_admin'
      and creator.disabled = false
  ) then
    raise exception using errcode = '42501', message = 'Only an active Super Admin can provision accounts.';
  end if;

  if p_user_id is null or v_email = '' or v_display_name = '' then
    raise exception using errcode = '23502', message = 'User id, email and display name are required.';
  end if;

  if char_length(v_display_name) > 120 then
    raise exception using errcode = '22001', message = 'The display name is too long.';
  end if;

  if v_role not in ('super_admin', 'content_manager', 'employee') then
    raise exception using errcode = '22023', message = 'The requested account role is invalid.';
  end if;

  if v_role = 'employee' and v_employee_number = '' then
    raise exception using errcode = '23502', message = 'An employee number is required.';
  end if;

  if v_role <> 'employee' and (
    p_employee_number is not null
    or btrim(coalesce(p_phone, '')) <> ''
    or p_employment_start_date is not null
    or p_employment_end_date is not null
    or p_primary_work_site_id is not null
  ) then
    raise exception using errcode = '22023', message = 'Employee fields require the employee role.';
  end if;

  if p_primary_work_site_id is not null and not exists (
    select 1 from public.work_sites site where site.id = p_primary_work_site_id and site.active = true
  ) then
    raise exception using errcode = '22023', message = 'The primary work site is unavailable.';
  end if;

  insert into public.user_profiles (id, email, display_name, role, created_by)
  values (p_user_id, v_email, v_display_name, v_role, p_created_by);

  insert into public.activity_log (
    actor_user_id, actor_email, action, entity_type, entity_id, new_value
  ) values (
    p_created_by,
    (select email from public.user_profiles where id = p_created_by),
    'create',
    'user_profiles',
    p_user_id::text,
    jsonb_build_object('email', v_email, 'display_name', v_display_name, 'role', v_role)
  );

  if v_role = 'employee' then
    insert into public.employees (
      id,
      employee_number,
      phone,
      employment_start_date,
      employment_end_date,
      created_by,
      updated_by
    ) values (
      p_user_id,
      v_employee_number,
      btrim(coalesce(p_phone, '')),
      p_employment_start_date,
      p_employment_end_date,
      p_created_by,
      p_created_by
    );

    if p_primary_work_site_id is not null then
      insert into public.employee_work_sites (
        employee_id,
        work_site_id,
        is_primary,
        valid_from,
        created_by,
        updated_by
      ) values (
        p_user_id,
        p_primary_work_site_id,
        true,
        coalesce(p_employment_start_date, (clock_timestamp() at time zone 'Europe/Berlin')::date),
        p_created_by,
        p_created_by
      );
    end if;
  end if;

  return query select p_user_id, v_email, v_display_name, v_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Time calculations and server-authored clock state transitions
-- ---------------------------------------------------------------------------

create view public.time_entry_totals
with (security_invoker = true)
as
select
  entry.id,
  entry.employee_id,
  entry.work_site_id,
  entry.shift_id,
  entry.work_date,
  entry.started_at,
  entry.ended_at,
  entry.status,
  entry.note,
  entry.created_at,
  entry.updated_at,
  break_totals.break_seconds,
  greatest(
    0,
    floor(extract(epoch from (coalesce(entry.ended_at, clock_timestamp()) - entry.started_at)))::bigint
      - break_totals.break_seconds
  ) as worked_seconds
from public.time_entries entry
left join lateral (
  select coalesce(
    sum(
      greatest(
        0,
        floor(extract(epoch from (coalesce(brk.ended_at, clock_timestamp()) - brk.started_at)))::bigint
      )
    ),
    0
  )::bigint as break_seconds
  from public.time_breaks brk
  where brk.time_entry_id = entry.id
) break_totals on true;

create view public.time_daily_totals
with (security_invoker = true)
as
select
  employee_id,
  work_site_id,
  work_date,
  sum(worked_seconds)::bigint as worked_seconds
from public.time_entry_totals
group by employee_id, work_site_id, work_date;

create or replace function public.record_time_event(
  p_action text,
  p_request_id uuid,
  p_work_site_id uuid default null,
  p_shift_id uuid default null,
  p_note text default null
)
returns table (
  entry_id uuid,
  employee_id uuid,
  work_site_id uuid,
  shift_id uuid,
  work_date date,
  started_at timestamptz,
  ended_at timestamptz,
  entry_status text,
  active_break_started_at timestamptz,
  break_seconds bigint,
  worked_seconds bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := (select auth.uid());
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_now timestamptz;
  v_entry public.time_entries%rowtype;
  v_existing_event public.time_entry_events%rowtype;
  v_timezone_name text;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_employee_id is null or p_request_id is null then
    raise exception using errcode = '23502', message = 'Authentication and request id are required.';
  end if;

  if v_action not in ('start', 'pause', 'resume', 'end') then
    raise exception using errcode = '22023', message = 'Unsupported time action.';
  end if;

  if char_length(v_note) > 1000 then
    raise exception using errcode = '22001', message = 'The work note is too long.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));

  perform 1
  from public.user_profiles profile
  join public.employees employee on employee.id = profile.id
  where profile.id = v_employee_id
    and profile.role = 'employee'
    and profile.disabled = false
    and (
      employee.employment_start_date is null
      or employee.employment_start_date <= (clock_timestamp() at time zone 'Europe/Berlin')::date
    )
    and (
      employee.employment_end_date is null
      or employee.employment_end_date >= (clock_timestamp() at time zone 'Europe/Berlin')::date
    )
  for update of profile, employee;

  if not found then
    raise exception using errcode = '42501', message = 'Employee account is not active.';
  end if;

  v_now := clock_timestamp();

  select event.*
    into v_existing_event
  from public.time_entry_events event
  where event.employee_id = v_employee_id
    and event.request_id = p_request_id;

  if v_existing_event.id is not null then
    if v_existing_event.event_type <> v_action then
      raise exception using errcode = '23505', message = 'The request id was already used for another action.';
    end if;

    return query
    select
      totals.id,
      totals.employee_id,
      totals.work_site_id,
      totals.shift_id,
      totals.work_date,
      totals.started_at,
      totals.ended_at,
      totals.status,
      open_break.started_at,
      totals.break_seconds,
      totals.worked_seconds,
      v_now
    from public.time_entry_totals totals
    left join public.time_breaks open_break
      on open_break.time_entry_id = totals.id and open_break.ended_at is null
    where totals.id = v_existing_event.time_entry_id;
    return;
  end if;

  if v_action = 'start' then
    if p_work_site_id is null then
      raise exception using errcode = '23502', message = 'A work site is required.';
    end if;

    select site.timezone_name
      into v_timezone_name
    from public.work_sites site
    where site.id = p_work_site_id and site.active = true;

    if v_timezone_name is null then
      raise exception using errcode = '22023', message = 'The selected work site is unavailable.';
    end if;

    if not public.employee_can_clock_at_work_site(p_work_site_id) then
      raise exception using errcode = '42501', message = 'The employee is not assigned to this work site today.';
    end if;

    if exists (
      select 1
      from public.employee_absences absence
      where absence.employee_id = v_employee_id
        and absence.approval_status = 'approved'
        and absence.start_date <= (v_now at time zone v_timezone_name)::date
        and absence.end_date >= (v_now at time zone v_timezone_name)::date
    ) then
      raise exception using errcode = '55000', message = 'Time tracking is unavailable during an approved absence.';
    end if;

    if p_shift_id is not null and not exists (
      select 1
      from public.work_shifts shift
      where shift.id = p_shift_id
        and shift.employee_id = v_employee_id
        and shift.work_site_id = p_work_site_id
        and shift.status = 'scheduled'
    ) then
      raise exception using errcode = '22023', message = 'The selected shift is invalid.';
    end if;

    if exists (
      select 1
      from public.time_entries existing
      where existing.employee_id = v_employee_id
        and existing.status in ('working', 'paused')
    ) then
      raise exception using errcode = '23505', message = 'An active work session already exists.';
    end if;

    insert into public.time_entries (
      employee_id,
      work_site_id,
      shift_id,
      work_date,
      started_at,
      status,
      note,
      created_by,
      updated_by
    ) values (
      v_employee_id,
      p_work_site_id,
      p_shift_id,
      (v_now at time zone v_timezone_name)::date,
      v_now,
      'working',
      v_note,
      v_employee_id,
      v_employee_id
    )
    returning * into v_entry;
  else
    select existing.*
      into v_entry
    from public.time_entries existing
    where existing.employee_id = v_employee_id
      and existing.status in ('working', 'paused')
    order by existing.started_at desc
    limit 1
    for update;

    if v_entry.id is null then
      raise exception using errcode = 'P0002', message = 'No active work session exists.';
    end if;

    if v_action = 'pause' then
      if v_entry.status <> 'working' then
        raise exception using errcode = '55000', message = 'The work session is already paused.';
      end if;

      insert into public.time_breaks (
        time_entry_id, started_at, created_by, updated_by
      ) values (
        v_entry.id, v_now, v_employee_id, v_employee_id
      );

      update public.time_entries
      set status = 'paused',
          note = case when v_note = '' then note else v_note end,
          updated_by = v_employee_id
      where id = v_entry.id
      returning * into v_entry;
    elsif v_action = 'resume' then
      if v_entry.status <> 'paused' then
        raise exception using errcode = '55000', message = 'The work session is not paused.';
      end if;

      update public.time_breaks
      set ended_at = v_now, updated_by = v_employee_id
      where time_entry_id = v_entry.id and ended_at is null;

      if not found then
        raise exception using errcode = 'P0002', message = 'The open break could not be found.';
      end if;

      update public.time_entries
      set status = 'working',
          note = case when v_note = '' then note else v_note end,
          updated_by = v_employee_id
      where id = v_entry.id
      returning * into v_entry;
    elsif v_action = 'end' then
      if v_entry.status = 'paused' then
        update public.time_breaks
        set ended_at = v_now, updated_by = v_employee_id
        where time_entry_id = v_entry.id and ended_at is null;

        if not found then
          raise exception using errcode = 'P0002', message = 'The open break could not be found.';
        end if;
      end if;

      update public.time_entries
      set status = 'completed',
          ended_at = v_now,
          note = case when v_note = '' then note else v_note end,
          updated_by = v_employee_id
      where id = v_entry.id
      returning * into v_entry;
    end if;
  end if;

  insert into public.time_entry_events (
    time_entry_id,
    employee_id,
    request_id,
    event_type,
    recorded_at,
    actor_user_id
  ) values (
    v_entry.id,
    v_employee_id,
    p_request_id,
    v_action,
    v_now,
    v_employee_id
  );

  return query
  select
    totals.id,
    totals.employee_id,
    totals.work_site_id,
    totals.shift_id,
    totals.work_date,
    totals.started_at,
    totals.ended_at,
    totals.status,
    open_break.started_at,
    totals.break_seconds,
    totals.worked_seconds,
    v_now
  from public.time_entry_totals totals
  left join public.time_breaks open_break
    on open_break.time_entry_id = totals.id and open_break.ended_at is null
  where totals.id = v_entry.id;
end;
$$;

create or replace function public.get_my_time_state()
returns table (
  entry_id uuid,
  work_site_id uuid,
  shift_id uuid,
  work_date date,
  started_at timestamptz,
  entry_status text,
  active_break_started_at timestamptz,
  break_seconds bigint,
  worked_seconds bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_employee_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
begin
  if v_employee_id is null or not public.is_employee() then
    raise exception using errcode = '42501', message = 'Employee account is not active.';
  end if;

  return query
  select
    totals.id,
    totals.work_site_id,
    totals.shift_id,
    totals.work_date,
    totals.started_at,
    totals.status,
    open_break.started_at,
    totals.break_seconds,
    totals.worked_seconds,
    v_now
  from public.time_entry_totals totals
  left join public.time_breaks open_break
    on open_break.time_entry_id = totals.id and open_break.ended_at is null
  where totals.employee_id = v_employee_id
    and totals.status in ('working', 'paused')
  order by totals.started_at desc
  limit 1;
end;
$$;

create or replace function public.update_own_time_entry_note(
  p_time_entry_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := (select auth.uid());
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_employee_id is null or not public.is_employee() then
    raise exception using errcode = '42501', message = 'Employee account is not active.';
  end if;

  if char_length(v_note) > 1000 then
    raise exception using errcode = '22001', message = 'The work note is too long.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));

  update public.time_entries
  set note = v_note, updated_by = v_employee_id
  where id = p_time_entry_id and employee_id = v_employee_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The work session could not be found.';
  end if;

  insert into public.time_entry_events (
    time_entry_id,
    employee_id,
    request_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    p_time_entry_id,
    v_employee_id,
    gen_random_uuid(),
    'note_update',
    v_employee_id,
    jsonb_build_object('note_length', char_length(v_note))
  );
end;
$$;

create or replace function public.get_time_summary(
  p_employee_id uuid,
  p_from date,
  p_to date,
  p_bucket text default 'day',
  p_work_site_id uuid default null
)
returns table (
  period_start date,
  worked_seconds bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
stable
as $$
declare
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
begin
  if p_employee_id is null or p_from is null or p_to is null then
    raise exception using errcode = '23502', message = 'Employee and date range are required.';
  end if;

  if p_to < p_from or p_to - p_from > 370 then
    raise exception using errcode = '22023', message = 'The report date range is invalid.';
  end if;

  if v_bucket not in ('day', 'week', 'month') then
    raise exception using errcode = '22023', message = 'The report bucket is invalid.';
  end if;

  if not public.is_super_admin()
    and (not public.is_employee() or p_employee_id <> (select auth.uid())) then
    raise exception using errcode = '42501', message = 'The requested report is not permitted.';
  end if;

  return query
  select
    case v_bucket
      when 'week' then date_trunc('week', daily.work_date::timestamp)::date
      when 'month' then date_trunc('month', daily.work_date::timestamp)::date
      else daily.work_date
    end,
    sum(daily.worked_seconds)::bigint
  from public.time_daily_totals daily
  where daily.employee_id = p_employee_id
    and daily.work_date between p_from and p_to
    and (p_work_site_id is null or daily.work_site_id = p_work_site_id)
  group by 1
  order by 1;
end;
$$;

create or replace function public.update_employee_account(
  p_employee_id uuid,
  p_display_name text,
  p_employee_number text,
  p_phone text default '',
  p_employment_start_date date default null,
  p_employment_end_date date default null,
  p_disabled boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_employee_number text := btrim(coalesce(p_employee_number, ''));
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Only a Super Admin can update employee accounts.';
  end if;

  if p_employee_id is null or v_display_name = '' or v_employee_number = '' then
    raise exception using errcode = '23502', message = 'Employee, display name and employee number are required.';
  end if;

  if char_length(v_display_name) > 120 then
    raise exception using errcode = '22001', message = 'The display name is too long.';
  end if;

  update public.user_profiles
  set display_name = v_display_name,
      disabled = coalesce(p_disabled, false),
      updated_at = clock_timestamp()
  where id = p_employee_id and role = 'employee';

  if not found then
    raise exception using errcode = 'P0002', message = 'The employee profile could not be found.';
  end if;

  update public.employees
  set employee_number = v_employee_number,
      phone = btrim(coalesce(p_phone, '')),
      employment_start_date = p_employment_start_date,
      employment_end_date = p_employment_end_date,
      updated_by = v_actor
  where id = p_employee_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The employee record could not be found.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges and triggers
-- ---------------------------------------------------------------------------

revoke execute on function public.is_employee() from public, anon, authenticated;
revoke execute on function public.employee_can_read_work_site(uuid) from public, anon, authenticated;
revoke execute on function public.employee_can_clock_at_work_site(uuid) from public, anon, authenticated;
revoke execute on function public.trg_validate_employee_profile_role() from public, anon, authenticated;
revoke execute on function public.trg_prevent_employee_role_mismatch() from public, anon, authenticated;
revoke execute on function public.trg_validate_employee_work_site_overlap() from public, anon, authenticated;
revoke execute on function public.trg_validate_work_shift_overlap() from public, anon, authenticated;
revoke execute on function public.trg_validate_employee_absence_overlap() from public, anon, authenticated;
revoke execute on function public.trg_log_workforce_change() from public, anon, authenticated;
revoke execute on function public.trg_log_absence_change() from public, anon, authenticated;
revoke execute on function public.provision_user_profile(uuid, text, text, text, uuid, text, text, date, date, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.record_time_event(text, uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.get_my_time_state() from public, anon, authenticated;
revoke execute on function public.update_own_time_entry_note(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_time_summary(uuid, date, date, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.update_employee_account(uuid, text, text, text, date, date, boolean)
  from public, anon, authenticated;

grant execute on function public.is_employee() to authenticated;
grant execute on function public.employee_can_read_work_site(uuid) to authenticated;
grant execute on function public.employee_can_clock_at_work_site(uuid) to authenticated;
grant execute on function public.provision_user_profile(uuid, text, text, text, uuid, text, text, date, date, uuid)
  to service_role;
grant execute on function public.record_time_event(text, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.get_my_time_state() to authenticated;
grant execute on function public.update_own_time_entry_note(uuid, text) to authenticated;
grant execute on function public.get_time_summary(uuid, date, date, text, uuid) to authenticated;
grant execute on function public.update_employee_account(uuid, text, text, text, date, date, boolean)
  to authenticated;

create trigger employees_validate_profile_role
before insert or update of id on public.employees
for each row execute function public.trg_validate_employee_profile_role();

create trigger user_profiles_prevent_employee_role_mismatch
before update of role on public.user_profiles
for each row execute function public.trg_prevent_employee_role_mismatch();

create trigger employee_work_sites_validate_overlap
before insert or update of employee_id, work_site_id, is_primary, valid_from, valid_until
on public.employee_work_sites
for each row execute function public.trg_validate_employee_work_site_overlap();

create trigger work_shifts_validate_overlap
before insert or update of employee_id, scheduled_start, scheduled_end, status on public.work_shifts
for each row execute function public.trg_validate_work_shift_overlap();

create trigger employee_absences_validate_overlap
before insert or update of employee_id, start_date, end_date, approval_status on public.employee_absences
for each row execute function public.trg_validate_employee_absence_overlap();

create trigger work_sites_activity_log
after insert or update or delete on public.work_sites
for each row execute function public.trg_log_workforce_change();
create trigger employees_activity_log
after insert or update or delete on public.employees
for each row execute function public.trg_log_workforce_change();
create trigger employee_work_sites_activity_log
after insert or update or delete on public.employee_work_sites
for each row execute function public.trg_log_workforce_change();
create trigger work_shifts_activity_log
after insert or update or delete on public.work_shifts
for each row execute function public.trg_log_workforce_change();
create trigger employee_absences_activity_log
after insert or update or delete on public.employee_absences
for each row execute function public.trg_log_absence_change();

create trigger work_sites_touch_updated_at
before update on public.work_sites
for each row execute function public.trg_touch_updated_at();
create trigger employees_touch_updated_at
before update on public.employees
for each row execute function public.trg_touch_updated_at();
create trigger employee_work_sites_touch_updated_at
before update on public.employee_work_sites
for each row execute function public.trg_touch_updated_at();
create trigger work_shifts_touch_updated_at
before update on public.work_shifts
for each row execute function public.trg_touch_updated_at();
create trigger employee_absences_touch_updated_at
before update on public.employee_absences
for each row execute function public.trg_touch_updated_at();
create trigger time_entries_touch_updated_at
before update on public.time_entries
for each row execute function public.trg_touch_updated_at();
create trigger time_breaks_touch_updated_at
before update on public.time_breaks
for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS and base grants
-- ---------------------------------------------------------------------------

alter table public.work_sites enable row level security;
alter table public.employees enable row level security;
alter table public.employee_work_sites enable row level security;
alter table public.work_shifts enable row level security;
alter table public.employee_absences enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_breaks enable row level security;
alter table public.time_entry_events enable row level security;

grant select, insert, update on public.work_sites to authenticated;
grant select, update on public.employees to authenticated;
grant select, insert, update on public.employee_work_sites to authenticated;
grant select, insert, update on public.work_shifts to authenticated;
grant select, insert, update on public.employee_absences to authenticated;
grant select on public.time_entries to authenticated;
grant select on public.time_breaks to authenticated;
grant select on public.time_entry_events to authenticated;
grant select on public.time_entry_totals to authenticated;
grant select on public.time_daily_totals to authenticated;

create policy work_sites_read_permitted
on public.work_sites for select
to authenticated
using (public.is_super_admin() or public.employee_can_read_work_site(id));
create policy work_sites_admin_insert
on public.work_sites for insert
to authenticated
with check (public.is_super_admin());
create policy work_sites_admin_update
on public.work_sites for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy employees_read_own_or_admin
on public.employees for select
to authenticated
using (
  public.is_super_admin()
  or (id = (select auth.uid()) and public.is_employee())
);
create policy employees_admin_update
on public.employees for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy employee_work_sites_read_own_or_admin
on public.employee_work_sites for select
to authenticated
using (
  public.is_super_admin()
  or (employee_id = (select auth.uid()) and public.is_employee())
);
create policy employee_work_sites_admin_insert
on public.employee_work_sites for insert
to authenticated
with check (public.is_super_admin());
create policy employee_work_sites_admin_update
on public.employee_work_sites for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy work_shifts_read_own_or_admin
on public.work_shifts for select
to authenticated
using (
  public.is_super_admin()
  or (employee_id = (select auth.uid()) and public.is_employee())
);
create policy work_shifts_admin_insert
on public.work_shifts for insert
to authenticated
with check (public.is_super_admin());
create policy work_shifts_admin_update
on public.work_shifts for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy employee_absences_read_own_or_admin
on public.employee_absences for select
to authenticated
using (
  public.is_super_admin()
  or (employee_id = (select auth.uid()) and public.is_employee())
);
create policy employee_absences_admin_insert
on public.employee_absences for insert
to authenticated
with check (public.is_super_admin());
create policy employee_absences_admin_update
on public.employee_absences for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy time_entries_read_own_or_admin
on public.time_entries for select
to authenticated
using (
  public.is_super_admin()
  or (employee_id = (select auth.uid()) and public.is_employee())
);

create policy time_breaks_read_own_or_admin
on public.time_breaks for select
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.time_entries entry
    where entry.id = time_breaks.time_entry_id
      and entry.employee_id = (select auth.uid())
      and public.is_employee()
  )
);

create policy time_entry_events_read_own_or_admin
on public.time_entry_events for select
to authenticated
using (
  public.is_super_admin()
  or (employee_id = (select auth.uid()) and public.is_employee())
);

-- ---------------------------------------------------------------------------
-- Timed announcements and a database-backed public clock
-- ---------------------------------------------------------------------------

alter table public.announcements
  add column if not exists countdown_enabled boolean not null default false,
  add column if not exists auto_hide_after_end boolean not null default true,
  add column if not exists discount_percentage numeric(5, 2);

alter table public.announcements
  drop constraint if exists announcements_schedule_check,
  drop constraint if exists announcements_discount_percentage_check;

alter table public.announcements
  add constraint announcements_schedule_check check (
    start_date is null
    or end_date is null
    or end_date > start_date
  ),
  add constraint announcements_discount_percentage_check check (
    discount_percentage is null
    or (discount_percentage > 0 and discount_percentage <= 100)
  );

drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read
on public.announcements for select
to anon, authenticated
using (
  status = 'active'
  and (start_date is null or start_date <= now())
  and (
    end_date is null
    or end_date >= now()
    or auto_hide_after_end = false
  )
);

create or replace function public.get_public_server_time()
returns timestamptz
language sql
security invoker
set search_path = pg_catalog
volatile
as $$
  select clock_timestamp();
$$;

revoke all on function public.get_public_server_time() from public;
grant execute on function public.get_public_server_time() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- PostgreSQL lint corrections for time tracking
-- ---------------------------------------------------------------------------

-- PostgreSQL treats the RETURNS TABLE column `ended_at` as a PL/pgSQL
-- variable. Qualify the target relation in both break-closing branches so
-- Pause -> Fortsetzen and Pause -> Ende compile without ambiguity. Building
-- from pg_get_functiondef keeps this corrective migration small while still
-- preserving the exact, already-reviewed transition function.
do $migration$
declare
  v_signature regprocedure :=
    'public.record_time_event(text,uuid,uuid,uuid,text)'::regprocedure;
  v_original text;
  v_corrected text;
begin
  select pg_get_functiondef(v_signature) into v_original;

  v_corrected := replace(
    v_original,
    E'update public.time_breaks\n      set ended_at = v_now, updated_by = v_employee_id\n      where time_entry_id = v_entry.id and ended_at is null;',
    E'update public.time_breaks as open_break\n      set ended_at = v_now, updated_by = v_employee_id\n      where open_break.time_entry_id = v_entry.id and open_break.ended_at is null;'
  );

  if v_corrected = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'record_time_event break updates could not be qualified safely.';
  end if;

  execute v_corrected;
end;
$migration$;

-- ============================================================
-- Invoice management
-- ============================================================
create table public.invoice_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  salutation text check (salutation is null or char_length(salutation) <= 50),
  company_name text check (company_name is null or char_length(company_name) <= 160),
  first_name text check (first_name is null or char_length(first_name) <= 120),
  last_name text check (last_name is null or char_length(last_name) <= 120),
  street_address text not null default '' check (char_length(street_address) <= 300),
  postal_code text not null default '' check (char_length(postal_code) <= 20),
  city text not null default '' check (char_length(city) <= 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 50),
  archived_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_customers_active_name_idx
on public.invoice_customers (lower(display_name))
where archived_at is null;

create table public.invoice_settings (
  singleton boolean primary key default true check (singleton),
  legal_name text not null default '' check (char_length(legal_name) <= 180),
  street_address text not null default '' check (char_length(street_address) <= 300),
  postal_code text not null default '' check (char_length(postal_code) <= 20),
  city text not null default '' check (char_length(city) <= 120),
  phone text not null default '' check (char_length(phone) <= 50),
  email text not null default '' check (char_length(email) <= 254),
  website text not null default '' check (char_length(website) <= 200),
  tax_number text not null default '' check (char_length(tax_number) <= 80),
  account_holder text not null default '' check (char_length(account_holder) <= 180),
  iban text not null default '' check (char_length(iban) <= 42),
  default_vat_bps integer not null default 1900 check (default_vat_bps between 0 and 10000),
  default_payment_terms text not null default 'zahlbar nach Erhalt' check (char_length(default_payment_terms) between 1 and 160),
  invoice_prefix text not null default 'SP' check (invoice_prefix = 'SP'),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_number_sequences (
  sequence_year smallint primary key check (sequence_year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique check (invoice_number is null or invoice_number ~ '^SP-[0-9]{4}-[0-9]{4,}$'),
  sequence_year smallint check (sequence_year is null or sequence_year between 2000 and 9999),
  sequence_number integer check (sequence_number is null or sequence_number > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'cancelled')),
  pricing_mode text not null default 'gross' check (pricing_mode in ('gross', 'net')),
  customer_id uuid references public.invoice_customers (id) on delete restrict,
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  issuer_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(issuer_snapshot) = 'object'),
  invoice_date date not null default current_date,
  service_date date not null,
  payment_terms text not null check (char_length(payment_terms) between 1 and 160),
  payment_method text not null check (payment_method in ('bank_transfer', 'cash')),
  subtotal_cents bigint not null default 0 check (subtotal_cents between 0 and 999999999999),
  vat_bps integer not null default 1900 check (vat_bps between 0 and 10000),
  vat_cents bigint not null default 0 check (vat_cents between 0 and 999999999999),
  total_cents bigint not null default 0 check (total_cents between 0 and 999999999999),
  notes text not null default '' check (char_length(notes) <= 2000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  pdf_storage_path text check (pdf_storage_path is null or char_length(pdf_storage_path) <= 500),
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_generated_at timestamptz,
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_year, sequence_number),
  constraint invoices_totals_check check (total_cents = subtotal_cents + vat_cents),
  constraint invoices_pdf_metadata_check check (
    (pdf_storage_path is null and pdf_sha256 is null and pdf_generated_at is null)
    or (pdf_storage_path is not null and pdf_sha256 is not null and pdf_generated_at is not null)
  ),
  constraint invoices_snapshot_state_check check (
    status = 'draft'
    or (
      btrim(coalesce(customer_snapshot ->> 'display_name', '')) <> ''
      and btrim(coalesce(customer_snapshot ->> 'street_address', '')) <> ''
      and btrim(coalesce(issuer_snapshot ->> 'legal_name', '')) <> ''
      and btrim(coalesce(issuer_snapshot ->> 'tax_number', '')) <> ''
      and btrim(coalesce(issuer_snapshot ->> 'iban', '')) <> ''
    )
  ),
  constraint invoices_number_state_check check (
    (status = 'draft' and invoice_number is null and sequence_year is null and sequence_number is null and issued_at is null and paid_at is null and cancelled_at is null)
    or
    (status = 'open' and invoice_number is not null and sequence_year is not null and sequence_number is not null and issued_at is not null and paid_at is null and cancelled_at is null)
    or
    (status = 'paid' and invoice_number is not null and sequence_year is not null and sequence_number is not null and issued_at is not null and paid_at is not null and cancelled_at is null)
    or
    (status = 'cancelled' and invoice_number is not null and sequence_year is not null and sequence_number is not null and issued_at is not null and cancelled_at is not null)
  )
);

create index invoices_status_date_idx on public.invoices (status, invoice_date desc);
create index invoices_customer_idx on public.invoices (customer_id, invoice_date desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  details text not null default '' check (char_length(details) <= 1000),
  quantity_milli integer not null default 1000 check (quantity_milli between 1 and 100000000),
  unit text not null check (unit in ('flat_rate', 'hour', 'piece', 'sqm', 'custom')),
  custom_unit text check (custom_unit is null or char_length(custom_unit) between 1 and 40),
  unit_price_net_cents bigint not null check (unit_price_net_cents between 0 and 999999999),
  line_total_net_cents bigint not null check (line_total_net_cents between 0 and 999999999999),
  line_total_gross_cents bigint not null check (line_total_gross_cents between 0 and 999999999999),
  position integer not null check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique (invoice_id, position),
  constraint invoice_items_custom_unit_check check (
    (unit = 'custom' and custom_unit is not null)
    or (unit <> 'custom' and custom_unit is null)
  )
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

comment on table public.invoices is 'Private, immutable-after-issue SauberPlus invoices. All mutations use Super Admin RPCs.';
comment on column public.invoices.customer_snapshot is 'Customer identity and address frozen on the invoice.';
comment on column public.invoices.issuer_snapshot is 'Company, bank, and tax data frozen when the invoice is issued.';

create trigger invoice_customers_touch_updated_at
before update on public.invoice_customers
for each row execute function public.trg_touch_updated_at();

create trigger invoice_settings_touch_updated_at
before update on public.invoice_settings
for each row execute function public.trg_touch_updated_at();

create trigger invoices_touch_updated_at
before update on public.invoices
for each row execute function public.trg_touch_updated_at();

create or replace function public.trg_protect_invoice_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Invoices cannot be deleted.';
  end if;

  if old.status <> 'draft' and (
    new.invoice_number is distinct from old.invoice_number
    or new.sequence_year is distinct from old.sequence_year
    or new.sequence_number is distinct from old.sequence_number
    or new.pricing_mode is distinct from old.pricing_mode
    or new.customer_id is distinct from old.customer_id
    or new.customer_snapshot is distinct from old.customer_snapshot
    or new.issuer_snapshot is distinct from old.issuer_snapshot
    or new.invoice_date is distinct from old.invoice_date
    or new.service_date is distinct from old.service_date
    or new.payment_terms is distinct from old.payment_terms
    or new.payment_method is distinct from old.payment_method
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.vat_bps is distinct from old.vat_bps
    or new.vat_cents is distinct from old.vat_cents
    or new.total_cents is distinct from old.total_cents
    or new.notes is distinct from old.notes
    or new.issued_at is distinct from old.issued_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '55000', message = 'Issued invoice identity and financial values are immutable.';
  end if;
  if old.status <> 'draft' and old.pdf_storage_path is not null and (
    new.pdf_storage_path is distinct from old.pdf_storage_path
    or new.pdf_sha256 is distinct from old.pdf_sha256
    or new.pdf_generated_at is distinct from old.pdf_generated_at
  ) then
    raise exception using errcode = '55000', message = 'Archived invoice PDFs are immutable.';
  end if;

  if (old.status = 'draft' and new.status not in ('draft', 'open'))
    or (old.status = 'open' and new.status not in ('open', 'paid', 'cancelled'))
    or (old.status = 'paid' and new.status not in ('paid', 'cancelled'))
    or (old.status = 'cancelled' and new.status <> 'cancelled') then
    raise exception using errcode = '55000', message = 'Invalid invoice status transition.';
  end if;

  return new;
end;
$$;

revoke execute on function public.trg_protect_invoice_history() from public, anon, authenticated;

create trigger invoices_protect_history
before update or delete on public.invoices
for each row execute function public.trg_protect_invoice_history();

create or replace function public.trg_protect_issued_invoice_items()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into v_old_status from public.invoices where id = old.invoice_id;
    if v_old_status is null then
      raise exception using errcode = '23503', message = 'Invoice not found.';
    end if;
    if v_old_status <> 'draft' then
      raise exception using errcode = '55000', message = 'Issued invoice items are immutable.';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select status into v_new_status from public.invoices where id = new.invoice_id;
    if v_new_status is null then
      raise exception using errcode = '23503', message = 'Invoice not found.';
    end if;
    if v_new_status <> 'draft' then
      raise exception using errcode = '55000', message = 'Issued invoice items are immutable.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_protect_issued_invoice_items() from public, anon, authenticated;

create trigger invoice_items_protect_history
before insert or update or delete on public.invoice_items
for each row execute function public.trg_protect_issued_invoice_items();

create or replace function public.save_invoice_settings(p_settings jsonb)
returns public.invoice_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_result public.invoice_settings%rowtype;
  v_vat_bps integer;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'Invoice settings must be an object.';
  end if;
  if coalesce(p_settings ->> 'default_vat_bps', '') !~ '^[0-9]{1,5}$' then
    raise exception using errcode = '22023', message = 'Invalid VAT rate.';
  end if;
  v_vat_bps := (p_settings ->> 'default_vat_bps')::integer;
  if v_vat_bps > 10000
    or char_length(btrim(coalesce(p_settings ->> 'legal_name', ''))) > 180
    or char_length(coalesce(p_settings ->> 'street_address', '')) > 300
    or char_length(coalesce(p_settings ->> 'postal_code', '')) > 20
    or char_length(coalesce(p_settings ->> 'city', '')) > 120
    or char_length(coalesce(p_settings ->> 'phone', '')) > 50
    or char_length(coalesce(p_settings ->> 'email', '')) > 254
    or char_length(coalesce(p_settings ->> 'website', '')) > 200
    or char_length(coalesce(p_settings ->> 'tax_number', '')) > 80
    or char_length(coalesce(p_settings ->> 'account_holder', '')) > 180
    or char_length(regexp_replace(coalesce(p_settings ->> 'iban', ''), '\s+', '', 'g')) > 34
    or char_length(btrim(coalesce(p_settings ->> 'default_payment_terms', ''))) not between 1 and 160
    or coalesce(p_settings ->> 'invoice_prefix', 'SP') <> 'SP' then
    raise exception using errcode = '22023', message = 'Invalid invoice settings.';
  end if;

  insert into public.invoice_settings (
    singleton, legal_name, street_address, postal_code, city, phone, email,
    website, tax_number, account_holder, iban, default_vat_bps,
    default_payment_terms, invoice_prefix, updated_by
  ) values (
    true,
    btrim(coalesce(p_settings ->> 'legal_name', '')),
    btrim(coalesce(p_settings ->> 'street_address', '')),
    btrim(coalesce(p_settings ->> 'postal_code', '')),
    btrim(coalesce(p_settings ->> 'city', '')),
    btrim(coalesce(p_settings ->> 'phone', '')),
    btrim(coalesce(p_settings ->> 'email', '')),
    btrim(coalesce(p_settings ->> 'website', '')),
    btrim(coalesce(p_settings ->> 'tax_number', '')),
    btrim(coalesce(p_settings ->> 'account_holder', '')),
    upper(regexp_replace(coalesce(p_settings ->> 'iban', ''), '\s+', '', 'g')),
    v_vat_bps,
    btrim(p_settings ->> 'default_payment_terms'),
    'SP',
    v_actor
  )
  on conflict (singleton) do update set
    legal_name = excluded.legal_name,
    street_address = excluded.street_address,
    postal_code = excluded.postal_code,
    city = excluded.city,
    phone = excluded.phone,
    email = excluded.email,
    website = excluded.website,
    tax_number = excluded.tax_number,
    account_holder = excluded.account_holder,
    iban = excluded.iban,
    default_vat_bps = excluded.default_vat_bps,
    default_payment_terms = excluded.default_payment_terms,
    invoice_prefix = excluded.invoice_prefix,
    updated_by = v_actor
  returning * into v_result;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'update', 'invoice_settings', 'singleton', jsonb_build_object('configured', true));
  return v_result;
end;
$$;

create or replace function public.save_invoice_draft(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_customer jsonb,
  p_invoice_date date,
  p_service_date date,
  p_payment_method text,
  p_payment_terms text,
  p_vat_bps integer,
  p_pricing_mode text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
  v_customer_id uuid := p_customer_id;
  v_customer_snapshot jsonb;
  v_item jsonb;
  v_position integer := 0;
  v_description text;
  v_details text;
  v_unit text;
  v_custom_unit text;
  v_quantity_milli integer;
  v_unit_price_net_cents bigint;
  v_line_net_cents bigint;
  v_line_gross_cents bigint;
  v_gross_cents bigint;
  v_subtotal_cents bigint := 0;
  v_total_cents bigint := 0;
  v_vat_cents bigint := 0;
  v_running_net_cents bigint := 0;
  v_allocated_vat_cents bigint := 0;
  v_cumulative_vat_cents bigint;
  v_display_name text;
  v_street_address text;
  v_postal_code text;
  v_city text;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if jsonb_typeof(p_customer) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Customer and items are required.';
  end if;
  if p_invoice_date is null or p_service_date is null
    or p_payment_method not in ('bank_transfer', 'cash')
    or p_pricing_mode not in ('gross', 'net')
    or p_vat_bps not between 0 and 10000
    or char_length(btrim(coalesce(p_payment_terms, ''))) not between 1 and 160
    or char_length(coalesce(p_notes, '')) > 2000
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Invalid invoice data.';
  end if;

  v_display_name := btrim(coalesce(p_customer ->> 'display_name', ''));
  v_street_address := btrim(coalesce(p_customer ->> 'street_address', ''));
  v_postal_code := btrim(coalesce(p_customer ->> 'postal_code', ''));
  v_city := btrim(coalesce(p_customer ->> 'city', ''));
  if char_length(v_display_name) not between 1 and 160
    or char_length(v_street_address) not between 1 and 300
    or char_length(v_postal_code) > 20
    or char_length(v_city) > 120
    or char_length(coalesce(p_customer ->> 'salutation', '')) > 50
    or char_length(coalesce(p_customer ->> 'company_name', '')) > 160
    or char_length(coalesce(p_customer ->> 'first_name', '')) > 120
    or char_length(coalesce(p_customer ->> 'last_name', '')) > 120
    or char_length(coalesce(p_customer ->> 'email', '')) > 254
    or char_length(coalesce(p_customer ->> 'phone', '')) > 50 then
    raise exception using errcode = '22023', message = 'Invalid customer data.';
  end if;

  if v_customer_id is null then
    insert into public.invoice_customers (
      display_name, salutation, company_name, first_name, last_name,
      street_address, postal_code, city, email, phone, created_by, updated_by
    ) values (
      v_display_name, nullif(btrim(coalesce(p_customer ->> 'salutation', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'company_name', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'first_name', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'last_name', '')), ''),
      v_street_address, v_postal_code, v_city,
      nullif(btrim(coalesce(p_customer ->> 'email', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'phone', '')), ''),
      v_actor, v_actor
    ) returning id into v_customer_id;
  elsif not exists (
    select 1 from public.invoice_customers
    where id = v_customer_id and archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'Customer not found.';
  end if;

  v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'display_name', v_display_name,
    'salutation', nullif(btrim(coalesce(p_customer ->> 'salutation', '')), ''),
    'company_name', nullif(btrim(coalesce(p_customer ->> 'company_name', '')), ''),
    'first_name', nullif(btrim(coalesce(p_customer ->> 'first_name', '')), ''),
    'last_name', nullif(btrim(coalesce(p_customer ->> 'last_name', '')), ''),
    'street_address', v_street_address,
    'postal_code', v_postal_code,
    'city', v_city,
    'email', nullif(btrim(coalesce(p_customer ->> 'email', '')), ''),
    'phone', nullif(btrim(coalesce(p_customer ->> 'phone', '')), '')
  ));

  if p_invoice_id is null then
    insert into public.invoices (
      status, pricing_mode, customer_id, customer_snapshot, invoice_date,
      service_date, payment_terms, payment_method, vat_bps, notes,
      created_by, updated_by
    ) values (
      'draft', p_pricing_mode, v_customer_id, v_customer_snapshot,
      p_invoice_date, p_service_date, btrim(p_payment_terms),
      p_payment_method, p_vat_bps, coalesce(p_notes, ''), v_actor, v_actor
    ) returning * into v_invoice;
  else
    select * into v_invoice from public.invoices where id = p_invoice_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Invoice not found.';
    end if;
    if v_invoice.status <> 'draft' then
      raise exception using errcode = '55000', message = 'Only draft invoices can be edited.';
    end if;
    update public.invoices set
      pricing_mode = p_pricing_mode,
      customer_id = v_customer_id,
      customer_snapshot = v_customer_snapshot,
      invoice_date = p_invoice_date,
      service_date = p_service_date,
      payment_terms = btrim(p_payment_terms),
      payment_method = p_payment_method,
      vat_bps = p_vat_bps,
      notes = coalesce(p_notes, ''),
      updated_by = v_actor
    where id = p_invoice_id returning * into v_invoice;
    delete from public.invoice_items where invoice_id = v_invoice.id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    v_description := btrim(coalesce(v_item ->> 'description', ''));
    v_details := btrim(coalesce(v_item ->> 'details', ''));
    v_unit := coalesce(v_item ->> 'unit', 'flat_rate');
    v_custom_unit := nullif(btrim(coalesce(v_item ->> 'custom_unit', '')), '');
    if char_length(v_description) not between 1 and 300
      or char_length(v_details) > 1000
      or v_unit not in ('flat_rate', 'hour', 'piece', 'sqm', 'custom')
      or (v_unit = 'custom' and (v_custom_unit is null or char_length(v_custom_unit) > 40))
      or (v_unit <> 'custom' and v_custom_unit is not null)
      or coalesce(v_item ->> 'quantity_milli', '') !~ '^[0-9]{1,9}$' then
      raise exception using errcode = '22023', message = 'Invalid invoice item.';
    end if;
    v_quantity_milli := (v_item ->> 'quantity_milli')::integer;
    if v_quantity_milli not between 1 and 100000000 then
      raise exception using errcode = '22023', message = 'Invalid item quantity.';
    end if;

    if p_pricing_mode = 'gross' then
      if coalesce(v_item ->> 'gross_cents', '') !~ '^[0-9]{1,12}$' then
        raise exception using errcode = '22023', message = 'Invalid gross amount.';
      end if;
      v_gross_cents := (v_item ->> 'gross_cents')::bigint;
      if v_gross_cents > 999999999999 then
        raise exception using errcode = '22023', message = 'Gross amount is too large.';
      end if;
      v_line_net_cents := (v_gross_cents * 10000 + ((10000 + p_vat_bps) / 2)) / (10000 + p_vat_bps);
      v_line_gross_cents := v_gross_cents;
      v_unit_price_net_cents := (v_line_net_cents * 1000 + (v_quantity_milli / 2)) / v_quantity_milli;
    else
      if coalesce(v_item ->> 'unit_price_net_cents', '') !~ '^[0-9]{1,9}$' then
        raise exception using errcode = '22023', message = 'Invalid net unit price.';
      end if;
      v_unit_price_net_cents := (v_item ->> 'unit_price_net_cents')::bigint;
      v_line_net_cents := (v_unit_price_net_cents * v_quantity_milli + 500) / 1000;
      v_running_net_cents := v_running_net_cents + v_line_net_cents;
      v_cumulative_vat_cents := (v_running_net_cents * p_vat_bps + 5000) / 10000;
      v_line_gross_cents := v_line_net_cents + v_cumulative_vat_cents - v_allocated_vat_cents;
      v_allocated_vat_cents := v_cumulative_vat_cents;
    end if;

    insert into public.invoice_items (
      invoice_id, description, details, quantity_milli, unit, custom_unit,
      unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
    ) values (
      v_invoice.id, v_description, v_details, v_quantity_milli, v_unit, v_custom_unit,
      v_unit_price_net_cents, v_line_net_cents, v_line_gross_cents, v_position
    );
    v_subtotal_cents := v_subtotal_cents + v_line_net_cents;
    v_total_cents := v_total_cents + v_line_gross_cents;
  end loop;

  if p_pricing_mode = 'net' then
    v_vat_cents := v_allocated_vat_cents;
    v_total_cents := v_subtotal_cents + v_vat_cents;
  else
    v_vat_cents := v_total_cents - v_subtotal_cents;
  end if;

  update public.invoices set
    subtotal_cents = v_subtotal_cents,
    vat_cents = v_vat_cents,
    total_cents = v_total_cents,
    updated_by = v_actor
  where id = v_invoice.id;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (
    v_actor, (select email from public.user_profiles where id = v_actor),
    case when p_invoice_id is null then 'create' else 'update' end,
    'invoices', v_invoice.id::text,
    jsonb_build_object('status', 'draft', 'subtotal_cents', v_subtotal_cents, 'vat_cents', v_vat_cents, 'total_cents', v_total_cents)
  );
  return v_invoice.id;
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
  v_settings public.invoice_settings%rowtype;
  v_year smallint;
  v_sequence integer;
  v_subtotal bigint;
  v_total bigint;
  v_vat bigint;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;
  if v_invoice.status <> 'draft' then
    if v_invoice.invoice_number is not null then
      return v_invoice;
    end if;
    raise exception using errcode = '55000', message = 'Invoice cannot be issued.';
  end if;

  select * into v_settings from public.invoice_settings where singleton = true;
  if not found
    or btrim(v_settings.legal_name) = ''
    or btrim(v_settings.street_address) = ''
    or btrim(v_settings.postal_code) = ''
    or btrim(v_settings.city) = ''
    or btrim(v_settings.tax_number) = ''
    or btrim(v_settings.account_holder) = ''
    or btrim(v_settings.iban) = '' then
    raise exception using errcode = '55000', message = 'Invoice company, tax, and bank settings must be completed before issuing.';
  end if;
  if btrim(coalesce(v_invoice.customer_snapshot ->> 'display_name', '')) = ''
    or btrim(coalesce(v_invoice.customer_snapshot ->> 'street_address', '')) = '' then
    raise exception using errcode = '22023', message = 'Invoice customer snapshot is incomplete.';
  end if;

  select coalesce(sum(line_total_net_cents), 0), coalesce(sum(line_total_gross_cents), 0)
  into v_subtotal, v_total
  from public.invoice_items
  where invoice_id = v_invoice.id;
  if v_subtotal <= 0 or not exists (select 1 from public.invoice_items where invoice_id = v_invoice.id) then
    raise exception using errcode = '22023', message = 'Invoice requires at least one positive line item.';
  end if;
  if v_invoice.pricing_mode = 'net' then
    v_vat := (v_subtotal * v_invoice.vat_bps + 5000) / 10000;
    v_total := v_subtotal + v_vat;
  else
    v_vat := v_total - v_subtotal;
  end if;

  v_year := extract(year from v_invoice.invoice_date)::smallint;
  insert into public.invoice_number_sequences (sequence_year, last_number)
  values (v_year, 1)
  on conflict (sequence_year) do update set
    last_number = public.invoice_number_sequences.last_number + 1,
    updated_at = clock_timestamp()
  returning last_number into v_sequence;

  update public.invoices set
    invoice_number = 'SP-' || v_year::text || '-' || lpad(v_sequence::text, 4, '0'),
    sequence_year = v_year,
    sequence_number = v_sequence,
    status = 'open',
    subtotal_cents = v_subtotal,
    vat_cents = v_vat,
    total_cents = v_total,
    issuer_snapshot = jsonb_build_object(
      'legal_name', v_settings.legal_name,
      'street_address', v_settings.street_address,
      'postal_code', v_settings.postal_code,
      'city', v_settings.city,
      'phone', v_settings.phone,
      'email', v_settings.email,
      'website', v_settings.website,
      'tax_number', v_settings.tax_number,
      'account_holder', v_settings.account_holder,
      'iban', v_settings.iban
    ),
    issued_at = clock_timestamp(),
    updated_by = v_actor
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (
    v_actor, (select email from public.user_profiles where id = v_actor),
    'issue', 'invoices', v_invoice.id::text,
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'total_cents', v_invoice.total_cents)
  );
  return v_invoice;
end;
$$;

create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  if v_invoice.status = 'paid' then return v_invoice; end if;
  if v_invoice.status <> 'open' then raise exception using errcode = '55000', message = 'Only open invoices can be marked paid.'; end if;
  update public.invoices set status = 'paid', paid_at = clock_timestamp(), updated_by = v_actor
  where id = p_invoice_id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'paid', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text default null)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Cancellation reason is too long.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  if v_invoice.status = 'cancelled' then return v_invoice; end if;
  if v_invoice.status not in ('open', 'paid') then raise exception using errcode = '55000', message = 'Only issued invoices can be cancelled.'; end if;
  update public.invoices set
    status = 'cancelled', cancelled_at = clock_timestamp(),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_by = v_actor
  where id = p_invoice_id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'cancel', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

create or replace function public.duplicate_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_source public.invoices%rowtype;
  v_new_id uuid;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_source from public.invoices where id = p_invoice_id;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  insert into public.invoices (
    status, pricing_mode, customer_id, customer_snapshot, invoice_date,
    service_date, payment_terms, payment_method, subtotal_cents, vat_bps,
    vat_cents, total_cents, notes, created_by, updated_by
  ) values (
    'draft', v_source.pricing_mode, v_source.customer_id, v_source.customer_snapshot,
    current_date, v_source.service_date, v_source.payment_terms, v_source.payment_method,
    v_source.subtotal_cents, v_source.vat_bps, v_source.vat_cents,
    v_source.total_cents, v_source.notes, v_actor, v_actor
  ) returning id into v_new_id;
  insert into public.invoice_items (
    invoice_id, description, details, quantity_milli, unit, custom_unit,
    unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
  )
  select v_new_id, description, details, quantity_milli, unit, custom_unit,
    unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
  from public.invoice_items where invoice_id = v_source.id order by position;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'duplicate', 'invoices', v_new_id::text, jsonb_build_object('source_invoice_id', v_source.id));
  return v_new_id;
end;
$$;

create or replace function public.invoice_pdf_path_is_allowed(p_name text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.is_super_admin() and exists (
    select 1 from public.invoices invoice
    where invoice.status <> 'draft'
      and p_name = 'invoices/' || invoice.id::text || '/' || invoice.invoice_number || '.pdf'
  );
$$;

create or replace function public.record_invoice_pdf(p_invoice_id uuid, p_storage_path text, p_sha256 text)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
  v_expected_path text;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found or v_invoice.status = 'draft' then
    raise exception using errcode = '55000', message = 'Only issued invoices can archive PDFs.';
  end if;
  v_expected_path := 'invoices/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf';
  if p_storage_path is distinct from v_expected_path or coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid invoice PDF metadata.';
  end if;
  if v_invoice.pdf_storage_path is not null then
    if v_invoice.pdf_storage_path = p_storage_path and v_invoice.pdf_sha256 = p_sha256 then
      return v_invoice;
    end if;
    raise exception using errcode = '55000', message = 'Archived invoice PDFs are immutable.';
  end if;
  update public.invoices set
    pdf_storage_path = p_storage_path, pdf_sha256 = p_sha256,
    pdf_generated_at = clock_timestamp(), updated_by = v_actor
  where id = p_invoice_id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'pdf_archive', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

revoke all on function public.save_invoice_settings(jsonb) from public, anon, authenticated;
revoke all on function public.save_invoice_draft(uuid, uuid, jsonb, date, date, text, text, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.issue_invoice(uuid) from public, anon, authenticated;
revoke all on function public.mark_invoice_paid(uuid) from public, anon, authenticated;
revoke all on function public.cancel_invoice(uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_invoice(uuid) from public, anon, authenticated;
revoke all on function public.invoice_pdf_path_is_allowed(text) from public, anon, authenticated;
revoke all on function public.record_invoice_pdf(uuid, text, text) from public, anon, authenticated;

grant execute on function public.save_invoice_settings(jsonb) to authenticated;
grant execute on function public.save_invoice_draft(uuid, uuid, jsonb, date, date, text, text, integer, text, text, jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.mark_invoice_paid(uuid) to authenticated;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
grant execute on function public.duplicate_invoice(uuid) to authenticated;
grant execute on function public.invoice_pdf_path_is_allowed(text) to authenticated;
grant execute on function public.record_invoice_pdf(uuid, text, text) to authenticated;

alter table public.invoice_customers enable row level security;
alter table public.invoice_settings enable row level security;
alter table public.invoice_number_sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoice_customers, public.invoice_settings, public.invoice_number_sequences, public.invoices, public.invoice_items from public, anon, authenticated;
grant select on public.invoice_customers, public.invoice_settings, public.invoices, public.invoice_items to authenticated;

create policy invoice_customers_super_admin_read on public.invoice_customers
for select to authenticated using (public.is_super_admin());
create policy invoice_settings_super_admin_read on public.invoice_settings
for select to authenticated using (public.is_super_admin());
create policy invoices_super_admin_read on public.invoices
for select to authenticated using (public.is_super_admin());
create policy invoice_items_super_admin_read on public.invoice_items
for select to authenticated using (public.is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-pdfs', 'invoice-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy invoice_pdfs_super_admin_read on storage.objects
for select to authenticated
using (bucket_id = 'invoice-pdfs' and public.invoice_pdf_path_is_allowed(name));

create policy invoice_pdfs_super_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'invoice-pdfs' and public.invoice_pdf_path_is_allowed(name));


-- ============================================================
-- User account lifecycle (safe disable/archive + last-admin guard)
-- ============================================================

create or replace function public.trg_guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removing_last_candidate boolean := tg_op = 'DELETE';
begin
  if tg_op = 'UPDATE' then
    v_removing_last_candidate := new.role <> 'super_admin' or new.disabled;
  end if;

  if old.role = 'super_admin' and not old.disabled and v_removing_last_candidate then
    perform pg_advisory_xact_lock(hashtextextended('sauberplus:last-super-admin', 0));

    if not exists (
      select 1
      from public.user_profiles profile
      where profile.role = 'super_admin'
        and not profile.disabled
        and profile.id <> old.id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Der letzte aktive Super Admin kann nicht deaktiviert, gelöscht oder herabgestuft werden.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_guard_last_super_admin() from public, anon, authenticated;

drop trigger if exists user_profiles_guard_last_super_admin on public.user_profiles;
create trigger user_profiles_guard_last_super_admin
before update of role, disabled or delete on public.user_profiles
for each row execute function public.trg_guard_last_super_admin();

create or replace function public.manage_user_account(
  p_user_id uuid,
  p_action text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target public.user_profiles%rowtype;
  v_archive_date date;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Nur Super Admins können Benutzerkonten verwalten.';
  end if;

  if p_user_id is null or p_action is null or p_action not in ('enable', 'disable', 'delete', 'role') then
    raise exception using errcode = '22023', message = 'Ungültige Kontoaktion.';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Das Benutzerkonto wurde nicht gefunden.';
  end if;

  if p_user_id = v_actor and p_action in ('disable', 'delete', 'role') then
    raise exception using errcode = 'P0001', message = 'Das eigene Administratorkonto kann hier nicht geändert werden.';
  end if;

  if v_target.archived_at is not null and p_action <> 'delete' then
    raise exception using errcode = 'P0001', message = 'Ein gelöschtes Konto kann nicht erneut aktiviert oder geändert werden.';
  end if;

  if p_action = 'role' then
    if v_target.role = 'employee' or p_role is null or p_role not in ('super_admin', 'content_manager') then
      raise exception using errcode = '22023', message = 'Ungültige Administratorrolle.';
    end if;

    update public.user_profiles
    set role = p_role
    where id = p_user_id;
    return;
  end if;

  if p_action = 'enable' then
    update public.user_profiles
    set disabled = false
    where id = p_user_id;
    return;
  end if;

  update public.user_profiles
  set disabled = true,
      archived_at = case
        when p_action = 'delete' then coalesce(archived_at, clock_timestamp())
        else archived_at
      end
  where id = p_user_id;

  if p_action = 'delete' then
    if v_target.role = 'employee' then
      select greatest(current_date, coalesce(employee.employment_start_date, current_date))
      into v_archive_date
      from public.employees employee
      where employee.id = p_user_id;

      update public.employees
      set employment_end_date = case
            when employment_end_date is null or employment_end_date > v_archive_date then v_archive_date
            else employment_end_date
          end,
          updated_by = v_actor
      where id = p_user_id;
    end if;

    insert into public.activity_log (
      actor_user_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      previous_value
    ) values (
      v_actor,
      (select email from public.user_profiles where id = v_actor),
      'delete',
      'user_profiles',
      p_user_id::text,
      jsonb_build_object(
        'email', v_target.email,
        'display_name', v_target.display_name,
        'role', v_target.role,
        'disabled', v_target.disabled
      )
    );
  end if;
end;
$$;

revoke execute on function public.manage_user_account(uuid, text, text) from public, anon, authenticated;
grant execute on function public.manage_user_account(uuid, text, text) to authenticated;

comment on function public.manage_user_account(uuid, text, text) is
  'Transactional Super Admin lifecycle operations. Delete archives access and preserves workforce records.';

-- ---------------------------------------------------------------------------
-- Employee portal manual time entry
-- ---------------------------------------------------------------------------

create or replace function public.submit_manual_time_entry(
  p_request_id uuid,
  p_work_site_id uuid,
  p_work_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_break_minutes integer default 0,
  p_note text default null,
  p_signature_data_url text default null
)
returns table (
  entry_id uuid,
  employee_id uuid,
  work_site_id uuid,
  work_date date,
  started_at timestamptz,
  ended_at timestamptz,
  entry_status text,
  break_seconds bigint,
  worked_seconds bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_timezone_name text;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_shift_minutes integer;
  v_break_minutes integer := coalesce(p_break_minutes, 0);
  v_note text := btrim(coalesce(p_note, ''));
  v_signature text := coalesce(p_signature_data_url, '');
  v_entry public.time_entries%rowtype;
  v_existing_event public.time_entry_events%rowtype;
begin
  if v_employee_id is null or p_request_id is null then
    raise exception using errcode = '23502', message = 'Authentication and request id are required.';
  end if;

  if p_work_site_id is null or p_work_date is null or p_start_time is null or p_end_time is null then
    raise exception using errcode = '23502', message = 'Work site, date, start and end are required.';
  end if;

  if char_length(v_note) > 1000 then
    raise exception using errcode = '22001', message = 'The work note is too long.';
  end if;

  if v_break_minutes < 0 or v_break_minutes > 240 then
    raise exception using errcode = '22023', message = 'Break minutes must be between 0 and 240.';
  end if;

  if char_length(v_signature) < 100
    or char_length(v_signature) > 500000
    or left(v_signature, 22) <> 'data:image/png;base64,' then
    raise exception using errcode = '22023', message = 'A valid PNG signature is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));

  select event.* into v_existing_event
  from public.time_entry_events event
  where event.employee_id = v_employee_id and event.request_id = p_request_id;

  if v_existing_event.id is not null then
    if v_existing_event.event_type <> 'end'
      or v_existing_event.metadata ->> 'submission_mode' <> 'manual' then
      raise exception using errcode = '23505', message = 'The request id was already used for another action.';
    end if;

    return query
    select totals.id, totals.employee_id, totals.work_site_id, totals.work_date,
      totals.started_at, totals.ended_at, totals.status, totals.break_seconds,
      totals.worked_seconds, v_now
    from public.time_entry_totals totals
    where totals.id = v_existing_event.time_entry_id;
    return;
  end if;

  select site.timezone_name into v_timezone_name
  from public.work_sites site
  where site.id = p_work_site_id and site.active = true;

  if v_timezone_name is null then
    raise exception using errcode = '22023', message = 'The selected work site is unavailable.';
  end if;

  perform 1
  from public.user_profiles profile
  join public.employees employee on employee.id = profile.id
  where profile.id = v_employee_id
    and profile.role = 'employee'
    and profile.disabled = false
    and (employee.employment_start_date is null or employee.employment_start_date <= p_work_date)
    and (employee.employment_end_date is null or employee.employment_end_date >= p_work_date)
  for update of profile, employee;

  if not found then
    raise exception using errcode = '42501', message = 'Employee account is not active for the selected date.';
  end if;

  if p_work_date > (v_now at time zone v_timezone_name)::date then
    raise exception using errcode = '22023', message = 'A future work date is not permitted.';
  end if;

  if not exists (
    select 1 from public.employee_work_sites assignment
    where assignment.employee_id = v_employee_id
      and assignment.work_site_id = p_work_site_id
      and (assignment.valid_from is null or assignment.valid_from <= p_work_date)
      and (assignment.valid_until is null or assignment.valid_until >= p_work_date)
  ) and not exists (
    select 1 from public.work_shifts shift
    where shift.employee_id = v_employee_id
      and shift.work_site_id = p_work_site_id
      and shift.status = 'scheduled'
      and (shift.scheduled_start at time zone v_timezone_name)::date = p_work_date
  ) then
    raise exception using errcode = '42501', message = 'The employee is not assigned to this work site for the selected date.';
  end if;

  if exists (
    select 1 from public.employee_absences absence
    where absence.employee_id = v_employee_id
      and absence.approval_status = 'approved'
      and absence.start_date <= p_work_date
      and absence.end_date >= p_work_date
  ) then
    raise exception using errcode = '55000', message = 'Time tracking is unavailable during an approved absence.';
  end if;

  v_started_at := (p_work_date + p_start_time) at time zone v_timezone_name;
  v_ended_at := (p_work_date + case when p_end_time <= p_start_time then 1 else 0 end + p_end_time) at time zone v_timezone_name;
  v_shift_minutes := floor(extract(epoch from (v_ended_at - v_started_at)) / 60)::integer;

  if v_shift_minutes <= 0 or v_shift_minutes > 960 or v_break_minutes >= v_shift_minutes then
    raise exception using errcode = '22023', message = 'The submitted shift duration is invalid.';
  end if;

  if exists (
    select 1 from public.time_entries existing
    where existing.employee_id = v_employee_id and existing.status in ('working', 'paused')
  ) then
    raise exception using errcode = '23505', message = 'An active work session already exists.';
  end if;

  if exists (
    select 1 from public.time_entries existing
    where existing.employee_id = v_employee_id
      and existing.started_at < v_ended_at
      and coalesce(existing.ended_at, 'infinity'::timestamptz) > v_started_at
  ) then
    raise exception using errcode = '23P01', message = 'The submitted shift overlaps an existing entry.';
  end if;

  insert into public.time_entries (
    employee_id, work_site_id, work_date, started_at, ended_at, status,
    note, created_by, updated_by
  ) values (
    v_employee_id, p_work_site_id, p_work_date, v_started_at, v_ended_at,
    'completed', v_note, v_employee_id, v_employee_id
  ) returning * into v_entry;

  if v_break_minutes > 0 then
    insert into public.time_breaks (
      time_entry_id, started_at, ended_at, created_by, updated_by
    ) values (
      v_entry.id, v_ended_at - make_interval(mins => v_break_minutes),
      v_ended_at, v_employee_id, v_employee_id
    );
  end if;

  insert into public.time_entry_events (
    time_entry_id, employee_id, request_id, event_type, recorded_at,
    actor_user_id, metadata
  ) values (
    v_entry.id, v_employee_id, p_request_id, 'end', v_now, v_employee_id,
    jsonb_build_object(
      'submission_mode', 'manual', 'confirmed', true,
      'signature_data_url', v_signature, 'break_minutes', v_break_minutes
    )
  );

  return query
  select totals.id, totals.employee_id, totals.work_site_id, totals.work_date,
    totals.started_at, totals.ended_at, totals.status, totals.break_seconds,
    totals.worked_seconds, v_now
  from public.time_entry_totals totals
  where totals.id = v_entry.id;
end;
$$;

revoke execute on function public.submit_manual_time_entry(uuid, uuid, date, time without time zone, time without time zone, integer, text, text)
  from public, anon;
grant execute on function public.submit_manual_time_entry(uuid, uuid, date, time without time zone, time without time zone, integer, text, text)
  to authenticated;

-- Both functions read clock_timestamp(), directly or through
-- time_entry_totals, so VOLATILE is the truthful planner contract.
alter function public.get_my_time_state() volatile;
alter function public.get_time_summary(uuid, date, date, text, uuid) volatile;

-- ---------------------------------------------------------------------------
-- PostgreSQL lint completion for time tracking
-- ---------------------------------------------------------------------------

-- The paused -> Ende branch is indented one level deeper than the resume
-- branch corrected previously. Qualify that second update as well.
do $migration$
declare
  v_signature regprocedure :=
    'public.record_time_event(text,uuid,uuid,uuid,text)'::regprocedure;
  v_original text;
  v_corrected text;
begin
  select pg_get_functiondef(v_signature) into v_original;

  v_corrected := replace(
    v_original,
    E'update public.time_breaks\n        set ended_at = v_now, updated_by = v_employee_id\n        where time_entry_id = v_entry.id and ended_at is null;',
    E'update public.time_breaks as open_break\n        set ended_at = v_now, updated_by = v_employee_id\n        where open_break.time_entry_id = v_entry.id and open_break.ended_at is null;'
  );

  if v_corrected = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'record_time_event paused-end update could not be qualified safely.';
  end if;

  execute v_corrected;
end;
$migration$;

-- p_email remains in this legacy public signature for backward compatibility,
-- but identity is derived exclusively from auth.uid(). Referencing it without
-- using it for lookup keeps plpgsql_check free of a misleading unused warning.
do $migration$
declare
  v_signature regprocedure :=
    'public.register_successful_login(text)'::regprocedure;
  v_original text;
  v_corrected text;
begin
  select pg_get_functiondef(v_signature) into v_original;

  v_corrected := replace(
    v_original,
    E'begin\n  if v_user_id is null then',
    E'begin\n  perform p_email;\n\n  if v_user_id is null then'
  );

  if v_corrected = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'register_successful_login compatibility parameter could not be marked safely.';
  end if;

  execute v_corrected;
end;
$migration$;
