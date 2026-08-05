CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(_tenant_id uuid, _user_id uuid, _demand_type_key text, _current_key text, _work_area work_area DEFAULT 'midia'::work_area)
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
  v_prev text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN _current_key;
  END IF;

  WITH req AS (
    SELECT function_key
    FROM public.demand_type_flow_rules
    WHERE tenant_id = _tenant_id
      AND demand_type_key = _demand_type_key
      AND work_area = _work_area
      AND requirement = 'required'
  ),
  fns AS (
    SELECT function_key, position
    FROM public.flow_functions
    WHERE tenant_id = _tenant_id
      AND active = true
      AND work_area = _work_area
      AND function_key <> 'avaliar'
    ORDER BY position
  )
  SELECT ARRAY(
    SELECT function_key FROM fns
    WHERE (SELECT count(*) FROM req) = 0
       OR function_key IN (SELECT function_key FROM req)
    ORDER BY position
  ) INTO v_sequence;

  SELECT ARRAY(
    SELECT function_key
    FROM public.collaborator_function_assignments
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
      AND allowed = true
      AND work_area = _work_area
      AND function_key <> 'avaliar'
  ) INTO v_allowed;

  -- Etapa atual permitida ao usuário: mantém.
  IF _current_key IS NOT NULL
     AND _current_key <> 'avaliar'
     AND _current_key = ANY(v_allowed) THEN
    RETURN _current_key;
  END IF;

  IF v_sequence IS NULL OR array_length(v_sequence, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ARRAY(
    SELECT s FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE s = ANY(v_allowed)
    ORDER BY ord
  ) INTO v_allowed_seq;

  IF array_length(v_allowed_seq, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  IF _current_key IS NOT NULL AND _current_key <> 'avaliar' AND _current_key = ANY(v_sequence) THEN
    SELECT ord INTO v_idx
    FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE s = _current_key
    LIMIT 1;

    -- 1. Preferência: próxima etapa habilitada à frente (não regride o fluxo).
    SELECT s INTO v_next
    FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE ord > v_idx AND s = ANY(v_allowed)
    ORDER BY ord
    LIMIT 1;

    IF v_next IS NOT NULL THEN
      RETURN v_next;
    END IF;

    -- 2. Último recurso: etapa habilitada mais próxima ANTES da atual (regressão).
    SELECT s INTO v_prev
    FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE ord < v_idx AND s = ANY(v_allowed)
    ORDER BY ord DESC
    LIMIT 1;

    RETURN v_prev;
  END IF;

  RETURN v_allowed_seq[1];
END;
$function$;