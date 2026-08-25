-- Permissão por pessoa: acesso somente a Assinaturas e ferramentas.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS finance_tools_access boolean NOT NULL DEFAULT false;

-- Acesso completo OU permissão explícita de assinaturas/ferramentas.
CREATE OR REPLACE FUNCTION public.has_finance_tools_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_finance_access(_tenant_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.tenant_id = _tenant_id
          AND ur.finance_tools_access = true
      );
$function$;

-- Escopo canônico consumido pelo front-end.
CREATE OR REPLACE FUNCTION public.finance_access_scope(_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_finance_access(_tenant_id) THEN 'full'
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = _tenant_id
        AND ur.finance_tools_access = true
    ) THEN 'tools'
    ELSE 'none'
  END;
$function$;

-- Item que o escopo restrito pode manipular.
CREATE OR REPLACE FUNCTION public.finance_tools_item_allowed(_tenant_id uuid, _item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.finance_items fi
    WHERE fi.id = _item_id
      AND fi.tenant_id = _tenant_id
      AND fi.kind IN ('tool', 'package', 'included_resource')
      AND fi.cost_center <> 'administrativo'
  );
$function$;

-- Cartões em formato SEGURO: rótulo e ciclo, nunca limite ou fatura.
CREATE OR REPLACE FUNCTION public.list_finance_safe_cards(_tenant_id uuid)
RETURNS TABLE(id uuid, bank_name text, card_last4 text, statement_closing_day integer, statement_due_day integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_finance_tools_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para Assinaturas e ferramentas';
  END IF;

  RETURN QUERY
  SELECT fi.id,
         fi.bank_name,
         fi.card_last4,
         fi.statement_closing_day,
         fi.statement_due_day
  FROM public.finance_items fi
  WHERE fi.tenant_id = _tenant_id
    AND fi.kind = 'card'
    AND fi.active = true
  ORDER BY coalesce(fi.bank_name, ''), coalesce(fi.card_last4, '');
END;
$function$;

-- Trava de senha: vale para os dois escopos. Criar/trocar segue só super admin.
CREATE OR REPLACE FUNCTION public.finance_password_status(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.has_finance_tools_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  SELECT finance_access_password_hash INTO v_hash
  FROM public.tenants
  WHERE id = _tenant_id;

  RETURN jsonb_build_object(
    'configured', v_hash IS NOT NULL,
    'can_setup', public.is_super_admin()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_finance_password(_tenant_id uuid, _password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.has_finance_tools_access(_tenant_id) THEN
    RETURN false;
  END IF;

  SELECT finance_access_password_hash INTO v_hash
  FROM public.tenants
  WHERE id = _tenant_id;

  IF v_hash IS NULL OR _password IS NULL THEN
    RETURN false;
  END IF;

  RETURN crypt(_password, v_hash) = v_hash;
END;
$function$;

-- Políticas do escopo restrito. Sem DELETE: desativar cadastro é suficiente.
DROP POLICY IF EXISTS finance_items_tools_select ON public.finance_items;
CREATE POLICY finance_items_tools_select
  ON public.finance_items FOR SELECT TO authenticated
  USING (
    public.has_finance_tools_access(tenant_id)
    AND kind = ANY (ARRAY['tool', 'package', 'included_resource'])
    AND cost_center <> 'administrativo'
  );

DROP POLICY IF EXISTS finance_items_tools_insert ON public.finance_items;
CREATE POLICY finance_items_tools_insert
  ON public.finance_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_finance_tools_access(tenant_id)
    AND kind = ANY (ARRAY['tool', 'package', 'included_resource'])
    AND cost_center <> 'administrativo'
  );

DROP POLICY IF EXISTS finance_items_tools_update ON public.finance_items;
CREATE POLICY finance_items_tools_update
  ON public.finance_items FOR UPDATE TO authenticated
  USING (
    public.has_finance_tools_access(tenant_id)
    AND kind = ANY (ARRAY['tool', 'package', 'included_resource'])
    AND cost_center <> 'administrativo'
  )
  WITH CHECK (
    public.has_finance_tools_access(tenant_id)
    AND kind = ANY (ARRAY['tool', 'package', 'included_resource'])
    AND cost_center <> 'administrativo'
  );

DROP POLICY IF EXISTS finance_occ_tools_select ON public.finance_occurrences;
CREATE POLICY finance_occ_tools_select
  ON public.finance_occurrences FOR SELECT TO authenticated
  USING (
    public.has_finance_tools_access(tenant_id)
    AND public.finance_tools_item_allowed(tenant_id, item_id)
  );

DROP POLICY IF EXISTS finance_occ_tools_insert ON public.finance_occurrences;
CREATE POLICY finance_occ_tools_insert
  ON public.finance_occurrences FOR INSERT TO authenticated
  WITH CHECK (
    public.has_finance_tools_access(tenant_id)
    AND public.finance_tools_item_allowed(tenant_id, item_id)
  );

DROP POLICY IF EXISTS finance_occ_tools_update ON public.finance_occurrences;
CREATE POLICY finance_occ_tools_update
  ON public.finance_occurrences FOR UPDATE TO authenticated
  USING (
    public.has_finance_tools_access(tenant_id)
    AND public.finance_tools_item_allowed(tenant_id, item_id)
  )
  WITH CHECK (
    public.has_finance_tools_access(tenant_id)
    AND public.finance_tools_item_allowed(tenant_id, item_id)
  );