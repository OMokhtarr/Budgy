-- Budgy cloud sync: a copy of each signed-in user's accounts, categories, transactions and settings.
--
-- The app stays local-first (Dexie on the device) and syncs in the background:
--   push = upsert rows changed on the device; pull = rows whose server_updated_at is newer than the
--   device's cursor. Each record's fields live in `data` (the same JSON the app stores locally), so
--   app-side fields can change without a migration. Only the sync bookkeeping has its own columns.
--
-- "Last edit wins": a write carrying an older updated_at than the stored row is ignored, so an edit that
-- reaches the server late (a phone that was offline) can't overwrite a newer one.
-- Devices never hard-delete: deleted_at marks a deletion so it reaches every device. Rows only really go
-- away with the account (on delete cascade from auth.users), via the delete-account Edge Function.

create schema if not exists private;

-- Stamps server time on every write and drops writes older than what's stored.
create function private.stamp_and_keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- An older edit arriving late (or the same edit sent again) changes nothing, and doesn't bump
  -- server_updated_at, so other devices don't download it again.
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  -- clock_timestamp(), not now(): rows written in one long request still get increasing times.
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ── Records: one table per kind, all with the same shape ──

-- The key is (user_id, id): ids are made on the devices, and the built-in starting records use the
-- same fixed ids on every install, so they only need to be unique per user.
create table public.accounts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.categories (like public.accounts including defaults including constraints);
alter table public.categories add primary key (user_id, id);
alter table public.categories
  add foreign key (user_id) references auth.users (id) on delete cascade;

create table public.transactions (like public.accounts including defaults including constraints);
alter table public.transactions add primary key (user_id, id);
alter table public.transactions
  add foreign key (user_id) references auth.users (id) on delete cascade;

-- ── Settings: one row per user (main currency, exchange rates, week start, profile…) ──

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- ── Shared setup for all four tables ──

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'settings'] loop
    execute format(
      'create trigger stamp_and_keep_newest before insert or update on public.%I
         for each row execute function private.stamp_and_keep_newest()', t);

    -- Pull: "my rows changed since X".
    execute format('create index %I on public.%I (user_id, server_updated_at)', t || '_user_changes_idx', t);

    -- Row-level security: each user sees and writes only their own rows.
    execute format('alter table public.%I enable row level security', t);
    -- SELECT is also needed for UPDATE (and so for upserts) to find the row at all.
    execute format(
      'create policy "Users read their own rows" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Users add their own rows" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    -- WITH CHECK too, so a row can't be handed over to another user.
    execute format(
      'create policy "Users change their own rows" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    -- No DELETE policy on purpose: devices soft-delete (deleted_at).

    -- Data API access. New tables aren't exposed automatically any more (since 2026-10-30), and the
    -- anonymous role gets nothing at all.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;
