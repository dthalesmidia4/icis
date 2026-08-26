-- 1) Dia do fato mensal no cadastro (agenda da DESPESA, não do pagamento)
ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS recurrence_day_of_month integer;

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_recurrence_day_of_month_range;
ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_recurrence_day_of_month_range
  CHECK (recurrence_day_of_month IS NULL OR (recurrence_day_of_month BETWEEN 1 AND 31));

-- 2) AGENDA DE PAGAMENTO (independente da agenda da despesa)
CREATE TABLE IF NOT EXISTS public.finance_payment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.finance_items(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('per_occurrence','daily','weekly','monthly','manual')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
  weekday integer CHECK (weekday IS NULL OR (weekday BETWEEN 1 AND 7)),
  day_of_month integer CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_payment_rules TO authenticated;
GRANT ALL ON public.finance_payment_rules TO service_role;
ALTER TABLE public.finance_payment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_payment_rules_select" ON public.finance_payment_rules
  FOR SELECT TO authenticated USING (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_rules_insert" ON public.finance_payment_rules
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_rules_update" ON public.finance_payment_rules
  FOR UPDATE TO authenticated USING (public.has_finance_access(tenant_id))
  WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_rules_delete" ON public.finance_payment_rules
  FOR DELETE TO authenticated USING (public.has_finance_access(tenant_id));

CREATE TRIGGER finance_payment_rules_updated_at
  BEFORE UPDATE ON public.finance_payment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) LOTE DE PAGAMENTO: uma saída de caixa que quita várias ocorrências
CREATE TABLE IF NOT EXISTS public.finance_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.finance_items(id) ON DELETE CASCADE,
  competence_month date NOT NULL,
  scheduled_date date,
  paid_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_payment_batches TO authenticated;
GRANT ALL ON public.finance_payment_batches TO service_role;
ALTER TABLE public.finance_payment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_payment_batches_select" ON public.finance_payment_batches
  FOR SELECT TO authenticated USING (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_batches_insert" ON public.finance_payment_batches
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_batches_update" ON public.finance_payment_batches
  FOR UPDATE TO authenticated USING (public.has_finance_access(tenant_id))
  WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_batches_delete" ON public.finance_payment_batches
  FOR DELETE TO authenticated USING (public.has_finance_access(tenant_id) AND paid_at IS NULL);

CREATE TRIGGER finance_payment_batches_updated_at
  BEFORE UPDATE ON public.finance_payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Componentes do lote pela IDENTIDADE do lançamento (item + data agendada),
--    para que projeções entrem no lote sem precisar ser materializadas antes.
CREATE TABLE IF NOT EXISTS public.finance_payment_batch_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.finance_payment_batches(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.finance_items(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, item_id, scheduled_date),
  -- Uma ocorrência nunca pode ser paga por dois lotes.
  UNIQUE (tenant_id, item_id, scheduled_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_payment_batch_entries TO authenticated;
GRANT ALL ON public.finance_payment_batch_entries TO service_role;
ALTER TABLE public.finance_payment_batch_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_payment_batch_entries_select" ON public.finance_payment_batch_entries
  FOR SELECT TO authenticated USING (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_batch_entries_insert" ON public.finance_payment_batch_entries
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_payment_batch_entries_delete" ON public.finance_payment_batch_entries
  FOR DELETE TO authenticated USING (public.has_finance_access(tenant_id));

CREATE INDEX IF NOT EXISTS finance_payment_batch_entries_batch_idx
  ON public.finance_payment_batch_entries (batch_id);
CREATE INDEX IF NOT EXISTS finance_payment_batches_competence_idx
  ON public.finance_payment_batches (tenant_id, competence_month);
CREATE INDEX IF NOT EXISTS finance_payment_rules_item_idx
  ON public.finance_payment_rules (item_id, effective_from);

-- 5) Pagar / desfazer o LOTE (a saída de caixa real)
CREATE OR REPLACE FUNCTION public.finance_pay_payment_batch(
  _batch_id uuid,
  _paid_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_paid timestamptz;
  v_count integer;
BEGIN
  SELECT tenant_id, paid_at INTO v_tenant, v_paid
  FROM public.finance_payment_batches WHERE id = _batch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lote de pagamento não encontrado';
  END IF;
  IF NOT public.has_finance_access(v_tenant) THEN
    RAISE EXCEPTION 'Sem acesso ao Financeiro desta agência';
  END IF;
  IF v_paid IS NOT NULL THEN
    RAISE EXCEPTION 'Este lote já está pago';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.finance_payment_batch_entries WHERE batch_id = _batch_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Lote sem lançamentos: nada a pagar';
  END IF;

  UPDATE public.finance_payment_batches
  SET paid_at = COALESCE(_paid_at, now())
  WHERE id = _batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_unpay_payment_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.finance_payment_batches WHERE id = _batch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lote de pagamento não encontrado';
  END IF;
  IF NOT public.has_finance_access(v_tenant) THEN
    RAISE EXCEPTION 'Sem acesso ao Financeiro desta agência';
  END IF;
  UPDATE public.finance_payment_batches SET paid_at = NULL WHERE id = _batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_pay_payment_batch(uuid, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.finance_unpay_payment_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.finance_pay_payment_batch(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_unpay_payment_batch(uuid) TO authenticated;

-- 6) Realtime das novas tabelas (a tela do Financeiro é realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_payment_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_payment_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_payment_batch_entries;