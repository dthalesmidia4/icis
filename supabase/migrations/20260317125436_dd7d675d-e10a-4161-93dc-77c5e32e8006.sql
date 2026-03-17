CREATE POLICY "tenant_members_view_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);