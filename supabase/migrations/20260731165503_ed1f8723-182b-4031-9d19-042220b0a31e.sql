CREATE OR REPLACE FUNCTION public.user_can_hold_function(_tenant_id uuid, _user_id uuid, _function_key text, _work_area work_area DEFAULT 'midia'::work_area)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborator_function_assignments
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
      AND function_key = _function_key
      AND work_area = _work_area
      AND allowed = true
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_can_hold_function(uuid, uuid, text, work_area) TO authenticated, service_role;

-- resolve_function_for_assignee: nunca mais devolver a etapa atual quando ela não é permitida.
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

  SELECT ARRAY(
    SELECT function_key
    FROM public.collaborator_function_assignments
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
      AND allowed = true
      AND work_area = _work_area
      AND function_key <> 'avaliar'
  ) INTO v_allowed;

  -- Etapa atual permitida ao usuário: mantém (regra anti-regressão).
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

    SELECT s INTO v_next
    FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE ord > v_idx AND s = ANY(v_allowed)
    ORDER BY ord
    LIMIT 1;

    -- Sem etapa permitida à frente: NÃO aprova a etapa atual.
    RETURN v_next;
  END IF;

  RETURN v_allowed_seq[1];
END;
$function$;

-- Assinatura antiga (sem área): mesma correção, mantida por compatibilidade.
CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(_tenant_id uuid, _user_id uuid, _demand_type_key text, _current_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.resolve_function_for_assignee(_tenant_id, _user_id, _demand_type_key, _current_key, 'midia'::work_area)
$function$;

-- Trigger: bloqueia QUALQUER etapa sem a função atribuída na área do card.
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
  v_name text;
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

  -- 1. Responsável tem a função da etapa atual na área do card: ok.
  IF public.user_can_hold_function(NEW.tenant_id, NEW.assigned_to, NEW.current_function_key, v_area) THEN
    RETURN NEW;
  END IF;

  -- 2. Tenta remapear para uma etapa à frente que ele possa exercer.
  v_resolved := public.resolve_function_for_assignee(
    NEW.tenant_id,
    NEW.assigned_to,
    NEW.demand_type_key,
    NEW.current_function_key,
    v_area
  );

  IF v_resolved IS NOT NULL
     AND v_resolved <> NEW.current_function_key
     AND public.user_can_hold_function(NEW.tenant_id, NEW.assigned_to, v_resolved, v_area) THEN
    NEW.current_function_key := v_resolved;
    RETURN NEW;
  END IF;

  -- 3. Sem etapa compatível: bloqueia.
  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.assigned_to;

  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = format(
      '%s não tem a função "%s" na área %s.',
      COALESCE(NULLIF(v_name, ''), 'O responsável selecionado'),
      NEW.current_function_key,
      v_area
    );
END;
$function$;