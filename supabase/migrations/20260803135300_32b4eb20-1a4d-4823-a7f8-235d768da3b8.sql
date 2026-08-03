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

  IF coalesce(current_setting('app.skip_release_guard', true), '') = 'on' THEN
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

CREATE OR REPLACE FUNCTION public.auto_release_next_for_user(_tenant_id uuid, _user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg jsonb;
  v_limit int;
  v_visible int;
  v_slots int;
  v_ids uuid[];
BEGIN
  IF _tenant_id IS NULL OR _user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(settings->'release_queue', '{}'::jsonb) INTO v_cfg
  FROM public.tenants WHERE id = _tenant_id;

  IF coalesce((v_cfg->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN 0;
  END IF;

  v_limit := greatest(coalesce((v_cfg->>'limit')::int, 6), 1);

  SELECT count(*) INTO v_visible
  FROM public.demands
  WHERE tenant_id = _tenant_id
    AND assigned_to = _user_id
    AND archived_at IS NULL
    AND is_draft = false
    AND released_at IS NOT NULL;

  v_slots := v_limit - v_visible;
  IF v_slots <= 0 THEN
    RETURN 0;
  END IF;

  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.demands
    WHERE tenant_id = _tenant_id
      AND assigned_to = _user_id
      AND archived_at IS NULL
      AND is_draft = false
      AND released_at IS NULL
    ORDER BY due_date NULLS LAST, due_time NULLS LAST, created_at
    LIMIT v_slots
  ) q;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.skip_release_guard', 'on', true);

  UPDATE public.demands
  SET released_at = now()
  WHERE id = ANY(v_ids);

  INSERT INTO public.demand_flow_history (tenant_id, demand_id, to_user_id, action, metadata)
  SELECT _tenant_id, id, _user_id, 'released', jsonb_build_object('auto', true)
  FROM public.demands WHERE id = ANY(v_ids);

  PERFORM set_config('app.skip_release_guard', 'off', true);

  RETURN array_length(v_ids, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_auto_release_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.assigned_to IS NULL OR OLD.is_draft = true THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    PERFORM public.auto_release_next_for_user(OLD.tenant_id, OLD.assigned_to);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_release_queue_trg ON public.demands;
CREATE TRIGGER trigger_auto_release_queue_trg
  AFTER UPDATE ON public.demands
  FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_release_queue();