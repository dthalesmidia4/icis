
DROP TABLE IF EXISTS public.function_permissions;

CREATE TABLE public.flow_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  function_key text NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, function_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_functions TO authenticated;
GRANT ALL ON public.flow_functions TO service_role;
ALTER TABLE public.flow_functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view flow_functions"
ON public.flow_functions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins insert flow_functions"
ON public.flow_functions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id));

CREATE POLICY "Admins update flow_functions"
ON public.flow_functions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id));

CREATE POLICY "Admins delete flow_functions"
ON public.flow_functions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id));

CREATE TRIGGER update_flow_functions_updated_at
BEFORE UPDATE ON public.flow_functions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.demand_type_flow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  demand_type_key text NOT NULL,
  demand_type_name text NOT NULL,
  function_key text NOT NULL,
  requirement text NOT NULL DEFAULT 'disabled' CHECK (requirement IN ('required','optional','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, demand_type_key, function_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_type_flow_rules TO authenticated;
GRANT ALL ON public.demand_type_flow_rules TO service_role;
ALTER TABLE public.demand_type_flow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view demand_type_flow_rules"
ON public.demand_type_flow_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins insert demand_type_flow_rules"
ON public.demand_type_flow_rules FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id));

CREATE POLICY "Admins update demand_type_flow_rules"
ON public.demand_type_flow_rules FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id));

CREATE POLICY "Admins delete demand_type_flow_rules"
ON public.demand_type_flow_rules FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_agency_admin(tenant_id));

CREATE TRIGGER update_demand_type_flow_rules_updated_at
BEFORE UPDATE ON public.demand_type_flow_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
