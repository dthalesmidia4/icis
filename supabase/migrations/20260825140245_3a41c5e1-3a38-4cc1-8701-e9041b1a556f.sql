-- ============================ A. PRE-FLIGHT ============================
DO $$
DECLARE v_key text; v_n bigint;
BEGIN
  v_key := private.finance_data_key();
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'PREFLIGHT: chave icis_finance_data_key_v1 indisponível';
  END IF;

  SELECT count(*) INTO v_n FROM public.finance_items
  WHERE (default_amount_original IS NOT NULL AND default_amount_original_enc IS NULL)
     OR (default_exchange_rate  IS NOT NULL AND default_exchange_rate_enc  IS NULL)
     OR (default_amount_brl     IS NOT NULL AND default_amount_brl_enc     IS NULL)
     OR (card_limit_brl         IS NOT NULL AND card_limit_brl_enc         IS NULL);
  IF v_n > 0 THEN RAISE EXCEPTION 'PREFLIGHT: % itens sem cipher', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.finance_items
  WHERE (default_amount_original IS NOT NULL AND private.finance_decrypt_numeric(default_amount_original_enc) IS DISTINCT FROM default_amount_original)
     OR (default_exchange_rate  IS NOT NULL AND private.finance_decrypt_numeric(default_exchange_rate_enc)  IS DISTINCT FROM default_exchange_rate)
     OR (default_amount_brl     IS NOT NULL AND private.finance_decrypt_numeric(default_amount_brl_enc)     IS DISTINCT FROM default_amount_brl)
     OR (card_limit_brl         IS NOT NULL AND private.finance_decrypt_numeric(card_limit_brl_enc)         IS DISTINCT FROM card_limit_brl);
  IF v_n > 0 THEN RAISE EXCEPTION 'PREFLIGHT: % itens divergentes', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.finance_occurrences
  WHERE (amount_original  IS NOT NULL AND amount_original_enc  IS NULL)
     OR (exchange_rate    IS NOT NULL AND exchange_rate_enc    IS NULL)
     OR (amount_brl       IS NOT NULL AND amount_brl_enc       IS NULL)
     OR (paid_amount_brl  IS NOT NULL AND paid_amount_brl_enc  IS NULL);
  IF v_n > 0 THEN RAISE EXCEPTION 'PREFLIGHT: % ocorrências sem cipher', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.finance_occurrences
  WHERE (amount_original IS NOT NULL AND private.finance_decrypt_numeric(amount_original_enc) IS DISTINCT FROM amount_original)
     OR (exchange_rate   IS NOT NULL AND private.finance_decrypt_numeric(exchange_rate_enc)   IS DISTINCT FROM exchange_rate)
     OR (amount_brl      IS NOT NULL AND private.finance_decrypt_numeric(amount_brl_enc)      IS DISTINCT FROM amount_brl)
     OR (paid_amount_brl IS NOT NULL AND private.finance_decrypt_numeric(paid_amount_brl_enc) IS DISTINCT FROM paid_amount_brl);
  IF v_n > 0 THEN RAISE EXCEPTION 'PREFLIGHT: % ocorrências divergentes', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.tenants
  WHERE (finance_monthly_budget_brl IS NOT NULL AND (finance_monthly_budget_brl_enc IS NULL OR private.finance_decrypt_numeric(finance_monthly_budget_brl_enc) IS DISTINCT FROM finance_monthly_budget_brl))
     OR (finance_default_usd_rate   IS NOT NULL AND (finance_default_usd_rate_enc   IS NULL OR private.finance_decrypt_numeric(finance_default_usd_rate_enc)   IS DISTINCT FROM finance_default_usd_rate));
  IF v_n > 0 THEN RAISE EXCEPTION 'PREFLIGHT: % tenants divergentes', v_n; END IF;
END $$;

-- ================== B. TRIGGERS CUTOVER (encrypt then null) ==================

-- INSERT: cifra e zera plaintext
CREATE OR REPLACE FUNCTION public.finance_items_enc_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  NEW.default_amount_original_enc := private.finance_encrypt_numeric(NEW.default_amount_original);
  NEW.default_exchange_rate_enc   := private.finance_encrypt_numeric(NEW.default_exchange_rate);
  NEW.default_amount_brl_enc      := private.finance_encrypt_numeric(NEW.default_amount_brl);
  NEW.card_limit_brl_enc          := private.finance_encrypt_numeric(NEW.card_limit_brl);
  NEW.default_amount_original := NULL;
  NEW.default_exchange_rate   := NULL;
  NEW.default_amount_brl      := NULL;
  NEW.card_limit_brl          := NULL;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.finance_occurrences_enc_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  NEW.amount_original_enc  := private.finance_encrypt_numeric(NEW.amount_original);
  NEW.exchange_rate_enc    := private.finance_encrypt_numeric(NEW.exchange_rate);
  NEW.amount_brl_enc       := private.finance_encrypt_numeric(NEW.amount_brl);
  NEW.paid_amount_brl_enc  := private.finance_encrypt_numeric(NEW.paid_amount_brl);
  NEW.amount_original := NULL;
  NEW.exchange_rate   := NULL;
  NEW.amount_brl      := NULL;
  NEW.paid_amount_brl := NULL;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tenants_enc_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  NEW.finance_monthly_budget_brl_enc := private.finance_encrypt_numeric(NEW.finance_monthly_budget_brl);
  NEW.finance_default_usd_rate_enc   := private.finance_encrypt_numeric(NEW.finance_default_usd_rate);
  NEW.finance_monthly_budget_brl := NULL;
  NEW.finance_default_usd_rate   := NULL;
  RETURN NEW;
END $$;

-- UPDATE OF <coluna>: só roda quando a coluna participa do UPDATE
CREATE OR REPLACE FUNCTION public.finance_items_enc_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE f text := TG_ARGV[0];
BEGIN
  IF f = 'default_amount_original' THEN
    NEW.default_amount_original_enc := private.finance_encrypt_numeric(NEW.default_amount_original);
    NEW.default_amount_original := NULL;
  ELSIF f = 'default_exchange_rate' THEN
    NEW.default_exchange_rate_enc := private.finance_encrypt_numeric(NEW.default_exchange_rate);
    NEW.default_exchange_rate := NULL;
  ELSIF f = 'default_amount_brl' THEN
    NEW.default_amount_brl_enc := private.finance_encrypt_numeric(NEW.default_amount_brl);
    NEW.default_amount_brl := NULL;
  ELSIF f = 'card_limit_brl' THEN
    NEW.card_limit_brl_enc := private.finance_encrypt_numeric(NEW.card_limit_brl);
    NEW.card_limit_brl := NULL;
  ELSE
    RAISE EXCEPTION 'Campo financeiro desconhecido: %', f;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.finance_occurrences_enc_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
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
  ELSE
    RAISE EXCEPTION 'Campo financeiro desconhecido: %', f;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tenants_enc_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE f text := TG_ARGV[0];
BEGIN
  IF f = 'finance_monthly_budget_brl' THEN
    NEW.finance_monthly_budget_brl_enc := private.finance_encrypt_numeric(NEW.finance_monthly_budget_brl);
    NEW.finance_monthly_budget_brl := NULL;
  ELSIF f = 'finance_default_usd_rate' THEN
    NEW.finance_default_usd_rate_enc := private.finance_encrypt_numeric(NEW.finance_default_usd_rate);
    NEW.finance_default_usd_rate := NULL;
  ELSE
    RAISE EXCEPTION 'Campo financeiro desconhecido: %', f;
  END IF;
  RETURN NEW;
END $$;

-- C. Guard de tenants (nome garante execução antes dos triggers de cifra)
CREATE OR REPLACE FUNCTION public.guard_tenant_finance_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF (NEW.finance_monthly_budget_brl     IS DISTINCT FROM OLD.finance_monthly_budget_brl)
     OR (NEW.finance_default_usd_rate    IS DISTINCT FROM OLD.finance_default_usd_rate)
     OR (NEW.finance_monthly_budget_brl_enc IS DISTINCT FROM OLD.finance_monthly_budget_brl_enc)
     OR (NEW.finance_default_usd_rate_enc   IS DISTINCT FROM OLD.finance_default_usd_rate_enc) THEN
    IF NOT public.has_finance_access(OLD.id) THEN
      RAISE EXCEPTION 'Sem permissão para alterar configurações financeiras da empresa';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Remove triggers/funções sync da Fase 1
DROP TRIGGER IF EXISTS finance_items_sync_enc ON public.finance_items;
DROP TRIGGER IF EXISTS finance_occurrences_sync_enc ON public.finance_occurrences;
DROP TRIGGER IF EXISTS tenants_sync_finance_enc ON public.tenants;
DROP FUNCTION IF EXISTS public.finance_items_sync_enc();
DROP FUNCTION IF EXISTS public.finance_occurrences_sync_enc();
DROP FUNCTION IF EXISTS public.tenants_sync_finance_enc();

-- Novos triggers
DROP TRIGGER IF EXISTS a_finance_items_enc_insert ON public.finance_items;
CREATE TRIGGER a_finance_items_enc_insert BEFORE INSERT ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_items_enc_insert();

DROP TRIGGER IF EXISTS a_finance_items_enc_upd_amount_original ON public.finance_items;
CREATE TRIGGER a_finance_items_enc_upd_amount_original BEFORE UPDATE OF default_amount_original ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_items_enc_update('default_amount_original');
DROP TRIGGER IF EXISTS a_finance_items_enc_upd_exchange_rate ON public.finance_items;
CREATE TRIGGER a_finance_items_enc_upd_exchange_rate BEFORE UPDATE OF default_exchange_rate ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_items_enc_update('default_exchange_rate');
DROP TRIGGER IF EXISTS a_finance_items_enc_upd_amount_brl ON public.finance_items;
CREATE TRIGGER a_finance_items_enc_upd_amount_brl BEFORE UPDATE OF default_amount_brl ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_items_enc_update('default_amount_brl');
DROP TRIGGER IF EXISTS a_finance_items_enc_upd_card_limit ON public.finance_items;
CREATE TRIGGER a_finance_items_enc_upd_card_limit BEFORE UPDATE OF card_limit_brl ON public.finance_items
  FOR EACH ROW EXECUTE FUNCTION public.finance_items_enc_update('card_limit_brl');

DROP TRIGGER IF EXISTS a_finance_occ_enc_insert ON public.finance_occurrences;
CREATE TRIGGER a_finance_occ_enc_insert BEFORE INSERT ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_enc_insert();

DROP TRIGGER IF EXISTS a_finance_occ_enc_upd_amount_original ON public.finance_occurrences;
CREATE TRIGGER a_finance_occ_enc_upd_amount_original BEFORE UPDATE OF amount_original ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_enc_update('amount_original');
DROP TRIGGER IF EXISTS a_finance_occ_enc_upd_exchange_rate ON public.finance_occurrences;
CREATE TRIGGER a_finance_occ_enc_upd_exchange_rate BEFORE UPDATE OF exchange_rate ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_enc_update('exchange_rate');
DROP TRIGGER IF EXISTS a_finance_occ_enc_upd_amount_brl ON public.finance_occurrences;
CREATE TRIGGER a_finance_occ_enc_upd_amount_brl BEFORE UPDATE OF amount_brl ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_enc_update('amount_brl');
DROP TRIGGER IF EXISTS a_finance_occ_enc_upd_paid_amount ON public.finance_occurrences;
CREATE TRIGGER a_finance_occ_enc_upd_paid_amount BEFORE UPDATE OF paid_amount_brl ON public.finance_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_enc_update('paid_amount_brl');

DROP TRIGGER IF EXISTS a_guard_tenant_finance_fields ON public.tenants;
CREATE TRIGGER a_guard_tenant_finance_fields BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_finance_fields();

DROP TRIGGER IF EXISTS b_tenants_enc_insert ON public.tenants;
CREATE TRIGGER b_tenants_enc_insert BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_enc_insert();
DROP TRIGGER IF EXISTS b_tenants_enc_upd_budget ON public.tenants;
CREATE TRIGGER b_tenants_enc_upd_budget BEFORE UPDATE OF finance_monthly_budget_brl ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_enc_update('finance_monthly_budget_brl');
DROP TRIGGER IF EXISTS b_tenants_enc_upd_rate ON public.tenants;
CREATE TRIGGER b_tenants_enc_upd_rate BEFORE UPDATE OF finance_default_usd_rate ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_enc_update('finance_default_usd_rate');

-- ===================== H. CUTOVER DOS DADOS (preserva _enc) =====================
ALTER TABLE public.finance_items DISABLE TRIGGER USER;
ALTER TABLE public.finance_occurrences DISABLE TRIGGER USER;
ALTER TABLE public.tenants DISABLE TRIGGER USER;

UPDATE public.finance_items
   SET default_amount_original = NULL,
       default_exchange_rate   = NULL,
       default_amount_brl      = NULL,
       card_limit_brl          = NULL
 WHERE default_amount_original IS NOT NULL
    OR default_exchange_rate   IS NOT NULL
    OR default_amount_brl      IS NOT NULL
    OR card_limit_brl          IS NOT NULL;

UPDATE public.finance_occurrences
   SET amount_original = NULL,
       exchange_rate   = NULL,
       amount_brl      = NULL,
       paid_amount_brl = NULL
 WHERE amount_original IS NOT NULL
    OR exchange_rate   IS NOT NULL
    OR amount_brl      IS NOT NULL
    OR paid_amount_brl IS NOT NULL;

UPDATE public.tenants
   SET finance_monthly_budget_brl = NULL,
       finance_default_usd_rate   = NULL
 WHERE finance_monthly_budget_brl IS NOT NULL
    OR finance_default_usd_rate   IS NOT NULL;

ALTER TABLE public.finance_items ENABLE TRIGGER USER;
ALTER TABLE public.finance_occurrences ENABLE TRIGGER USER;
ALTER TABLE public.tenants ENABLE TRIGGER USER;

DO $$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.finance_items
   WHERE default_amount_original IS NOT NULL OR default_exchange_rate IS NOT NULL
      OR default_amount_brl IS NOT NULL OR card_limit_brl IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'CUTOVER: % itens ainda com plaintext', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.finance_occurrences
   WHERE amount_original IS NOT NULL OR exchange_rate IS NOT NULL
      OR amount_brl IS NOT NULL OR paid_amount_brl IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'CUTOVER: % ocorrências ainda com plaintext', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.tenants
   WHERE finance_monthly_budget_brl IS NOT NULL OR finance_default_usd_rate IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'CUTOVER: % tenants ainda com plaintext', v_n; END IF;
END $$;

-- ===================== D. RPCs sem fallback plaintext =====================
CREATE OR REPLACE FUNCTION public.finance_read_item_values(_tenant_id uuid)
RETURNS TABLE(id uuid, default_amount_original numeric, default_exchange_rate numeric, default_amount_brl numeric, card_limit_brl numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_scope text;
BEGIN
  v_scope := public.finance_access_scope(_tenant_id);
  IF v_scope = 'none' THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  RETURN QUERY
  SELECT fi.id,
         private.finance_decrypt_numeric(fi.default_amount_original_enc),
         private.finance_decrypt_numeric(fi.default_exchange_rate_enc),
         private.finance_decrypt_numeric(fi.default_amount_brl_enc),
         CASE WHEN v_scope = 'full'
           THEN private.finance_decrypt_numeric(fi.card_limit_brl_enc)
           ELSE NULL END
  FROM public.finance_items fi
  WHERE fi.tenant_id = _tenant_id
    AND (
      v_scope = 'full'
      OR (fi.kind IN ('tool', 'package', 'included_resource') AND fi.cost_center <> 'administrativo')
    );
END $$;

CREATE OR REPLACE FUNCTION public.finance_read_occurrence_values(_tenant_id uuid, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date)
RETURNS TABLE(id uuid, amount_original numeric, exchange_rate numeric, amount_brl numeric, paid_amount_brl numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
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
         private.finance_decrypt_numeric(fo.paid_amount_brl_enc)
  FROM public.finance_occurrences fo
  WHERE fo.tenant_id = _tenant_id
    AND (_from IS NULL OR fo.competence_month >= _from)
    AND (_to IS NULL OR fo.competence_month <= _to)
    AND (
      v_scope = 'full'
      OR public.finance_tools_item_allowed(_tenant_id, fo.item_id)
    );
END $$;

CREATE OR REPLACE FUNCTION public.finance_read_tenant_values(_tenant_id uuid)
RETURNS TABLE(finance_monthly_budget_brl numeric, finance_default_usd_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NOT public.has_finance_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para as configurações do Financeiro';
  END IF;

  RETURN QUERY
  SELECT private.finance_decrypt_numeric(t.finance_monthly_budget_brl_enc),
         private.finance_decrypt_numeric(t.finance_default_usd_rate_enc)
  FROM public.tenants t
  WHERE t.id = _tenant_id;
END $$;

-- ===================== E. Funções existentes =====================
CREATE OR REPLACE FUNCTION public.pay_finance_statement(_occurrence_id uuid, _paid_at timestamp with time zone DEFAULT now(), _paid_amount_brl numeric DEFAULT NULL::numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_occ public.finance_occurrences;
  v_kind text;
  v_components integer := 0;
  v_statement_amount numeric;
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

  v_statement_amount := COALESCE(
    _paid_amount_brl,
    private.finance_decrypt_numeric(v_occ.amount_brl_enc)
  );

  UPDATE public.finance_occurrences
     SET paid_at = COALESCE(_paid_at, now()),
         paid_amount_brl = v_statement_amount,
         updated_at = now()
   WHERE id = _occurrence_id;

  UPDATE public.finance_occurrences fo
     SET paid_at = COALESCE(_paid_at, now()),
         paid_amount_brl = COALESCE(
           private.finance_decrypt_numeric(fo.paid_amount_brl_enc),
           private.finance_decrypt_numeric(fo.amount_brl_enc)
         ),
         statement_occurrence_id = COALESCE(fo.statement_occurrence_id, _occurrence_id),
         updated_at = now()
   WHERE fo.tenant_id = v_occ.tenant_id
     AND fo.paid_at IS NULL
     AND (
       fo.statement_occurrence_id = _occurrence_id
       OR (
         fo.card_item_id_snapshot = v_occ.item_id
         AND fo.statement_competence_snapshot = v_occ.competence_month
       )
     );
  GET DIAGNOSTICS v_components = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'statement_id', _occurrence_id, 'components_settled', v_components);
END $$;

-- ===================== I. Health check pós-cutover =====================
CREATE OR REPLACE FUNCTION public.finance_encryption_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_result jsonb; v_probe numeric;
BEGIN
  -- valida integridade dos ciphers sem devolver valores
  SELECT count(*) INTO v_probe FROM (
    SELECT private.finance_decrypt_numeric(default_amount_original_enc),
           private.finance_decrypt_numeric(default_exchange_rate_enc),
           private.finance_decrypt_numeric(default_amount_brl_enc),
           private.finance_decrypt_numeric(card_limit_brl_enc)
    FROM public.finance_items
  ) s;
  SELECT count(*) INTO v_probe FROM (
    SELECT private.finance_decrypt_numeric(amount_original_enc),
           private.finance_decrypt_numeric(exchange_rate_enc),
           private.finance_decrypt_numeric(amount_brl_enc),
           private.finance_decrypt_numeric(paid_amount_brl_enc)
    FROM public.finance_occurrences
  ) s;
  SELECT count(*) INTO v_probe FROM (
    SELECT private.finance_decrypt_numeric(finance_monthly_budget_brl_enc),
           private.finance_decrypt_numeric(finance_default_usd_rate_enc)
    FROM public.tenants
  ) s;

  SELECT jsonb_build_object(
    'items_total', (SELECT count(*) FROM public.finance_items),
    'items_plaintext_rows', (SELECT count(*) FROM public.finance_items
       WHERE default_amount_original IS NOT NULL OR default_exchange_rate IS NOT NULL
          OR default_amount_brl IS NOT NULL OR card_limit_brl IS NOT NULL),
    'items_cipher_default_amount_brl', (SELECT count(*) FROM public.finance_items WHERE default_amount_brl_enc IS NOT NULL),
    'items_cipher_default_amount_original', (SELECT count(*) FROM public.finance_items WHERE default_amount_original_enc IS NOT NULL),
    'items_cipher_default_exchange_rate', (SELECT count(*) FROM public.finance_items WHERE default_exchange_rate_enc IS NOT NULL),
    'items_cipher_card_limit', (SELECT count(*) FROM public.finance_items WHERE card_limit_brl_enc IS NOT NULL),
    'occurrences_total', (SELECT count(*) FROM public.finance_occurrences),
    'occurrences_plaintext_rows', (SELECT count(*) FROM public.finance_occurrences
       WHERE amount_original IS NOT NULL OR exchange_rate IS NOT NULL
          OR amount_brl IS NOT NULL OR paid_amount_brl IS NOT NULL),
    'occurrences_cipher_amount_brl', (SELECT count(*) FROM public.finance_occurrences WHERE amount_brl_enc IS NOT NULL),
    'occurrences_cipher_amount_original', (SELECT count(*) FROM public.finance_occurrences WHERE amount_original_enc IS NOT NULL),
    'occurrences_cipher_exchange_rate', (SELECT count(*) FROM public.finance_occurrences WHERE exchange_rate_enc IS NOT NULL),
    'occurrences_cipher_paid_amount', (SELECT count(*) FROM public.finance_occurrences WHERE paid_amount_brl_enc IS NOT NULL),
    'tenants_plaintext_rows', (SELECT count(*) FROM public.tenants
       WHERE finance_monthly_budget_brl IS NOT NULL OR finance_default_usd_rate IS NOT NULL),
    'tenants_cipher_budget', (SELECT count(*) FROM public.tenants WHERE finance_monthly_budget_brl_enc IS NOT NULL),
    'tenants_cipher_rate', (SELECT count(*) FROM public.tenants WHERE finance_default_usd_rate_enc IS NOT NULL)
  ) INTO v_result;
  RETURN v_result;
END $$;

-- ===================== G. Hardening =====================
REVOKE ALL ON FUNCTION public.finance_encryption_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_encryption_health() FROM anon;
REVOKE ALL ON FUNCTION public.finance_encryption_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finance_encryption_health() TO service_role;

REVOKE ALL ON public.finance_items FROM anon;
REVOKE ALL ON public.finance_occurrences FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_occurrences TO authenticated;
GRANT ALL ON public.finance_items TO service_role;
GRANT ALL ON public.finance_occurrences TO service_role;