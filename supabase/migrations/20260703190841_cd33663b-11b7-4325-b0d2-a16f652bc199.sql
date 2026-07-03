
CREATE TABLE public.collaborator_function_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  function_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, function_key)
);

CREATE INDEX idx_cfa_tenant ON public.collaborator_function_assignments(tenant_id);
CREATE INDEX idx_cfa_user ON public.collaborator_function_assignments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collaborator_function_assignments TO authenticated;
GRANT ALL ON public.collaborator_function_assignments TO service_role;

ALTER TABLE public.collaborator_function_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view assignments in their tenant"
  ON public.collaborator_function_assignments FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Agency admins can insert assignments"
  ON public.collaborator_function_assignments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_agency_admin(tenant_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Agency admins can update assignments"
  ON public.collaborator_function_assignments FOR UPDATE
  TO authenticated
  USING (public.is_agency_admin(tenant_id) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.is_agency_admin(tenant_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Agency admins can delete assignments"
  ON public.collaborator_function_assignments FOR DELETE
  TO authenticated
  USING (public.is_agency_admin(tenant_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER cfa_set_updated_at
  BEFORE UPDATE ON public.collaborator_function_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
