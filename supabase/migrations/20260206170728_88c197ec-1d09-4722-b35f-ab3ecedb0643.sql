-- Allow agency admins and managers to view profiles of users in their tenant
CREATE POLICY "agency_admins_view_tenant_profiles"
ON public.profiles
FOR SELECT
USING (
  -- Own profile
  (id = auth.uid())
  OR 
  -- Super admin
  has_role(auth.uid(), 'super_admin'::app_role)
  OR
  -- Agency admin or manager can see profiles of users in their tenant
  (
    (is_agency_admin(tenant_id) OR EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role = 'agency_manager'
      AND user_roles.tenant_id = profiles.tenant_id
    ))
    AND tenant_id IS NOT NULL
  )
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "users_view_own_profile" ON public.profiles;