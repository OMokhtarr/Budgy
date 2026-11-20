-- Budgy recurring transactions (rent, salary, subscriptions), synced like the other records.
--
-- Same shape and rules as the tables in 20261103114647_sync_tables.sql: each record's fields in `data`,
-- "last edit wins" on updated_at, soft deletes, and each user sees only their own rows.

create table public.recurring (like public.accounts including defaults including constraints);
alter table public.recurring add primary key (user_id, id);
alter table public.recurring
  add foreign key (user_id) references auth.users (id) on delete cascade;

create trigger stamp_and_keep_newest before insert or update on public.recurring
  for each row execute function private.stamp_and_keep_newest();

-- Pull: "my rows changed since X".
create index recurring_user_changes_idx on public.recurring (user_id, server_updated_at);

-- Row-level security: each user sees and writes only their own rows.
alter table public.recurring enable row level security;
-- SELECT is also needed for UPDATE (and so for upserts) to find the row at all.
create policy "Users read their own rows" on public.recurring for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own rows" on public.recurring for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- WITH CHECK too, so a row can't be handed over to another user.
create policy "Users change their own rows" on public.recurring for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- No DELETE policy on purpose: devices soft-delete (deleted_at).

-- Data API access: new tables aren't exposed automatically, and the anonymous role gets nothing.
revoke all on public.recurring from anon, authenticated;
grant select, insert, update on public.recurring to authenticated;
