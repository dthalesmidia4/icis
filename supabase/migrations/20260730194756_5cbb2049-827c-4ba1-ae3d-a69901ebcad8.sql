CREATE TABLE public.systems_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  parent_company_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  city text,
  state text,
  plan text,
  notes text,
  contact_cadence_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'ativo',
  onboarded_at date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.systems_clients TO authenticated;
GRANT ALL ON public.systems_clients TO service_role;

ALTER TABLE public.systems_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view systems clients"
ON public.systems_clients FOR SELECT TO authenticated
USING (public.is_super_admin() OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can create systems clients"
ON public.systems_clients FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin() OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update systems clients"
ON public.systems_clients FOR UPDATE TO authenticated
USING (public.is_super_admin() OR public.user_has_tenant_access(auth.uid(), tenant_id))
WITH CHECK (public.is_super_admin() OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can delete systems clients"
ON public.systems_clients FOR DELETE TO authenticated
USING (public.is_super_admin() OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX idx_systems_clients_tenant ON public.systems_clients(tenant_id);
CREATE INDEX idx_systems_clients_parent ON public.systems_clients(parent_company_id);

CREATE TRIGGER update_systems_clients_updated_at
BEFORE UPDATE ON public.systems_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.demands
  ADD COLUMN subclient_id uuid REFERENCES public.systems_clients(id) ON DELETE SET NULL;

ALTER TABLE public.client_touchpoints
  ADD COLUMN subclient_id uuid REFERENCES public.systems_clients(id) ON DELETE SET NULL;

CREATE INDEX idx_demands_subclient ON public.demands(subclient_id);
CREATE INDEX idx_client_touchpoints_subclient ON public.client_touchpoints(subclient_id);