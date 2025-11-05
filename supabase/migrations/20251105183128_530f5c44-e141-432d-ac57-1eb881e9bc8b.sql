-- Remover as políticas antigas que estão causando problemas
DROP POLICY IF EXISTS "authenticated_users_can_create_agency_tenant" ON public.tenants;
DROP POLICY IF EXISTS "users_can_create_initial_role" ON public.user_roles;

-- Criar função para verificar se usuário pode criar tenant
CREATE OR REPLACE FUNCTION public.can_create_tenant(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Usuário pode criar tenant se não tiver nenhuma role ainda
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
  );
$$;

-- Nova política mais robusta para criar tenant de agency
CREATE POLICY "authenticated_users_create_first_agency"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_type = 'agency'
  AND public.can_create_tenant(auth.uid())
);

-- Nova política para criar role inicial
CREATE POLICY "users_create_agency_admin_role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'agency_admin'
  AND EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE id = tenant_id 
    AND tenant_type = 'agency'
  )
);

-- Adicionar constraint para garantir que slugs sejam únicos (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tenants_slug_unique'
  ) THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);
  END IF;
END
$$;