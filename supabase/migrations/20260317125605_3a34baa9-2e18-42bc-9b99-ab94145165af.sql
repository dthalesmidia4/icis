-- Drop the recursive policy
DROP POLICY IF EXISTS "tenant_members_view_roles" ON public.user_roles;

-- Create a security definer function to safely get user's tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.user_roles WHERE user_id = _user_id
$$;

-- Recreate the policy using the safe function
CREATE POLICY "tenant_members_view_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
);