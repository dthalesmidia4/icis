
-- FASE 1: Limpeza geral do sistema

-- 1. Drop tabelas legadas
DROP TABLE IF EXISTS public.companies CASCADE;
DROP TABLE IF EXISTS public.marketing_plans CASCADE;

-- 2. Remover colunas legadas da tabela demands
ALTER TABLE public.demands DROP COLUMN IF EXISTS objetivo;
ALTER TABLE public.demands DROP COLUMN IF EXISTS instrucoes;
ALTER TABLE public.demands DROP COLUMN IF EXISTS column_name;
ALTER TABLE public.demands DROP COLUMN IF EXISTS plan_id;
ALTER TABLE public.demands DROP COLUMN IF EXISTS publication_dates;
ALTER TABLE public.demands DROP COLUMN IF EXISTS delivery_date;
ALTER TABLE public.demands DROP COLUMN IF EXISTS file_location;

-- 3. Corrigir RLS da tabela api_keys (restringir a super_admin)
DROP POLICY IF EXISTS "Allow authenticated users to manage API keys" ON public.api_keys;
CREATE POLICY "super_admins_manage_api_keys" ON public.api_keys
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
