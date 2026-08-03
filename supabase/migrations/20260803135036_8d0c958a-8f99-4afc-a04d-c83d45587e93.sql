ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS released_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS released_by uuid;

UPDATE public.demands SET released_at = COALESCE(released_at, created_at) WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS demands_unreleased_idx ON public.demands (tenant_id, assigned_to) WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION public.can_manage_release_queue(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = _tenant_id
        AND role IN ('agency_admin', 'agency_manager')
    )
$$;

CREATE OR REPLACE FUNCTION public.guard_demand_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.released_at IS NOT DISTINCT FROM OLD.released_at THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.can_manage_release_queue(NEW.tenant_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Somente gestores podem liberar ou devolver demandas para a fila.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_demand_release_trg ON public.demands;
CREATE TRIGGER guard_demand_release_trg
  BEFORE UPDATE ON public.demands
  FOR EACH ROW EXECUTE FUNCTION public.guard_demand_release();