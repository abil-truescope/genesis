-- Схема бэкенда «Дневника атмосферы» (применена к проекту genesis-diary).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  consent_version text,
  created_at timestamptz not null default now()
);

create table public.days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 4 and 64),
  date date not null,
  title text not null check (char_length(title) <= 200),
  caption text check (char_length(caption) <= 400),
  entry_text text not null check (char_length(entry_text) <= 20000),
  page_no int,
  song jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  thumb_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index days_user_date_idx on public.days (user_id, date desc);

alter table public.profiles enable row level security;
alter table public.days enable row level security;

create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);

create policy "days: read own" on public.days for select to authenticated using ((select auth.uid()) = user_id);
create policy "days: insert own" on public.days for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "days: update own" on public.days for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "days: delete own" on public.days for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger days_touch before update on public.days for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, consent_version)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80), new.raw_user_meta_data ->> 'consent');
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diary', 'diary', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "diary: read own" on storage.objects for select to authenticated
  using (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "diary: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "diary: update own" on storage.objects for update to authenticated
  using (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "diary: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'diary' and (storage.foldername(name))[1] = (select auth.uid())::text);
