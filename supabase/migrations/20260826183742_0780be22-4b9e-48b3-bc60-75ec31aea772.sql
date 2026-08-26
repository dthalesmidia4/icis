-- Saneamento: item cobrado no cartão não tem vencimento próprio (é da fatura).
UPDATE public.finance_items
SET due_day = NULL
WHERE kind <> 'card'
  AND due_day IS NOT NULL
  AND (card_item_id IS NOT NULL OR payment_method = 'Cartão de Crédito');

-- Proteção: master de item vinculado a cartão não recebe due_day de novo.
CREATE OR REPLACE FUNCTION public.finance_items_guard_card_due_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'card'
     AND NEW.due_day IS NOT NULL
     AND (NEW.card_item_id IS NOT NULL OR NEW.payment_method = 'Cartão de Crédito') THEN
    NEW.due_day := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_items_guard_card_due_day ON public.finance_items;
CREATE TRIGGER finance_items_guard_card_due_day
BEFORE INSERT OR UPDATE ON public.finance_items
FOR EACH ROW EXECUTE FUNCTION public.finance_items_guard_card_due_day();