REVOKE ALL ON FUNCTION public.create_manual_demand_atomic(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_release_queue_config(uuid, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_release_queue_enabled(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_initial_function(uuid, text, work_area, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_demand_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_release_queue_config(uuid, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_release_queue_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_initial_function(uuid, text, work_area, text) TO authenticated;