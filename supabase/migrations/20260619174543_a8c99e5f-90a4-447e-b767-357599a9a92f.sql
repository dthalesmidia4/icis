GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_demand_history TO authenticated;
GRANT ALL ON public.planned_demand_history TO service_role;

DROP POLICY IF EXISTS "Tenant members can view planned demand history" ON public.planned_demand_history;
DROP POLICY IF EXISTS "Tenant members can insert planned demand history" ON public.planned_demand_history;
DROP POLICY IF EXISTS "Tenant members can delete planned demand history" ON public.planned_demand_history;

CREATE POLICY "Tenant members can view planned demand history"
ON public.planned_demand_history
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_tenant_access(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant members can insert planned demand history"
ON public.planned_demand_history
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_tenant_access(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant members can delete planned demand history"
ON public.planned_demand_history
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_tenant_access(auth.uid(), tenant_id)
);