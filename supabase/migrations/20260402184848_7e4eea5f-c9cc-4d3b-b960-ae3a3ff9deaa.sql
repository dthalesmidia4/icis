
ALTER TABLE public.bills_payable 
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN recurrence_months integer,
  ADD COLUMN parent_bill_id uuid REFERENCES public.bills_payable(id) ON DELETE SET NULL;
