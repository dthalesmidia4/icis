-- 1) Recria a função do trigger para nunca zerar assigned_to
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

  -- Se a função atual já é permitida ao responsável, não mexe
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
    -- Reencaminha para uma função permitida da sequência
    NEW.current_function_key := v_resolved;
  END IF;
  -- Caso contrário (usuário sem função na sequência): preserva tudo.
  -- NUNCA zera assigned_to — o responsável foi escolhido pelo usuário.

  RETURN NEW;
END;
$$;

-- 2) Restaura os responsáveis originais dos cards afetados pelo backfill de 2026-07-28 13:43:07
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT h.demand_id, h.tenant_id, h.from_user_id, h.from_function_key
    FROM public.demand_flow_history h
    WHERE h.action = 'system_realign'
      AND h.to_user_id IS NULL
      AND h.from_user_id IS NOT NULL
      AND (h.metadata->>'reason') = 'backfill'
      AND h.created_at = '2026-07-28 13:43:07.316406+00'
  LOOP
    UPDATE public.demands d
    SET assigned_to = r.from_user_id
    WHERE d.id = r.demand_id
      AND d.archived_at IS NULL
      AND d.assigned_to IS NULL;

    IF FOUND THEN
      INSERT INTO public.demand_flow_history (
        tenant_id, demand_id, from_user_id, to_user_id,
        from_function_key, to_function_key, action, created_by, metadata
      ) VALUES (
        r.tenant_id, r.demand_id, NULL, r.from_user_id,
        r.from_function_key, r.from_function_key,
        'system_restore', NULL,
        jsonb_build_object('reason', 'undo_backfill_null_assignee')
      );
    END IF;
  END LOOP;
END;
$$;