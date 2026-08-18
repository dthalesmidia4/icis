CREATE TABLE public.demand_stage_duration_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  demand_id uuid NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  function_key text NOT NULL,
  duration_min integer NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (demand_id, function_key)
);

CREATE INDEX idx_dsdo_tenant_demand ON public.demand_stage_duration_overrides (tenant_id, demand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_stage_duration_overrides TO authenticated;
GRANT ALL ON public.demand_stage_duration_overrides TO service_role;

ALTER TABLE public.demand_stage_duration_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read stage duration overrides"
ON public.demand_stage_duration_overrides FOR SELECT TO authenticated
USING (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "tenant members insert stage duration overrides"
ON public.demand_stage_duration_overrides FOR INSERT TO authenticated
WITH CHECK (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "tenant members update stage duration overrides"
ON public.demand_stage_duration_overrides FOR UPDATE TO authenticated
USING (public.user_has_tenant_access(auth.uid(), tenant_id))
WITH CHECK (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "tenant members delete stage duration overrides"
ON public.demand_stage_duration_overrides FOR DELETE TO authenticated
USING (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER dsdo_set_updated_at
BEFORE UPDATE ON public.demand_stage_duration_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER dsdo_validate_duration
BEFORE INSERT OR UPDATE ON public.demand_stage_duration_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();