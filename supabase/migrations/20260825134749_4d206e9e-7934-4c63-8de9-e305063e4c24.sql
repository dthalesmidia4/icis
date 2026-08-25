-- Triggers com auto-cura: se o cipher está ausente mas há valor, cifra mesmo sem mudança de plaintext
CREATE OR REPLACE FUNCTION public.finance_items_sync_enc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.default_amount_original IS DISTINCT FROM OLD.default_amount_original
     OR (NEW.default_amount_original IS NOT NULL AND OLD.default_amount_original_enc IS NULL) THEN
    NEW.default_amount_original_enc := private.finance_encrypt_numeric(NEW.default_amount_original);
  ELSE
    NEW.default_amount_original_enc := OLD.default_amount_original_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.default_exchange_rate IS DISTINCT FROM OLD.default_exchange_rate
     OR (NEW.default_exchange_rate IS NOT NULL AND OLD.default_exchange_rate_enc IS NULL) THEN
    NEW.default_exchange_rate_enc := private.finance_encrypt_numeric(NEW.default_exchange_rate);
  ELSE
    NEW.default_exchange_rate_enc := OLD.default_exchange_rate_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.default_amount_brl IS DISTINCT FROM OLD.default_amount_brl
     OR (NEW.default_amount_brl IS NOT NULL AND OLD.default_amount_brl_enc IS NULL) THEN
    NEW.default_amount_brl_enc := private.finance_encrypt_numeric(NEW.default_amount_brl);
  ELSE
    NEW.default_amount_brl_enc := OLD.default_amount_brl_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.card_limit_brl IS DISTINCT FROM OLD.card_limit_brl
     OR (NEW.card_limit_brl IS NOT NULL AND OLD.card_limit_brl_enc IS NULL) THEN
    NEW.card_limit_brl_enc := private.finance_encrypt_numeric(NEW.card_limit_brl);
  ELSE
    NEW.card_limit_brl_enc := OLD.card_limit_brl_enc;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_occurrences_sync_enc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.amount_original IS DISTINCT FROM OLD.amount_original
     OR (NEW.amount_original IS NOT NULL AND OLD.amount_original_enc IS NULL) THEN
    NEW.amount_original_enc := private.finance_encrypt_numeric(NEW.amount_original);
  ELSE
    NEW.amount_original_enc := OLD.amount_original_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
     OR (NEW.exchange_rate IS NOT NULL AND OLD.exchange_rate_enc IS NULL) THEN
    NEW.exchange_rate_enc := private.finance_encrypt_numeric(NEW.exchange_rate);
  ELSE
    NEW.exchange_rate_enc := OLD.exchange_rate_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.amount_brl IS DISTINCT FROM OLD.amount_brl
     OR (NEW.amount_brl IS NOT NULL AND OLD.amount_brl_enc IS NULL) THEN
    NEW.amount_brl_enc := private.finance_encrypt_numeric(NEW.amount_brl);
  ELSE
    NEW.amount_brl_enc := OLD.amount_brl_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.paid_amount_brl IS DISTINCT FROM OLD.paid_amount_brl
     OR (NEW.paid_amount_brl IS NOT NULL AND OLD.paid_amount_brl_enc IS NULL) THEN
    NEW.paid_amount_brl_enc := private.finance_encrypt_numeric(NEW.paid_amount_brl);
  ELSE
    NEW.paid_amount_brl_enc := OLD.paid_amount_brl_enc;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenants_sync_finance_enc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.finance_monthly_budget_brl IS DISTINCT FROM OLD.finance_monthly_budget_brl
     OR (NEW.finance_monthly_budget_brl IS NOT NULL AND OLD.finance_monthly_budget_brl_enc IS NULL) THEN
    NEW.finance_monthly_budget_brl_enc := private.finance_encrypt_numeric(NEW.finance_monthly_budget_brl);
  ELSE
    NEW.finance_monthly_budget_brl_enc := OLD.finance_monthly_budget_brl_enc;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.finance_default_usd_rate IS DISTINCT FROM OLD.finance_default_usd_rate
     OR (NEW.finance_default_usd_rate IS NOT NULL AND OLD.finance_default_usd_rate_enc IS NULL) THEN
    NEW.finance_default_usd_rate_enc := private.finance_encrypt_numeric(NEW.finance_default_usd_rate);
  ELSE
    NEW.finance_default_usd_rate_enc := OLD.finance_default_usd_rate_enc;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill efetivo (o trigger cifra os campos pendentes)
UPDATE public.finance_items SET updated_at = updated_at
WHERE (default_amount_original IS NOT NULL AND default_amount_original_enc IS NULL)
   OR (default_exchange_rate IS NOT NULL AND default_exchange_rate_enc IS NULL)
   OR (default_amount_brl IS NOT NULL AND default_amount_brl_enc IS NULL)
   OR (card_limit_brl IS NOT NULL AND card_limit_brl_enc IS NULL);

UPDATE public.finance_occurrences SET updated_at = updated_at
WHERE (amount_original IS NOT NULL AND amount_original_enc IS NULL)
   OR (exchange_rate IS NOT NULL AND exchange_rate_enc IS NULL)
   OR (amount_brl IS NOT NULL AND amount_brl_enc IS NULL)
   OR (paid_amount_brl IS NOT NULL AND paid_amount_brl_enc IS NULL);

UPDATE public.tenants SET updated_at = updated_at
WHERE (finance_monthly_budget_brl IS NOT NULL AND finance_monthly_budget_brl_enc IS NULL)
   OR (finance_default_usd_rate IS NOT NULL AND finance_default_usd_rate_enc IS NULL);

REVOKE ALL ON FUNCTION public.finance_read_item_values(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.finance_read_tenant_values(uuid) FROM anon;