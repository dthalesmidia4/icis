
-- 1) Resolver função SECURITY DEFINER (espelha resolveFunctionForAssignee do client)
CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(
  _tenant_id uuid,
  _user_id uuid,
  _demand_type_key text,
  _current_key text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Sequência do tipo (required) OU fallback: todas as funções ativas
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
    WHERE tenant_id = _tenant_id AND active = true
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
  ) INTO v_allowed;

  -- Interseção mantendo a ordem da sequência
  SELECT ARRAY(
    SELECT s FROM unnest(v_sequence) WITH ORDINALITY AS x(s, ord)
    WHERE s = ANY(v_allowed)
    ORDER BY ord
  ) INTO v_allowed_seq;

  IF array_length(v_allowed_seq, 1) IS NULL THEN
    RETURN NULL; -- usuário não tem nenhuma função da sequência
  END IF;

  -- (a) Se atual é permitido e está na sequência: mantém
  IF _current_key IS NOT NULL
     AND _current_key = ANY(v_allowed)
     AND _current_key = ANY(v_sequence) THEN
    RETURN _current_key;
  END IF;

  -- (b) Se atual está na sequência mas não é permitido: avança para a próxima permitida
  IF _current_key IS NOT NULL AND _current_key = ANY(v_sequence) THEN
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

  -- (c) fallback: primeira permitida
  RETURN v_allowed_seq[1];
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_function_for_assignee(uuid, uuid, text, text) TO authenticated, service_role;

-- 2) Trigger que valida gravação em demands
CREATE OR REPLACE FUNCTION public.validate_demand_stage_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved text;
  v_should_check boolean := false;
BEGIN
  -- Só valida se assigned_to e current_function_key estão preenchidos
  IF NEW.assigned_to IS NULL OR NEW.current_function_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_check := true;
  ELSE
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.current_function_key IS DISTINCT FROM OLD.current_function_key
       OR NEW.demand_type_key IS DISTINCT FROM OLD.demand_type_key THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN
    RETURN NEW;
  END IF;

  -- Se já é permitido, não mexe
  IF EXISTS (
    SELECT 1 FROM public.collaborator_function_assignments
    WHERE tenant_id = NEW.tenant_id
      AND user_id = NEW.assigned_to
      AND function_key = NEW.current_function_key
      AND allowed = true
  ) THEN
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_function_for_assignee(
    NEW.tenant_id, NEW.assigned_to, NEW.demand_type_key, NEW.current_function_key
  );

  IF v_resolved IS NOT NULL THEN
    NEW.current_function_key := v_resolved;
  ELSE
    -- Usuário não tem nenhuma função da sequência: remove responsável
    NEW.assigned_to := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_demand_stage_assignment_trg ON public.demands;
CREATE TRIGGER validate_demand_stage_assignment_trg
BEFORE INSERT OR UPDATE ON public.demands
FOR EACH ROW
EXECUTE FUNCTION public.validate_demand_stage_assignment();

-- 3) View de auditoria contínua
CREATE OR REPLACE VIEW public.v_demand_stage_misalignment AS
SELECT
  d.id AS demand_id,
  d.tenant_id,
  d.client_id,
  d.assigned_to,
  d.current_function_key,
  d.demand_type_key,
  d.title,
  d.archived_at
FROM public.demands d
WHERE d.archived_at IS NULL
  AND d.assigned_to IS NOT NULL
  AND d.current_function_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.collaborator_function_assignments c
    WHERE c.tenant_id = d.tenant_id
      AND c.user_id = d.assigned_to
      AND c.function_key = d.current_function_key
      AND c.allowed = true
  );

GRANT SELECT ON public.v_demand_stage_misalignment TO authenticated, service_role;

-- 4) Backfill: corrige cards ativos desalinhados registrando histórico
DO $$
DECLARE
  r RECORD;
  v_new text;
  v_old text;
  v_old_user uuid;
  v_new_user uuid;
BEGIN
  FOR r IN
    SELECT d.id, d.tenant_id, d.assigned_to, d.current_function_key, d.demand_type_key
    FROM public.demands d
    WHERE d.archived_at IS NULL
      AND d.assigned_to IS NOT NULL
      AND d.current_function_key IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.collaborator_function_assignments c
        WHERE c.tenant_id = d.tenant_id
          AND c.user_id = d.assigned_to
          AND c.function_key = d.current_function_key
          AND c.allowed = true
      )
  LOOP
    v_old := r.current_function_key;
    v_old_user := r.assigned_to;
    v_new := public.resolve_function_for_assignee(r.tenant_id, r.assigned_to, r.demand_type_key, r.current_function_key);

    IF v_new IS NOT NULL THEN
      UPDATE public.demands
      SET current_function_key = v_new
      WHERE id = r.id;
      v_new_user := v_old_user;
    ELSE
      UPDATE public.demands
      SET assigned_to = NULL
      WHERE id = r.id;
      v_new_user := NULL;
    END IF;

    INSERT INTO public.demand_flow_history (
      tenant_id, demand_id, from_user_id, to_user_id,
      from_function_key, to_function_key, action, created_by, metadata
    ) VALUES (
      r.tenant_id, r.id, v_old_user, v_new_user,
      v_old, COALESCE(v_new, v_old),
      'system_realign', NULL,
      jsonb_build_object('reason', 'backfill', 'previous_function', v_old)
    );
  END LOOP;
END;
$$;
