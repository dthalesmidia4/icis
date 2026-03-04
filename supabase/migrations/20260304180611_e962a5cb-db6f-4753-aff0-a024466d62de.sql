
CREATE TABLE public.generated_contents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  content_type text NOT NULL DEFAULT 'post',
  title text,
  prompt text,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_generated_contents" ON public.generated_contents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX idx_generated_contents_client ON public.generated_contents(client_id, created_at DESC);
