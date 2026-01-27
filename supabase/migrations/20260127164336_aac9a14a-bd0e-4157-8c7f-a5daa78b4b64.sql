-- Remove a tabela 'cards' que foi unificada com 'demands'
-- Todos os dados já foram migrados para a tabela 'demands' com source='card'
DROP TABLE IF EXISTS public.cards;