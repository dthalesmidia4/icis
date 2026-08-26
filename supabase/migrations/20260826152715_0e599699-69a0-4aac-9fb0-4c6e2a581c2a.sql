-- =============================================================================
-- RECORRÊNCIA GENÉRICA (diária/semanal/mensal) + EXCEÇÕES AUDITÁVEIS
-- =============================================================================

/* ---------------------------- 1. CADASTRO MESTRE --------------------------- */

ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS recurrence_interval integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_weekday integer,
  ADD COLUMN IF NOT EXISTS recurrence_anchor_date date;

-- Normaliza o parque atual: mensal com o MESMO intervalo já praticado.
UPDATE public.finance_items
   SET recurrence_interval = GREATEST(COALESCE(recurrence_interval_months, 1), 1)
 WHERE recurrence_interval IS DISTINCT FROM GREATEST(COALESCE(recurrence_interval_months, 1), 1);

UPDATE public.finance_items
   SET recurrence_anchor_date = COALESCE(recurrence_start_date, subscription_date)
 WHERE recurrence_anchor_date IS NULL
   AND COALESCE(recurrence_start_date, subscription_date) IS NOT NULL;

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_recurrence_type_check;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_recurrence_type_check
  CHECK (recurrence_type = ANY (ARRAY[
    'one_off','monthly','annual','credits','variable','installments','daily','weekly'
  ]));

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_recurrence_interval_generic_positive;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_recurrence_interval_generic_positive
  CHECK (recurrence_interval > 0);

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_recurrence_weekday_range;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_recurrence_weekday_range
  CHECK (recurrence_weekday IS NULL OR (recurrence_weekday BETWEEN 1 AND 7));

-- Semanal SEM dia padrão não é cronograma: bloqueia cadastro ambíguo.
ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_weekly_needs_weekday;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_weekly_needs_weekday
  CHECK (recurrence_type <> 'weekly' OR recurrence_weekday IS NOT NULL);

/* --------------------- 2. HISTÓRICO DE REGRA (VERSÕES) -------------------- */

CREATE TABLE IF NOT EXISTS public.finance_recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.finance_items(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  frequency text NOT NULL CHECK (frequency = ANY (ARRAY['daily','weekly','monthly'])),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  weekday integer CHECK (weekday IS NULL OR (weekday BETWEEN 1 AND 7)),
  day_of_month integer CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  anchor_date date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_recurrence_rules_weekly_needs_weekday
    CHECK (frequency <> 'weekly' OR weekday IS NOT NULL),
  CONSTRAINT finance_recurrence_rules_item_from_uniq UNIQUE (item_id, effective_from)
);

CREATE INDEX IF NOT EXISTS finance_recurrence_rules_item_idx
  ON public.finance_recurrence_rules (item_id, effective_from);

-- Leitura direta pelo frontend (metadata não sensível); escrita só por RPC.
GRANT SELECT ON public.finance_recurrence_rules TO authenticated;
GRANT ALL ON public.finance_recurrence_rules TO service_role;

ALTER TABLE public.finance_recurrence_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance readers can view recurrence rules"
  ON public.finance_recurrence_rules;
CREATE POLICY "Finance readers can view recurrence rules"
  ON public.finance_recurrence_rules
  FOR SELECT TO authenticated
  USING (public.finance_access_scope(tenant_id) <> 'none');

DROP TRIGGER IF EXISTS finance_recurrence_rules_updated_at ON public.finance_recurrence_rules;
CREATE TRIGGER finance_recurrence_rules_updated_at
  BEFORE UPDATE ON public.finance_recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/* --------------------- 3. IDENTIDADE E SKIP DA OCORRÊNCIA ----------------- */

ALTER TABLE public.finance_occurrences
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS skipped_by uuid,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid;

-- SEM backfill: inventar scheduled_date para compras de cartão migradas criaria
-- identidade ambígua. Legado permanece sem data agendada.

DROP INDEX IF EXISTS public.finance_occ_item_competence_uniq;

-- Recorrentes: identidade é (tenant, item, data agendada).
CREATE UNIQUE INDEX IF NOT EXISTS finance_occ_item_scheduled_uniq
  ON public.finance_occurrences (tenant_id, item_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

-- Sem data agendada (faturas/legado): segue no máximo uma por competência.
CREATE UNIQUE INDEX IF NOT EXISTS finance_occ_item_competence_nosched_uniq
  ON public.finance_occurrences (tenant_id, item_id, competence_month)
  WHERE scheduled_date IS NULL;

CREATE INDEX IF NOT EXISTS finance_occ_scheduled_idx
  ON public.finance_occurrences (tenant_id, item_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_occ_skipped_idx
  ON public.finance_occurrences (tenant_id, competence_month)
  WHERE skipped_at IS NOT NULL;

/* --------- 4. GUARDA NO BANCO: pago/liquidado nunca pode ser skip -------- */

CREATE OR REPLACE FUNCTION public.finance_occurrences_guard_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_kind text;
  v_statement_paid timestamptz;
BEGIN
  SELECT kind INTO v_kind FROM public.finance_items WHERE id = NEW.item_id;

  -- Fatura é unidade de caixa por competência: não tem data agendada e não
  -- pode ser "ignorada" (isso apagaria caixa real do mês).
  IF v_kind = 'card' THEN
    IF NEW.scheduled_date IS NOT NULL THEN
      RAISE EXCEPTION 'Fatura de cartao nao possui data agendada de recorrencia';
    END IF;
    IF NEW.skipped_at IS NOT NULL THEN
      RAISE EXCEPTION 'Fatura de cartao nao pode ser ignorada';
    END IF;
  END IF;

  IF NEW.skipped_at IS NOT NULL THEN
    IF NEW.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'Lancamento pago nao pode ser ignorado';
    END IF;
    IF NEW.statement_occurrence_id IS NOT NULL THEN
      SELECT paid_at INTO v_statement_paid
        FROM public.finance_occurrences WHERE id = NEW.statement_occurrence_id;
      IF v_statement_paid IS NOT NULL THEN
        RAISE EXCEPTION 'Lancamento liquidado por fatura paga nao pode ser ignorado';
      END IF;
    END IF;
  END IF;

  -- scheduled_date é IDENTIDADE: imutável depois de criada.
  IF TG_OP = 'UPDATE'
     AND OLD.scheduled_date IS NOT NULL
     AND NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    RAISE EXCEPTION 'Data agendada e identidade do lancamento e nao pode ser alterada';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.finance_occurrences_guard_schedule() FROM PUBLIC;

DROP TRIGGER IF EXISTS finance_occurrences_guard_schedule_trg ON public.finance_occurrences;
CREATE TRIGGER finance_occurrences_guard_schedule_trg
  BEFORE INSERT OR UPDATE ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_guard_schedule();

/* ----------------------- 5. RPCs SEGURAS DE EXCEÇÃO ---------------------- */

-- Ignora (ou cria já ignorada) a ocorrência de uma data agendada.
CREATE OR REPLACE FUNCTION public.finance_skip_occurrence(
  _item_id uuid,
  _scheduled_date date,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item public.finance_items;
  v_occ public.finance_occurrences;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;
  SELECT * INTO v_item FROM public.finance_items WHERE id = _item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro nao encontrado';
  END IF;
  IF public.finance_access_scope(v_item.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;
  IF v_item.kind = 'card' THEN
    RAISE EXCEPTION 'Fatura de cartao nao pode ser ignorada';
  END IF;
  IF _scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Data agendada obrigatoria';
  END IF;

  SELECT * INTO v_occ
    FROM public.finance_occurrences
   WHERE tenant_id = v_item.tenant_id
     AND item_id = _item_id
     AND scheduled_date = _scheduled_date
   FOR UPDATE;

  IF v_occ.id IS NULL THEN
    INSERT INTO public.finance_occurrences (
      tenant_id, item_id, competence_month, scheduled_date, currency,
      skipped_at, skip_reason, skipped_by, created_by
    ) VALUES (
      v_item.tenant_id, _item_id, date_trunc('month', _scheduled_date)::date,
      _scheduled_date, v_item.currency,
      now(), NULLIF(btrim(COALESCE(_reason, '')), ''), auth.uid(), auth.uid()
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.finance_occurrences
     SET skipped_at = now(),
         skip_reason = NULLIF(btrim(COALESCE(_reason, '')), ''),
         skipped_by = auth.uid(),
         restored_at = NULL,
         restored_by = NULL,
         updated_at = now()
   WHERE id = v_occ.id;
  RETURN v_occ.id;
END $$;

REVOKE ALL ON FUNCTION public.finance_skip_occurrence(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_skip_occurrence(uuid, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_skip_occurrence(uuid, date, text) TO authenticated;

-- Restaura uma ocorrência ignorada, mantendo trilha.
CREATE OR REPLACE FUNCTION public.finance_restore_occurrence(_occurrence_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_occ public.finance_occurrences;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;
  SELECT * INTO v_occ FROM public.finance_occurrences
   WHERE id = _occurrence_id FOR UPDATE;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Lancamento nao encontrado';
  END IF;
  IF public.finance_access_scope(v_occ.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;
  IF v_occ.skipped_at IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.finance_occurrences
     SET skipped_at = NULL,
         restored_at = now(),
         restored_by = auth.uid(),
         updated_at = now()
   WHERE id = _occurrence_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.finance_restore_occurrence(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_restore_occurrence(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_restore_occurrence(uuid) TO authenticated;

-- Altera o cronograma a partir de uma data: nova versão de regra + mestre
-- atualizado. O passado NUNCA é reescrito (versões anteriores permanecem).
CREATE OR REPLACE FUNCTION public.finance_set_recurrence_future(
  _item_id uuid,
  _effective_from date,
  _frequency text,
  _interval integer DEFAULT 1,
  _weekday integer DEFAULT NULL,
  _day_of_month integer DEFAULT NULL,
  _anchor_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item public.finance_items;
  v_prev_freq text;
  v_rule_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;
  SELECT * INTO v_item FROM public.finance_items WHERE id = _item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro nao encontrado';
  END IF;
  IF public.finance_access_scope(v_item.tenant_id) <> 'full' THEN
    RAISE EXCEPTION 'Sem acesso completo ao financeiro';
  END IF;
  IF _frequency NOT IN ('daily','weekly','monthly') THEN
    RAISE EXCEPTION 'Frequencia invalida';
  END IF;
  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'Data de inicio obrigatoria';
  END IF;
  IF _frequency = 'weekly' AND _weekday IS NULL THEN
    RAISE EXCEPTION 'Recorrencia semanal exige dia padrao da semana';
  END IF;
  IF COALESCE(_interval, 1) < 1 THEN
    RAISE EXCEPTION 'Intervalo invalido';
  END IF;

  -- Preserva a regra vigente ANTES da mudança, para o passado continuar
  -- explicável mesmo que ela nunca tenha sido versionada.
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_recurrence_rules
     WHERE item_id = _item_id AND effective_from < _effective_from
  ) THEN
    v_prev_freq := CASE
      WHEN v_item.recurrence_type IN ('daily','weekly','monthly') THEN v_item.recurrence_type
      ELSE 'monthly'
    END;
    INSERT INTO public.finance_recurrence_rules (
      tenant_id, item_id, effective_from, frequency, interval_count,
      weekday, day_of_month, anchor_date, note, created_by
    ) VALUES (
      v_item.tenant_id, _item_id,
      LEAST(
        COALESCE(v_item.recurrence_anchor_date, v_item.recurrence_start_date,
                 v_item.subscription_date, v_item.created_at::date),
        _effective_from - 1
      ),
      v_prev_freq,
      GREATEST(COALESCE(v_item.recurrence_interval, 1), 1),
      v_item.recurrence_weekday,
      COALESCE(v_item.due_day, v_item.charge_day),
      COALESCE(v_item.recurrence_anchor_date, v_item.recurrence_start_date, v_item.subscription_date),
      'Regra anterior preservada automaticamente',
      auth.uid()
    )
    ON CONFLICT (item_id, effective_from) DO NOTHING;
  END IF;

  INSERT INTO public.finance_recurrence_rules (
    tenant_id, item_id, effective_from, frequency, interval_count,
    weekday, day_of_month, anchor_date, created_by
  ) VALUES (
    v_item.tenant_id, _item_id, _effective_from, _frequency,
    GREATEST(COALESCE(_interval, 1), 1), _weekday, _day_of_month,
    COALESCE(_anchor_date, _effective_from), auth.uid()
  )
  ON CONFLICT (item_id, effective_from) DO UPDATE
     SET frequency = EXCLUDED.frequency,
         interval_count = EXCLUDED.interval_count,
         weekday = EXCLUDED.weekday,
         day_of_month = EXCLUDED.day_of_month,
         anchor_date = EXCLUDED.anchor_date,
         updated_at = now()
  RETURNING id INTO v_rule_id;

  -- O mestre reflete a regra VIGENTE mais recente.
  UPDATE public.finance_items
     SET recurrence_type = _frequency,
         recurrence_interval = GREATEST(COALESCE(_interval, 1), 1),
         recurrence_interval_months = CASE
           WHEN _frequency = 'monthly' THEN GREATEST(COALESCE(_interval, 1), 1)
           ELSE recurrence_interval_months
         END,
         recurrence_weekday = _weekday,
         recurrence_anchor_date = COALESCE(_anchor_date, _effective_from),
         due_day = CASE
           WHEN _frequency = 'monthly' AND _day_of_month IS NOT NULL AND card_item_id IS NULL
             THEN _day_of_month ELSE due_day END,
         updated_at = now()
   WHERE id = _item_id;

  RETURN v_rule_id;
END $$;

REVOKE ALL ON FUNCTION public.finance_set_recurrence_future(uuid, date, text, integer, integer, integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_set_recurrence_future(uuid, date, text, integer, integer, integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_set_recurrence_future(uuid, date, text, integer, integer, integer, date) TO authenticated;
