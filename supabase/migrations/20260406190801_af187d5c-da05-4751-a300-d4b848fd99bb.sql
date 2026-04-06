
-- Gerar os 11 lançamentos futuros faltantes para a conta recorrente ALELO
INSERT INTO public.bills_payable (tenant_id, name, due_date, observations, attachment_url, attachment_name, amount, payment_method, is_recurring, recurrence_months, parent_bill_id, created_by)
SELECT 
  bp.tenant_id,
  bp.name,
  (bp.due_date + (generate_series * interval '1 month'))::date,
  bp.observations,
  bp.attachment_url,
  bp.attachment_name,
  bp.amount,
  bp.payment_method,
  true,
  bp.recurrence_months,
  bp.id,
  bp.created_by
FROM public.bills_payable bp
CROSS JOIN generate_series(1, bp.recurrence_months - 1) AS generate_series
WHERE bp.id = '55d90373-d449-4d7d-8956-b7c5c99b3f21'
AND NOT EXISTS (
  SELECT 1 FROM public.bills_payable child WHERE child.parent_bill_id = bp.id
);
