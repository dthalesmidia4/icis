CREATE OR REPLACE FUNCTION public.block_conflicting_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamp;
  v_end timestamp;
  v_conflict record;
  v_untimed text[] := ARRAY['aguardando_cliente','enviar_cliente','entregar_cliente','feedback_cliente'];
BEGIN
  IF coalesce(current_setting('app.skip_schedule_check', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL OR NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.current_function_key,'') = ANY(v_untimed) THEN
    RETURN NEW;
  END IF;

  IF NEW.due_date IS NULL OR NEW.delivery_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.due_date < CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  v_start := NEW.due_date + coalesce(NEW.due_time, '00:00')::time;
  v_end := NEW.delivery_date + coalesce(NEW.delivery_time, '00:00')::time;
  IF v_end <= v_start THEN
    RETURN NEW;
  END IF;

  SELECT d.title,
         (d.due_date + coalesce(d.due_time,'00:00')::time) AS s,
         (d.delivery_date + coalesce(d.delivery_time,'00:00')::time) AS e
    INTO v_conflict
  FROM public.demands d
  WHERE d.id <> NEW.id
    AND d.tenant_id = NEW.tenant_id
    AND d.assigned_to = NEW.assigned_to
    AND d.archived_at IS NULL
    AND d.is_draft = false
    AND coalesce(d.current_function_key,'') <> ALL(v_untimed)
    AND d.due_date IS NOT NULL
    AND d.delivery_date IS NOT NULL
    AND (d.due_date + coalesce(d.due_time,'00:00')::time) < v_end
    AND (d.delivery_date + coalesce(d.delivery_time,'00:00')::time) > v_start
  ORDER BY (d.due_date + coalesce(d.due_time,'00:00')::time)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Conflito de agenda: o responsável já tem "%s" de %s a %s.',
        v_conflict.title,
        to_char(v_conflict.s, 'DD/MM HH24:MI'),
        to_char(v_conflict.e, 'DD/MM HH24:MI')
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_conflicting_assignment_trigger ON public.demands;
CREATE TRIGGER block_conflicting_assignment_trigger
BEFORE UPDATE ON public.demands
FOR EACH ROW
EXECUTE FUNCTION public.block_conflicting_assignment();