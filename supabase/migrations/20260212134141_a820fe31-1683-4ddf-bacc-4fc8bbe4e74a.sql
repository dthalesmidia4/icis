
-- Migração 1: Preparar infraestrutura
-- 1. Adicionar colunas de stats em client_demand_templates
ALTER TABLE public.client_demand_templates
  ADD COLUMN IF NOT EXISTS times_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS times_matched integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_matched_at timestamptz;

-- 2. Migrar dados existentes de client_demand_template_stats
UPDATE public.client_demand_templates t
SET 
  times_used = s.times_used,
  last_used_at = s.last_used_at,
  times_matched = s.times_matched,
  last_matched_at = s.last_matched_at
FROM public.client_demand_template_stats s
WHERE s.template_id = t.id;

-- 3. Criar índices compostos em demand_feedback_events
CREATE INDEX IF NOT EXISTS idx_dfe_client_created 
  ON public.demand_feedback_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dfe_client_event_created 
  ON public.demand_feedback_events (client_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dfe_client_type_channel 
  ON public.demand_feedback_events (client_id, demand_type, channel);

CREATE INDEX IF NOT EXISTS idx_dfe_client_weekday 
  ON public.demand_feedback_events (client_id, publish_weekday);

CREATE INDEX IF NOT EXISTS idx_dfe_client_fingerprint 
  ON public.demand_feedback_events (client_id, demand_fingerprint);
