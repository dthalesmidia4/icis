-- Corrigir recursão infinita na tabela super_admins
-- Remover políticas problemáticas que causam loop infinito
DROP POLICY IF EXISTS "super_admins_select" ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_manage" ON public.super_admins;

-- Criar novas políticas usando a função SECURITY DEFINER is_super_admin()
-- Isso bypassa RLS e evita a recursão
CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "super_admins_manage" ON public.super_admins
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());