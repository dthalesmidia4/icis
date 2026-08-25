CREATE OR REPLACE FUNCTION public.finance_encryption_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'items_total', (SELECT count(*) FROM public.finance_items),
    'items_pending', (
      SELECT count(*) FROM public.finance_items
      WHERE (default_amount_original IS NOT NULL AND default_amount_original_enc IS NULL)
         OR (default_exchange_rate IS NOT NULL AND default_exchange_rate_enc IS NULL)
         OR (default_amount_brl IS NOT NULL AND default_amount_brl_enc IS NULL)
         OR (card_limit_brl IS NOT NULL AND card_limit_brl_enc IS NULL)
    ),
    'items_mismatch', (
      SELECT count(*) FROM public.finance_items
      WHERE private.finance_decrypt_numeric(default_amount_original_enc) IS DISTINCT FROM default_amount_original
         OR private.finance_decrypt_numeric(default_exchange_rate_enc) IS DISTINCT FROM default_exchange_rate
         OR private.finance_decrypt_numeric(default_amount_brl_enc) IS DISTINCT FROM default_amount_brl
         OR private.finance_decrypt_numeric(card_limit_brl_enc) IS DISTINCT FROM card_limit_brl
    ),
    'occurrences_total', (SELECT count(*) FROM public.finance_occurrences),
    'occurrences_pending', (
      SELECT count(*) FROM public.finance_occurrences
      WHERE (amount_original IS NOT NULL AND amount_original_enc IS NULL)
         OR (exchange_rate IS NOT NULL AND exchange_rate_enc IS NULL)
         OR (amount_brl IS NOT NULL AND amount_brl_enc IS NULL)
         OR (paid_amount_brl IS NOT NULL AND paid_amount_brl_enc IS NULL)
    ),
    'occurrences_mismatch', (
      SELECT count(*) FROM public.finance_occurrences
      WHERE private.finance_decrypt_numeric(amount_original_enc) IS DISTINCT FROM amount_original
         OR private.finance_decrypt_numeric(exchange_rate_enc) IS DISTINCT FROM exchange_rate
         OR private.finance_decrypt_numeric(amount_brl_enc) IS DISTINCT FROM amount_brl
         OR private.finance_decrypt_numeric(paid_amount_brl_enc) IS DISTINCT FROM paid_amount_brl
    ),
    'tenants_mismatch', (
      SELECT count(*) FROM public.tenants
      WHERE private.finance_decrypt_numeric(finance_monthly_budget_brl_enc) IS DISTINCT FROM finance_monthly_budget_brl
         OR private.finance_decrypt_numeric(finance_default_usd_rate_enc) IS DISTINCT FROM finance_default_usd_rate
    )
  );
$$;

REVOKE ALL ON FUNCTION public.finance_encryption_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_encryption_health() TO authenticated, service_role;