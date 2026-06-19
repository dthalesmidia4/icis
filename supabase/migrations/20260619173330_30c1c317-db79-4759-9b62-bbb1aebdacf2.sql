
CREATE TABLE public.planned_demand_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  solicitacao TEXT,
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
  respostas JSONB NOT NULL DEFAULT '[]'::jsonb,
  demanda JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planned_demand_history_tenant_client ON public.planned_demand_history(tenant_id, client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_demand_history TO authenticated;
GRANT ALL ON public.planned_demand_history TO service_role;

ALTER TABLE public.planned_demand_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view planned demand history"
  ON public.planned_demand_history FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant members can insert planned demand history"
  ON public.planned_demand_history FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant members can delete planned demand history"
  ON public.planned_demand_history FOR DELETE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
