CREATE TABLE public.finance_occurrence_corrections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES public.finance_occurrences(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.finance_items(id) ON DELETE CASCADE,
  kind text NOT NULL,
  fields text[] NOT NULL DEFAULT '{}',
  note text,
  corrected_by uuid,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.finance_occurrence_corrections TO authenticated;
GRANT ALL ON public.finance_occurrence_corrections TO service_role;

ALTER TABLE public.finance_occurrence_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance full access reads corrections"
ON public.finance_occurrence_corrections
FOR SELECT
TO authenticated
USING (public.finance_access_scope(tenant_id) = 'full');

CREATE INDEX idx_finance_occurrence_corrections_occ
  ON public.finance_occurrence_corrections (occurrence_id, corrected_at DESC);

-- ---------------------------------------------------------------------------
-- Correção auditada de um lançamento (fato do mês).
-- Whitelist estrita: nada de scheduled_date, competence_month, item_id,
-- paid_at, paid_amount_brl, statement ids ou metadados de skip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_correct_occurrence(
  _occurrence_id uuid,
  _patch jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_occ public.finance_occurrences;
  v_item public.finance_items;
  v_key text;
  v_fields text[] := '{}';
  v_allowed text[] := ARRAY[
    'currency','amount_original','exchange_rate','amount_brl',
    'charge_date','due_date','observations',
    'payment_method_snapshot','card_item_id_snapshot'
  ];
  v_charge date;
  v_due date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'Correcao vazia';
  END IF;

  SELECT * INTO v_occ FROM public.finance_occurrences WHERE id = _occurrence_id FOR UPDATE;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Lancamento nao encontrado';
  END IF;
  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;

  SELECT * INTO v_item FROM public.finance_items WHERE id = v_occ.item_id;
  IF v_item.kind = 'card' THEN
    RAISE EXCEPTION 'Fatura de cartao nao pode ser corrigida por aqui';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Campo nao corrigivel: %', v_key;
    END IF;
    v_fields := array_append(v_fields, v_key);
  END LOOP;

  IF array_length(v_fields, 1) IS NULL THEN
    RAISE EXCEPTION 'Correcao vazia';
  END IF;

  -- Cartao: a data real e a COBRANCA; o vencimento pertence a fatura.
  IF _patch ? 'charge_date' THEN
    v_charge := NULLIF(_patch->>'charge_date','')::date;
    UPDATE public.finance_occurrences
       SET charge_date = v_charge, due_date = NULL, updated_at = now()
     WHERE id = v_occ.id;
  END IF;

  IF _patch ? 'due_date' AND NOT (_patch ? 'charge_date') THEN
    v_due := NULLIF(_patch->>'due_date','')::date;
    UPDATE public.finance_occurrences
       SET due_date = v_due, updated_at = now()
     WHERE id = v_occ.id;
  END IF;

  IF _patch ? 'currency' THEN
    UPDATE public.finance_occurrences
       SET currency = _patch->>'currency', updated_at = now()
     WHERE id = v_occ.id;
  END IF;

  -- Valores continuam entrando em claro e sao cifrados pelos triggers.
  IF _patch ? 'amount_original' THEN
    UPDATE public.finance_occurrences
       SET amount_original = NULLIF(_patch->>'amount_original','')::numeric,
           is_estimated = false, updated_at = now()
     WHERE id = v_occ.id;
  END IF;
  IF _patch ? 'exchange_rate' THEN
    UPDATE public.finance_occurrences
       SET exchange_rate = NULLIF(_patch->>'exchange_rate','')::numeric, updated_at = now()
     WHERE id = v_occ.id;
  END IF;
  IF _patch ? 'amount_brl' THEN
    UPDATE public.finance_occurrences
       SET amount_brl = NULLIF(_patch->>'amount_brl','')::numeric,
           is_estimated = false, updated_at = now()
     WHERE id = v_occ.id;
  END IF;

  IF _patch ? 'observations' THEN
    UPDATE public.finance_occurrences
       SET observations = NULLIF(btrim(COALESCE(_patch->>'observations','')), ''), updated_at = now()
     WHERE id = v_occ.id;
  END IF;

  IF _patch ? 'payment_method_snapshot' OR _patch ? 'card_item_id_snapshot' THEN
    UPDATE public.finance_occurrences
       SET payment_method_snapshot = CASE WHEN _patch ? 'payment_method_snapshot'
              THEN NULLIF(_patch->>'payment_method_snapshot','') ELSE payment_method_snapshot END,
           card_item_id_snapshot = CASE WHEN _patch ? 'card_item_id_snapshot'
              THEN NULLIF(_patch->>'card_item_id_snapshot','')::uuid ELSE card_item_id_snapshot END,
           updated_at = now()
     WHERE id = v_occ.id;
  END IF;

  INSERT INTO public.finance_occurrence_corrections
    (tenant_id, occurrence_id, item_id, kind, fields, corrected_by)
  VALUES
    (v_occ.tenant_id, v_occ.id, v_occ.item_id, 'fact_correction', v_fields, auth.uid());

  RETURN v_occ.id;
END $function$;

REVOKE ALL ON FUNCTION public.finance_correct_occurrence(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_correct_occurrence(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_correct_occurrence(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Converte um fato avulso pago DIRETO em cobranca do cartao.
-- Exige a data real da cobranca. Nunca cria uma segunda ocorrencia.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_convert_occurrence_to_card_charge(
  _occurrence_id uuid,
  _charge_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_occ public.finance_occurrences;
  v_item public.finance_items;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;
  IF _charge_date IS NULL THEN
    RAISE EXCEPTION 'Data real da cobranca obrigatoria';
  END IF;

  SELECT * INTO v_occ FROM public.finance_occurrences WHERE id = _occurrence_id FOR UPDATE;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Lancamento nao encontrado';
  END IF;
  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;

  SELECT * INTO v_item FROM public.finance_items WHERE id = v_occ.item_id;
  IF v_item.kind = 'card' THEN
    RAISE EXCEPTION 'Fatura de cartao nao pode ser convertida';
  END IF;
  IF v_item.card_item_id IS NULL AND v_occ.card_item_id_snapshot IS NULL THEN
    RAISE EXCEPTION 'O cadastro nao esta vinculado a um cartao';
  END IF;

  UPDATE public.finance_occurrences
     SET charge_date = _charge_date,
         due_date = NULL,
         paid_at = NULL,
         updated_at = now()
   WHERE id = v_occ.id;

  -- Componente de cartao nao carrega pagamento proprio: quem quita e a fatura.
  UPDATE public.finance_occurrences
     SET paid_amount_brl = NULL, updated_at = now()
   WHERE id = v_occ.id;

  INSERT INTO public.finance_occurrence_corrections
    (tenant_id, occurrence_id, item_id, kind, fields, corrected_by, note)
  VALUES
    (v_occ.tenant_id, v_occ.id, v_occ.item_id, 'convert_to_card_charge',
     ARRAY['charge_date','due_date','paid_at','paid_amount_brl'], auth.uid(),
     'Pagamento direto anterior ao vinculo com o cartao: passa a ser liquidado pela fatura');

  RETURN v_occ.id;
END $function$;

REVOKE ALL ON FUNCTION public.finance_convert_occurrence_to_card_charge(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_convert_occurrence_to_card_charge(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_convert_occurrence_to_card_charge(uuid, date) TO authenticated;