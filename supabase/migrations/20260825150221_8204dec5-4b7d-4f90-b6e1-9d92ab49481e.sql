-- Idempotent sync of harden_finance_access_after_role_distribution

CREATE OR REPLACE FUNCTION public.finance_password_status(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text;
begin
  if not public.has_finance_access(_tenant_id) then
    raise exception 'Sem permissão para o Financeiro completo';
  end if;

  select finance_access_password_hash into v_hash
  from public.tenants
  where id = _tenant_id;

  return jsonb_build_object(
    'configured', v_hash is not null,
    'can_setup', public.is_super_admin()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_finance_password(_tenant_id uuid, _password text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text;
begin
  if not public.has_finance_access(_tenant_id) then
    return false;
  end if;

  select finance_access_password_hash into v_hash
  from public.tenants
  where id = _tenant_id;

  if v_hash is null or _password is null then
    return false;
  end if;

  return crypt(_password, v_hash) = v_hash;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_tools_item_allowed(_tenant_id uuid, _item_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_finance_tools_access(_tenant_id)
     and exists (
       select 1
       from public.finance_items fi
       where fi.id = _item_id
         and fi.tenant_id = _tenant_id
         and fi.kind in ('tool','package','included_resource')
         and fi.cost_center <> 'administrativo'
     );
$function$;

REVOKE EXECUTE ON FUNCTION public.finance_access_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_finance_tools_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_tools_item_allowed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_finance_safe_cards(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_password_status(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.finance_access_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_finance_tools_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_tools_item_allowed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_finance_safe_cards(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_password_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) TO authenticated;