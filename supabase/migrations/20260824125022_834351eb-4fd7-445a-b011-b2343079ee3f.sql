-- =====================================================================
-- 1. PERMISSÃO DE ACESSO AO FINANCEIRO
-- =====================================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS finance_access boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_finance_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.tenant_id = _tenant_id
          AND (
            ur.role = 'agency_admin'::app_role
            OR (ur.role = 'agency_manager'::app_role AND ur.finance_access = true)
          )
      );
$$;

-- =====================================================================
-- 2. CONFIGURAÇÃO FINANCEIRA DO TENANT
-- =====================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS finance_monthly_budget_brl numeric,
  ADD COLUMN IF NOT EXISTS finance_default_usd_rate numeric;

UPDATE public.tenants
   SET finance_monthly_budget_brl = COALESCE(finance_monthly_budget_brl, 5000.00),
       finance_default_usd_rate   = COALESCE(finance_default_usd_rate, 5.13);

CREATE OR REPLACE FUNCTION public.set_finance_settings(
  _tenant_id uuid,
  _monthly_budget_brl numeric,
  _default_usd_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.tenants;
BEGIN
  IF NOT public.has_finance_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para configurar o Financeiro';
  END IF;
  IF _monthly_budget_brl IS NOT NULL AND _monthly_budget_brl < 0 THEN
    RAISE EXCEPTION 'Orçamento inválido';
  END IF;
  IF _default_usd_rate IS NOT NULL AND _default_usd_rate <= 0 THEN
    RAISE EXCEPTION 'Câmbio inválido';
  END IF;

  UPDATE public.tenants
     SET finance_monthly_budget_brl = _monthly_budget_brl,
         finance_default_usd_rate = _default_usd_rate,
         updated_at = now()
   WHERE id = _tenant_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'monthly_budget_brl', v_row.finance_monthly_budget_brl,
    'default_usd_rate', v_row.finance_default_usd_rate
  );
END;
$$;

-- =====================================================================
-- 3. finance_items
-- =====================================================================
CREATE TABLE public.finance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('expense','tool','package','card','included_resource')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  purpose text,
  category text,
  cost_center text NOT NULL DEFAULT 'administrativo'
    CHECK (cost_center IN ('midia','sistemas','administrativo','compartilhado')),
  active boolean NOT NULL DEFAULT true,
  payment_method text,
  card_item_id uuid REFERENCES public.finance_items(id) ON DELETE SET NULL,
  bank_name text,
  card_last4 text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  statement_closing_day integer CHECK (statement_closing_day IS NULL OR statement_closing_day BETWEEN 1 AND 31),
  statement_due_day integer CHECK (statement_due_day IS NULL OR statement_due_day BETWEEN 1 AND 31),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL','USD')),
  default_amount_original numeric CHECK (default_amount_original IS NULL OR default_amount_original >= 0),
  default_exchange_rate numeric CHECK (default_exchange_rate IS NULL OR default_exchange_rate > 0),
  default_amount_brl numeric CHECK (default_amount_brl IS NULL OR default_amount_brl >= 0),
  recurrence_type text NOT NULL DEFAULT 'one_off'
    CHECK (recurrence_type IN ('one_off','monthly','annual','credits','variable')),
  charge_day integer CHECK (charge_day IS NULL OR charge_day BETWEEN 1 AND 31),
  due_day integer CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  subscription_date date,
  link text,
  parent_item_id uuid REFERENCES public.finance_items(id) ON DELETE CASCADE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_items_card_fields CHECK (
    kind = 'card' OR (bank_name IS NULL AND card_last4 IS NULL
                      AND statement_closing_day IS NULL AND statement_due_day IS NULL)
  ),
  CONSTRAINT finance_items_included_needs_parent CHECK (
    kind <> 'included_resource' OR parent_item_id IS NOT NULL
  ),
  CONSTRAINT finance_items_card_no_self_card CHECK (kind <> 'card' OR card_item_id IS NULL),
  CONSTRAINT finance_items_no_self_parent CHECK (parent_item_id IS NULL OR parent_item_id <> id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_items TO authenticated;
GRANT ALL ON public.finance_items TO service_role;
ALTER TABLE public.finance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_items_select" ON public.finance_items FOR SELECT TO authenticated
  USING (public.has_finance_access(tenant_id));
CREATE POLICY "finance_items_insert" ON public.finance_items FOR INSERT TO authenticated
  WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_items_update" ON public.finance_items FOR UPDATE TO authenticated
  USING (public.has_finance_access(tenant_id)) WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_items_delete" ON public.finance_items FOR DELETE TO authenticated
  USING (public.has_finance_access(tenant_id));

CREATE INDEX finance_items_tenant_kind_idx ON public.finance_items (tenant_id, kind, active);
CREATE INDEX finance_items_card_idx ON public.finance_items (card_item_id) WHERE card_item_id IS NOT NULL;
CREATE INDEX finance_items_parent_idx ON public.finance_items (parent_item_id) WHERE parent_item_id IS NOT NULL;
CREATE UNIQUE INDEX finance_items_card_last4_uniq
  ON public.finance_items (tenant_id, card_last4) WHERE kind = 'card' AND card_last4 IS NOT NULL;
CREATE UNIQUE INDEX finance_items_catalog_uniq
  ON public.finance_items (
    tenant_id, kind, lower(btrim(name)),
    COALESCE(card_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(parent_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE kind IN ('tool','package','card','included_resource');

CREATE TRIGGER finance_items_updated_at BEFORE UPDATE ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- validações relacionais (kind do cartão / pai / tenant)
CREATE OR REPLACE FUNCTION public.finance_items_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_kind text; v_tenant uuid;
BEGIN
  IF NEW.card_item_id IS NOT NULL THEN
    SELECT kind, tenant_id INTO v_kind, v_tenant FROM public.finance_items WHERE id = NEW.card_item_id;
    IF v_kind IS DISTINCT FROM 'card' THEN
      RAISE EXCEPTION 'card_item_id deve apontar para um item do tipo card';
    END IF;
    IF v_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Cartão pertence a outro tenant';
    END IF;
  END IF;

  IF NEW.parent_item_id IS NOT NULL THEN
    SELECT kind, tenant_id INTO v_kind, v_tenant FROM public.finance_items WHERE id = NEW.parent_item_id;
    IF v_kind IS DISTINCT FROM 'package' THEN
      RAISE EXCEPTION 'parent_item_id deve apontar para um item do tipo package';
    END IF;
    IF v_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'Pacote pertence a outro tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_items_validate_trg BEFORE INSERT OR UPDATE ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_items_validate();

-- =====================================================================
-- 4. finance_occurrences
-- =====================================================================
CREATE TABLE public.finance_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.finance_items(id) ON DELETE CASCADE,
  competence_month date NOT NULL,
  charge_date date,
  due_date date,
  amount_original numeric CHECK (amount_original IS NULL OR amount_original >= 0),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL','USD')),
  exchange_rate numeric CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  amount_brl numeric CHECK (amount_brl IS NULL OR amount_brl >= 0),
  is_estimated boolean NOT NULL DEFAULT false,
  statement_occurrence_id uuid REFERENCES public.finance_occurrences(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_amount_brl numeric CHECK (paid_amount_brl IS NULL OR paid_amount_brl >= 0),
  attachment_url text,
  attachment_name text,
  observations text,
  legacy_bill_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_occurrences_competence_first_day CHECK (date_trunc('month', competence_month)::date = competence_month),
  CONSTRAINT finance_occurrences_no_self_statement CHECK (statement_occurrence_id IS NULL OR statement_occurrence_id <> id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_occurrences TO authenticated;
GRANT ALL ON public.finance_occurrences TO service_role;
ALTER TABLE public.finance_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_occ_select" ON public.finance_occurrences FOR SELECT TO authenticated
  USING (public.has_finance_access(tenant_id));
CREATE POLICY "finance_occ_insert" ON public.finance_occurrences FOR INSERT TO authenticated
  WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_occ_update" ON public.finance_occurrences FOR UPDATE TO authenticated
  USING (public.has_finance_access(tenant_id)) WITH CHECK (public.has_finance_access(tenant_id));
CREATE POLICY "finance_occ_delete" ON public.finance_occurrences FOR DELETE TO authenticated
  USING (public.has_finance_access(tenant_id));

CREATE UNIQUE INDEX finance_occ_item_competence_uniq
  ON public.finance_occurrences (tenant_id, item_id, competence_month);
CREATE UNIQUE INDEX finance_occ_legacy_uniq
  ON public.finance_occurrences (legacy_bill_id) WHERE legacy_bill_id IS NOT NULL;
CREATE INDEX finance_occ_tenant_competence_idx ON public.finance_occurrences (tenant_id, competence_month);
CREATE INDEX finance_occ_due_idx ON public.finance_occurrences (tenant_id, due_date);
CREATE INDEX finance_occ_paid_idx ON public.finance_occurrences (tenant_id, paid_at);
CREATE INDEX finance_occ_statement_idx ON public.finance_occurrences (statement_occurrence_id)
  WHERE statement_occurrence_id IS NOT NULL;
CREATE INDEX finance_occ_item_idx ON public.finance_occurrences (item_id);

CREATE TRIGGER finance_occurrences_updated_at BEFORE UPDATE ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.finance_occurrences_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_kind text; v_tenant uuid;
BEGIN
  SELECT kind, tenant_id INTO v_kind, v_tenant FROM public.finance_items WHERE id = NEW.item_id;
  IF v_kind = 'included_resource' THEN
    RAISE EXCEPTION 'Recurso incluído em pacote não gera ocorrência financeira';
  END IF;
  IF v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Item pertence a outro tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_occurrences_validate_trg BEFORE INSERT OR UPDATE ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_validate();

-- =====================================================================
-- 5. PAGAR FATURA (liquida fatura + componentes, sem dupla contagem)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pay_finance_statement(
  _occurrence_id uuid,
  _paid_at timestamptz DEFAULT now(),
  _paid_amount_brl numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_occ public.finance_occurrences;
  v_kind text;
  v_components integer := 0;
BEGIN
  SELECT * INTO v_occ FROM public.finance_occurrences WHERE id = _occurrence_id;
  IF v_occ.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada';
  END IF;
  IF NOT public.has_finance_access(v_occ.tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  SELECT kind INTO v_kind FROM public.finance_items WHERE id = v_occ.item_id;
  IF v_kind <> 'card' THEN
    RAISE EXCEPTION 'Esta ocorrência não é uma fatura de cartão';
  END IF;

  UPDATE public.finance_occurrences
     SET paid_at = COALESCE(_paid_at, now()),
         paid_amount_brl = COALESCE(_paid_amount_brl, amount_brl),
         updated_at = now()
   WHERE id = _occurrence_id;

  UPDATE public.finance_occurrences
     SET paid_at = COALESCE(_paid_at, now()),
         paid_amount_brl = COALESCE(paid_amount_brl, amount_brl),
         updated_at = now()
   WHERE statement_occurrence_id = _occurrence_id
     AND paid_at IS NULL;
  GET DIAGNOSTICS v_components = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'statement_id', _occurrence_id, 'components_settled', v_components);
END;
$$;

-- =====================================================================
-- 6. MIGRAÇÃO DE bills_payable -> finance_items / finance_occurrences
-- =====================================================================
DO $migrate$
DECLARE
  v_tenant uuid;
  g RECORD;
  v_item_id uuid;
  v_card_itau uuid;
  v_card_9584 uuid;
  v_default_amount numeric;
  v_default_method text;
  v_default_day integer;
  v_recurring boolean;
  v_expected integer;
  v_migrated integer;
  v_pkg_conteudos uuid;
  v_pkg_designer uuid;
  v_norm text;
  v_res text;
BEGIN
FOR v_tenant IN SELECT DISTINCT tenant_id FROM public.bills_payable LOOP

  -- 6.1 cartões
  INSERT INTO public.finance_items
    (tenant_id, kind, name, category, cost_center, bank_name, card_last4,
     statement_closing_day, statement_due_day, recurrence_type, currency, notes)
  VALUES
    (v_tenant, 'card', 'Itaú ••••7587', 'Cartão', 'compartilhado', 'Itaú', '7587',
     NULL, NULL, 'monthly', 'BRL',
     'Fechamento e vencimento não informados: complete os dados do cartão para projetar a fatura.')
  RETURNING id INTO v_card_itau;

  INSERT INTO public.finance_items
    (tenant_id, kind, name, category, cost_center, bank_name, card_last4,
     statement_closing_day, statement_due_day, recurrence_type, currency, notes)
  VALUES
    (v_tenant, 'card', 'Cartão ••••9584', 'Cartão', 'compartilhado', NULL, '9584',
     NULL, NULL, 'monthly', 'BRL',
     'Banco, fechamento e vencimento não informados: configuração incompleta.')
  RETURNING id INTO v_card_9584;

  -- 6.2 séries de contas legadas
  FOR g IN
    SELECT COALESCE(parent_bill_id, id) AS grp
    FROM public.bills_payable
    WHERE tenant_id = v_tenant
    GROUP BY 1
  LOOP
    -- linhas "reais" da série (descarta filhos futuros artificiais e vazios)
    CREATE TEMP TABLE IF NOT EXISTS _rel (LIKE public.bills_payable) ON COMMIT DROP;
    DELETE FROM _rel;
    INSERT INTO _rel
    SELECT * FROM public.bills_payable
     WHERE tenant_id = v_tenant
       AND COALESCE(parent_bill_id, id) = g.grp
       AND NOT (
         due_date > CURRENT_DATE
         AND paid_at IS NULL
         AND amount IS NULL
         AND attachment_url IS NULL
         AND COALESCE(btrim(observations), '') = ''
       );

    IF NOT EXISTS (SELECT 1 FROM _rel) THEN
      CONTINUE;
    END IF;

    SELECT bool_or(is_recurring) INTO v_recurring FROM _rel;

    SELECT amount, payment_method, EXTRACT(DAY FROM due_date)::int
      INTO v_default_amount, v_default_method, v_default_day
      FROM _rel
     WHERE amount IS NOT NULL
     ORDER BY due_date DESC
     LIMIT 1;

    IF v_default_day IS NULL THEN
      SELECT payment_method, EXTRACT(DAY FROM due_date)::int
        INTO v_default_method, v_default_day
        FROM _rel ORDER BY due_date DESC LIMIT 1;
    END IF;

    SELECT upper(btrim(name)) INTO v_norm FROM _rel ORDER BY due_date ASC LIMIT 1;

    IF v_norm IN ('CARTÃO ITAÚ', 'CARTÃO CRED. ITAÚ') THEN
      -- faturas históricas do cartão Itaú (não são despesa adicional)
      v_item_id := v_card_itau;
    ELSE
      INSERT INTO public.finance_items
        (tenant_id, kind, name, category, cost_center, active, payment_method,
         currency, default_amount_brl, recurrence_type, due_day, created_by, notes)
      SELECT v_tenant, 'expense', r.name, 'Conta', 'administrativo',
             CASE WHEN v_recurring THEN true ELSE false END,
             v_default_method, 'BRL', v_default_amount,
             CASE WHEN v_recurring THEN 'monthly' ELSE 'one_off' END,
             CASE WHEN v_recurring THEN v_default_day ELSE NULL END,
             r.created_by, NULL
        FROM _rel r ORDER BY r.due_date ASC LIMIT 1
      RETURNING id INTO v_item_id;
    END IF;

    INSERT INTO public.finance_occurrences
      (tenant_id, item_id, competence_month, due_date, amount_brl, currency,
       paid_at, paid_amount_brl, attachment_url, attachment_name, observations,
       legacy_bill_id, created_by, created_at)
    SELECT v_tenant, v_item_id, date_trunc('month', r.due_date)::date, r.due_date,
           r.amount, 'BRL', r.paid_at,
           CASE WHEN r.paid_at IS NOT NULL THEN r.amount ELSE NULL END,
           r.attachment_url, r.attachment_name, r.observations,
           r.id, r.created_by, r.created_at
      FROM _rel r
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 6.3 catálogo de ferramentas/assinaturas ativas de referência
  INSERT INTO public.finance_items
    (tenant_id, kind, name, category, cost_center, currency, default_amount_original,
     default_exchange_rate, default_amount_brl, recurrence_type, charge_day, due_day,
     payment_method, card_item_id, purpose)
  VALUES
    (v_tenant,'tool','Google Drive','Ferramenta','midia','BRL',14.99,NULL,14.99,'monthly',1,NULL,'Cartão de Crédito',v_card_itau,'Armazenamento e arquivos'),
    (v_tenant,'tool','Canva','Ferramenta','midia','BRL',34.90,NULL,34.90,'monthly',NULL,NULL,'Cartão de Crédito',v_card_9584,'Design'),
    (v_tenant,'tool','CapCut','Ferramenta','midia','BRL',32.90,NULL,32.90,'monthly',13,NULL,'Cartão de Crédito',v_card_9584,'Edição de vídeo'),
    (v_tenant,'package','ConteúdosFlix','Pacote','midia','BRL',54.90,NULL,54.90,'monthly',NULL,NULL,NULL,NULL,'Pacote de ferramentas de conteúdo'),
    (v_tenant,'package','Designer Flix','Pacote','midia','BRL',NULL,NULL,NULL,'variable',NULL,NULL,NULL,NULL,'Pacote de ferramentas de design'),
    (v_tenant,'tool','ChatGPT Subscription','IA','compartilhado','USD',70.00,5.13,359.10,'monthly',24,NULL,'Cartão de Crédito',v_card_itau,'Assinatura de IA (uso Mídia/LEAL)'),
    (v_tenant,'tool','API GPT','IA','sistemas','USD',80.00,5.13,410.40,'credits',NULL,NULL,'Cartão de Crédito',v_card_itau,'Créditos de API'),
    (v_tenant,'tool','Adobe Creative Cloud','IA','midia','BRL',189.00,NULL,189.00,'monthly',NULL,14,NULL,NULL,'Suíte de criação'),
    (v_tenant,'tool','Supabase','IA','sistemas','USD',66.50,5.13,341.15,'monthly',15,NULL,'Cartão de Crédito',v_card_itau,'Infraestrutura de banco'),
    (v_tenant,'tool','AVISA-API','IA','sistemas','BRL',69.00,NULL,69.00,'variable',20,NULL,'Cartão de Crédito',v_card_itau,'API de mensageria'),
    (v_tenant,'tool','ElevenLabs','IA','midia','USD',5.00,5.13,25.65,'monthly',6,NULL,'Cartão de Crédito',v_card_9584,'Voz sintética'),
    (v_tenant,'tool','Google Cloud (Créditos API)','IA','sistemas','BRL',439.77,NULL,439.77,'credits',1,NULL,'Cartão de Crédito',v_card_itau,'Créditos de API'),
    (v_tenant,'tool','Lovable','IA','sistemas','USD',705.00,5.13,3616.65,'monthly',23,NULL,'Cartão de Crédito',v_card_itau,'Plataforma de desenvolvimento')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_pkg_conteudos FROM public.finance_items
   WHERE tenant_id = v_tenant AND kind='package' AND lower(btrim(name))='conteúdosflix' LIMIT 1;
  SELECT id INTO v_pkg_designer FROM public.finance_items
   WHERE tenant_id = v_tenant AND kind='package' AND lower(btrim(name))='designer flix' LIMIT 1;

  FOREACH v_res IN ARRAY ARRAY['Freepik','Leonardo AI','Midjourney','Motion Array','Flaticon','Envato','PNGTree','Unsplash','Pika','Vecteezy','Canva','Eleven Labs']
  LOOP
    INSERT INTO public.finance_items (tenant_id, kind, name, category, cost_center, parent_item_id, recurrence_type)
    VALUES (v_tenant,'included_resource',v_res,'Recurso incluído','midia',v_pkg_designer,'variable')
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH v_res IN ARRAY ARRAY['Runway','Gamma AI','Envato','ChatGPT','Suno AI','Midjourney','CapCut Pro','Leonardo AI','Freepik','Canva Pro','Voicefy','Veed.io']
  LOOP
    INSERT INTO public.finance_items (tenant_id, kind, name, category, cost_center, parent_item_id, recurrence_type)
    VALUES (v_tenant,'included_resource',v_res,'Recurso incluído','midia',v_pkg_conteudos,'variable')
    ON CONFLICT DO NOTHING;
  END LOOP;

END LOOP;

-- 6.4 validação: todo registro histórico relevante foi migrado
SELECT count(*) INTO v_expected FROM public.bills_payable bp
 WHERE NOT (
   bp.due_date > CURRENT_DATE AND bp.paid_at IS NULL AND bp.amount IS NULL
   AND bp.attachment_url IS NULL AND COALESCE(btrim(bp.observations),'') = ''
 );

SELECT count(*) INTO v_migrated FROM public.finance_occurrences WHERE legacy_bill_id IS NOT NULL;

IF v_migrated <> v_expected THEN
  RAISE EXCEPTION 'Migração incompleta: esperados % registros históricos, migrados %', v_expected, v_migrated;
END IF;
END
$migrate$;

-- =====================================================================
-- 7. tool_expenses (vazia) deixa de existir
-- =====================================================================
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.tool_expenses;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'tool_expenses não está vazia (% linhas); abortando remoção', v_rows;
  END IF;
  DROP TABLE public.tool_expenses;
END $$;