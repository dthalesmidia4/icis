-- Remove registros órfãos (strategies com company_id que não existe em tenant_companies)
DELETE FROM public.strategies
WHERE company_id NOT IN (
  SELECT id FROM public.tenant_companies
);

-- Remove a foreign key antiga que referencia a tabela 'companies'
ALTER TABLE public.strategies 
DROP CONSTRAINT IF EXISTS strategies_company_id_fkey;

-- Adiciona a nova foreign key que referencia 'tenant_companies'
ALTER TABLE public.strategies 
ADD CONSTRAINT strategies_company_id_fkey 
FOREIGN KEY (company_id) 
REFERENCES public.tenant_companies(id) 
ON DELETE CASCADE;