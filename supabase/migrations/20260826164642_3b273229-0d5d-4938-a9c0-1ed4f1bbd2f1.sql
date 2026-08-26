CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  strategy_id uuid NULL REFERENCES public.strategies(id) ON DELETE SET NULL,
  name text NOT NULL,
  objective text NULL,
  status text NOT NULL DEFAULT 'planning',
  start_date date NULL,
  end_date date NULL,
  city text NULL,
  state text NULL,
  region_label text NULL,
  radius_km numeric NULL,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_traffic_budget numeric NULL,
  acquisition_strategy text NULL,
  observations text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access_marketing_campaigns ON public.marketing_campaigns;
CREATE POLICY tenant_access_marketing_campaigns
  ON public.marketing_campaigns
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_company
  ON public.marketing_campaigns (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_status
  ON public.marketing_campaigns (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_company_start
  ON public.marketing_campaigns (company_id, start_date DESC);

DROP TRIGGER IF EXISTS update_marketing_campaigns_updated_at ON public.marketing_campaigns;
CREATE TRIGGER update_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.period_plans
  ADD COLUMN IF NOT EXISTS campaign_id uuid NULL REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_period_plans_campaign ON public.period_plans (campaign_id);

ALTER TABLE public.systems_clients
  ADD COLUMN IF NOT EXISTS acquisition_campaign_id uuid NULL REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_systems_clients_acquisition_campaign ON public.systems_clients (acquisition_campaign_id);