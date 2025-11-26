-- Remove a coluna responsible_name da tabela cards
ALTER TABLE public.cards DROP COLUMN IF EXISTS responsible_name;