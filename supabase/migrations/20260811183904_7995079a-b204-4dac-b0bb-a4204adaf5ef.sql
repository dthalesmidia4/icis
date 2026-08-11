-- ============================================================
-- 1. Resolvedor de etapa ORIGIN-AWARE
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(
  _tenant_id uuid,
  _user_id uuid,
  _demand_type_key text,
  _current_key text,
  _work_area work_area,
  _origin text
)
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
  v_client_origin boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN _current_key;
  END IF;

  -- NULL origin = não filtrar (compatibilidade com chamadas legadas).
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
    ORDER BY position
  )
  SELECT ARRAY(
    SELECT function_key FROM fns
    WHERE ((SELECT count(*) FROM req) = 0
           OR function_key IN (SELECT function_key FROM req))
      AND (NOT requires_client_origin OR v_client_origin)
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

    IF v_next IS NOT NULL THEN
      RETURN v_next;
    END IF;

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

-- Overloads antigos delegam (origem NULL = comportamento legado, sem filtro).
CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(
  _tenant_id uuid, _user_id uuid, _demand_type_key text, _current_key text, _work_area work_area DEFAULT 'midia'::work_area
)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.resolve_function_for_assignee(_tenant_id, _user_id, _demand_type_key, _current_key, _work_area, NULL::text)
$function$;

CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(
  _tenant_id uuid, _user_id uuid, _demand_type_key text, _current_key text
)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.resolve_function_for_assignee(_tenant_id, _user_id, _demand_type_key, _current_key, 'midia'::work_area, NULL::text)
$function$;

-- ============================================================
-- 2. Etapa inicial do fluxo (área + origem)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_initial_function(
  _tenant_id uuid,
  _demand_type_key text,
  _work_area work_area DEFAULT 'midia'::work_area,
  _origin text DEFAULT NULL::text
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_origin boolean;
  v_key text;
BEGIN
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
  SELECT function_key INTO v_key
  FROM fns
  WHERE ((SELECT count(*) FROM req) = 0
         OR function_key IN (SELECT function_key FROM req))
    AND (NOT requires_client_origin OR v_client_origin)
  ORDER BY position
  LIMIT 1;

  RETURN v_key;
END;
$function$;

-- ============================================================
-- 3. Trigger de validação de etapa: origin-aware + mensagem clara
-- ============================================================
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

  v_resolved := public.resolve_function_for_assignee(
    NEW.tenant_id,
    NEW.assigned_to,
    NEW.demand_type_key,
    NEW.current_function_key,
    v_area,
    NEW.origin
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
      '%s não possui nenhuma etapa compatível com este tipo de demanda na área %s.',
      COALESCE(NULLIF(v_name, ''), 'O responsável selecionado'),
      CASE WHEN v_area = 'sistemas'::work_area THEN 'Sistemas' ELSE 'Mídia' END
    );
END;
$function$;

-- ============================================================
-- 4. Conflito de agenda também no INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.block_conflicting_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamp;
  v_end timestamp;
  v_conflict record;
  v_untimed text[] := ARRAY['aguardando_cliente','enviar_cliente','entregar_cliente','feedback_cliente'];
BEGIN
  IF coalesce(current_setting('app.skip_schedule_check', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- UPDATE só valida quando o responsável muda (o reorganizador aplica
  -- vários updates sequenciais de datas do mesmo responsável).
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
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
$function$;

DROP TRIGGER IF EXISTS block_conflicting_assignment_trigger ON public.demands;
CREATE TRIGGER block_conflicting_assignment_trigger
BEFORE INSERT OR UPDATE ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.block_conflicting_assignment();

-- ============================================================
-- 5. Fila de liberação — um único significado
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_release_queue_enabled(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    ((settings -> 'release_queue' ->> 'enabled')::boolean),
    false
  )
  FROM public.tenants WHERE id = _tenant_id
$function$;

CREATE OR REPLACE FUNCTION public.normalize_release_state_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.released_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.is_draft, false) = true OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_release_queue_enabled(NEW.tenant_id) IS NOT TRUE THEN
    NEW.released_at := now();
    NEW.released_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_release_state_on_insert_trg ON public.demands;
CREATE TRIGGER normalize_release_state_on_insert_trg
BEFORE INSERT ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.normalize_release_state_on_insert();

CREATE OR REPLACE FUNCTION public.guard_demand_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF public.is_release_queue_enabled(NEW.tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'A fila de liberação está desativada.';
  END IF;

  IF NOT public.can_manage_release_queue(NEW.tenant_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Somente gestores podem liberar ou devolver demandas para a fila.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_release_queue_config(
  _tenant_id uuid,
  _enabled boolean,
  _limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings jsonb;
  v_limit int := greatest(least(coalesce(_limit, 6), 50), 1);
  v_normalized int := 0;
BEGIN
  IF NOT public.can_manage_release_queue(_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para salvar as configurações desta agência.');
  END IF;

  SELECT coalesce(settings, '{}'::jsonb) INTO v_settings FROM public.tenants WHERE id = _tenant_id;
  IF v_settings IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agência não encontrada.');
  END IF;

  UPDATE public.tenants
  SET settings = v_settings || jsonb_build_object(
    'release_queue', jsonb_build_object('enabled', coalesce(_enabled, false), 'limit', v_limit)
  )
  WHERE id = _tenant_id;

  IF coalesce(_enabled, false) IS NOT TRUE THEN
    PERFORM set_config('app.skip_release_guard', 'on', true);
    WITH upd AS (
      UPDATE public.demands
      SET released_at = now()
      WHERE tenant_id = _tenant_id
        AND archived_at IS NULL
        AND is_draft = false
        AND released_at IS NULL
      RETURNING id
    )
    SELECT count(*) INTO v_normalized FROM upd;
    PERFORM set_config('app.skip_release_guard', 'off', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'enabled', coalesce(_enabled, false), 'limit', v_limit, 'normalized', v_normalized);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_release_queue_config(uuid, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_release_queue_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_initial_function(uuid, text, work_area, text) TO authenticated;

-- ============================================================
-- 6. Criação manual ATÔMICA
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_manual_demand_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid := nullif(p_payload->>'client_id','')::uuid;
  v_tenant_id uuid;
  v_area work_area;
  v_origin text := coalesce(nullif(p_payload->>'origin',''), 'interno');
  v_type_key text := nullif(p_payload->>'demand_type_key','');
  v_assigned uuid := nullif(p_payload->>'assigned_to','')::uuid;
  v_title text := btrim(coalesce(p_payload->>'title',''));
  v_pipeline_id uuid;
  v_status_id uuid;
  v_initial text;
  v_stage text;
  v_is_daily boolean := coalesce((p_payload->>'is_daily_card')::boolean, false);
  v_demand_id uuid;
  v_row public.demands;
BEGIN
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_CLIENT', 'error', 'Selecione uma empresa');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.tenant_companies WHERE id = v_client_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_CLIENT', 'error', 'Cliente não encontrado');
  END IF;

  IF NOT public.can_create_demands(v_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', 'Sem permissão para criar demandas');
  END IF;

  IF v_title = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_TITLE', 'error', 'Informe um título');
  END IF;

  v_area := coalesce(nullif(p_payload->>'work_area','')::work_area, 'midia'::work_area);

  IF v_type_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_TYPE', 'error', 'Defina o tipo da demanda');
  END IF;

  IF v_assigned IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_ASSIGNEE', 'error', 'Escolha um responsável');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_assigned
      AND tenant_id = v_tenant_id
      AND role IN ('agency_admin','agency_manager','agency_user')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_COLLABORATOR', 'error', 'O responsável escolhido não é colaborador desta agência.');
  END IF;

  SELECT id INTO v_pipeline_id FROM public.pipelines
  WHERE tenant_id = v_tenant_id AND is_default = true LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    SELECT id INTO v_pipeline_id FROM public.pipelines
    WHERE tenant_id = v_tenant_id ORDER BY position LIMIT 1;
  END IF;
  IF v_pipeline_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_PIPELINE', 'error', 'Nenhum pipeline encontrado.');
  END IF;

  SELECT id INTO v_status_id FROM public.pipeline_statuses
  WHERE pipeline_id = v_pipeline_id AND is_initial = true ORDER BY position LIMIT 1;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id FROM public.pipeline_statuses
    WHERE pipeline_id = v_pipeline_id ORDER BY position LIMIT 1;
  END IF;
  IF v_status_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_STATUS', 'error', 'Nenhum status encontrado para o pipeline.');
  END IF;

  v_initial := public.resolve_initial_function(v_tenant_id, v_type_key, v_area, v_origin);
  IF v_initial IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_FLOW', 'error', 'Nenhuma etapa de fluxo configurada para este tipo de demanda.');
  END IF;

  v_stage := public.resolve_function_for_assignee(
    v_tenant_id, v_assigned, v_type_key, v_initial, v_area, v_origin
  );

  IF v_stage IS NULL OR NOT public.user_can_hold_function(v_tenant_id, v_assigned, v_stage, v_area) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NO_COMPATIBLE_STAGE',
      'error', 'Escolha outro responsável: este colaborador não possui etapa compatível com o fluxo selecionado.'
    );
  END IF;

  INSERT INTO public.demands (
    tenant_id, client_id, pipeline_id, status_id, period_plan_id,
    title, description, objective, instructions, observations, post_caption,
    demand_type, demand_type_key, channel, work_area, origin, origin_note,
    assigned_to, current_function_key,
    due_date, due_time, delivery_date, delivery_time,
    publish_date, publish_time, additional_publish_dates,
    subclient_id, subclient_ids, classifications,
    ad_plan, content_brief, image_aspect_ratio,
    is_daily_card, daily_start_date, daily_end_date, daily_time,
    daily_exclude_weekends, daily_exclude_holidays, daily_next_date, daily_total_occurrences,
    source, created_by, is_draft
  ) VALUES (
    v_tenant_id, v_client_id, v_pipeline_id, v_status_id, nullif(p_payload->>'period_plan_id','')::uuid,
    v_title,
    nullif(p_payload->>'description',''),
    nullif(p_payload->>'objective',''),
    nullif(p_payload->>'instructions',''),
    nullif(p_payload->>'observations',''),
    nullif(p_payload->>'post_caption',''),
    nullif(p_payload->>'demand_type',''), v_type_key, nullif(p_payload->>'channel',''),
    v_area, v_origin, nullif(p_payload->>'origin_note',''),
    v_assigned, v_stage,
    CASE WHEN v_is_daily THEN nullif(p_payload->>'daily_start_date','')::date ELSE nullif(p_payload->>'due_date','')::date END,
    CASE WHEN v_is_daily THEN NULL ELSE nullif(p_payload->>'due_time','') END,
    CASE WHEN v_is_daily THEN NULL ELSE nullif(p_payload->>'delivery_date','')::date END,
    CASE WHEN v_is_daily THEN NULL ELSE nullif(p_payload->>'delivery_time','') END,
    CASE WHEN v_is_daily THEN NULL ELSE nullif(p_payload->>'publish_date','')::date END,
    CASE WHEN v_is_daily THEN NULL ELSE nullif(p_payload->>'publish_time','') END,
    coalesce(p_payload->'additional_publish_dates', '[]'::jsonb),
    nullif(p_payload->>'subclient_id','')::uuid,
    coalesce(
      (SELECT array_agg(x)::uuid[] FROM jsonb_array_elements_text(coalesce(p_payload->'subclient_ids','[]'::jsonb)) AS t(x) WHERE x <> ''),
      '{}'::uuid[]
    ),
    coalesce(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(p_payload->'classifications','[]'::jsonb)) AS t(x) WHERE x <> ''),
      '{}'::text[]
    ),
    p_payload->'ad_plan',
    p_payload->'content_brief',
    nullif(p_payload->>'image_aspect_ratio',''),
    v_is_daily,
    nullif(p_payload->>'daily_start_date','')::date,
    nullif(p_payload->>'daily_end_date','')::date,
    nullif(p_payload->>'daily_time',''),
    coalesce((p_payload->>'daily_exclude_weekends')::boolean, true),
    coalesce((p_payload->>'daily_exclude_holidays')::boolean, true),
    coalesce(nullif(p_payload->>'daily_next_date','')::date, nullif(p_payload->>'daily_start_date','')::date),
    nullif(p_payload->>'daily_total_occurrences','')::int,
    'manual', auth.uid(), false
  ) RETURNING * INTO v_row;

  v_demand_id := v_row.id;

  INSERT INTO public.demand_flow_history (
    tenant_id, demand_id, from_user_id, to_user_id,
    from_function_key, to_function_key, action, created_by, metadata
  ) VALUES (
    v_tenant_id, v_demand_id, NULL, v_row.assigned_to,
    NULL, v_row.current_function_key, 'created', auth.uid(),
    jsonb_build_object('source', 'manual_atomic')
  );

  RETURN jsonb_build_object(
    'success', true,
    'demand_id', v_demand_id,
    'assigned_to', v_row.assigned_to,
    'current_function_key', v_row.current_function_key,
    'released_at', v_row.released_at,
    'work_area', v_row.work_area,
    'origin', v_row.origin,
    'status_id', v_row.status_id,
    'pipeline_id', v_row.pipeline_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_manual_demand_atomic(jsonb) TO authenticated;