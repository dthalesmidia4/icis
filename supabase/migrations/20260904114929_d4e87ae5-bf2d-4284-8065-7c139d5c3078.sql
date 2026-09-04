-- =====================================================================
-- KERNEL CANÔNICO DE FLUXO (autoridade única de etapa + responsável)
-- =====================================================================

-- 1) Sequência REAL do fluxo aplicável a (tenant, tipo, área, origem).
--    Regras: função ativa; nunca 'avaliar'; requirement='disabled' NUNCA entra;
--    quando existe pelo menos um 'required', a sequência é só o conjunto required;
--    etapas requires_client_origin apenas em origem de cliente.
CREATE OR REPLACE FUNCTION public.demand_flow_sequence(
  _tenant_id uuid,
  _demand_type_key text,
  _work_area work_area DEFAULT 'midia'::work_area,
  _origin text DEFAULT NULL
)
RETURNS TABLE(function_key text, seq_position int)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ctx AS (
    SELECT (_origin IS NULL OR _origin IN ('cliente_solicitacao','cliente_feedback','suporte')) AS client_origin
  ),
  rules AS (
    SELECT r.function_key, r.requirement
    FROM public.demand_type_flow_rules r
    WHERE r.tenant_id = _tenant_id
      AND r.work_area = _work_area
      AND r.demand_type_key = NULLIF(btrim(coalesce(_demand_type_key,'')), '')
  ),
  req AS (SELECT function_key FROM rules WHERE requirement = 'required'),
  dis AS (SELECT function_key FROM rules WHERE requirement = 'disabled'),
  fns AS (
    SELECT f.function_key, f.position, f.requires_client_origin
    FROM public.flow_functions f
    WHERE f.tenant_id = _tenant_id
      AND f.active = true
      AND f.work_area = _work_area
      AND f.function_key <> 'avaliar'
  )
  SELECT f.function_key, f.position::int
  FROM fns f, ctx
  WHERE f.function_key NOT IN (SELECT function_key FROM dis)
    AND ((SELECT count(*) FROM req) = 0 OR f.function_key IN (SELECT function_key FROM req))
    AND (NOT coalesce(f.requires_client_origin, false) OR ctx.client_origin)
  ORDER BY f.position;
$$;

-- 2) A etapa pertence ao fluxo real da demanda?
CREATE OR REPLACE FUNCTION public.demand_stage_is_valid(
  _tenant_id uuid,
  _demand_type_key text,
  _work_area work_area,
  _origin text,
  _function_key text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.demand_flow_sequence(_tenant_id, _demand_type_key, coalesce(_work_area,'midia'::work_area), _origin) s
    WHERE s.function_key = NULLIF(btrim(coalesce(_function_key,'')), '')
  );
$$;

-- 3) Etapas que um usuário JÁ concluiu neste card (histórico + runs).
CREATE OR REPLACE FUNCTION public.demand_stages_done_by_user(_demand_id uuid, _user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(DISTINCT k), ARRAY[]::text[]) FROM (
    SELECT from_function_key AS k
      FROM public.demand_flow_history
     WHERE demand_id = _demand_id AND from_user_id = _user_id AND from_function_key IS NOT NULL
    UNION
    SELECT function_key AS k
      FROM public.demand_execution_runs
     WHERE demand_id = _demand_id AND assigned_to = _user_id
       AND status = 'completed' AND function_key IS NOT NULL
  ) t
  WHERE _demand_id IS NOT NULL AND _user_id IS NOT NULL;
$$;

-- 4) Etapa VÁLIDA para um responsável, dentro do fluxo real.
--    _direction: 'auto' (mantém atual, senão frente, senão trás)
--                'forward' (só adiante) | 'backward' (só atrás)
--    _administrative = true: nunca escolhe etapa client-facing diferente da atual
--    e nunca atravessa barreira de cliente.
CREATE OR REPLACE FUNCTION public.resolve_valid_stage_for_assignee(
  _tenant_id uuid,
  _user_id uuid,
  _demand_type_key text,
  _work_area work_area,
  _origin text,
  _current_key text,
  _demand_id uuid DEFAULT NULL,
  _administrative boolean DEFAULT true,
  _direction text DEFAULT 'auto'
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seq text[];
  v_allowed text[];
  v_done text[];
  v_idx int;
  v_cand text;
  v_prev text;
  v_ord int;
  v_area work_area := coalesce(_work_area, 'midia'::work_area);
  v_current text := NULLIF(btrim(coalesce(_current_key,'')), '');
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(s.function_key ORDER BY s.seq_position) INTO v_seq
    FROM public.demand_flow_sequence(_tenant_id, _demand_type_key, v_area, _origin) s;
  IF v_seq IS NULL OR array_length(v_seq,1) IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(function_key) INTO v_allowed
    FROM public.collaborator_function_assignments
   WHERE tenant_id = _tenant_id AND user_id = _user_id
     AND allowed = true AND work_area = v_area AND function_key <> 'avaliar';
  IF v_allowed IS NULL THEN RETURN NULL; END IF;

  v_done := public.demand_stages_done_by_user(_demand_id, _user_id);

  -- 1. Etapa atual, quando pertence ao fluxo e o usuário a exerce.
  IF _direction = 'auto'
     AND v_current IS NOT NULL
     AND v_current = ANY(v_seq)
     AND v_current = ANY(v_allowed) THEN
    RETURN v_current;
  END IF;

  -- 2. Etapa atual fora do fluxo (ou direção forçada sem posição): primeira segura.
  IF v_current IS NULL OR NOT (v_current = ANY(v_seq)) THEN
    FOREACH v_cand IN ARRAY v_seq LOOP
      IF v_cand = ANY(v_allowed)
         AND NOT public.is_client_facing_function(v_cand)
         AND NOT (v_cand = ANY(v_done)) THEN
        RETURN v_cand;
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  SELECT ord INTO v_idx FROM unnest(v_seq) WITH ORDINALITY AS x(s, ord) WHERE s = v_current LIMIT 1;

  -- 3. Adiante.
  IF _direction IN ('auto','forward') THEN
    FOR v_cand, v_ord IN
      SELECT s, ord FROM unnest(v_seq) WITH ORDINALITY AS x(s, ord) WHERE ord > v_idx ORDER BY ord
    LOOP
      IF _administrative AND public.is_client_facing_function(v_cand) THEN EXIT; END IF;
      IF v_cand = ANY(v_allowed) AND NOT (v_cand = ANY(v_done)) THEN
        SELECT s INTO v_prev FROM unnest(v_seq) WITH ORDINALITY AS x(s, ord) WHERE ord = v_ord - 1;
        IF public.is_review_function(v_cand) AND v_prev IS NOT NULL AND v_prev = ANY(v_done) THEN
          CONTINUE;
        END IF;
        RETURN v_cand;
      END IF;
    END LOOP;
  END IF;

  -- 4. Atrás.
  IF _direction IN ('auto','backward') THEN
    FOR v_cand, v_ord IN
      SELECT s, ord FROM unnest(v_seq) WITH ORDINALITY AS x(s, ord) WHERE ord < v_idx ORDER BY ord DESC
    LOOP
      IF _administrative AND public.is_client_facing_function(v_cand) THEN EXIT; END IF;
      IF v_cand = ANY(v_allowed) AND NOT (v_cand = ANY(v_done)) THEN
        SELECT s INTO v_prev FROM unnest(v_seq) WITH ORDINALITY AS x(s, ord) WHERE ord = v_ord - 1;
        IF public.is_review_function(v_cand) AND v_prev IS NOT NULL AND v_prev = ANY(v_done) THEN
          CONTINUE;
        END IF;
        RETURN v_cand;
      END IF;
    END LOOP;
  END IF;

  -- 5. Última chance: a própria etapa atual, se ele a exerce (mesmo repetindo).
  IF v_current = ANY(v_allowed) THEN RETURN v_current; END IF;

  RETURN NULL;
END;
$$;

-- 5) Responsável VÁLIDO para uma etapa (algoritmo único de candidatos).
--    Preferência: _prefer_user → último executor da etapa neste card →
--    menor carga ativa → user_id (determinístico).
CREATE OR REPLACE FUNCTION public.resolve_valid_assignee_for_stage(
  _tenant_id uuid,
  _function_key text,
  _work_area work_area,
  _demand_id uuid DEFAULT NULL,
  _prefer_user uuid DEFAULT NULL,
  _exclude_user uuid DEFAULT NULL,
  _demand_type_key text DEFAULT NULL,
  _origin text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_area work_area := coalesce(_work_area, 'midia'::work_area);
  v_key text := NULLIF(btrim(coalesce(_function_key,'')), '');
  v_prev text;
  v_pick uuid;
BEGIN
  IF v_key IS NULL THEN RETURN NULL; END IF;

  -- etapa anterior no fluxo (anti-autorrevisão)
  SELECT s FROM (
    SELECT s.function_key AS s, row_number() OVER (ORDER BY s.seq_position) rn
      FROM public.demand_flow_sequence(_tenant_id, _demand_type_key, v_area, _origin) s
  ) q
  WHERE rn = (SELECT rn - 1 FROM (
        SELECT s.function_key AS s, row_number() OVER (ORDER BY s.seq_position) rn
          FROM public.demand_flow_sequence(_tenant_id, _demand_type_key, v_area, _origin) s
      ) q2 WHERE q2.s = v_key)
  INTO v_prev;

  WITH cand AS (
    SELECT c.user_id
      FROM public.collaborator_function_assignments c
     WHERE c.tenant_id = _tenant_id AND c.work_area = v_area
       AND c.function_key = v_key AND c.allowed = true
       AND (_exclude_user IS NULL OR c.user_id <> _exclude_user)
  ),
  safe AS (
    SELECT c.user_id FROM cand c
     WHERE _demand_id IS NULL
        OR NOT public.is_review_function(v_key)
        OR v_prev IS NULL
        OR NOT (v_prev = ANY(public.demand_stages_done_by_user(_demand_id, c.user_id)))
  ),
  pool AS (
    SELECT user_id FROM safe
    UNION ALL
    SELECT user_id FROM cand WHERE NOT EXISTS (SELECT 1 FROM safe)
  ),
  last_exec AS (
    SELECT h.to_user_id AS user_id
      FROM public.demand_flow_history h
     WHERE _demand_id IS NOT NULL AND h.demand_id = _demand_id
       AND h.to_function_key = v_key AND h.to_user_id IS NOT NULL
     ORDER BY h.created_at DESC LIMIT 1
  ),
  load AS (
    SELECT d.assigned_to AS user_id, count(*) AS n
      FROM public.demands d
     WHERE d.tenant_id = _tenant_id AND d.archived_at IS NULL
       AND coalesce(d.is_draft, false) = false AND d.assigned_to IS NOT NULL
     GROUP BY d.assigned_to
  )
  SELECT p.user_id INTO v_pick
    FROM (SELECT DISTINCT user_id FROM pool) p
    LEFT JOIN load l ON l.user_id = p.user_id
   ORDER BY
     (p.user_id = _prefer_user) DESC,
     (p.user_id = (SELECT user_id FROM last_exec)) DESC,
     coalesce(l.n, 0) ASC,
     p.user_id ASC
   LIMIT 1;

  RETURN v_pick;
END;
$$;

-- =====================================================================
-- 6) RPC AUTORITATIVA DE TRANSIÇÃO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.transition_demand_v2(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'demand_id','')::uuid;
  v_intent text := coalesce(p_payload->>'intent','reassign');
  v_row public.demands;
  v_area work_area;
  v_type text;
  v_origin text;
  v_type_label text;
  v_stage text;
  v_user uuid;
  v_prev_stage text;
  v_prev_user uuid;
  v_direction text := 'auto';
  v_admin boolean := true;
  v_extras uuid[];
  v_result jsonb;
  v_msg text;
BEGIN
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status','error','code','BAD_REQUEST','message','Demanda não informada.');
  END IF;

  SELECT * INTO v_row FROM public.demands WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','error','code','NOT_FOUND','message','Demanda não encontrada.');
  END IF;

  IF NOT public.user_has_tenant_access(auth.uid(), v_row.tenant_id) THEN
    RETURN jsonb_build_object('status','error','code','FORBIDDEN','message','Sem acesso a esta agência.');
  END IF;

  -- compare-and-set
  IF p_payload ? 'expected_updated_at'
     AND v_row.updated_at <> (p_payload->>'expected_updated_at')::timestamptz THEN
    RETURN jsonb_build_object('status','stale','code','STALE_STATE',
      'message','A demanda foi alterada por outro usuário. Atualize e tente novamente.');
  END IF;
  IF p_payload ? 'expected_assigned_to'
     AND coalesce(v_row.assigned_to::text,'') <> coalesce(p_payload->>'expected_assigned_to','') THEN
    RETURN jsonb_build_object('status','stale','code','STALE_STATE',
      'message','A demanda foi alterada por outro usuário. Atualize e tente novamente.');
  END IF;
  IF p_payload ? 'expected_function_key'
     AND coalesce(v_row.current_function_key,'') <> coalesce(p_payload->>'expected_function_key','') THEN
    RETURN jsonb_build_object('status','stale','code','STALE_STATE',
      'message','A demanda foi alterada por outro usuário. Atualize e tente novamente.');
  END IF;

  v_prev_stage := v_row.current_function_key;
  v_prev_user  := v_row.assigned_to;

  -- contexto final (tipo / área / origem)
  v_area   := coalesce(NULLIF(p_payload->>'target_work_area','')::work_area, coalesce(v_row.work_area,'midia'::work_area));
  v_type   := coalesce(NULLIF(p_payload->>'target_type_key',''), v_row.demand_type_key);
  v_origin := CASE WHEN p_payload ? 'target_origin' THEN NULLIF(p_payload->>'target_origin','') ELSE v_row.origin END;
  v_type_label := NULLIF(p_payload->>'target_type_label','');

  v_admin := coalesce((p_payload->>'administrative')::boolean, v_intent NOT IN ('proceed','move_back','auto_return','publication_review'));
  IF v_intent = 'move_back' THEN v_direction := 'backward';
  ELSIF v_intent IN ('proceed') THEN v_direction := 'forward';
  END IF;
  IF p_payload ? 'direction' THEN v_direction := p_payload->>'direction'; END IF;

  v_stage := NULLIF(btrim(coalesce(p_payload->>'target_function_key','')), '');
  v_user  := NULLIF(p_payload->>'target_user_id','')::uuid;

  -- ---------------------------------------------------------------
  -- RESOLUÇÃO
  -- ---------------------------------------------------------------
  IF v_stage IS NOT NULL THEN
    -- etapa explícita precisa ser válida no fluxo real
    IF NOT public.demand_stage_is_valid(v_row.tenant_id, v_type, v_area, v_origin, v_stage) THEN
      RETURN jsonb_build_object('status','blocked','code','INVALID_STAGE_FOR_FLOW',
        'message','Esta etapa não faz parte do fluxo atual desta demanda.');
    END IF;
    IF v_user IS NULL THEN
      -- mantém responsável atual quando ele exerce a etapa; senão resolve
      IF v_row.assigned_to IS NOT NULL
         AND public.user_can_hold_function(v_row.tenant_id, v_row.assigned_to, v_stage, v_area) THEN
        v_user := v_row.assigned_to;
      ELSE
        v_user := public.resolve_valid_assignee_for_stage(
          v_row.tenant_id, v_stage, v_area, v_row.id, NULL,
          CASE WHEN public.is_review_function(v_stage) THEN v_row.assigned_to ELSE NULL END,
          v_type, v_origin);
        IF v_user IS NULL THEN
          RETURN jsonb_build_object('status','blocked','code','NO_ASSIGNEE',
            'message','Não há colaborador habilitado para esta etapa neste fluxo.');
        END IF;
      END IF;
    ELSIF NOT public.user_can_hold_function(v_row.tenant_id, v_user, v_stage, v_area) THEN
      RETURN jsonb_build_object('status','blocked','code','NO_VALID_STAGE',
        'message','Este colaborador não pode executar a etapa escolhida nesta demanda.');
    END IF;
  ELSIF v_user IS NOT NULL THEN
    -- responsável explícito: mantém etapa se válida, senão remapeia
    IF v_prev_stage IS NOT NULL
       AND public.demand_stage_is_valid(v_row.tenant_id, v_type, v_area, v_origin, v_prev_stage)
       AND public.user_can_hold_function(v_row.tenant_id, v_user, v_prev_stage, v_area)
       AND v_direction = 'auto' THEN
      v_stage := v_prev_stage;
    ELSE
      v_stage := public.resolve_valid_stage_for_assignee(
        v_row.tenant_id, v_user, v_type, v_area, v_origin, v_prev_stage, v_row.id, v_admin, v_direction);
      IF v_stage IS NULL THEN
        RETURN jsonb_build_object('status','blocked','code','NO_VALID_STAGE',
          'message','Este colaborador não possui nenhuma etapa operacional válida para esta demanda.');
      END IF;
    END IF;
  ELSE
    -- nem etapa nem responsável: reconciliação de contexto
    IF v_prev_stage IS NOT NULL
       AND public.demand_stage_is_valid(v_row.tenant_id, v_type, v_area, v_origin, v_prev_stage)
       AND (v_prev_user IS NULL OR public.user_can_hold_function(v_row.tenant_id, v_prev_user, v_prev_stage, v_area)) THEN
      v_stage := v_prev_stage;
      v_user := v_prev_user;
    ELSE
      IF v_prev_user IS NOT NULL THEN
        v_stage := public.resolve_valid_stage_for_assignee(
          v_row.tenant_id, v_prev_user, v_type, v_area, v_origin, v_prev_stage, v_row.id, v_admin, v_direction);
        v_user := v_prev_user;
      END IF;
      IF v_stage IS NULL THEN
        SELECT s.function_key INTO v_stage
          FROM public.demand_flow_sequence(v_row.tenant_id, v_type, v_area, v_origin) s
         WHERE NOT public.is_client_facing_function(s.function_key)
         ORDER BY s.seq_position LIMIT 1;
        IF v_stage IS NULL THEN
          RETURN jsonb_build_object('status','blocked','code','NO_VALID_STAGE',
            'message','Não há etapa válida no fluxo desta demanda.');
        END IF;
        v_user := public.resolve_valid_assignee_for_stage(
          v_row.tenant_id, v_stage, v_area, v_row.id, v_prev_user, NULL, v_type, v_origin);
        IF v_user IS NULL THEN
          RETURN jsonb_build_object('status','blocked','code','NO_ASSIGNEE',
            'message','Não há colaborador habilitado para esta etapa neste fluxo.');
        END IF;
      END IF;
    END IF;
  END IF;

  -- nada mudou?
  IF v_stage IS NOT DISTINCT FROM v_prev_stage
     AND v_user IS NOT DISTINCT FROM v_prev_user
     AND v_type IS NOT DISTINCT FROM v_row.demand_type_key
     AND v_area IS NOT DISTINCT FROM coalesce(v_row.work_area,'midia'::work_area)
     AND v_origin IS NOT DISTINCT FROM v_row.origin THEN
    RETURN jsonb_build_object('status','nothing','code','NO_CHANGE','message','Nada a alterar.',
      'final', jsonb_build_object('assigned_to', v_user, 'function_key', v_stage,
        'type_key', v_type, 'work_area', v_area, 'origin', v_origin));
  END IF;

  -- colaboradores extras: pertencem à captação
  v_extras := coalesce(v_row.additional_assignees, ARRAY[]::uuid[]);
  IF v_stage <> 'captar' THEN
    v_extras := ARRAY[]::uuid[];
  ELSE
    SELECT coalesce(array_agg(u), ARRAY[]::uuid[]) INTO v_extras
      FROM unnest(v_extras) u WHERE u IS DISTINCT FROM v_user;
  END IF;

  UPDATE public.demands d
     SET assigned_to = v_user,
         current_function_key = v_stage,
         demand_type_key = v_type,
         demand_type = coalesce(v_type_label, d.demand_type),
         work_area = v_area,
         origin = v_origin,
         additional_assignees = v_extras,
         released_at = coalesce(d.released_at, now()),
         updated_at = now()
   WHERE d.id = v_id
  RETURNING d.* INTO v_row;

  INSERT INTO public.demand_flow_history(
    tenant_id, demand_id, action, from_user_id, to_user_id,
    from_function_key, to_function_key, metadata)
  VALUES (
    v_row.tenant_id, v_row.id,
    CASE WHEN v_intent = 'move_back' THEN 'moved_back'
         WHEN v_intent = 'proceed' THEN 'proceeded'
         ELSE 'manual_assignment' END,
    v_prev_user, v_user, v_prev_stage, v_stage,
    coalesce(p_payload->'metadata','{}'::jsonb) || jsonb_build_object(
      'intent', v_intent,
      'source', coalesce(p_payload->>'source','transition_demand_v2'),
      'engine', 'transition_demand_v2',
      'previous', jsonb_build_object('assigned_to', v_prev_user, 'function_key', v_prev_stage,
        'type_key', p_payload->>'expected_type_key', 'origin', v_origin)));

  RETURN jsonb_build_object(
    'status','applied','code','OK','message','Transição aplicada.',
    'previous', jsonb_build_object('assigned_to', v_prev_user, 'function_key', v_prev_stage),
    'final', jsonb_build_object('assigned_to', v_row.assigned_to, 'function_key', v_row.current_function_key,
      'type_key', v_row.demand_type_key, 'work_area', v_row.work_area, 'origin', v_row.origin,
      'updated_at', v_row.updated_at, 'additional_assignees', to_jsonb(v_row.additional_assignees)),
    'warnings', '[]'::jsonb);
EXCEPTION WHEN others THEN
  v_msg := SQLERRM;
  RETURN jsonb_build_object('status','error','code','ERROR','message', v_msg);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_demand_v2(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.transition_demand_v2(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demand_flow_sequence(uuid, text, work_area, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demand_stage_is_valid(uuid, text, work_area, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_valid_stage_for_assignee(uuid, uuid, text, work_area, text, text, uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_valid_assignee_for_stage(uuid, text, work_area, uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demand_stages_done_by_user(uuid, uuid) TO authenticated, service_role;

-- =====================================================================
-- 7) TRIGGER = INVARIANT GUARD (não remapeia mais silenciosamente)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.validate_demand_stage_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_area work_area;
  v_name text;
  v_should_check boolean := false;
BEGIN
  IF NEW.current_function_key IS NULL OR coalesce(NEW.is_draft,false) THEN
    RETURN NEW;
  END IF;

  v_area := coalesce(NEW.work_area, 'midia'::work_area);

  IF TG_OP = 'INSERT' THEN
    v_should_check := true;
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.current_function_key IS DISTINCT FROM OLD.current_function_key
     OR NEW.demand_type_key IS DISTINCT FROM OLD.demand_type_key
     OR NEW.work_area IS DISTINCT FROM OLD.work_area
     OR NEW.origin IS DISTINCT FROM OLD.origin THEN
    v_should_check := true;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  -- INVARIANTE 1: a etapa final precisa pertencer ao fluxo real.
  IF NOT public.demand_stage_is_valid(NEW.tenant_id, NEW.demand_type_key, v_area, NEW.origin, NEW.current_function_key) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('A etapa "%s" não faz parte do fluxo desta demanda (tipo/área/origem atuais).', NEW.current_function_key);
  END IF;

  -- INVARIANTE 2: o responsável precisa poder executar a etapa final.
  IF NEW.assigned_to IS NOT NULL
     AND NOT public.user_can_hold_function(NEW.tenant_id, NEW.assigned_to, NEW.current_function_key, v_area) THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.assigned_to;
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('%s não pode executar a etapa "%s" na área %s.',
        coalesce(NULLIF(v_name,''),'O responsável selecionado'), NEW.current_function_key,
        CASE WHEN v_area = 'sistemas'::work_area THEN 'Sistemas' ELSE 'Mídia' END);
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- 8) AUDITORIA + REPARO ESTRUTURAL
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_demand_flow_states(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(
  demand_id uuid, tenant_id uuid, title text, demand_type_key text,
  work_area work_area, origin text, current_function_key text,
  assigned_to uuid, problem text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.id, d.tenant_id, d.title, d.demand_type_key,
         coalesce(d.work_area,'midia'::work_area), d.origin, d.current_function_key, d.assigned_to,
         CASE
           WHEN d.current_function_key IS NULL THEN 'no_stage'
           WHEN NOT public.demand_stage_is_valid(d.tenant_id, d.demand_type_key,
                  coalesce(d.work_area,'midia'::work_area), d.origin, d.current_function_key)
             THEN 'stage_outside_flow_or_disabled'
           ELSE 'assignee_cannot_hold_stage'
         END
    FROM public.demands d
   WHERE d.archived_at IS NULL
     AND coalesce(d.is_draft,false) = false
     AND (_tenant_id IS NULL OR d.tenant_id = _tenant_id)
     AND public.user_has_tenant_access(auth.uid(), d.tenant_id)
     AND (
       d.current_function_key IS NULL
       OR NOT public.demand_stage_is_valid(d.tenant_id, d.demand_type_key,
              coalesce(d.work_area,'midia'::work_area), d.origin, d.current_function_key)
       OR (d.assigned_to IS NOT NULL AND NOT public.user_can_hold_function(
              d.tenant_id, d.assigned_to, d.current_function_key,
              coalesce(d.work_area,'midia'::work_area)))
     );
$$;

GRANT EXECUTE ON FUNCTION public.audit_demand_flow_states(uuid) TO authenticated, service_role;

-- Reparo: usa o MESMO resolvedor canônico, um card por vez, com histórico.
CREATE OR REPLACE FUNCTION public.repair_demand_flow_states(
  _tenant_id uuid,
  _dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_stage text;
  v_user uuid;
  v_area work_area;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_agency_admin(_tenant_id)) THEN
    RETURN jsonb_build_object('status','error','code','FORBIDDEN','message','Apenas administradores podem sanear o fluxo.');
  END IF;

  FOR r IN SELECT * FROM public.audit_demand_flow_states(_tenant_id) LOOP
    v_area := coalesce(r.work_area, 'midia'::work_area);
    v_stage := NULL; v_user := NULL;

    -- 1) preferir manter o responsável, trocando só a etapa
    IF r.assigned_to IS NOT NULL THEN
      v_stage := public.resolve_valid_stage_for_assignee(
        r.tenant_id, r.assigned_to, r.demand_type_key, v_area, r.origin,
        r.current_function_key, r.demand_id, true, 'auto');
      IF v_stage IS NOT NULL THEN v_user := r.assigned_to; END IF;
    END IF;

    -- 2) senão manter a etapa (se válida) trocando o responsável
    IF v_stage IS NULL
       AND r.current_function_key IS NOT NULL
       AND public.demand_stage_is_valid(r.tenant_id, r.demand_type_key, v_area, r.origin, r.current_function_key) THEN
      v_user := public.resolve_valid_assignee_for_stage(
        r.tenant_id, r.current_function_key, v_area, r.demand_id, NULL, NULL, r.demand_type_key, r.origin);
      IF v_user IS NOT NULL THEN v_stage := r.current_function_key; END IF;
    END IF;

    -- 3) senão primeira etapa operacional do fluxo + responsável habilitado
    IF v_stage IS NULL THEN
      SELECT s.function_key INTO v_stage
        FROM public.demand_flow_sequence(r.tenant_id, r.demand_type_key, v_area, r.origin) s
       WHERE NOT public.is_client_facing_function(s.function_key)
       ORDER BY s.seq_position LIMIT 1;
      IF v_stage IS NOT NULL THEN
        v_user := public.resolve_valid_assignee_for_stage(
          r.tenant_id, v_stage, v_area, r.demand_id, r.assigned_to, NULL, r.demand_type_key, r.origin);
        IF v_user IS NULL THEN v_stage := NULL; END IF;
      END IF;
    END IF;

    IF v_stage IS NULL THEN
      v_out := v_out || jsonb_build_object('demand_id', r.demand_id, 'title', r.title,
        'problem', r.problem, 'action', 'manual_intervention_required');
      CONTINUE;
    END IF;

    v_out := v_out || jsonb_build_object('demand_id', r.demand_id, 'title', r.title,
      'problem', r.problem, 'action', CASE WHEN _dry_run THEN 'would_repair' ELSE 'repaired' END,
      'from', jsonb_build_object('function_key', r.current_function_key, 'assigned_to', r.assigned_to),
      'to', jsonb_build_object('function_key', v_stage, 'assigned_to', v_user));

    IF NOT _dry_run THEN
      UPDATE public.demands
         SET current_function_key = v_stage, assigned_to = v_user, updated_at = now()
       WHERE id = r.demand_id;

      INSERT INTO public.demand_flow_history(
        tenant_id, demand_id, action, from_user_id, to_user_id,
        from_function_key, to_function_key, metadata)
      VALUES (r.tenant_id, r.demand_id, 'manual_assignment', r.assigned_to, v_user,
        r.current_function_key, v_stage,
        jsonb_build_object('source','structural_flow_repair','intent','structural_flow_repair',
          'reason', r.problem,
          'previous', jsonb_build_object('function_key', r.current_function_key, 'assigned_to', r.assigned_to),
          'final', jsonb_build_object('function_key', v_stage, 'assigned_to', v_user)));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status','ok','dry_run',_dry_run,'items',v_out);
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_demand_flow_states(uuid, boolean) TO authenticated, service_role;