-- 1) Deactivate 'avaliar' as an operational flow function
UPDATE public.flow_functions
SET active = false, updated_at = now()
WHERE function_key = 'avaliar';

-- 2) Update resolver to skip 'avaliar' when picking operational stages
CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(_tenant_id uuid, _user_id uuid, _demand_type_key text, _current_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sequence text[];
  v_allowed text[];
  v_allowed_seq text[];
  v_idx int;
  v_next text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN _current_key;
  END IF;

  WITH req AS (
    SELECT function_key
    FROM public.demand_type_flow_rules
    WHERE tenant_id = _tenant_id
      AND demand_type_key = _demand_type_key
      AND requirement = 'required'
  ),
  fns AS (
    SELECT function_key, position
    FROM public.flow_functions
    WHERE tenant_id = _tenant_id AND active = true AND function_key <> 'avaliar'
    ORDER BY position
  )
  SELECT ARRAY(
    SELECT function_key FROM fns
    WHERE (SELECT count(*) FROM req) = 0
       OR function_key IN (SELECT function_key FROM req)
    ORDER BY position
  ) INTO v_sequence;

  IF v_sequence IS NULL OR array_length(v_sequence, 1) IS NULL THEN
    RETURN _current_key;
  END IF;

  SELECT ARRAY(
    SELECT function_key
    FROM public.collaborator_function_assignments
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
      AND allowed = true
      AND function_key <> 'avaliar'
  ) INTO v_allowed;

  SELECT ARRAY(
    SELECT s FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE s = ANY(v_allowed)
    ORDER BY ord
  ) INTO v_allowed_seq;

  IF array_length(v_allowed_seq, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  IF _current_key IS NOT NULL
     AND _current_key <> 'avaliar'
     AND _current_key = ANY(v_allowed)
     AND _current_key = ANY(v_sequence) THEN
    RETURN _current_key;
  END IF;

  IF _current_key IS NOT NULL AND _current_key <> 'avaliar' AND _current_key = ANY(v_sequence) THEN
    SELECT ord INTO v_idx
    FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE s = _current_key
    LIMIT 1;

    SELECT s INTO v_next
    FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE ord > v_idx AND s = ANY(v_allowed)
    ORDER BY ord
    LIMIT 1;

    IF v_next IS NOT NULL THEN
      RETURN v_next;
    END IF;
  END IF;

  RETURN v_allowed_seq[1];
END;
$function$;

-- 3) Backfill: move cards stuck in 'avaliar' to a valid stage for their assignee
DO $$
DECLARE
  r RECORD;
  v_new_key text;
  v_fallback_key text;
BEGIN
  FOR r IN
    SELECT id, tenant_id, assigned_to, demand_type_key, current_function_key
    FROM public.demands
    WHERE current_function_key = 'avaliar'
  LOOP
    v_new_key := NULL;
    IF r.assigned_to IS NOT NULL THEN
      v_new_key := public.resolve_function_for_assignee(r.tenant_id, r.assigned_to, r.demand_type_key, NULL);
    END IF;

    IF v_new_key IS NULL THEN
      SELECT function_key INTO v_fallback_key
      FROM public.flow_functions
      WHERE tenant_id = r.tenant_id AND active = true AND function_key <> 'avaliar'
      ORDER BY position
      LIMIT 1;
      v_new_key := v_fallback_key;
    END IF;

    IF v_new_key IS NOT NULL THEN
      UPDATE public.demands
      SET current_function_key = v_new_key, updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.demand_flow_history (tenant_id, demand_id, from_function_key, to_function_key, action, metadata)
      VALUES (r.tenant_id, r.id, 'avaliar', v_new_key, 'system_repair', jsonb_build_object('reason', 'avaliar_deactivated_backfill'));
    END IF;
  END LOOP;
END$$;