-- Política para permitir que usuários autenticados criem seu primeiro tenant (agency)
CREATE POLICY "authenticated_users_can_create_agency_tenant"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_type = 'agency'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid()
  )
);

-- Política para permitir que usuários criem sua role inicial no tenant que acabaram de criar
CREATE POLICY "users_can_create_initial_role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'agency_admin'
  AND EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE tenants.id = tenant_id 
    AND tenants.tenant_type = 'agency'
  )
);

-- Criar trigger para criar profile automaticamente após signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger que chama a função após criar usuário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();