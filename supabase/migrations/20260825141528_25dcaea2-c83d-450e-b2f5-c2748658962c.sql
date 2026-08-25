-- 1) Guards de integridade de ciphertext (idempotentes; equivalentes ao já aplicado)
CREATE OR REPLACE FUNCTION public.guard_finance_items_cipher_input()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Chamadas internas/service role/migrations não têm auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.default_amount_original_enc IS NOT NULL
       OR NEW.default_exchange_rate_enc IS NOT NULL
       OR NEW.default_amount_brl_enc IS NOT NULL
       OR NEW.card_limit_brl_enc IS NOT NULL THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  ELSE
    IF NEW.default_amount_original_enc IS DISTINCT FROM OLD.default_amount_original_enc
       OR NEW.default_exchange_rate_enc IS DISTINCT FROM OLD.default_exchange_rate_enc
       OR NEW.default_amount_brl_enc IS DISTINCT FROM OLD.default_amount_brl_enc
       OR NEW.card_limit_brl_enc IS DISTINCT FROM OLD.card_limit_brl_enc THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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
       OR NEW.paid_amount_brl_enc IS NOT NULL THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  ELSE
    IF NEW.amount_original_enc IS DISTINCT FROM OLD.amount_original_enc
       OR NEW.exchange_rate_enc IS DISTINCT FROM OLD.exchange_rate_enc
       OR NEW.amount_brl_enc IS DISTINCT FROM OLD.amount_brl_enc
       OR NEW.paid_amount_brl_enc IS DISTINCT FROM OLD.paid_amount_brl_enc THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_tenant_finance_cipher_input()
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
    IF NEW.finance_monthly_budget_brl_enc IS NOT NULL
       OR NEW.finance_default_usd_rate_enc IS NOT NULL THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  ELSE
    IF NEW.finance_monthly_budget_brl_enc IS DISTINCT FROM OLD.finance_monthly_budget_brl_enc
       OR NEW.finance_default_usd_rate_enc IS DISTINCT FROM OLD.finance_default_usd_rate_enc THEN
      RAISE EXCEPTION 'Colunas criptografadas são gerenciadas internamente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_finance_items_cipher_input() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_finance_occurrences_cipher_input() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tenant_finance_cipher_input() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "00_guard_finance_items_cipher_input" ON public.finance_items;
CREATE TRIGGER "00_guard_finance_items_cipher_input"
BEFORE INSERT OR UPDATE ON public.finance_items
FOR EACH ROW EXECUTE FUNCTION public.guard_finance_items_cipher_input();

DROP TRIGGER IF EXISTS "00_guard_finance_occ_cipher_input" ON public.finance_occurrences;
CREATE TRIGGER "00_guard_finance_occ_cipher_input"
BEFORE INSERT OR UPDATE ON public.finance_occurrences
FOR EACH ROW EXECUTE FUNCTION public.guard_finance_occurrences_cipher_input();

DROP TRIGGER IF EXISTS "00_guard_tenant_finance_cipher_input" ON public.tenants;
CREATE TRIGGER "00_guard_tenant_finance_cipher_input"
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_finance_cipher_input();

-- 2) Health check que realmente força o decrypt de cada cipher não nulo
CREATE OR REPLACE FUNCTION public.finance_encryption_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- count(expr) só conta linhas em que expr NÃO é nulo, logo cada decrypt é
  -- efetivamente avaliado; cipher corrompido levanta exception aqui.
  SELECT jsonb_build_object(
    'items_total', count(*),
    'items_plaintext_rows', count(*) FILTER (
      WHERE default_amount_original IS NOT NULL OR default_exchange_rate IS NOT NULL
         OR default_amount_brl IS NOT NULL OR card_limit_brl IS NOT NULL),
    'items_cipher_default_amount_brl', count(default_amount_brl_enc),
    'items_decryptable_default_amount_brl', count(private.finance_decrypt_numeric(default_amount_brl_enc)),
    'items_cipher_default_amount_original', count(default_amount_original_enc),
    'items_decryptable_default_amount_original', count(private.finance_decrypt_numeric(default_amount_original_enc)),
    'items_cipher_default_exchange_rate', count(default_exchange_rate_enc),
    'items_decryptable_default_exchange_rate', count(private.finance_decrypt_numeric(default_exchange_rate_enc)),
    'items_cipher_card_limit', count(card_limit_brl_enc),
    'items_decryptable_card_limit', count(private.finance_decrypt_numeric(card_limit_brl_enc))
  ) INTO v_result
  FROM public.finance_items;

  SELECT v_result || jsonb_build_object(
    'occurrences_total', count(*),
    'occurrences_plaintext_rows', count(*) FILTER (
      WHERE amount_original IS NOT NULL OR exchange_rate IS NOT NULL
         OR amount_brl IS NOT NULL OR paid_amount_brl IS NOT NULL),
    'occurrences_cipher_amount_brl', count(amount_brl_enc),
    'occurrences_decryptable_amount_brl', count(private.finance_decrypt_numeric(amount_brl_enc)),
    'occurrences_cipher_amount_original', count(amount_original_enc),
    'occurrences_decryptable_amount_original', count(private.finance_decrypt_numeric(amount_original_enc)),
    'occurrences_cipher_exchange_rate', count(exchange_rate_enc),
    'occurrences_decryptable_exchange_rate', count(private.finance_decrypt_numeric(exchange_rate_enc)),
    'occurrences_cipher_paid_amount', count(paid_amount_brl_enc),
    'occurrences_decryptable_paid_amount', count(private.finance_decrypt_numeric(paid_amount_brl_enc))
  ) INTO v_result
  FROM public.finance_occurrences;

  SELECT v_result || jsonb_build_object(
    'tenants_total', count(*),
    'tenants_plaintext_rows', count(*) FILTER (
      WHERE finance_monthly_budget_brl IS NOT NULL OR finance_default_usd_rate IS NOT NULL),
    'tenants_cipher_budget', count(finance_monthly_budget_brl_enc),
    'tenants_decryptable_budget', count(private.finance_decrypt_numeric(finance_monthly_budget_brl_enc)),
    'tenants_cipher_rate', count(finance_default_usd_rate_enc),
    'tenants_decryptable_rate', count(private.finance_decrypt_numeric(finance_default_usd_rate_enc))
  ) INTO v_result
  FROM public.tenants;

  RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.finance_encryption_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_encryption_health() TO service_role;