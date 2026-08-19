ALTER FUNCTION public.is_client_facing_function(text) SET search_path = public;
ALTER FUNCTION public.is_review_function(text) SET search_path = public;
REVOKE ALL ON FUNCTION public.is_client_facing_function(text) FROM public;
REVOKE ALL ON FUNCTION public.is_review_function(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_client_facing_function(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_review_function(text) TO authenticated, service_role;