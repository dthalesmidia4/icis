ALTER TABLE public.tenant_companies
  ADD COLUMN IF NOT EXISTS brand_highlight_color text,
  ADD COLUMN IF NOT EXISTS brand_text_color text;