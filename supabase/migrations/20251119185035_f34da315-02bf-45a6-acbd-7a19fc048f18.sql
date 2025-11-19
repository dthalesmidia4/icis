-- Adicionar coluna fantasy_name à tabela tenant_companies
ALTER TABLE public.tenant_companies 
ADD COLUMN IF NOT EXISTS fantasy_name TEXT;

-- Comentário: fantasy_name armazena o nome fantasia da empresa, usado como referência principal nas interfaces