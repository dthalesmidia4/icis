ALTER TABLE public.finance_items
  ADD COLUMN IF NOT EXISTS installment_start_date date,
  ADD COLUMN IF NOT EXISTS installment_count integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_items_installment_count_positive'
      AND conrelid = 'public.finance_items'::regclass
  ) THEN
    ALTER TABLE public.finance_items
      ADD CONSTRAINT finance_items_installment_count_positive
      CHECK (installment_count IS NULL OR installment_count > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.finance_items.installment_start_date IS 'Ancora do cronograma parcelado (data da 1a parcela).';
COMMENT ON COLUMN public.finance_items.installment_count IS 'Quantidade TOTAL de parcelas do cronograma.';