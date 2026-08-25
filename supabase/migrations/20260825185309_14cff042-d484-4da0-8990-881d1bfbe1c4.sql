CREATE OR REPLACE FUNCTION public.create_finance_one_off(
  _tenant_id uuid,
  _kind text,
  _name text,
  _cost_center text,
  _currency text,
  _competence_month date,
  _payment_method text DEFAULT NULL,
  _card_item_id uuid DEFAULT NULL,
  _date date DEFAULT NULL,
  _amount_mode text DEFAULT 'fixed',
  _amount_original numeric DEFAULT NULL,
  _exchange_rate numeric DEFAULT NULL,
  _amount_brl numeric DEFAULT NULL,
  _purpose text DEFAULT NULL,
  _category text DEFAULT NULL,
  _link text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _parent_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scope text;
  v_item_id uuid;
  v_on_card boolean;
  v_card_kind text;
  v_card_tenant uuid;
BEGIN
  -- SECURITY DEFINER aqui existe para ATOMICIDADE, nunca para elevar escopo:
  -- toda regra de permissão é revalidada abaixo.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não informada';
  END IF;

  IF NOT public.user_has_tenant_access(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa';
  END IF;

  v_scope := public.finance_access_scope(_tenant_id);

  IF v_scope IS NULL OR v_scope = 'none' THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  -- Esta RPC cria SOMENTE gasto avulso com custo próprio.
  IF _kind IS NULL OR _kind NOT IN ('expense', 'tool', 'package') THEN
    RAISE EXCEPTION 'Tipo inválido para lançamento avulso';
  END IF;

  -- O escopo `tools` não administra contas/despesas nem o centro administrativo.
  IF v_scope = 'tools' THEN
    IF _kind NOT IN ('tool', 'package') THEN
      RAISE EXCEPTION 'Assinaturas e ferramentas só pode criar ferramenta ou pacote';
    END IF;
    IF _cost_center = 'administrativo' THEN
      RAISE EXCEPTION 'Assinaturas e ferramentas não administra o centro de custo administrativo';
    END IF;
  ELSIF v_scope <> 'full' THEN
    RAISE EXCEPTION 'Escopo do Financeiro não permite criar lançamentos';
  END IF;

  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'Informe o nome do lançamento';
  END IF;

  IF _cost_center IS NULL
     OR _cost_center NOT IN ('midia', 'sistemas', 'administrativo', 'compartilhado') THEN
    RAISE EXCEPTION 'Centro de custo inválido';
  END IF;

  IF _currency IS NULL OR _currency NOT IN ('BRL', 'USD') THEN
    RAISE EXCEPTION 'Moeda inválida';
  END IF;

  IF _competence_month IS NULL THEN
    RAISE EXCEPTION 'Competência não informada';
  END IF;

  v_on_card := _payment_method = 'Cartão de Crédito' AND _card_item_id IS NOT NULL;

  IF _payment_method = 'Cartão de Crédito' AND _card_item_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o cartão do lançamento';
  END IF;

  IF _card_item_id IS NOT NULL THEN
    SELECT kind, tenant_id INTO v_card_kind, v_card_tenant
    FROM public.finance_items
    WHERE id = _card_item_id;

    IF v_card_kind IS NULL OR v_card_tenant <> _tenant_id OR v_card_kind <> 'card' THEN
      RAISE EXCEPTION 'Cartão inválido para esta empresa';
    END IF;
  END IF;

  -- Cadastro do avulso. Valores em plaintext: os BEFORE triggers cifram e
  -- nulificam as colunas plaintext em repouso — nunca escrevemos `_enc` aqui.
  INSERT INTO public.finance_items (
    tenant_id, kind, name, purpose, category, cost_center, active,
    payment_method, card_item_id, currency,
    default_amount_original, default_exchange_rate, default_amount_brl,
    recurrence_type, amount_mode, link, notes, parent_item_id, created_by
  ) VALUES (
    _tenant_id, _kind, btrim(_name), _purpose, _category, _cost_center, true,
    _payment_method, CASE WHEN v_on_card THEN _card_item_id ELSE NULL END, _currency,
    _amount_original, _exchange_rate, _amount_brl,
    'one_off', COALESCE(_amount_mode, 'fixed'), _link, _notes, _parent_item_id, auth.uid()
  )
  RETURNING id INTO v_item_id;

  -- Fato do mês. No cartão a data é COBRANÇA (quem vence é a fatura); fora do
  -- cartão a data é VENCIMENTO. Nunca nasce pago.
  INSERT INTO public.finance_occurrences (
    tenant_id, item_id, competence_month, charge_date, due_date,
    currency, amount_original, exchange_rate, amount_brl,
    payment_method_snapshot, card_item_id_snapshot,
    paid_at, paid_amount_brl, created_by
  ) VALUES (
    _tenant_id, v_item_id, _competence_month,
    CASE WHEN v_on_card THEN _date ELSE NULL END,
    CASE WHEN v_on_card THEN NULL ELSE _date END,
    _currency, _amount_original, _exchange_rate, _amount_brl,
    _payment_method, CASE WHEN v_on_card THEN _card_item_id ELSE NULL END,
    NULL, NULL, auth.uid()
  );

  -- Não devolve valores financeiros: apenas identidade e sucesso.
  RETURN jsonb_build_object('ok', true, 'item_id', v_item_id);
END
$function$;

REVOKE ALL ON FUNCTION public.create_finance_one_off(uuid, text, text, text, text, date, text, uuid, date, text, numeric, numeric, numeric, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_finance_one_off(uuid, text, text, text, text, date, text, uuid, date, text, numeric, numeric, numeric, text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_finance_one_off(uuid, text, text, text, text, date, text, uuid, date, text, numeric, numeric, numeric, text, text, text, text, uuid) TO authenticated;