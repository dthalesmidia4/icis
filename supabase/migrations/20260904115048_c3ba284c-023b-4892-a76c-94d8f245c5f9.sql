GRANT EXECUTE ON FUNCTION public.demand_flow_sequence(uuid, text, work_area, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.demand_stage_is_valid(uuid, text, work_area, text, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.demand_stages_done_by_user(uuid, uuid) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.resolve_valid_stage_for_assignee(uuid, uuid, text, work_area, text, text, uuid, boolean, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.resolve_valid_assignee_for_stage(uuid, text, work_area, uuid, uuid, uuid, text, text) TO supabase_read_only_user;