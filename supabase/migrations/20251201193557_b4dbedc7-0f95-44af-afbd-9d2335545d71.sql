-- Remover política RESTRICTIVE incorreta
DROP POLICY IF EXISTS tenant_isolation_period_plans ON public.period_plans;

-- Criar política PERMISSIVE correta
CREATE POLICY "tenant_access_period_plans" ON public.period_plans
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  );