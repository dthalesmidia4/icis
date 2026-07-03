
CREATE TABLE public.function_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  function_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, function_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.function_permissions TO authenticated;
GRANT ALL ON public.function_permissions TO service_role;

ALTER TABLE public.function_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view function permissions"
ON public.function_permissions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_tenant_access(auth.uid(), tenant_id)
);

CREATE POLICY "Admins can insert function permissions"
ON public.function_permissions FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_agency_admin(tenant_id)
);

CREATE POLICY "Admins can update function permissions"
ON public.function_permissions FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_agency_admin(tenant_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_agency_admin(tenant_id)
);

CREATE POLICY "Admins can delete function permissions"
ON public.function_permissions FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.is_agency_admin(tenant_id)
);

CREATE TRIGGER update_function_permissions_updated_at
BEFORE UPDATE ON public.function_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
