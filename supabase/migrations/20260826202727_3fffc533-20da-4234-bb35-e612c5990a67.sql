-- 1. PAPEL DO LANÇAMENTO -----------------------------------------------------
ALTER TABLE public.finance_occurrences
  ADD COLUMN IF NOT EXISTS entry_role text NOT NULL DEFAULT 'regular';

UPDATE public.finance_occurrences SET entry_role = 'regular' WHERE entry_role IS NULL;

ALTER TABLE public.finance_occurrences
  DROP CONSTRAINT IF EXISTS finance_occurrences_entry_role_check;
ALTER TABLE public.finance_occurrences
  ADD CONSTRAINT finance_occurrences_entry_role_check
  CHECK (entry_role IN ('regular','extra','recharge'));

-- scheduled_date é identidade do lançamento AGENDADO (regular). Suplementar
-- nunca usa data agendada: a identidade dele é a própria PK.
ALTER TABLE public.finance_occurrences
  DROP CONSTRAINT IF EXISTS finance_occurrences_supplemental_no_schedule;
ALTER TABLE public.finance_occurrences
  ADD CONSTRAINT finance_occurrences_supplemental_no_schedule
  CHECK (entry_role = 'regular' OR scheduled_date IS NULL);

-- Unicidade passa a valer SÓ para o lançamento regular.
DROP INDEX IF EXISTS public.finance_occ_item_competence_nosched_uniq;
DROP INDEX IF EXISTS public.finance_occ_item_scheduled_uniq;

CREATE UNIQUE INDEX finance_occ_item_competence_nosched_uniq
  ON public.finance_occurrences (tenant_id, item_id, competence_month)
  WHERE scheduled_date IS NULL AND entry_role = 'regular';

CREATE UNIQUE INDEX finance_occ_item_scheduled_uniq
  ON public.finance_occurrences (tenant_id, item_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL AND entry_role = 'regular';

CREATE INDEX IF NOT EXISTS finance_occ_supplemental_idx
  ON public.finance_occurrences (tenant_id, item_id, competence_month)
  WHERE entry_role <> 'regular';

-- 2. CADASTRO QUE ACEITA SUPLEMENTARES ---------------------------------------
ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS supports_supplemental_entries boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplemental_entry_kind text;

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_supplemental_kind_check;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_supplemental_kind_check
  CHECK (supplemental_entry_kind IS NULL OR supplemental_entry_kind IN ('recharge','extra'));

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_supplemental_not_card;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_supplemental_not_card
  CHECK (kind NOT IN ('card','included_resource') OR supports_supplemental_entries = false);

-- 3. VALIDAÇÃO: fatura de cartão nunca tem suplementar -----------------------
CREATE OR REPLACE FUNCTION public.finance_occurrences_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text;
  v_tenant uuid;
BEGIN
  SELECT kind, tenant_id INTO v_kind, v_tenant
  FROM public.finance_items WHERE id = NEW.item_id;
  IF v_kind = 'included_resource' THEN
    RAISE EXCEPTION 'Recurso incluído em pacote não gera ocorrência financeira';
  END IF;
  IF v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Item pertence a outro tenant';
  END IF;

  IF COALESCE(NEW.entry_role, 'regular') <> 'regular' AND v_kind = 'card' THEN
    RAISE EXCEPTION 'A fatura do cartão não aceita lançamento suplementar';
  END IF;

  IF NEW.card_item_id_snapshot IS NOT NULL THEN
    SELECT kind, tenant_id INTO v_kind, v_tenant
    FROM public.finance_items WHERE id = NEW.card_item_id_snapshot;
    IF v_kind IS DISTINCT FROM 'card' THEN
      RAISE EXCEPTION 'card_item_id_snapshot deve apontar para um cartão';
    END IF;
    IF v_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Cartão da ocorrência pertence a outro tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. RPC SEGURA DE CRIAÇÃO DE SUPLEMENTAR ------------------------------------
CREATE OR REPLACE FUNCTION public.finance_create_supplemental_occurrence(
  _item_id uuid,
  _entry_role text,
  _fact_date date,
  _currency text DEFAULT 'BRL',
  _amount_original numeric DEFAULT NULL,
  _exchange_rate numeric DEFAULT NULL,
  _amount_brl numeric DEFAULT NULL,
  _payment_method_snapshot text DEFAULT NULL,
  _card_item_id_snapshot uuid DEFAULT NULL,
  _observations text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item public.finance_items;
  v_card uuid;
  v_on_card boolean;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;
  IF _entry_role NOT IN ('extra','recharge') THEN
    RAISE EXCEPTION 'Papel invalido para lancamento suplementar';
  END IF;
  IF _fact_date IS NULL THEN
    RAISE EXCEPTION 'Data real do lancamento obrigatoria';
  END IF;
  IF _currency NOT IN ('BRL','USD') THEN
    RAISE EXCEPTION 'Moeda invalida';
  END IF;

  SELECT * INTO v_item FROM public.finance_items WHERE id = _item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro nao encontrado';
  END IF;
  IF public.finance_access_scope(v_item.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;
  IF v_item.kind IN ('card','included_resource') THEN
    RAISE EXCEPTION 'Este cadastro nao aceita lancamento suplementar';
  END IF;

  IF _card_item_id_snapshot IS NOT NULL THEN
    PERFORM 1 FROM public.finance_items
      WHERE id = _card_item_id_snapshot
        AND tenant_id = v_item.tenant_id
        AND kind = 'card';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cartao informado nao pertence ao tenant';
    END IF;
  END IF;

  v_card := COALESCE(_card_item_id_snapshot, CASE WHEN _payment_method_snapshot IS NULL THEN v_item.card_item_id END);
  v_on_card := v_card IS NOT NULL
    OR COALESCE(_payment_method_snapshot, v_item.payment_method) = 'Cartão de Crédito';

  INSERT INTO public.finance_occurrences (
    tenant_id, item_id, competence_month, entry_role, scheduled_date,
    charge_date, due_date, currency,
    amount_original, exchange_rate, amount_brl,
    is_estimated, observations,
    payment_method_snapshot, card_item_id_snapshot, created_by
  ) VALUES (
    v_item.tenant_id, v_item.id, date_trunc('month', _fact_date)::date, _entry_role, NULL,
    CASE WHEN v_on_card THEN _fact_date ELSE NULL END,
    CASE WHEN v_on_card THEN NULL ELSE _fact_date END,
    _currency,
    _amount_original, _exchange_rate, _amount_brl,
    false, NULLIF(btrim(COALESCE(_observations,'')), ''),
    _payment_method_snapshot, _card_item_id_snapshot, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION public.finance_create_supplemental_occurrence(uuid,text,date,text,numeric,numeric,numeric,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_create_supplemental_occurrence(uuid,text,date,text,numeric,numeric,numeric,text,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_create_supplemental_occurrence(uuid,text,date,text,numeric,numeric,numeric,text,uuid,text) TO authenticated;