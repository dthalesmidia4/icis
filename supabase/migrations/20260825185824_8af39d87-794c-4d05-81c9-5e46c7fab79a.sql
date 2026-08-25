CREATE OR REPLACE FUNCTION public.pay_finance_statement(
  _occurrence_id uuid,
  _paid_at timestamp with time zone DEFAULT now(),
  _paid_amount_brl numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_occ public.finance_occurrences;
  v_kind text;
  v_invoice_amount numeric;
  v_statement_amount numeric;
BEGIN
  SELECT * INTO v_occ
  FROM public.finance_occurrences
  WHERE id = _occurrence_id;

  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada';
  END IF;

  IF NOT public.has_finance_access(v_occ.tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Apenas o Financeiro completo pode pagar faturas';
  END IF;

  SELECT kind INTO v_kind
  FROM public.finance_items
  WHERE id = v_occ.item_id;

  IF v_kind <> 'card' THEN
    RAISE EXCEPTION 'Esta ocorrência não é uma fatura de cartão';
  END IF;

  -- Pós-cutover: o plaintext fica NULL em repouso, então o valor real da fatura
  -- vem SEMPRE do cofre. Nunca fazer fallback para a coluna plaintext.
  v_invoice_amount := private.finance_decrypt_numeric(v_occ.amount_brl_enc);

  IF _paid_amount_brl IS NOT NULL THEN
    IF _paid_amount_brl <= 0 THEN
      RAISE EXCEPTION 'Valor pago inválido';
    END IF;

    -- O sistema não possui saldo nem pagamento parcial: a fatura é liquidada
    -- integralmente ou não é liquidada. Tolerância apenas de centavos.
    IF v_invoice_amount IS NOT NULL
       AND abs(_paid_amount_brl - v_invoice_amount) > 0.011 THEN
      RAISE EXCEPTION 'Pagamento parcial não é suportado: informe o valor integral da fatura';
    END IF;

    v_statement_amount := _paid_amount_brl;
  ELSE
    v_statement_amount := v_invoice_amount;
  END IF;

  IF v_statement_amount IS NULL OR v_statement_amount <= 0 THEN
    RAISE EXCEPTION 'Fatura sem valor conhecido: informe o valor integral para liquidar';
  END IF;

  -- A FATURA é a única unidade de liquidação: componentes NÃO recebem paid_at
  -- nem statement_occurrence_id por efeito colateral. A liquidação dos
  -- componentes é DERIVADA da fatura/ciclo na camada de leitura.
  UPDATE public.finance_occurrences
     SET paid_at = COALESCE(_paid_at, now()),
         paid_amount_brl = v_statement_amount,
         updated_at = now()
   WHERE id = _occurrence_id;

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'statement_id', _occurrence_id,
    'components_settled', 0
  );
END
$function$;

REVOKE ALL ON FUNCTION public.pay_finance_statement(uuid, timestamp with time zone, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_finance_statement(uuid, timestamp with time zone, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_finance_statement(uuid, timestamp with time zone, numeric) TO authenticated;