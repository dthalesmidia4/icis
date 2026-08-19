-- Resolvedor ADMINISTRATIVO de etapa (troca de responsável), espelhando as
-- regras do front (src/lib/initialFlowFunction.ts + flowSegments.ts):
--   * etapas client-facing nunca são destino automático;
--   * etapa já concluída pelo próprio usuário naquele card não é destino;
--   * anti-autorrevisão: não revisa o que ele mesmo executou na etapa anterior;
--   * mantém a etapa atual quando permitida; senão adiante; senão a mais
--     próxima atrás; NULL apenas quando não há etapa segura.
CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee_admin(
  _tenant_id uuid,
  _user_id uuid,
  _demand_type_key text,
  _current_key text,
  _work_area work_area,
  _origin text,
  _demand_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sequence text[];
  v_allowed text[];
  v_done text[];
  v_client_origin boolean;
  v_idx int;
  v_cand text;
  v_prev text;
  v_ord int;
BEGIN
  IF _user_id IS NULL THEN
    RETURN _current_key;
  END IF;

  v_client_origin := _origin IS NULL
    OR _origin IN ('cliente_solicitacao', 'cliente_feedback', 'suporte');

  WITH req AS (
    SELECT function_key
    FROM public.demand_type_flow_rules
    WHERE tenant_id = _tenant_id
      AND demand_type_key = _demand_type_key
      AND work_area = _work_area
      AND requirement = 'required'
  ),
  fns AS (
    SELECT function_key, position, requires_client_origin
    FROM public.flow_functions
    WHERE tenant_id = _tenant_id
      AND active = true
      AND work_area = _work_area
      AND function_key <> 'avaliar'
  )
  SELECT ARRAY(
    SELECT function_key FROM fns
    WHERE ((SELECT count(*) FROM req) = 0
           OR function_key IN (SELECT function_key FROM req))
      AND (NOT requires_client_origin OR v_client_origin)
    ORDER BY position
  ) INTO v_sequence;

  IF v_sequence IS NULL OR array_length(v_sequence, 1) IS NULL THEN
    RETURN NULL;
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

  -- Etapas que ESTE usuário já concluiu NESTE card.
  IF _demand_id IS NULL THEN
    v_done := ARRAY[]::text[];
  ELSE
    SELECT ARRAY(
      SELECT DISTINCT k FROM (
        SELECT from_function_key AS k
        FROM public.demand_flow_history
        WHERE demand_id = _demand_id
          AND from_user_id = _user_id
          AND from_function_key IS NOT NULL
        UNION
        SELECT function_key AS k
        FROM public.demand_execution_runs
        WHERE demand_id = _demand_id
          AND assigned_to = _user_id
          AND status = 'completed'
          AND function_key IS NOT NULL
      ) t
    ) INTO v_done;
  END IF;

  -- 1. Etapa atual, quando é permitida e não fere as regras.
  IF _current_key IS NOT NULL
     AND _current_key <> 'avaliar'
     AND _current_key = ANY(v_allowed) THEN
    RETURN _current_key;
  END IF;

  -- 2. Etapa atual fora da sequência: primeira etapa segura da sequência.
  IF _current_key IS NULL OR NOT (_current_key = ANY(v_sequence)) THEN
    FOR v_cand IN SELECT s FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord) ORDER BY ord LOOP
      IF v_cand = ANY(v_allowed)
         AND NOT public.is_client_facing_function(v_cand)
         AND NOT (v_cand = ANY(v_done)) THEN
        RETURN v_cand;
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  SELECT ord INTO v_idx
  FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
  WHERE s = _current_key
  LIMIT 1;

  -- 3. Adiante: primeira etapa operacional segura depois da atual.
  FOR v_cand, v_ord IN
    SELECT s, ord FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE ord > v_idx ORDER BY ord
  LOOP
    -- Barreira de cliente: não atravessa etapas client-facing.
    EXIT WHEN public.is_client_facing_function(v_cand);
    IF v_cand = ANY(v_allowed) AND NOT (v_cand = ANY(v_done)) THEN
      -- Anti-autorrevisão: não revisa o que ele mesmo executou logo antes.
      SELECT s INTO v_prev
      FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
      WHERE ord = v_ord - 1;
      IF public.is_review_function(v_cand) AND v_prev IS NOT NULL AND v_prev = ANY(v_done) THEN
        CONTINUE;
      END IF;
      RETURN v_cand;
    END IF;
  END LOOP;

  -- 4. Último recurso: etapa segura mais próxima atrás, sem atravessar cliente.
  FOR v_cand, v_ord IN
    SELECT s, ord FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE ord < v_idx ORDER BY ord DESC
  LOOP
    EXIT WHEN public.is_client_facing_function(v_cand);
    IF v_cand = ANY(v_allowed) AND NOT (v_cand = ANY(v_done)) THEN
      SELECT s INTO v_prev
      FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
      WHERE ord = v_ord - 1;
      IF public.is_review_function(v_cand) AND v_prev IS NOT NULL AND v_prev = ANY(v_done) THEN
        CONTINUE;
      END IF;
      RETURN v_cand;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- Trigger passa a usar o resolvedor administrativo (com o id da demanda,
-- necessário para as regras de etapa concluída / autorrevisão).
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

  IF public.user_can_hold_function(NEW.tenant_id, NEW.assigned_to, NEW.current_function_key, v_area) THEN
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_function_for_assignee_admin(
    NEW.tenant_id,
    NEW.assigned_to,
    NEW.demand_type_key,
    NEW.current_function_key,
    v_area,
    NEW.origin,
    NEW.id
  );

  IF v_resolved IS NOT NULL
     AND v_resolved <> NEW.current_function_key
     AND public.user_can_hold_function(NEW.tenant_id, NEW.assigned_to, v_resolved, v_area) THEN
    NEW.current_function_key := v_resolved;
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.assigned_to;

  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = format(
      '%s não possui nenhuma etapa OPERACIONAL compatível com este tipo de demanda na área %s.',
      COALESCE(NULLIF(v_name, ''), 'O responsável selecionado'),
      CASE WHEN v_area = 'sistemas'::work_area THEN 'Sistemas' ELSE 'Mídia' END
    );
END;
$function$;