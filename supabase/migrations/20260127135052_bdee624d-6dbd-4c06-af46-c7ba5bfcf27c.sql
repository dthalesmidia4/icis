-- Adicionar coluna publish_time para persistir horário de publicação nas demandas
ALTER TABLE public.demands
ADD COLUMN publish_time TEXT DEFAULT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.demands.publish_time IS 'Horário de publicação no formato HH:MM (ex: 09:00, 14:30)';