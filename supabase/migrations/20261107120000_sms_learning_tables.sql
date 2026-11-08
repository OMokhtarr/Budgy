-- Budgy SMS import: what the app learns from bank texts, synced like the other records.
--
-- These tables hold only learned links (sender, last digits, account id) and merchant rules (merchant,
-- flow, category), never message text. The texts themselves stay on the phone.
--
-- Same shape and rules as the tables in 20261103114647_sync_tables.sql: each record's fields in `data`,
-- "last edit wins" on updated_at, soft deletes, and each user sees only their own rows.

create table public.sms_links (like public.accounts including defaults including constraints);
alter table public.sms_links add primary key (user_id, id);
alter table public.sms_links
  add foreign key (user_id) references auth.users (id) on delete cascade;

create table public.merchant_rules (like public.accounts including defaults including constraints);
alter table public.merchant_rules add primary key (user_id, id);
alter table public.merchant_rules
  add foreign key (user_id) references auth.users (id) on delete cascade;

do $$
declare
  t text;
begin
  foreach t in array array['sms_links', 'merchant_rules'] loop
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

    -- Data API access: new tables aren't exposed automatically, and the anonymous role gets nothing.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;
