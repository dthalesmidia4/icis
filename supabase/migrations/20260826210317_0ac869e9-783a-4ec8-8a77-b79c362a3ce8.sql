-- ---------------------------------------------------------------------------
-- FECHAMENTO DA FATURA: total + IOF são o MESMO dado (uma única intenção).
-- Não toca em paid_at / paid_amount_brl: liquidação continua sendo outro fato.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_update_statement_closure(
  _occurrence_id uuid,
  _amount_brl numeric DEFAULT NULL,
  _iof_brl numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_occ    public.finance_occurrences;
  v_card   public.finance_items;
  v_total  numeric;
  v_iof    numeric;
  v_fields text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;

  SELECT * INTO v_occ FROM public.finance_occurrences WHERE id = _occurrence_id FOR UPDATE;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;

  IF NOT public.has_finance_access(v_occ.tenant_id) THEN
    RAISE EXCEPTION 'Sem acesso ao financeiro';
  END IF;
  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Ação permitida apenas no acesso financeiro completo';
  END IF;

  SELECT * INTO v_card FROM public.finance_items WHERE id = v_occ.item_id;
  IF v_card.id IS NULL OR v_card.kind <> 'card' THEN
    RAISE EXCEPTION 'Somente faturas de cartão têm fechamento';
  END IF;

  -- Total: quando não informado, mantém o total já conhecido (só o IOF muda).
  v_total := COALESCE(_amount_brl, private.finance_decrypt_numeric(v_occ.amount_brl_enc));
  IF _amount_brl IS NOT NULL THEN
    IF _amount_brl <= 0 THEN
      RAISE EXCEPTION 'Total da fatura inválido';
    END IF;
    v_fields := array_append(v_fields, 'amount_brl');
  END IF;

  v_iof := COALESCE(_iof_brl, 0);
  IF v_iof < 0 THEN
    RAISE EXCEPTION 'Repasse de IOF inválido';
  END IF;
  IF v_total IS NOT NULL AND v_iof > v_total THEN
    RAISE EXCEPTION 'Repasse de IOF não pode ser maior que o total da fatura';
  END IF;
  v_fields := array_append(v_fields, 'iof_amount_brl');

  -- Um único UPDATE: total e IOF na MESMA intenção. Valores entram em claro e
  -- são cifrados pelos triggers de criptografia.
  UPDATE public.finance_occurrences
     SET amount_brl     = CASE WHEN _amount_brl IS NOT NULL THEN _amount_brl ELSE amount_brl END,
         is_estimated   = CASE WHEN _amount_brl IS NOT NULL THEN false ELSE is_estimated END,
         iof_amount_brl = CASE WHEN v_iof > 0 THEN v_iof ELSE NULL END,
         updated_at     = now()
   WHERE id = _occurrence_id;

  INSERT INTO public.finance_occurrence_corrections
    (tenant_id, occurrence_id, item_id, kind, fields, corrected_by)
  VALUES
    (v_occ.tenant_id, v_occ.id, v_occ.item_id, 'statement_closure', v_fields, auth.uid());

  RETURN jsonb_build_object(
    'success', true,
    'occurrence_id', _occurrence_id,
    'amount_brl', v_total,
    'iof_brl', v_iof
  );
END
$function$;

REVOKE ALL ON FUNCTION public.finance_update_statement_closure(uuid, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_update_statement_closure(uuid, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_update_statement_closure(uuid, numeric, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pagamento da fatura: aceita o TOTAL do fechamento informado na tela, para que
-- total + IOF + paid_at sejam gravados na MESMA transação. A assinatura antiga
-- de 5 argumentos é removida para não haver rota ambígua.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.pay_finance_statement_reconciled(
  _occurrence_id uuid,
  _paid_at timestamp with time zone DEFAULT now(),
  _paid_amount_brl numeric DEFAULT NULL::numeric,
  _usd_components jsonb DEFAULT '[]'::jsonb,
  _iof_brl numeric DEFAULT 0,
  _statement_amount_brl numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_occ            public.finance_occurrences;
  v_card           public.finance_items;
  v_kind           text;
  v_invoice_amount numeric;
  v_statement_amount numeric;
  v_iof            numeric;
  v_comp           jsonb;
  v_item           public.finance_items;
  v_child          public.finance_occurrences;
  v_child_id       uuid;
  v_original       numeric;
  v_brl            numeric;
  v_rate           numeric;
  v_charge         date;
  v_card_of_child  uuid;
  v_cycle_start    date;
  v_cycle_end      date;
  v_reconciled     integer := 0;
BEGIN
  /* ----------------------------- A. FATURA ------------------------------ */
  SELECT * INTO v_occ FROM public.finance_occurrences WHERE id = _occurrence_id;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;

  IF NOT public.has_finance_access(v_occ.tenant_id) THEN
    RAISE EXCEPTION 'Sem acesso ao financeiro';
  END IF;
  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Ação permitida apenas no acesso financeiro completo';
  END IF;

  SELECT * INTO v_card FROM public.finance_items WHERE id = v_occ.item_id;
  v_kind := v_card.kind;
  IF v_kind <> 'card' THEN
    RAISE EXCEPTION 'Somente faturas de cartão podem ser pagas por esta rota';
  END IF;

  v_iof := COALESCE(_iof_brl, 0);
  IF v_iof < 0 THEN
    RAISE EXCEPTION 'Repasse de IOF inválido';
  END IF;

  /* --------- A.1 FECHAMENTO: total informado na tela é gravado antes ------ */
  IF _statement_amount_brl IS NOT NULL THEN
    IF _statement_amount_brl <= 0 THEN
      RAISE EXCEPTION 'Total da fatura inválido';
    END IF;
    UPDATE public.finance_occurrences
       SET amount_brl   = _statement_amount_brl,
           is_estimated = false,
           updated_at   = now()
     WHERE id = _occurrence_id;
  END IF;

  v_invoice_amount := COALESCE(
    _statement_amount_brl,
    private.finance_decrypt_numeric(v_occ.amount_brl_enc)
  );
  IF v_invoice_amount IS NOT NULL AND v_iof > v_invoice_amount THEN
    RAISE EXCEPTION 'Repasse de IOF não pode ser maior que o total da fatura';
  END IF;

  /* ------------------- B. JANELA DO CICLO DA FATURA -------------------- */
  IF v_card.statement_closing_day IS NOT NULL THEN
    v_cycle_end := (date_trunc('month', v_occ.competence_month)::date
                     + LEAST(v_card.statement_closing_day,
                             EXTRACT(DAY FROM (date_trunc('month', v_occ.competence_month)
                                               + interval '1 month - 1 day'))::int) - 1);
    v_cycle_start := (v_cycle_end - interval '1 month')::date + 1;
  ELSE
    v_cycle_start := date_trunc('month', v_occ.competence_month)::date;
    v_cycle_end := (date_trunc('month', v_occ.competence_month) + interval '1 month - 1 day')::date;
  END IF;

  /* --------------------- C. RECONCILIAÇÃO DOS USD ---------------------- */
  FOR v_comp IN SELECT * FROM jsonb_array_elements(COALESCE(_usd_components, '[]'::jsonb))
  LOOP
    v_child_id := NULLIF(v_comp->>'occurrence_id', '')::uuid;
    v_original := NULLIF(v_comp->>'amount_original', '')::numeric;
    v_brl      := NULLIF(v_comp->>'amount_brl', '')::numeric;
    v_charge   := NULLIF(v_comp->>'charge_date', '')::date;

    SELECT * INTO v_item FROM public.finance_items
      WHERE id = NULLIF(v_comp->>'item_id', '')::uuid;
    IF v_item.id IS NULL OR v_item.tenant_id <> v_occ.tenant_id THEN
      RAISE EXCEPTION 'Componente inválido para esta fatura';
    END IF;

    IF v_original IS NULL OR v_original <= 0 THEN
      RAISE EXCEPTION 'Valor em dólar inválido no componente %', v_item.name;
    END IF;
    IF v_brl IS NULL OR v_brl <= 0 THEN
      RAISE EXCEPTION 'Informe o valor exato em reais do componente %', v_item.name;
    END IF;

    -- Câmbio SEMPRE recalculado no banco, por componente.
    v_rate := round(v_brl / v_original, 6);

    IF v_child_id IS NOT NULL THEN
      SELECT * INTO v_child FROM public.finance_occurrences WHERE id = v_child_id;
      IF v_child.id IS NULL OR v_child.tenant_id <> v_occ.tenant_id
         OR v_child.item_id <> v_item.id THEN
        RAISE EXCEPTION 'Lançamento informado não pertence a esta fatura';
      END IF;
      IF v_child.currency <> 'USD' THEN
        RAISE EXCEPTION 'Componente % não é em dólar', v_item.name;
      END IF;
      v_card_of_child := COALESCE(v_child.card_item_id_snapshot, v_item.card_item_id);
      v_charge := COALESCE(v_charge, v_child.charge_date);
    ELSE
      IF v_item.currency <> 'USD' THEN
        RAISE EXCEPTION 'Componente % não é em dólar', v_item.name;
      END IF;
      v_card_of_child := v_item.card_item_id;
    END IF;

    IF v_card_of_child IS DISTINCT FROM v_card.id THEN
      RAISE EXCEPTION 'Componente % não pertence a este cartão', v_item.name;
    END IF;
    IF v_charge IS NULL OR v_charge < v_cycle_start OR v_charge > v_cycle_end THEN
      RAISE EXCEPTION 'Componente % não pertence ao ciclo desta fatura', v_item.name;
    END IF;

    IF v_child_id IS NOT NULL THEN
      UPDATE public.finance_occurrences
         SET amount_original = v_original,
             amount_brl      = v_brl,
             exchange_rate   = v_rate,
             is_estimated    = false,
             charge_date     = v_charge,
             updated_at      = now()
       WHERE id = v_child_id;
    ELSE
      INSERT INTO public.finance_occurrences (
        tenant_id, item_id, competence_month, charge_date, due_date, currency,
        amount_original, amount_brl, exchange_rate, is_estimated,
        payment_method_snapshot, card_item_id_snapshot,
        statement_competence_snapshot, created_by
      ) VALUES (
        v_occ.tenant_id, v_item.id, v_occ.competence_month, v_charge, NULL, 'USD',
        v_original, v_brl, v_rate, false,
        'Cartão de Crédito', v_card.id,
        v_occ.competence_month, auth.uid()
      );
    END IF;

    v_reconciled := v_reconciled + 1;
  END LOOP;

  /* ------------------------- D. PAGA A FATURA -------------------------- */
  IF _paid_amount_brl IS NOT NULL THEN
    IF _paid_amount_brl <= 0 THEN
      RAISE EXCEPTION 'Valor pago inválido';
    END IF;
    IF v_invoice_amount IS NOT NULL AND abs(_paid_amount_brl - v_invoice_amount) > 0.011 THEN
      RAISE EXCEPTION 'Pagamento parcial não é suportado: informe o valor integral da fatura';
    END IF;
    v_statement_amount := _paid_amount_brl;
  ELSE
    v_statement_amount := v_invoice_amount;
  END IF;

  IF v_statement_amount IS NULL OR v_statement_amount <= 0 THEN
    RAISE EXCEPTION 'Fatura sem valor conhecido: informe o valor pago';
  END IF;

  UPDATE public.finance_occurrences
     SET paid_at         = COALESCE(_paid_at, now()),
         paid_amount_brl = v_statement_amount,
         iof_amount_brl  = CASE WHEN v_iof > 0 THEN v_iof ELSE NULL END,
         updated_at      = now()
   WHERE id = _occurrence_id;

  RETURN jsonb_build_object(
    'success', true,
    'occurrence_id', _occurrence_id,
    'paid_amount_brl', v_statement_amount,
    'iof_brl', v_iof,
    'usd_reconciled', v_reconciled,
    'components_settled', 0
  );
END
$function$;

REVOKE ALL ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric, numeric) TO authenticated, service_role;