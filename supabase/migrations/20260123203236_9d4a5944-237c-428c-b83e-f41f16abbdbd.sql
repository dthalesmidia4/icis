-- Add policy for agency_admin to create invitations for their own tenant
CREATE POLICY "agency_admins_create_invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
  is_agency_admin(tenant_id) AND
  created_by = auth.uid()
);