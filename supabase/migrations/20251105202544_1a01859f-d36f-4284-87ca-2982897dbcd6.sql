-- Fase 1: Corrigir a função can_create_tenant com sintaxe correta
CREATE OR REPLACE FUNCTION public.can_create_tenant(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
  );
$$;

-- Adicionar função de debug
CREATE OR REPLACE FUNCTION public.debug_tenant_creation(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'user_id', _user_id,
    'has_roles', EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id),
    'role_count', (SELECT COUNT(*) FROM public.user_roles WHERE user_id = _user_id),
    'can_create', NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
  );
$$;

-- Fase 2: Simplificar a política RLS
DROP POLICY IF EXISTS "authenticated_users_create_first_agency" ON public.tenants;

CREATE POLICY "authenticated_users_create_first_agency"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_type = 'agency'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
);

-- Fase 3: Adicionar política de fallback para super_admin
DROP POLICY IF EXISTS "super_admin_create_any_tenant" ON public.tenants;

CREATE POLICY "super_admin_create_any_tenant"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
);