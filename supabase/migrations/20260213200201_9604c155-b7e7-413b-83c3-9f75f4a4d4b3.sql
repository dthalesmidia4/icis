
-- Add branding columns to tenant_companies
ALTER TABLE public.tenant_companies
  ADD COLUMN brand_primary_color text,
  ADD COLUMN brand_secondary_color text,
  ADD COLUMN brand_font text;
