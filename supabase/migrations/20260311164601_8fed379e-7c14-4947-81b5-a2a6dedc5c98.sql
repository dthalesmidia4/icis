CREATE POLICY "tenant_users_view_tenant_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);