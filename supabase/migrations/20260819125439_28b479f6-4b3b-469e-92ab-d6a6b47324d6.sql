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
  v_all jsonb := v_items || v_queue;
  v_ids uuid[];
  v_item jsonb;
  v_row public.demands;
  v_applied uuid[] := '{}';
  v_next text;
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

  SELECT array_agg((e->>'card_id')::uuid ORDER BY (e->>'card_id')::uuid)
    INTO v_ids
    FROM jsonb_array_elements(v_all) e;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN jsonb_build_object('status', 'nothing', 'applied_ids', '[]'::jsonb);
  END IF;

  -- Lock determinístico (ordem por id) para evitar deadlock entre gestores.
  PERFORM 1 FROM public.demands
   WHERE tenant_id = v_tenant AND id = ANY(v_ids)
   ORDER BY id
   FOR UPDATE;

  -- PASSO 1: validar TUDO antes de qualquer write.
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
       AND to_char(v_row.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') IS NOT NULL
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

    v_next := nullif(v_item->>'next_function_key', '');
    IF v_next IS NOT NULL AND coalesce((v_item->>'same_assignee')::boolean, false) = false THEN
      IF NOT public.user_can_hold_function(v_tenant, v_target, v_next, v_row.work_area) THEN
        RETURN jsonb_build_object('status', 'blocked', 'card_id', v_row.id,
                                  'message', 'Colaborador não tem a função desta etapa na área da demanda');
      END IF;
    END IF;
  END LOOP;

  -- PASSO 2: gravar (tudo ou nada — qualquer exceção reverte a transação).
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

    UPDATE public.demands SET
      assigned_to = v_target,
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
          'source_screen', v_source
        )
      );
    END IF;

    v_applied := v_applied || v_row.id;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'applied',
    'applied_ids', to_jsonb(v_applied)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_bulk_allocation_atomic_v1(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_bulk_allocation_atomic_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bulk_allocation_atomic_v1(jsonb) TO service_role;