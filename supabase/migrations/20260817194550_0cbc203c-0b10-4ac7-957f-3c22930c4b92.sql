CREATE TABLE public.demand_change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  demand_id uuid NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  requested_by uuid NULL,
  source_function_key text NULL,
  target_function_key text NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demand_change_requests_status_chk CHECK (status IN ('active','resolved','superseded'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_change_requests TO authenticated;
GRANT ALL ON public.demand_change_requests TO service_role;
ALTER TABLE public.demand_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "change requests select by tenant access" ON public.demand_change_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "change requests insert by tenant access" ON public.demand_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "change requests update by tenant access" ON public.demand_change_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "change requests delete by tenant access" ON public.demand_change_requests
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX idx_dcr_demand ON public.demand_change_requests(demand_id);
CREATE INDEX idx_dcr_tenant ON public.demand_change_requests(tenant_id);
CREATE INDEX idx_dcr_status ON public.demand_change_requests(status);
CREATE UNIQUE INDEX idx_dcr_one_active_per_demand ON public.demand_change_requests(demand_id) WHERE status = 'active';

CREATE TRIGGER trg_dcr_updated_at BEFORE UPDATE ON public.demand_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.demand_change_request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.demand_change_requests(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  text text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_by uuid NULL,
  completed_at timestamptz NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_change_request_items TO authenticated;
GRANT ALL ON public.demand_change_request_items TO service_role;
ALTER TABLE public.demand_change_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "change request items select by tenant access" ON public.demand_change_request_items
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "change request items insert by tenant access" ON public.demand_change_request_items
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "change request items update by tenant access" ON public.demand_change_request_items
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "change request items delete by tenant access" ON public.demand_change_request_items
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX idx_dcri_request ON public.demand_change_request_items(request_id);
CREATE INDEX idx_dcri_tenant ON public.demand_change_request_items(tenant_id);

CREATE TRIGGER trg_dcri_updated_at BEFORE UPDATE ON public.demand_change_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_change_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_change_request_items;
ALTER TABLE public.demand_change_requests REPLICA IDENTITY FULL;
ALTER TABLE public.demand_change_request_items REPLICA IDENTITY FULL;