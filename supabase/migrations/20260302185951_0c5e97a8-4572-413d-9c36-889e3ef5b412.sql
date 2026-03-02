
-- Table for visual identity presets
CREATE TABLE public.visual_identity_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Sem nome',
  primary_color TEXT,
  secondary_color TEXT,
  highlight_color TEXT,
  text_color TEXT,
  font_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.visual_identity_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_vi_presets"
ON public.visual_identity_presets
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_tenant_access(auth.uid(), tenant_id)
);

CREATE INDEX idx_vi_presets_company ON public.visual_identity_presets(company_id);
