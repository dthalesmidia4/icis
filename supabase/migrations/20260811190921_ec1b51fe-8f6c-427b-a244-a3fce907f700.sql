CREATE TABLE public.client_stage_routing_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  work_area work_area NOT NULL,
  function_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id, work_area, function_key, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_stage_routing_preferences TO authenticated;
GRANT ALL ON public.client_stage_routing_preferences TO service_role;

ALTER TABLE public.client_stage_routing_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view stage routing"
  ON public.client_stage_routing_preferences FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins insert stage routing"
  ON public.client_stage_routing_preferences FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR is_agency_admin(tenant_id));

CREATE POLICY "Admins update stage routing"
  ON public.client_stage_routing_preferences FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR is_agency_admin(tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR is_agency_admin(tenant_id));

CREATE POLICY "Admins delete stage routing"
  ON public.client_stage_routing_preferences FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR is_agency_admin(tenant_id));

CREATE INDEX idx_csrp_client_stage
  ON public.client_stage_routing_preferences (tenant_id, client_id, work_area, function_key, active);

CREATE INDEX idx_csrp_user_stage
  ON public.client_stage_routing_preferences (tenant_id, user_id, work_area, function_key, active);

CREATE TRIGGER update_csrp_updated_at
  BEFORE UPDATE ON public.client_stage_routing_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_stage_routing_preferences;