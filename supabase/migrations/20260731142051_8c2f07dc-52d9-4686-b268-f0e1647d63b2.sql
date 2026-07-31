ALTER TABLE public.collaborator_function_assignments
  ADD COLUMN IF NOT EXISTS work_area work_area NOT NULL DEFAULT 'midia';

UPDATE public.collaborator_function_assignments
SET work_area = 'sistemas'
WHERE function_key IN ('especificar','desenvolver','corrigir_bug_n1','corrigir_bug_n2','corrigir_bug_n3','testar','ajustar','entregar_cliente','feedback_cliente');

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.collaborator_function_assignments'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.collaborator_function_assignments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS collaborator_function_assignments_tenant_user_fn_idx;

CREATE UNIQUE INDEX IF NOT EXISTS cfa_tenant_user_fn_area_uidx
  ON public.collaborator_function_assignments (tenant_id, user_id, function_key, work_area);

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

  IF v_sequence IS NULL OR array_length(v_sequence, 1) IS NULL THEN
    RETURN _current_key;
  END IF;

  SELECT ARRAY(
    SELECT function_key
    FROM public.collaborator_function_assignments
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
      AND allowed = true
      AND work_area = _work_area
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

    RETURN _current_key;
  END IF;

  RETURN v_allowed_seq[1];
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_demand_stage_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resolved text;
  v_should_check boolean := false;
  v_area work_area;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.current_function_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_area := COALESCE(NEW.work_area, 'midia'::work_area);

  IF TG_OP = 'INSERT' THEN
    v_should_check := true;
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.current_function_key IS DISTINCT FROM OLD.current_function_key
     OR NEW.demand_type_key IS DISTINCT FROM OLD.demand_type_key
     OR NEW.work_area IS DISTINCT FROM OLD.work_area THEN
    v_should_check := true;
  END IF;

  IF NOT v_should_check THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.collaborator_function_assignments
    WHERE tenant_id = NEW.tenant_id
      AND user_id = NEW.assigned_to
      AND function_key = NEW.current_function_key
      AND work_area = v_area
      AND allowed = true
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.current_function_key IN ('aguardando_cliente', 'enviar_cliente', 'entregar_cliente') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('O responsável selecionado não possui a função obrigatória %s na área %s.', NEW.current_function_key, v_area);
  END IF;

  v_resolved := public.resolve_function_for_assignee(
    NEW.tenant_id,
    NEW.assigned_to,
    NEW.demand_type_key,
    NEW.current_function_key,
    v_area
  );

  IF v_resolved IS NOT NULL THEN
    NEW.current_function_key := v_resolved;
  END IF;

  RETURN NEW;
END;
$function$;