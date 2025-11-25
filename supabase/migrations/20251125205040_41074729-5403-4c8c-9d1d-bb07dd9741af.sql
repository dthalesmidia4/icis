-- Adicionar campos de período à tabela marketing_plans
ALTER TABLE public.marketing_plans 
ADD COLUMN periodo_titulo TEXT,
ADD COLUMN periodo_data_inicio DATE,
ADD COLUMN periodo_data_fim DATE,
ADD COLUMN periodo_status TEXT DEFAULT 'ativo' CHECK (periodo_status IN ('ativo', 'rascunho', 'concluido'));

-- Criar índices para melhor performance
CREATE INDEX idx_marketing_plans_periodo_status ON public.marketing_plans(periodo_status);
CREATE INDEX idx_marketing_plans_periodo_dates ON public.marketing_plans(periodo_data_inicio, periodo_data_fim);

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.marketing_plans.periodo_titulo IS 'Nome descritivo do período (ex: Campanha Q2, Estratégia de Verão)';
COMMENT ON COLUMN public.marketing_plans.periodo_data_inicio IS 'Data de início do período de planejamento';
COMMENT ON COLUMN public.marketing_plans.periodo_data_fim IS 'Data de término do período de planejamento';
COMMENT ON COLUMN public.marketing_plans.periodo_status IS 'Status do período: ativo, rascunho ou concluido';