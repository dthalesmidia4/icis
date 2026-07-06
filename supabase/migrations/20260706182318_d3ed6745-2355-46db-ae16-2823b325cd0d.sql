
CREATE TABLE public.demand_flow_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  demand_id uuid NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  from_user_id uuid NULL,
  to_user_id uuid NULL,
  from_function_key text NULL,
  to_function_key text NULL,
  action text NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_dfh_tenant_to_user ON public.demand_flow_history(tenant_id, to_user_id);
CREATE INDEX idx_dfh_demand_created ON public.demand_flow_history(demand_id, created_at DESC);
CREATE INDEX idx_dfh_tenant_created ON public.demand_flow_history(tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.demand_flow_history TO authenticated;
GRANT ALL ON public.demand_flow_history TO service_role;

ALTER TABLE public.demand_flow_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow history select by tenant access"
  ON public.demand_flow_history FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_tenant_access(auth.uid(), tenant_id)
  );

CREATE POLICY "flow history insert by tenant access"
  ON public.demand_flow_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_tenant_access(auth.uid(), tenant_id)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_flow_history;

-- Backfill: 1 linha por demanda ativa com responsável ou função corrente.
INSERT INTO public.demand_flow_history
  (tenant_id, demand_id, from_user_id, to_user_id, from_function_key, to_function_key, action, created_by, created_at, metadata)
SELECT
  d.tenant_id, d.id, NULL, d.assigned_to, NULL, d.current_function_key,
  'created', d.created_by, COALESCE(d.created_at, now()), jsonb_build_object('backfill', true)
FROM public.demands d
WHERE (d.assigned_to IS NOT NULL OR d.current_function_key IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.demand_flow_history h WHERE h.demand_id = d.id
  );
