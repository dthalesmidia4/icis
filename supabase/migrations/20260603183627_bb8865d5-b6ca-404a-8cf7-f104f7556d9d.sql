
CREATE TABLE public.client_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram','facebook')),
  account_label text,
  access_token text NOT NULL,
  ig_user_id text,
  fb_page_id text,
  token_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_csa_client ON public.client_social_accounts(client_id);
CREATE INDEX idx_csa_tenant ON public.client_social_accounts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_social_accounts TO authenticated;
GRANT ALL ON public.client_social_accounts TO service_role;

ALTER TABLE public.client_social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant access read csa" ON public.client_social_accounts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "tenant access write csa" ON public.client_social_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "tenant access update csa" ON public.client_social_accounts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "tenant access delete csa" ON public.client_social_accounts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER trg_csa_updated_at
  BEFORE UPDATE ON public.client_social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
