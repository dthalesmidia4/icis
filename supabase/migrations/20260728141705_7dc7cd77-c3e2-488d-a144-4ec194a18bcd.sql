-- 1) Enum de área
DO $$ BEGIN
  CREATE TYPE public.work_area AS ENUM ('midia', 'sistemas');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Colunas em demands, profiles, tenant_companies
ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS work_area public.work_area NOT NULL DEFAULT 'midia';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_work_area text NOT NULL DEFAULT 'ambos';

ALTER TABLE public.tenant_companies
  ADD COLUMN IF NOT EXISTS default_work_area public.work_area;

CREATE INDEX IF NOT EXISTS idx_demands_assigned_area
  ON public.demands (assigned_to, work_area)
  WHERE archived_at IS NULL;

-- 3) Tabela user_area_schedules
CREATE TABLE IF NOT EXISTS public.user_area_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  work_area public.work_area NOT NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_user_area_schedules_lookup
  ON public.user_area_schedules (tenant_id, user_id, weekday, work_area);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_area_schedules TO authenticated;
GRANT ALL ON public.user_area_schedules TO service_role;

ALTER TABLE public.user_area_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uas_select_tenant" ON public.user_area_schedules;
CREATE POLICY "uas_select_tenant" ON public.user_area_schedules
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_tenant_access(auth.uid(), tenant_id)
  );

DROP POLICY IF EXISTS "uas_manage_admin" ON public.user_area_schedules;
CREATE POLICY "uas_manage_admin" ON public.user_area_schedules
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.is_agency_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND tenant_id = user_area_schedules.tenant_id
        AND role = 'agency_manager'
    )
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.is_agency_admin(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND tenant_id = user_area_schedules.tenant_id
        AND role = 'agency_manager'
    )
    OR user_id = auth.uid()
  );

CREATE TRIGGER trg_uas_updated_at
  BEFORE UPDATE ON public.user_area_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Backfill de áreas padrão dos perfis conhecidos
UPDATE public.profiles p
SET default_work_area = 'midia'
FROM auth.users u
WHERE p.id = u.id AND lower(u.email) LIKE 'lucia%';

UPDATE public.profiles p
SET default_work_area = 'sistemas'
FROM auth.users u
WHERE p.id = u.id AND lower(u.email) LIKE 'henrique%';
