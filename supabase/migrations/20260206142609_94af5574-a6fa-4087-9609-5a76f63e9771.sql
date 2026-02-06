-- Tabela para controlar permissões de colunas do Kanban por usuário
CREATE TABLE public.user_column_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status_id UUID NOT NULL REFERENCES public.pipeline_statuses(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, status_id)
);

-- Habilitar RLS
ALTER TABLE public.user_column_permissions ENABLE ROW LEVEL SECURITY;

-- Política: Admins podem gerenciar todas as permissões do tenant
CREATE POLICY "admins_manage_column_permissions" ON public.user_column_permissions
FOR ALL USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR is_agency_admin(tenant_id)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR is_agency_admin(tenant_id)
);

-- Política: Usuários podem ver suas próprias permissões
CREATE POLICY "users_view_own_permissions" ON public.user_column_permissions
FOR SELECT USING (user_id = auth.uid());

-- Trigger para updated_at
CREATE TRIGGER update_user_column_permissions_updated_at
  BEFORE UPDATE ON public.user_column_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_user_column_permissions_user_id ON public.user_column_permissions(user_id);
CREATE INDEX idx_user_column_permissions_tenant_id ON public.user_column_permissions(tenant_id);
CREATE INDEX idx_user_column_permissions_status_id ON public.user_column_permissions(status_id);