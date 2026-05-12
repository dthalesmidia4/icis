ALTER TABLE public.tenant_companies
  ADD COLUMN IF NOT EXISTS brand_secondary_font text,
  ADD COLUMN IF NOT EXISTS brand_auxiliary_color text;

ALTER TABLE public.visual_identity_presets
  ADD COLUMN IF NOT EXISTS secondary_font text,
  ADD COLUMN IF NOT EXISTS auxiliary_color text;