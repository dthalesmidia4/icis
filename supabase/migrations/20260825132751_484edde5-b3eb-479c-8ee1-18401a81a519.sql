CREATE OR REPLACE FUNCTION public.enforce_user_role_delegation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_is_admin boolean := false;
  v_actor_full boolean := false;
  v_actor_tools boolean := false;
BEGIN
  -- Regra de coerência de função: Financeiro completo só existe para
  -- super_admin / agency_admin / agency_manager (espelha has_finance_access).
  IF NEW.finance_access = true
     AND NEW.role NOT IN (
       'super_admin'::public.app_role,
       'agency_admin'::public.app_role,
       'agency_manager'::public.app_role
     ) THEN
    RAISE EXCEPTION 'Financeiro completo só pode ser concedido a administrador ou gestor';
  END IF;

  -- Service-role / migrations and super admin are not constrained by delegation ceiling.
  IF v_actor IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_actor
      AND ur.tenant_id = NEW.tenant_id
      AND ur.role = 'agency_admin'::public.app_role
  ) INTO v_actor_is_admin;

  IF NOT v_actor_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Administrador da agência não pode conceder super admin';
  END IF;

  SELECT public.has_finance_access(NEW.tenant_id),
         public.has_finance_tools_access(NEW.tenant_id)
    INTO v_actor_full, v_actor_tools;

  IF NEW.finance_access = true AND NOT v_actor_full THEN
    RAISE EXCEPTION 'Você não pode conceder Financeiro completo sem possuir esse acesso';
  END IF;

  IF NEW.finance_tools_access = true AND NOT v_actor_tools THEN
    RAISE EXCEPTION 'Você não pode conceder Assinaturas e ferramentas sem possuir esse acesso';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_user_role_delegation ON public.user_roles;
CREATE TRIGGER trg_enforce_user_role_delegation
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_role_delegation();