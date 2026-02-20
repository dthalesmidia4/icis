
ALTER TABLE public.tenant_companies
ADD COLUMN has_mascot boolean NOT NULL DEFAULT false,
ADD COLUMN mascot_url text;
