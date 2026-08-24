REVOKE ALL ON FUNCTION public.finance_items_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_occurrences_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_finance_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_finance_settings(uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_finance_statement(uuid, timestamptz, numeric) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_finance_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_finance_settings(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_finance_statement(uuid, timestamptz, numeric) TO authenticated;