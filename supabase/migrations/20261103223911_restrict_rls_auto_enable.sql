-- The dashboard's automatic-RLS option adds public.rls_auto_enable(), run by the ensure_rls event trigger on
-- CREATE TABLE. It's SECURITY DEFINER and everyone can EXECUTE it, which the security advisor flags. The event
-- trigger doesn't need that grant, so only the grant goes. Projects made without the option don't have it.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
