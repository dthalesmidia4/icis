-- Idempotent sync of revoke_public_finance_rpc_execution
REVOKE EXECUTE ON FUNCTION public.finance_access_scope(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_finance_tools_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_tools_item_allowed(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_finance_safe_cards(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_password_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.finance_access_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_finance_tools_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_tools_item_allowed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_finance_safe_cards(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_password_status(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.finance_access_scope(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_finance_tools_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_tools_item_allowed(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_finance_safe_cards(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_password_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) TO authenticated, service_role;