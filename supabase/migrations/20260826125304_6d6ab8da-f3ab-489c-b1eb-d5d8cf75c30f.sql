REVOKE EXECUTE ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric) FROM anon;

GRANT EXECUTE ON FUNCTION public.finance_read_occurrence_values(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_finance_statement_reconciled(uuid, timestamptz, numeric, jsonb, numeric) TO authenticated, service_role;