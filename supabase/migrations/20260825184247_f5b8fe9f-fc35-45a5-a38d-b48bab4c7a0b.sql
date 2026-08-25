CREATE OR REPLACE FUNCTION public.pay_finance_statement(
  _occurrence_id uuid,
  _paid_at timestamp with time zone DEFAULT now(),
  _paid_amount_brl numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_kind text;
BEGIN
  SELECT o.tenant_id, i.kind
    INTO v_tenant, v_kind
  FROM public.finance_occurrences o
  JOIN public.finance_items i ON i.id = o.item_id
  WHERE o.id = _occurrence_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada';
  END IF;

  IF NOT public.has_finance_access(v_tenant) THEN
    RAISE EXCEPTION 'Acesso negado ao Financeiro';
  END IF;

  IF public.finance_access_scope(v_tenant) <> 'full' THEN
    RAISE EXCEPTION 'Apenas o Financeiro completo pode pagar faturas';
  END IF;

  IF v_kind <> 'card' THEN
    RAISE EXCEPTION 'Somente a ocorrência da fatura de um cartão pode ser paga por esta função';
  END IF;

  -- A FATURA é a única unidade de liquidação: os componentes NÃO recebem
  -- paid_at nem statement_occurrence_id por efeito colateral. A liquidação dos
  -- componentes é DERIVADA da fatura/ciclo na camada de leitura.
  UPDATE public.finance_occurrences
     SET paid_at = COALESCE(_paid_at, now()),
         paid_amount_brl = COALESCE(_paid_amount_brl, paid_amount_brl),
         updated_at = now()
   WHERE id = _occurrence_id;

  RETURN jsonb_build_object('success', true, 'components_settled', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_finance_statement(uuid, timestamp with time zone, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_finance_statement(uuid, timestamp with time zone, numeric) TO authenticated;