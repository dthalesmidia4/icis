
ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS demand_type_key TEXT NULL;

ALTER TABLE public.demands
  DROP CONSTRAINT IF EXISTS demands_demand_type_key_check;

ALTER TABLE public.demands
  ADD CONSTRAINT demands_demand_type_key_check
  CHECK (demand_type_key IS NULL OR demand_type_key IN ('criativo_estatico','carrossel','video_captado','video_gerado'));

CREATE INDEX IF NOT EXISTS idx_demands_demand_type_key ON public.demands(demand_type_key);

-- Backfill conservador: apenas casos indiscutíveis
UPDATE public.demands
SET demand_type_key = 'criativo_estatico'
WHERE demand_type_key IS NULL
  AND demand_type IN ('Post Estático','Post estático','Post','Stories','Story');

UPDATE public.demands
SET demand_type_key = 'carrossel'
WHERE demand_type_key IS NULL
  AND demand_type IS NOT NULL
  AND (lower(demand_type) LIKE '%carrossel%' OR lower(demand_type) LIKE '%carousel%')
  AND demand_type NOT LIKE '%+%';
