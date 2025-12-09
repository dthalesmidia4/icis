-- Adicionar colunas para perguntas movidas do client-guide
ALTER TABLE public.period_plans
ADD COLUMN IF NOT EXISTS client_acquisition TEXT,
ADD COLUMN IF NOT EXISTS paid_traffic_budget TEXT;