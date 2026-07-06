
-- 1. Update CHECK constraint to allow 'outro'
ALTER TABLE public.demands DROP CONSTRAINT IF EXISTS demands_demand_type_key_check;
ALTER TABLE public.demands ADD CONSTRAINT demands_demand_type_key_check
  CHECK (demand_type_key IS NULL OR demand_type_key = ANY (ARRAY[
    'criativo_estatico'::text,
    'carrossel'::text,
    'video_captado'::text,
    'video_gerado'::text,
    'outro'::text
  ]));

-- 2. Seed 'outro' flow rules for every existing tenant that already has rules configured
--    planejar + revisar = required; all others = disabled
INSERT INTO public.demand_type_flow_rules (tenant_id, demand_type_key, demand_type_name, function_key, requirement)
SELECT DISTINCT r.tenant_id, 'outro', 'Outro', ff.function_key,
  CASE WHEN ff.function_key IN ('planejar','revisar') THEN 'required' ELSE 'disabled' END
FROM public.demand_type_flow_rules r
CROSS JOIN (SELECT DISTINCT function_key FROM public.flow_functions) ff
WHERE NOT EXISTS (
  SELECT 1 FROM public.demand_type_flow_rules x
  WHERE x.tenant_id = r.tenant_id
    AND x.demand_type_key = 'outro'
    AND x.function_key = ff.function_key
);
