-- Idempotente: reflete no repositório o schema que o Financeiro já usa.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS recurrence_interval_months integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_start_date date,
  ADD COLUMN IF NOT EXISTS amount_mode text NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_items_recurrence_interval_positive'
      AND conrelid = 'public.finance_items'::regclass
  ) THEN
    ALTER TABLE public.finance_items
      ADD CONSTRAINT finance_items_recurrence_interval_positive
      CHECK (recurrence_interval_months > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_items_amount_mode_check'
      AND conrelid = 'public.finance_items'::regclass
  ) THEN
    ALTER TABLE public.finance_items
      ADD CONSTRAINT finance_items_amount_mode_check
      CHECK (amount_mode IN ('fixed', 'variable'));
  END IF;
END $$;

COMMENT ON COLUMN public.finance_items.recurrence_interval_months IS 'Intervalo da recorrencia em meses (1 = todo mes).';
COMMENT ON COLUMN public.finance_items.recurrence_start_date IS 'Ancora da recorrencia: a partir de quando o intervalo e contado.';
COMMENT ON COLUMN public.finance_items.amount_mode IS 'fixed = valor previsivel; variable = consumo (confirma no mes).';

ALTER TABLE public.finance_occurrences
  ADD COLUMN IF NOT EXISTS payment_method_snapshot text,
  ADD COLUMN IF NOT EXISTS card_item_id_snapshot uuid REFERENCES public.finance_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS statement_competence_snapshot date;

COMMENT ON COLUMN public.finance_occurrences.payment_method_snapshot IS 'Forma de pagamento que valeu NESTE mes (prevalece sobre o cadastro).';
COMMENT ON COLUMN public.finance_occurrences.card_item_id_snapshot IS 'Cartao que valeu NESTE mes (prevalece sobre o cadastro).';
COMMENT ON COLUMN public.finance_occurrences.statement_competence_snapshot IS 'Competencia da fatura em que a cobranca caiu (historico).';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS finance_access_password_hash text;

CREATE OR REPLACE FUNCTION public.set_finance_password(_tenant_id uuid, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Somente o super admin pode definir a senha do Financeiro';
  END IF;
  IF _password IS NULL OR length(btrim(_password)) < 4 OR length(_password) > 64 THEN
    RAISE EXCEPTION 'A senha deve ter entre 4 e 64 caracteres';
  END IF;
  UPDATE public.tenants
  SET finance_access_password_hash = crypt(_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = _tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_finance_password(_tenant_id uuid, _password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.has_finance_access(_tenant_id) THEN
    RETURN false;
  END IF;
  SELECT finance_access_password_hash INTO v_hash
  FROM public.tenants WHERE id = _tenant_id;
  IF v_hash IS NULL OR _password IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(_password, v_hash) = v_hash;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_password_status(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.has_finance_access(_tenant_id) THEN
    RAISE EXCEPTION 'Sem permissão para o Financeiro';
  END IF;
  SELECT finance_access_password_hash INTO v_hash
  FROM public.tenants WHERE id = _tenant_id;
  RETURN jsonb_build_object(
    'configured', v_hash IS NOT NULL,
    'can_setup', public.is_super_admin()
  );
END;
$function$;