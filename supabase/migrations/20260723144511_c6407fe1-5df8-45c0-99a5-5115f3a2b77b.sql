
-- 1) avulso_drafts
CREATE TABLE public.avulso_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video','estatico','carrossel')),
  title TEXT,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_avulso_drafts_user ON public.avulso_drafts(user_id, updated_at DESC);
CREATE INDEX idx_avulso_drafts_client ON public.avulso_drafts(client_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avulso_drafts TO authenticated;
GRANT ALL ON public.avulso_drafts TO service_role;
ALTER TABLE public.avulso_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own avulso drafts"
  ON public.avulso_drafts FOR ALL
  USING (auth.uid() = user_id AND public.user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (auth.uid() = user_id AND public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER trg_avulso_drafts_updated_at
  BEFORE UPDATE ON public.avulso_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) seedance_pricing
CREATE TABLE public.seedance_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_key TEXT NOT NULL CHECK (model_key IN ('lite','pro','v2')),
  resolution TEXT NOT NULL CHECK (resolution IN ('480p','720p','1080p')),
  price_credits_per_second NUMERIC(12,4) NOT NULL,
  price_brl_per_credit NUMERIC(12,6),
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(model_key, resolution)
);

GRANT SELECT ON public.seedance_pricing TO authenticated;
GRANT ALL ON public.seedance_pricing TO service_role;
ALTER TABLE public.seedance_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read seedance pricing"
  ON public.seedance_pricing FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage seedance pricing"
  ON public.seedance_pricing FOR ALL
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE TRIGGER trg_seedance_pricing_updated_at
  BEFORE UPDATE ON public.seedance_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) video_references (reusable library)
CREATE TABLE public.video_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('character','scenery','prop','brand_asset')),
  name TEXT NOT NULL,
  description TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  primary_image_url TEXT,
  extra_image_urls TEXT[] NOT NULL DEFAULT '{}',
  logo_variant TEXT CHECK (logo_variant IN ('primary','light','dark')),
  restrictions TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_video_references_tenant ON public.video_references(tenant_id, kind);
CREATE INDEX idx_video_references_client ON public.video_references(client_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_references TO authenticated;
GRANT ALL ON public.video_references TO service_role;
ALTER TABLE public.video_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members manage video references"
  ON public.video_references FOR ALL
  USING (public.user_has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (public.user_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER trg_video_references_updated_at
  BEFORE UPDATE ON public.video_references
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
