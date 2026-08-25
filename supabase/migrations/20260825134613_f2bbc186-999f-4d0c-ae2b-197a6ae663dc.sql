-- ============================================================
-- FASE 1: criptografia paralela dos dados financeiros
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Chave exclusiva no Vault (criada uma única vez, nunca retornada)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'icis_finance_data_key_v1') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'icis_finance_data_key_v1',
      'Chave AES-256 para valores financeiros do ICIS (Fase 1)'
    );
  END IF;
END $$;

-- Colunas cifradas
ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS default_amount_original_enc bytea,
  ADD COLUMN IF NOT EXISTS default_exchange_rate_enc bytea,
  ADD COLUMN IF NOT EXISTS default_amount_brl_enc bytea,
  ADD COLUMN IF NOT EXISTS card_limit_brl_enc bytea;

ALTER TABLE public.finance_occurrences
  ADD COLUMN IF NOT EXISTS amount_original_enc bytea,
  ADD COLUMN IF NOT EXISTS exchange_rate_enc bytea,
  ADD COLUMN IF NOT EXISTS amount_brl_enc bytea,
  ADD COLUMN IF NOT EXISTS paid_amount_brl_enc bytea;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS finance_monthly_budget_brl_enc bytea,
  ADD COLUMN IF NOT EXISTS finance_default_usd_rate_enc bytea;

-- ------------------------------------------------------------
-- Helpers privados
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.finance_data_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ds.decrypted_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'icis_finance_data_key_v1'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.finance_encrypt_numeric(_value numeric)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_key text;
BEGIN
  IF _value IS NULL THEN RETURN NULL; END IF;
  v_key := private.finance_data_key();
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de dados financeiros indisponível';
  END IF;
  RETURN extensions.pgp_sym_encrypt(_value::text, v_key, 'cipher-algo=aes256');
END;
$$;

CREATE OR REPLACE FUNCTION private.finance_decrypt_numeric(_cipher bytea)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_key text;
BEGIN
  IF _cipher IS NULL THEN RETURN NULL; END IF;
  v_key := private.finance_data_key();
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de dados financeiros indisponível';
  END IF;
  RETURN extensions.pgp_sym_decrypt(_cipher, v_key)::numeric;
END;
$$;

REVOKE ALL ON FUNCTION private.finance_data_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.finance_encrypt_numeric(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.finance_decrypt_numeric(bytea) FROM PUBLIC;

-- ------------------------------------------------------------
-- Dual-write: recifra apenas o campo cujo plaintext mudou
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_items_sync_enc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.default_amount_original IS DISTINCT FROM OLD.default_amount_original THEN
    NEW.default_amount_original_enc := private.finance_encrypt_numeric(NEW.default_amount_original);
  ELSE
    NEW.default_amount_original_enc := OLD.default_amount_original_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.default_exchange_rate IS DISTINCT FROM OLD.default_exchange_rate THEN
    NEW.default_exchange_rate_enc := private.finance_encrypt_numeric(NEW.default_exchange_rate);
  ELSE
    NEW.default_exchange_rate_enc := OLD.default_exchange_rate_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.default_amount_brl IS DISTINCT FROM OLD.default_amount_brl THEN
    NEW.default_amount_brl_enc := private.finance_encrypt_numeric(NEW.default_amount_brl);
  ELSE
    NEW.default_amount_brl_enc := OLD.default_amount_brl_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.card_limit_brl IS DISTINCT FROM OLD.card_limit_brl THEN
    NEW.card_limit_brl_enc := private.finance_encrypt_numeric(NEW.card_limit_brl);
  ELSE
    NEW.card_limit_brl_enc := OLD.card_limit_brl_enc;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_items_sync_enc ON public.finance_items;
CREATE TRIGGER finance_items_sync_enc
BEFORE INSERT OR UPDATE ON public.finance_items
FOR EACH ROW EXECUTE FUNCTION public.finance_items_sync_enc();

CREATE OR REPLACE FUNCTION public.finance_occurrences_sync_enc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.amount_original IS DISTINCT FROM OLD.amount_original THEN
    NEW.amount_original_enc := private.finance_encrypt_numeric(NEW.amount_original);
  ELSE
    NEW.amount_original_enc := OLD.amount_original_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate THEN
    NEW.exchange_rate_enc := private.finance_encrypt_numeric(NEW.exchange_rate);
  ELSE
    NEW.exchange_rate_enc := OLD.exchange_rate_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.amount_brl IS DISTINCT FROM OLD.amount_brl THEN
    NEW.amount_brl_enc := private.finance_encrypt_numeric(NEW.amount_brl);
  ELSE
    NEW.amount_brl_enc := OLD.amount_brl_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.paid_amount_brl IS DISTINCT FROM OLD.paid_amount_brl THEN
    NEW.paid_amount_brl_enc := private.finance_encrypt_numeric(NEW.paid_amount_brl);
  ELSE
    NEW.paid_amount_brl_enc := OLD.paid_amount_brl_enc;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_occurrences_sync_enc ON public.finance_occurrences;
CREATE TRIGGER finance_occurrences_sync_enc
BEFORE INSERT OR UPDATE ON public.finance_occurrences
FOR EACH ROW EXECUTE FUNCTION public.finance_occurrences_sync_enc();

CREATE OR REPLACE FUNCTION public.tenants_sync_finance_enc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.finance_monthly_budget_brl IS DISTINCT FROM OLD.finance_monthly_budget_brl THEN
    NEW.finance_monthly_budget_brl_enc := private.finance_encrypt_numeric(NEW.finance_monthly_budget_brl);
  ELSE
    NEW.finance_monthly_budget_brl_enc := OLD.finance_monthly_budget_brl_enc;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.finance_default_usd_rate IS DISTINCT FROM OLD.finance_default_usd_rate THEN
    NEW.finance_default_usd_rate_enc := private.finance_encrypt_numeric(NEW.finance_default_usd_rate);
  ELSE
    NEW.finance_default_usd_rate_enc := OLD.finance_default_usd_rate_enc;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_sync_finance_enc ON public.tenants;
CREATE TRIGGER tenants_sync_finance_enc
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenants_sync_finance_enc();

-- ------------------------------------------------------------
-- Backfill (não altera plaintext)
-- ------------------------------------------------------------
UPDATE public.finance_items SET
  default_amount_original_enc = CASE WHEN default_amount_original IS NOT NULL AND default_amount_original_enc IS NULL
    THEN private.finance_encrypt_numeric(default_amount_original) ELSE default_amount_original_enc END,
  default_exchange_rate_enc = CASE WHEN default_exchange_rate IS NOT NULL AND default_exchange_rate_enc IS NULL
    THEN private.finance_encrypt_numeric(default_exchange_rate) ELSE default_exchange_rate_enc END,
  default_amount_brl_enc = CASE WHEN default_amount_brl IS NOT NULL AND default_amount_brl_enc IS NULL
    THEN private.finance_encrypt_numeric(default_amount_brl) ELSE default_amount_brl_enc END,
  card_limit_brl_enc = CASE WHEN card_limit_brl IS NOT NULL AND card_limit_brl_enc IS NULL
    THEN private.finance_encrypt_numeric(card_limit_brl) ELSE card_limit_brl_enc END
WHERE (default_amount_original IS NOT NULL AND default_amount_original_enc IS NULL)
   OR (default_exchange_rate IS NOT NULL AND default_exchange_rate_enc IS NULL)
   OR (default_amount_brl IS NOT NULL AND default_amount_brl_enc IS NULL)
   OR (card_limit_brl IS NOT NULL AND card_limit_brl_enc IS NULL);

UPDATE public.finance_occurrences SET
  amount_original_enc = CASE WHEN amount_original IS NOT NULL AND amount_original_enc IS NULL
    THEN private.finance_encrypt_numeric(amount_original) ELSE amount_original_enc END,
  exchange_rate_enc = CASE WHEN exchange_rate IS NOT NULL AND exchange_rate_enc IS NULL
    THEN private.finance_encrypt_numeric(exchange_rate) ELSE exchange_rate_enc END,
  amount_brl_enc = CASE WHEN amount_brl IS NOT NULL AND amount_brl_enc IS NULL
    THEN private.finance_encrypt_numeric(amount_brl) ELSE amount_brl_enc END,
  paid_amount_brl_enc = CASE WHEN paid_amount_brl IS NOT NULL AND paid_amount_brl_enc IS NULL
    THEN private.finance_encrypt_numeric(paid_amount_brl) ELSE paid_amount_brl_enc END
WHERE (amount_original IS NOT NULL AND amount_original_enc IS NULL)
   OR (exchange_rate IS NOT NULL AND exchange_rate_enc IS NULL)
   OR (amount_brl IS NOT NULL AND amount_brl_enc IS NULL)
   OR (paid_amount_brl IS NOT NULL AND paid_amount_brl_enc IS NULL);

UPDATE public.tenants SET
  finance_monthly_budget_brl_enc = CASE WHEN finance_monthly_budget_brl IS NOT NULL AND finance_monthly_budget_brl_enc IS NULL
    THEN private.finance_encrypt_numeric(finance_monthly_budget_brl) ELSE finance_monthly_budget_brl_enc END,
  finance_default_usd_rate_enc = CASE WHEN finance_default_usd_rate IS NOT NULL AND finance_default_usd_rate_enc IS NULL
    THEN private.finance_encrypt_numeric(finance_default_usd_rate) ELSE finance_default_usd_rate_enc END
WHERE (finance_monthly_budget_brl IS NOT NULL AND finance_monthly_budget_brl_enc IS NULL)
   OR (finance_default_usd_rate IS NOT NULL AND finance_default_usd_rate_enc IS NULL);

-- ------------------------------------------------------------
-- RPCs de leitura segura
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_read_item_values(_tenant_id uuid)
RETURNS TABLE(
  id uuid,
  default_amount_original numeric,
  default_exchange_rate numeric,
  default_amount_brl numeric,
  card_limit_brl numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_scope text;
BEGIN
  v_scope := public.finance_access_scope(_tenant_id);
  IF v_scope = 'none' THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  RETURN QUERY
  SELECT fi.id,
         COALESCE(private.finance_decrypt_numeric(fi.default_amount_original_enc), fi.default_amount_original),
         COALESCE(private.finance_decrypt_numeric(fi.default_exchange_rate_enc), fi.default_exchange_rate),
         COALESCE(private.finance_decrypt_numeric(fi.default_amount_brl_enc), fi.default_amount_brl),
         CASE WHEN v_scope = 'full'
           THEN COALESCE(private.finance_decrypt_numeric(fi.card_limit_brl_enc), fi.card_limit_brl)
           ELSE NULL END
  FROM public.finance_items fi
  WHERE fi.tenant_id = _tenant_id
    AND (
      v_scope = 'full'
      OR (fi.kind IN ('tool', 'package', 'included_resource') AND fi.cost_center <> 'administrativo')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_read_occurrence_values(
  _tenant_id uuid,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  amount_original numeric,
  exchange_rate numeric,
  amount_brl numeric,
  paid_amount_brl numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_scope text;
BEGIN
  v_scope := public.finance_access_scope(_tenant_id);
  IF v_scope = 'none' THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;

  RETURN QUERY
  SELECT fo.id,
         COALESCE(private.finance_decrypt_numeric(fo.amount_original_enc), fo.amount_original),
         COALESCE(private.finance_decrypt_numeric(fo.exchange_rate_enc), fo.exchange_rate),
         COALESCE(private.finance_decrypt_numeric(fo.amount_brl_enc), fo.amount_brl),
         COALESCE(private.finance_decrypt_numeric(fo.paid_amount_brl_enc), fo.paid_amount_brl)
  FROM public.finance_occurrences fo
  WHERE fo.tenant_id = _tenant_id
    AND (_from IS NULL OR fo.competence_month >= _from)
    AND (_to IS NULL OR fo.competence_month <= _to)
    AND (
      v_scope = 'full'
      OR public.finance_tools_item_allowed(_tenant_id, fo.item_id)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_read_tenant_values(_tenant_id uuid)
RETURNS TABLE(
  finance_monthly_budget_brl numeric,
  finance_default_usd_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_finance_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para as configurações do Financeiro';
  END IF;

  RETURN QUERY
  SELECT COALESCE(private.finance_decrypt_numeric(t.finance_monthly_budget_brl_enc), t.finance_monthly_budget_brl),
         COALESCE(private.finance_decrypt_numeric(t.finance_default_usd_rate_enc), t.finance_default_usd_rate)
  FROM public.tenants t
  WHERE t.id = _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_read_item_values(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_read_tenant_values(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_read_item_values(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_read_tenant_values(uuid) TO authenticated;

-- ------------------------------------------------------------
-- Funções existentes cutover-ready
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_finance_statement(
  _occurrence_id uuid,
  _paid_at timestamp with time zone DEFAULT now(),
  _paid_amount_brl numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    private.finance_decrypt_numeric(v_occ.amount_brl_enc),
    v_occ.amount_brl
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
           fo.paid_amount_brl,
           private.finance_decrypt_numeric(fo.amount_brl_enc),
           fo.amount_brl
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
END;
$$;

CREATE OR REPLACE FUNCTION public.set_finance_settings(
  _tenant_id uuid,
  _monthly_budget_brl numeric,
  _default_usd_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
   WHERE id = _tenant_id;

  RETURN jsonb_build_object(
    'monthly_budget_brl', _monthly_budget_brl,
    'default_usd_rate', _default_usd_rate
  );
END;
$$;