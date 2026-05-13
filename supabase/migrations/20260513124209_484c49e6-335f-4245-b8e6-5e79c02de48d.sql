ALTER TABLE public.tenant_companies
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS corporate_email text,
  ADD COLUMN IF NOT EXISTS commercial_phone text,
  ADD COLUMN IF NOT EXISTS responsible_cpf text;