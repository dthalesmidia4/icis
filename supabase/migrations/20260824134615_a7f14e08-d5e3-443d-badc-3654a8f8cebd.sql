ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS card_limit_brl numeric NULL;

ALTER TABLE public.finance_items
  DROP CONSTRAINT IF EXISTS finance_items_card_limit_brl_check;

ALTER TABLE public.finance_items
  ADD CONSTRAINT finance_items_card_limit_brl_check
  CHECK (card_limit_brl IS NULL OR card_limit_brl >= 0);

COMMENT ON COLUMN public.finance_items.card_limit_brl IS 'Limite do cartão de crédito em BRL. Somente kind = card. Não é orçamento mensal.';

UPDATE public.tenants
   SET finance_monthly_budget_brl = NULL
 WHERE finance_monthly_budget_brl = 5000;