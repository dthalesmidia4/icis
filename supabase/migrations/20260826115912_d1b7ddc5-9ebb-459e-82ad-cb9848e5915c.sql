-- 1. Coluna de staging (plaintext transitório) + coluna cifrada do IOF
ALTER TABLE public.finance_occurrences
  ADD COLUMN IF NOT EXISTS iof_amount_brl numeric,
  ADD COLUMN IF NOT EXISTS iof_amount_brl_enc bytea;

-- 2. Cifra no INSERT
CREATE OR REPLACE FUNCTION public.finance_occurrences_enc_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.amount_original_enc  := private.finance_encrypt_numeric(NEW.amount_original);
  NEW.exchange_rate_enc    := private.finance_encrypt_numeric(NEW.exchange_rate);
  NEW.amount_brl_enc       := private.finance_encrypt_numeric(NEW.amount_brl);
  NEW.paid_amount_brl_enc  := private.finance_encrypt_numeric(NEW.paid_amount_brl);
  NEW.iof_amount_brl_enc   := private.finance_encrypt_numeric(NEW.iof_amount_brl);
  NEW.amount_original := NULL;
  NEW.exchange_rate   := NULL;
  NEW.amount_brl      := NULL;
  NEW.paid_amount_brl := NULL;
  NEW.iof_amount_brl  := NULL;
  RETURN NEW;
END $function$;

-- 3. Cifra no UPDATE (por campo)
CREATE OR REPLACE FUNCTION public.finance_occurrences_enc_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE f text := TG_ARGV[0];
BEGIN
  IF f = 'amount_original' THEN
    NEW.amount_original_enc := private.finance_encrypt_numeric(NEW.amount_original);
    NEW.amount_original := NULL;
  ELSIF f = 'exchange_rate' THEN
    NEW.exchange_rate_enc := private.finance_encrypt_numeric(NEW.exchange_rate);
    NEW.exchange_rate := NULL;
  ELSIF f = 'amount_brl' THEN
    NEW.amount_brl_enc := private.finance_encrypt_numeric(NEW.amount_brl);
    NEW.amount_brl := NULL;
  ELSIF f = 'paid_amount_brl' THEN
    NEW.paid_amount_brl_enc := private.finance_encrypt_numeric(NEW.paid_amount_brl);
    NEW.paid_amount_brl := NULL;
  ELSIF f = 'iof_amount_brl' THEN
    NEW.iof_amount_brl_enc := private.finance_encrypt_numeric(NEW.iof_amount_brl);
    NEW.iof_amount_brl := NULL;
  ELSE
    RAISE EXCEPTION 'Campo financeiro desconhecido: %', f;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS finance_occurrences_enc_update_iof ON public.finance_occurrences;
CREATE TRIGGER finance_occurrences_enc_update_iof
  BEFORE UPDATE OF iof_amount_brl ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_enc_update('iof_amount_brl');

-- 4. Guard: ciphertext continua sendo gerenciado internamente
CREATE OR REPLACE FUNCTION public.guard_finance_occurrences_cipher_input()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.amount_original_enc IS NOT NULL
       OR NEW.exchange_rate_enc IS NOT NULL
       OR NEW.amount_brl_enc IS NOT NULL
       OR NEW.paid_amount_brl_enc IS NOT NULL
       OR NEW.iof_amount_brl_enc IS NOT NULL THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  ELSE
    IF NEW.amount_original_enc IS DISTINCT FROM OLD.amount_original_enc
       OR NEW.exchange_rate_enc IS DISTINCT FROM OLD.exchange_rate_enc
       OR NEW.amount_brl_enc IS DISTINCT FROM OLD.amount_brl_enc
       OR NEW.paid_amount_brl_enc IS DISTINCT FROM OLD.paid_amount_brl_enc
       OR NEW.iof_amount_brl_enc IS DISTINCT FROM OLD.iof_amount_brl_enc THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Leitura segura passa a expor o IOF
DROP FUNCTION IF EXISTS public.finance_read_occurrence_values(uuid, date, date);
CREATE FUNCTION public.finance_read_occurrence_values(_tenant_id uuid, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date)
RETURNS TABLE(id uuid, amount_original numeric, exchange_rate numeric, amount_brl numeric, paid_amount_brl numeric, iof_amount_brl numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_scope text;
BEGIN
  v_scope := public.finance_access_scope(_tenant_id);
  IF v_scope = 'none' THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  RETURN QUERY
  SELECT fo.id,
         private.finance_decrypt_numeric(fo.amount_original_enc),
         private.finance_decrypt_numeric(fo.exchange_rate_enc),
         private.finance_decrypt_numeric(fo.amount_brl_enc),
         private.finance_decrypt_numeric(fo.paid_amount_brl_enc),
         private.finance_decrypt_numeric(fo.iof_amount_brl_enc)
  FROM public.finance_occurrences fo
  WHERE fo.tenant_id = _tenant_id
    AND (_from IS NULL OR fo.competence_month >= _from)
    AND (_to IS NULL OR fo.competence_month <= _to)
    AND (
      v_scope = 'full'
      OR public.finance_tools_item_allowed(_tenant_id, fo.item_id)
    );
END $function$;

REVOKE ALL ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) TO authenticated;

-- 6. Pagamento/conciliação da fatura com repasse de IOF
DROP FUNCTION IF EXISTS public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb);
CREATE FUNCTION public.pay_finance_statement_reconciled(
  _occurrence_id uuid,
  _paid_at timestamp with time zone DEFAULT now(),
  _paid_amount_brl numeric DEFAULT NULL::numeric,
  _usd_components jsonb DEFAULT '[]'::jsonb,
  _iof_brl numeric DEFAULT 0
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
  v_expected       numeric;
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
  v_invoice_amount := private.finance_decrypt_numeric(v_occ.amount_brl_enc);
  v_expected := CASE WHEN v_invoice_amount IS NULL THEN NULL ELSE v_invoice_amount + v_iof END;

  IF _paid_amount_brl IS NOT NULL THEN
    IF _paid_amount_brl <= 0 THEN
      RAISE EXCEPTION 'Valor pago inválido';
    END IF;
    IF v_expected IS NOT NULL AND abs(_paid_amount_brl - v_expected) > 0.011 THEN
      RAISE EXCEPTION 'Pagamento parcial não é suportado: informe o valor integral da fatura (incluindo o repasse de IOF)';
    END IF;
    v_statement_amount := _paid_amount_brl;
  ELSE
    v_statement_amount := v_expected;
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

REVOKE ALL ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric) TO authenticated;