-- Funções do Financeiro só fazem sentido com sessão: visitante não executa.
REVOKE EXECUTE ON FUNCTION public.finance_access_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_finance_tools_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_tools_item_allowed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_finance_safe_cards(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_password_status(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_finance_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_finance_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_finance_settings(uuid, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_finance_statement(uuid, timestamptz, numeric) FROM anon;