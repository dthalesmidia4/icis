-- Remove selected_month column from companies table
ALTER TABLE public.companies DROP COLUMN IF EXISTS selected_month;

-- Remove selected_month column from tenant_companies table
ALTER TABLE public.tenant_companies DROP COLUMN IF EXISTS selected_month;