-- =========================================================================
-- 1) FIM DO DELETE DIRETO: histórico financeiro não pode ser destruído
--    por um DELETE do cliente (finance_occurrences.item_id é CASCADE).
-- =========================================================================
DROP POLICY IF EXISTS finance_items_delete ON public.finance_items;
DROP POLICY IF EXISTS finance_occ_delete ON public.finance_occurrences;
REVOKE DELETE ON public.finance_items FROM authenticated;
REVOKE DELETE ON public.finance_occurrences FROM authenticated;

-- =========================================================================
-- 2) DECISÃO (sem valores monetários): a UI pergunta o que é possível fazer.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.finance_item_delete_decision(_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item public.finance_items;
  v_occ_count int;
  v_child_count int;
  v_ref_count int;
  v_ref_active_count int;
  v_snapshot_count int;
  v_action text;
BEGIN
  SELECT * INTO v_item FROM public.finance_items WHERE id = _item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro nao encontrado';
  END IF;
  IF public.finance_access_scope(v_item.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;

  SELECT count(*) INTO v_occ_count FROM public.finance_occurrences WHERE item_id = _item_id;
  SELECT count(*) INTO v_child_count FROM public.finance_items WHERE parent_item_id = _item_id;
  SELECT count(*) INTO v_ref_count FROM public.finance_items WHERE card_item_id = _item_id;
  SELECT count(*) INTO v_ref_active_count
    FROM public.finance_items WHERE card_item_id = _item_id AND active IS TRUE;
  SELECT count(*) INTO v_snapshot_count
    FROM public.finance_occurrences WHERE card_item_id_snapshot = _item_id;

  IF v_ref_active_count > 0 THEN
    v_action := 'blocked_card_referenced';
  ELSIF v_occ_count = 0 AND v_child_count = 0 AND v_ref_count = 0 AND v_snapshot_count = 0 THEN
    v_action := 'delete';
  ELSIF v_item.active IS TRUE THEN
    v_action := 'inactivate';
  ELSE
    v_action := 'keep_history';
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'kind', v_item.kind,
    'recurrence_type', v_item.recurrence_type,
    'active', v_item.active,
    'occurrence_count', v_occ_count,
    'child_count', v_child_count,
    'referencing_item_count', v_ref_count,
    'referencing_active_item_count', v_ref_active_count,
    'snapshot_count', v_snapshot_count
  );
END;
$$;

-- =========================================================================
-- 3) HARD DELETE do cadastro — SOMENTE sem nenhum histórico/dependência.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.delete_finance_item_safe(_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item public.finance_items;
BEGIN
  SELECT * INTO v_item FROM public.finance_items WHERE id = _item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro nao encontrado';
  END IF;
  IF public.finance_access_scope(v_item.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;

  IF EXISTS (SELECT 1 FROM public.finance_occurrences WHERE item_id = _item_id) THEN
    RAISE EXCEPTION 'Cadastro possui historico: use inativar para preservar os meses anteriores';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_items WHERE parent_item_id = _item_id) THEN
    RAISE EXCEPTION 'Cadastro possui itens vinculados: remova ou reatribua antes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_items WHERE card_item_id = _item_id) THEN
    RAISE EXCEPTION 'Cartao usado por despesas cadastradas: reatribua a forma de pagamento antes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_occurrences WHERE card_item_id_snapshot = _item_id) THEN
    RAISE EXCEPTION 'Cartao possui historico de cobrancas: use inativar';
  END IF;

  DELETE FROM public.finance_items WHERE id = _item_id;
  RETURN jsonb_build_object('deleted_item', true, 'item_id', _item_id);
END;
$$;

-- =========================================================================
-- 4) INATIVAR cadastro — para o futuro sem tocar no passado.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.inactivate_finance_item_safe(_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item public.finance_items;
BEGIN
  SELECT * INTO v_item FROM public.finance_items WHERE id = _item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro nao encontrado';
  END IF;
  IF public.finance_access_scope(v_item.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.finance_items
    WHERE card_item_id = _item_id AND active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Cartao usado por despesas ativas: reatribua a forma de pagamento antes';
  END IF;

  UPDATE public.finance_items SET active = false, updated_at = now() WHERE id = _item_id;
  RETURN jsonb_build_object('inactivated_item', true, 'item_id', _item_id);
END;
$$;

-- =========================================================================
-- 5) EXCLUIR LANÇAMENTO — apenas fatura não paga ou avulso aberto.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.delete_finance_occurrence_safe(_occurrence_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_occ public.finance_occurrences;
  v_item public.finance_items;
  v_statement_paid timestamptz;
  v_occ_count int;
  v_deleted_item boolean := false;
BEGIN
  SELECT * INTO v_occ FROM public.finance_occurrences WHERE id = _occurrence_id FOR UPDATE;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Lancamento nao encontrado';
  END IF;
  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;

  SELECT * INTO v_item FROM public.finance_items WHERE id = v_occ.item_id;

  -- Fato fechado é imutável.
  IF v_occ.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Registro fechado: preservado no historico';
  END IF;
  IF v_occ.statement_occurrence_id IS NOT NULL THEN
    SELECT paid_at INTO v_statement_paid
      FROM public.finance_occurrences WHERE id = v_occ.statement_occurrence_id;
    IF v_statement_paid IS NOT NULL THEN
      RAISE EXCEPTION 'Cobranca liquidada por fatura paga: preservada no historico';
    END IF;
  END IF;

  IF v_item.kind = 'card' THEN
    -- Fatura informada e ainda não paga: apaga só a fatura, o cartão permanece.
    UPDATE public.finance_occurrences
       SET statement_occurrence_id = NULL, updated_at = now()
     WHERE statement_occurrence_id = _occurrence_id;
    DELETE FROM public.finance_occurrences WHERE id = _occurrence_id;
    RETURN jsonb_build_object('deleted_occurrence', true, 'deleted_item', false);
  END IF;

  SELECT count(*) INTO v_occ_count FROM public.finance_occurrences WHERE item_id = v_item.id;

  IF v_item.recurrence_type = 'one_off' AND v_occ_count = 1 THEN
    IF EXISTS (SELECT 1 FROM public.finance_items WHERE parent_item_id = v_item.id)
       OR EXISTS (SELECT 1 FROM public.finance_items WHERE card_item_id = v_item.id) THEN
      RAISE EXCEPTION 'Cadastro possui dependencias: reatribua antes de excluir';
    END IF;
    DELETE FROM public.finance_occurrences WHERE id = _occurrence_id;
    DELETE FROM public.finance_items WHERE id = v_item.id;
    v_deleted_item := true;
    RETURN jsonb_build_object('deleted_occurrence', true, 'deleted_item', v_deleted_item);
  END IF;

  RAISE EXCEPTION 'Lancamento recorrente ou parcelado: inative o cadastro para interromper o futuro';
END;
$$;

-- =========================================================================
-- 6) GRANTS: nunca público/anônimo.
-- =========================================================================
REVOKE ALL ON FUNCTION public.finance_item_delete_decision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_finance_item_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inactivate_finance_item_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_finance_occurrence_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_item_delete_decision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_finance_item_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inactivate_finance_item_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_finance_occurrence_safe(uuid) TO authenticated;