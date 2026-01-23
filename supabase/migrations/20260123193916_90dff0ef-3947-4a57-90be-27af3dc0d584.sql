-- ==============================================
-- PARTE 1: Tabela super_admins
-- ==============================================

CREATE TABLE public.super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_super_admins_user_id ON public.super_admins(user_id);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Apenas super_admins podem ver/gerenciar a lista
CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE POLICY "super_admins_manage" ON public.super_admins
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

-- ==============================================
-- PARTE 2: Funções de Segurança
-- ==============================================

-- Função para verificar se usuário é super_admin (tabela separada)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = auth.uid()
  )
$$;

-- Função para buscar role do usuário em um tenant específico
CREATE OR REPLACE FUNCTION public.get_user_role_in_tenant(_tenant_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT role 
  FROM public.user_roles
  WHERE tenant_id = _tenant_id AND user_id = auth.uid()
  LIMIT 1
$$;

-- Função para verificar se é agency_admin em um tenant
CREATE OR REPLACE FUNCTION public.is_agency_admin(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE tenant_id = _tenant_id 
      AND user_id = auth.uid() 
      AND role = 'agency_admin'
  )
$$;

-- Atualizar função has_role para usar tabela super_admins separada
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT 
    CASE 
      WHEN _role = 'super_admin' THEN 
        EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
      ELSE 
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    END
$$;