-- Remover planos órfãos que não tem empresa correspondente em tenant_companies
DELETE FROM marketing_plans 
WHERE company_id NOT IN (SELECT id FROM tenant_companies);

-- Remove a foreign key antiga que aponta para companies
ALTER TABLE marketing_plans 
DROP CONSTRAINT IF EXISTS marketing_plans_company_id_fkey;

-- Adiciona nova foreign key apontando para tenant_companies
ALTER TABLE marketing_plans 
ADD CONSTRAINT marketing_plans_company_id_fkey 
FOREIGN KEY (company_id) 
REFERENCES tenant_companies(id) 
ON DELETE CASCADE;