
-- Migração 5: Dropar tabelas e função obsoletas

-- Remover políticas RLS antes de dropar tabelas
DROP POLICY IF EXISTS "template_stats_access" ON public.client_demand_template_stats;
DROP POLICY IF EXISTS "pattern_scores_tenant_access" ON public.demand_pattern_scores;

-- Dropar tabelas
DROP TABLE IF EXISTS public.client_demand_template_stats;
DROP TABLE IF EXISTS public.demand_pattern_scores;

-- Dropar função obsoleta
DROP FUNCTION IF EXISTS public.calculate_pattern_scores(uuid);
