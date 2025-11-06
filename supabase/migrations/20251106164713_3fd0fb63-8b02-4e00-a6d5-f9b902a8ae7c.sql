-- FASE 2: Corrigir Dados Existentes
-- 2.1 Associar usuários existentes ao tenant "Agência Principal"
WITH existing_tenant AS (
  SELECT id FROM public.tenants WHERE name = 'Agência Principal' LIMIT 1
)
UPDATE public.profiles 
SET tenant_id = (SELECT id FROM existing_tenant)
WHERE tenant_id IS NULL
  AND EXISTS (SELECT 1 FROM existing_tenant);

-- 2.2 Criar roles agency_admin para usuários sem role
WITH existing_tenant AS (
  SELECT id FROM public.tenants WHERE name = 'Agência Principal' LIMIT 1
)
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  p.id,
  (SELECT id FROM existing_tenant),
  'agency_admin'::app_role
FROM public.profiles p
WHERE p.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p.id
  )
  AND EXISTS (SELECT 1 FROM existing_tenant);

-- FASE 3: Ajustar Políticas RLS
-- 3.1 Remover política antiga e criar uma mais clara
DROP POLICY IF EXISTS "authenticated_users_create_first_agency" ON public.tenants;

CREATE POLICY "users_create_first_agency"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  -- Só pode criar SE:
  -- 1. É do tipo 'agency'
  tenant_type = 'agency'
  -- 2. Usuário ainda não tem nenhum tenant associado
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND tenant_id IS NOT NULL
  )
  -- 3. Usuário não tem nenhuma role
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
);

-- 3.2 Adicionar política para super_admin criar tenants filhos
CREATE POLICY "super_admin_create_child_tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  AND tenant_type IN ('agency', 'client', 'subclient')
);