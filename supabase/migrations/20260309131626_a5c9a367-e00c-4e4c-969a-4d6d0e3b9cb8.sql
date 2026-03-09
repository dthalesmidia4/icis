
CREATE TABLE public.platform_logins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  access_info text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_logins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_platform_logins" ON public.platform_logins
  FOR ALL
  TO public
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR user_has_tenant_access(auth.uid(), tenant_id)
  );
