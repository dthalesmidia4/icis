-- Tabela para permissões de acesso aos botões/seções do Hub
CREATE TABLE public.user_hub_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hub_section text NOT NULL,
  can_access boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id, hub_section)
);

-- Habilitar RLS
ALTER TABLE public.user_hub_permissions ENABLE ROW LEVEL SECURITY;

-- Política: admins podem gerenciar todas as permissões de hub do tenant
CREATE POLICY "admins_manage_hub_permissions"
ON public.user_hub_permissions
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR is_agency_admin(tenant_id)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR is_agency_admin(tenant_id)
);

-- Política: usuários podem ver suas próprias permissões
CREATE POLICY "users_view_own_hub_permissions"
ON public.user_hub_permissions
FOR SELECT
USING (user_id = auth.uid());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_user_hub_permissions_updated_at
  BEFORE UPDATE ON public.user_hub_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();