-- Etapas voltadas ao cliente (mesma lista do front: src/lib/flowFunctions.ts)
CREATE OR REPLACE FUNCTION public.is_client_facing_function(_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(_key, ''))) IN (
    'aguardando_cliente', 'enviar_cliente', 'entregar_cliente', 'feedback_cliente'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_review_function(_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(_key, ''))) LIKE 'revis%'
      OR lower(trim(coalesce(_key, ''))) IN ('testar');
$$;

/**
 * Destino administrativo válido para a alocação em massa.
 * Espelha `stageOptions`/`flowSegments` do front:
 *  - a etapa precisa pertencer à sequência real (área + tipo + origem);
 *  - etapa client-facing só pode ser MANTIDA (nunca escolhida como avanço/regressão);
 *  - não pode atravessar uma barreira client-facing;
 *  - não pode pular uma revisão obrigatória para encaixar o colaborador.
 */
CREATE OR REPLACE FUNCTION public.bulk_admin_stage_allowed(
  _tenant_id uuid,
  _demand_type_key text,
  _work_area work_area,
  _origin text,
  _current_key text,
  _next_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_origin boolean := coalesce(nullif(trim(coalesce(_origin, 'interno')), ''), 'interno') <> 'interno';
  v_required_count int;
  v_seq text[];
  v_cur_idx int;
  v_next_idx int;
  v_i int;
BEGIN
  IF _next_key IS NULL OR trim(_next_key) = '' THEN
    RETURN true; -- nada a validar: etapa não muda
  END IF;

  SELECT count(*) INTO v_required_count
    FROM public.demand_type_flow_rules r
   WHERE r.tenant_id = _tenant_id
     AND r.work_area = _work_area
     AND r.demand_type_key = coalesce(_demand_type_key, '')
     AND r.requirement = 'required'
     AND r.function_key <> 'avaliar';

  SELECT array_agg(f.function_key ORDER BY f.position)
    INTO v_seq
    FROM public.flow_functions f
   WHERE f.tenant_id = _tenant_id
     AND f.work_area = _work_area
     AND f.active
     AND f.function_key <> 'avaliar'
     AND (NOT f.requires_client_origin OR v_client_origin)
     AND (
       v_required_count = 0
       OR EXISTS (
         SELECT 1 FROM public.demand_type_flow_rules r
          WHERE r.tenant_id = _tenant_id
            AND r.work_area = _work_area
            AND r.demand_type_key = coalesce(_demand_type_key, '')
            AND r.requirement = 'required'
            AND r.function_key = f.function_key
       )
     );

  IF v_seq IS NULL THEN
    RETURN false;
  END IF;

  v_next_idx := array_position(v_seq, _next_key);
  IF v_next_idx IS NULL THEN
    RETURN false; -- etapa fora do fluxo desta demanda
  END IF;

  v_cur_idx := CASE WHEN _current_key IS NULL OR trim(_current_key) = ''
                    THEN NULL ELSE array_position(v_seq, _current_key) END;

  -- Etapa client-facing só se mantém; nunca é escolhida administrativamente.
  IF public.is_client_facing_function(_next_key) THEN
    RETURN _current_key IS NOT NULL AND lower(trim(_current_key)) = lower(trim(_next_key));
  END IF;

  IF _current_key IS NOT NULL AND trim(_current_key) <> '' AND v_cur_idx IS NULL THEN
    RETURN false; -- etapa atual fora do fluxo: exige decisão explícita de processo
  END IF;

  IF v_cur_idx IS NOT NULL AND v_cur_idx <> v_next_idx THEN
    -- Barreira de cliente e revisão obrigatória entre a etapa atual e o destino.
    FOR v_i IN LEAST(v_cur_idx, v_next_idx) + 1 .. GREATEST(v_cur_idx, v_next_idx) - 1 LOOP
      IF public.is_client_facing_function(v_seq[v_i]) THEN
        RETURN false;
      END IF;
      IF v_next_idx > v_cur_idx AND public.is_review_function(v_seq[v_i]) THEN
        RETURN false; -- não pula revisão obrigatória para encaixar o usuário
      END IF;
    END LOOP;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_bulk_allocation_atomic_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := (p_payload->>'tenant_id')::uuid;
  v_target uuid := (p_payload->>'target_user_id')::uuid;
  v_bulk_id text := coalesce(p_payload->>'bulk_allocation_id', '');
  v_source text := coalesce(p_payload->>'source_screen', 'overview');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_queue jsonb := coalesce(p_payload->'queue', '[]'::jsonb);
  v_guards jsonb := coalesce(p_payload->'guards', '[]'::jsonb);
  v_durations jsonb := coalesce(p_payload->'duration_overrides', '[]'::jsonb);
  v_tz text := coalesce(nullif(p_payload->>'timezone', ''), 'America/Sao_Paulo');
  v_all jsonb := v_items || v_queue;
  v_lock_ids uuid[];
  v_ids uuid[];
  v_item jsonb;
  v_row public.demands;
  v_applied uuid[] := '{}';
  v_next text;
  v_now timestamp;
  v_start timestamp;
  v_extras uuid[];
  v_overlap_title text;
BEGIN
  IF v_tenant IS NULL OR v_target IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Payload inválido');
  END IF;

  IF NOT public.user_has_tenant_access(auth.uid(), v_tenant) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Sem acesso a esta agência');
  END IF;
  IF NOT (public.is_super_admin() OR public.can_manage_release_queue(v_tenant)) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Apenas gestor operacional pode alocar em massa');
  END IF;

  v_now := (now() AT TIME ZONE v_tz);

  SELECT array_agg((e->>'card_id')::uuid ORDER BY (e->>'card_id')::uuid)
    INTO v_ids
    FROM jsonb_array_elements(v_all) e;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN jsonb_build_object('status', 'nothing', 'applied_ids', '[]'::jsonb);
  END IF;

  -- Lock determinístico de TUDO que participou do cálculo (writes + guardas),
  -- em ordem de id, antes de validar ou escrever.
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_lock_ids
    FROM (
      SELECT (e->>'card_id')::uuid AS x FROM jsonb_array_elements(v_all) e
      UNION
      SELECT (g->>'card_id')::uuid AS x FROM jsonb_array_elements(v_guards) g
    ) s;

  PERFORM 1 FROM public.demands
   WHERE tenant_id = v_tenant AND id = ANY(v_lock_ids)
   ORDER BY id
   FOR UPDATE;

  -- PASSO 1a: guardas (não serão atualizadas, mas nada pode ter mudado nelas).
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_guards) LOOP
    SELECT * INTO v_row FROM public.demands
     WHERE id = (v_item->>'card_id')::uuid AND tenant_id = v_tenant;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_item->>'card_id',
                                'message', 'A fila do colaborador mudou desde a prévia');
    END IF;
    IF v_item->>'expected_updated_at' IS NOT NULL
       AND v_row.updated_at <> (v_item->>'expected_updated_at')::timestamptz THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                'message', 'A fila do colaborador mudou desde a prévia');
    END IF;
    IF coalesce(v_row.assigned_to::text, '') <> coalesce(v_item->>'expected_assigned_to', '')
       OR coalesce(v_row.current_function_key, '') <> coalesce(v_item->>'expected_function_key', '')
       OR coalesce(v_row.due_date::text, '') <> coalesce(v_item->>'expected_due_date', '')
       OR coalesce(left(v_row.due_time, 5), '') <> coalesce(left(v_item->>'expected_due_time', 5), '')
       OR coalesce(v_row.delivery_date::text, '') <> coalesce(v_item->>'expected_delivery_date', '')
       OR coalesce(left(v_row.delivery_time, 5), '') <> coalesce(left(v_item->>'expected_delivery_time', 5), '') THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                'message', 'A fila do colaborador mudou desde a prévia');
    END IF;
  END LOOP;

  -- PASSO 1b: validar TUDO que será escrito antes de qualquer write.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_all) LOOP
    SELECT * INTO v_row FROM public.demands
     WHERE id = (v_item->>'card_id')::uuid AND tenant_id = v_tenant;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_item->>'card_id',
                                'message', 'Demanda não encontrada nesta agência');
    END IF;
    IF v_row.archived_at IS NOT NULL OR v_row.is_draft THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                'message', 'Demanda arquivada ou rascunho');
    END IF;
    IF (v_item ? 'expected_updated_at')
       AND v_item->>'expected_updated_at' IS NOT NULL
       AND v_row.updated_at <> (v_item->>'expected_updated_at')::timestamptz THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                'message', 'A fila mudou desde a prévia');
    END IF;
    IF (v_item ? 'expected_assigned_to')
       AND coalesce(v_row.assigned_to::text, '') <> coalesce(v_item->>'expected_assigned_to', '') THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                'message', 'O responsável mudou desde a prévia');
    END IF;
    IF (v_item ? 'expected_function_key')
       AND coalesce(v_row.current_function_key, '') <> coalesce(v_item->>'expected_function_key', '') THEN
      RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                'message', 'A etapa mudou desde a prévia');
    END IF;

    -- Nenhum horário NOVO pode começar antes do wallclock atual.
    IF v_item->'schedule' IS NOT NULL AND v_item->'schedule' <> 'null'::jsonb THEN
      v_start := ((v_item->'schedule'->>'due_date') || ' ' || (v_item->'schedule'->>'due_time'))::timestamp;
      IF v_start < date_trunc('minute', v_now) - interval '2 minutes' THEN
        RETURN jsonb_build_object('status', 'stale', 'card_id', v_row.id,
                                  'message', 'Horário proposto já passou. Recalcule a prévia.');
      END IF;
    END IF;

    v_next := nullif(v_item->>'next_function_key', '');
    IF v_next IS NOT NULL AND coalesce((v_item->>'same_assignee')::boolean, false) = false THEN
      IF NOT public.user_can_hold_function(v_tenant, v_target, v_next, v_row.work_area) THEN
        RETURN jsonb_build_object('status', 'blocked', 'card_id', v_row.id,
                                  'message', 'Colaborador não tem a função desta etapa na área da demanda');
      END IF;
      IF NOT public.bulk_admin_stage_allowed(
            v_tenant, v_row.demand_type_key, v_row.work_area, v_row.origin,
            v_row.current_function_key, v_next) THEN
        RETURN jsonb_build_object('status', 'blocked', 'card_id', v_row.id,
                                  'message', 'Etapa inválida para alocação administrativa (fora do fluxo, etapa de cliente ou revisão obrigatória)');
      END IF;
    END IF;
  END LOOP;

  -- PASSO 2: gravar. Bloco com EXCEPTION = subtransação: overlap reverte tudo.
  BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_queue) LOOP
      UPDATE public.demands SET
        due_date = coalesce((v_item->'schedule'->>'due_date')::date, due_date),
        due_time = coalesce(v_item->'schedule'->>'due_time', due_time),
        delivery_date = coalesce((v_item->'schedule'->>'delivery_date')::date, delivery_date),
        delivery_time = coalesce(v_item->'schedule'->>'delivery_time', delivery_time),
        updated_at = now()
      WHERE id = (v_item->>'card_id')::uuid AND tenant_id = v_tenant;
      v_applied := v_applied || (v_item->>'card_id')::uuid;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      SELECT * INTO v_row FROM public.demands
       WHERE id = (v_item->>'card_id')::uuid AND tenant_id = v_tenant;

      -- Colaboradores extras: limpar ao sair de `captar`; sem duplicar o novo principal.
      v_extras := coalesce(v_row.additional_assignees, '{}'::uuid[]);
      IF coalesce(v_item->>'additional_assignees_mode', 'keep') = 'clear' THEN
        v_extras := '{}'::uuid[];
      ELSE
        SELECT coalesce(array_agg(x), '{}'::uuid[]) INTO v_extras
          FROM unnest(v_extras) AS t(x)
         WHERE x <> v_target;
      END IF;

      UPDATE public.demands SET
        assigned_to = v_target,
        additional_assignees = v_extras,
        current_function_key = coalesce(nullif(v_item->>'next_function_key', ''), current_function_key),
        due_date = coalesce((v_item->'schedule'->>'due_date')::date, due_date),
        due_time = coalesce(v_item->'schedule'->>'due_time', due_time),
        delivery_date = coalesce((v_item->'schedule'->>'delivery_date')::date, delivery_date),
        delivery_time = coalesce(v_item->'schedule'->>'delivery_time', delivery_time),
        updated_at = now()
      WHERE id = v_row.id AND tenant_id = v_tenant;

      IF coalesce((v_item->>'same_assignee')::boolean, false) = false THEN
        INSERT INTO public.demand_flow_history (
          tenant_id, demand_id, from_user_id, to_user_id,
          from_function_key, to_function_key, action, created_by, metadata
        ) VALUES (
          v_tenant, v_row.id, v_row.assigned_to, v_target,
          v_row.current_function_key, coalesce(nullif(v_item->>'next_function_key', ''), v_row.current_function_key),
          'manual_assignment', auth.uid(),
          jsonb_build_object(
            'source', 'bulk_allocation_atomic',
            'bulk_allocation_id', v_bulk_id,
            'source_screen', v_source,
            'additional_assignees_mode', coalesce(v_item->>'additional_assignees_mode', 'keep')
          )
        );
      END IF;

      v_applied := v_applied || v_row.id;
    END LOOP;

    -- Tempos personalizados na MESMA transação.
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_durations) LOOP
      IF nullif(v_item->>'function_key', '') IS NULL
         OR coalesce((v_item->>'duration_min')::int, 0) <= 0 THEN
        CONTINUE;
      END IF;
      INSERT INTO public.demand_stage_duration_overrides
        (tenant_id, demand_id, function_key, duration_min, created_by)
      VALUES (
        v_tenant, (v_item->>'card_id')::uuid, v_item->>'function_key',
        (v_item->>'duration_min')::int, auth.uid()
      )
      ON CONFLICT (demand_id, function_key)
      DO UPDATE SET duration_min = excluded.duration_min, updated_at = now();
    END LOOP;

    -- Validação AUTORITATIVA final: a fila operacional do destinatário não pode
    -- ter sobreposição entre cards ativos temporizados. Cobre também updates de
    -- agenda em que o responsável NÃO muda (caso que o trigger ignora).
    SELECT b.title INTO v_overlap_title
      FROM public.demands a
      JOIN public.demands b ON b.id > a.id
     WHERE a.tenant_id = v_tenant AND b.tenant_id = v_tenant
       AND a.assigned_to = v_target AND b.assigned_to = v_target
       AND a.archived_at IS NULL AND b.archived_at IS NULL
       AND a.is_draft = false AND b.is_draft = false
       AND NOT public.is_client_facing_function(a.current_function_key)
       AND NOT public.is_client_facing_function(b.current_function_key)
       AND a.due_date IS NOT NULL AND a.due_time IS NOT NULL
       AND a.delivery_date IS NOT NULL AND a.delivery_time IS NOT NULL
       AND b.due_date IS NOT NULL AND b.due_time IS NOT NULL
       AND b.delivery_date IS NOT NULL AND b.delivery_time IS NOT NULL
       AND (a.id = ANY(v_ids) OR b.id = ANY(v_ids))
       AND (a.due_date + a.due_time::time) < (b.delivery_date + b.delivery_time::time)
       AND (b.due_date + b.due_time::time) < (a.delivery_date + a.delivery_time::time)
     LIMIT 1;

    IF v_overlap_title IS NOT NULL THEN
      RAISE EXCEPTION 'BULK_OVERLAP:%', v_overlap_title USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'BULK_OVERLAP:%' THEN
        RETURN jsonb_build_object(
          'status', 'blocked',
          'message', 'Conflito de horário na fila do colaborador ("' ||
                     replace(SQLERRM, 'BULK_OVERLAP:', '') || '"). Nada foi gravado.'
        );
      END IF;
      RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'status', 'applied',
    'applied_ids', to_jsonb(v_applied)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_bulk_allocation_atomic_v1(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_bulk_allocation_atomic_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bulk_allocation_atomic_v1(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.bulk_admin_stage_allowed(uuid, text, work_area, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_admin_stage_allowed(uuid, text, work_area, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_admin_stage_allowed(uuid, text, work_area, text, text, text) TO service_role;