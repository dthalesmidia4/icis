-- As três funções já validam permissão internamente; ainda assim, ninguém
-- deslogado precisa poder chamá-las.
REVOKE EXECUTE ON FUNCTION public.set_finance_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_password_status(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.set_finance_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_finance_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_password_status(uuid) TO authenticated;