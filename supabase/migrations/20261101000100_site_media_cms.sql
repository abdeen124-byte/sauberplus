-- Website-managed leadership profiles, vehicle imagery and hero media.

create table public.leadership_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kicker_de text not null default '', kicker_en text not null default '', kicker_ar text not null default '',
  role_de text not null, role_en text not null default '', role_ar text not null default '',
  description_de text not null default '', description_en text not null default '', description_ar text not null default '',
  image_path text not null check (char_length(image_path) between 1 and 500),
  image_alt text not null default '',
  hidden boolean not null default false,
  sort_order integer not null default 1000,
  created_by uuid references public.user_profiles(id),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_media (
  id uuid primary key default gen_random_uuid(),
  placement text not null check (placement in ('hero', 'service_vehicle')),
  media_type text not null check (media_type in ('image', 'animated_image', 'video')),
  media_path text not null check (char_length(media_path) between 1 and 500),
  poster_path text check (poster_path is null or char_length(poster_path) between 1 and 500),
  alt_de text not null default '', alt_en text not null default '', alt_ar text not null default '',
  hidden boolean not null default false,
  autoplay boolean not null default true,
  loop boolean not null default true,
  duration_ms integer not null default 7000 check (duration_ms between 2000 and 30000),
  sort_order integer not null default 1000,
  created_by uuid references public.user_profiles(id),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_media_placement_type_check check (
    placement = 'hero' or (placement = 'service_vehicle' and media_type = 'image')
  ),
  constraint site_media_video_poster_check check (media_type = 'video' or poster_path is null)
);

create trigger leadership_profiles_activity_log after insert or update or delete on public.leadership_profiles
for each row execute function public.trg_log_content_change();
create trigger site_media_activity_log after insert or update or delete on public.site_media
for each row execute function public.trg_log_content_change();
create trigger leadership_profiles_touch_updated_at before update on public.leadership_profiles
for each row execute function public.trg_touch_updated_at();
create trigger site_media_touch_updated_at before update on public.site_media
for each row execute function public.trg_touch_updated_at();

alter table public.leadership_profiles enable row level security;
alter table public.site_media enable row level security;
grant select on public.leadership_profiles, public.site_media to anon, authenticated;
grant insert, update, delete on public.leadership_profiles, public.site_media to authenticated;

create policy leadership_profiles_public_read on public.leadership_profiles for select to anon, authenticated using (hidden = false);
create policy leadership_profiles_staff_read on public.leadership_profiles for select to authenticated using (public.is_staff());
create policy leadership_profiles_staff_insert on public.leadership_profiles for insert to authenticated with check (public.is_staff());
create policy leadership_profiles_staff_update on public.leadership_profiles for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy leadership_profiles_staff_delete on public.leadership_profiles for delete to authenticated using (public.is_staff());

create policy site_media_public_read on public.site_media for select to anon, authenticated using (hidden = false);
create policy site_media_staff_read on public.site_media for select to authenticated using (public.is_staff());
create policy site_media_staff_insert on public.site_media for insert to authenticated with check (public.is_staff());
create policy site_media_staff_update on public.site_media for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy site_media_staff_delete on public.site_media for delete to authenticated using (public.is_staff());

create index leadership_profiles_sort_order_idx on public.leadership_profiles(sort_order);
create index site_media_placement_sort_order_idx on public.site_media(placement, sort_order);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 31457280, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy site_media_storage_staff_read on storage.objects for select to authenticated
using (bucket_id='site-media' and public.is_staff());
create policy site_media_storage_staff_insert on storage.objects for insert to authenticated
with check (bucket_id='site-media' and public.is_staff());
create policy site_media_storage_staff_update on storage.objects for update to authenticated
using (bucket_id='site-media' and public.is_staff()) with check (bucket_id='site-media' and public.is_staff());
create policy site_media_storage_staff_delete on storage.objects for delete to authenticated
using (bucket_id='site-media' and public.is_staff());
