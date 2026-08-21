create or replace function public.set_team_member_avatar(_target_user_id uuid, _avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _target_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select tenant_id into _target_tenant from public.profiles where id = _target_user_id;
  if _target_tenant is null and _target_user_id <> auth.uid() then
    raise exception 'target member not found';
  end if;

  if _target_user_id <> auth.uid()
     and not public.is_super_admin()
     and not public.is_agency_admin(_target_tenant) then
    raise exception 'not allowed to change this member photo';
  end if;

  update public.profiles
     set avatar_url = _avatar_url,
         updated_at = now()
   where id = _target_user_id;
end;
$$;

revoke all on function public.set_team_member_avatar(uuid, text) from public, anon;
grant execute on function public.set_team_member_avatar(uuid, text) to authenticated;