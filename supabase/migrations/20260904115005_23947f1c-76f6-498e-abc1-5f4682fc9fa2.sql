REVOKE ALL ON FUNCTION public.demand_flow_sequence(uuid, text, work_area, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demand_stage_is_valid(uuid, text, work_area, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demand_stages_done_by_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_valid_stage_for_assignee(uuid, uuid, text, work_area, text, text, uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_valid_assignee_for_stage(uuid, text, work_area, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_demand_v2(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_demand_flow_states(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repair_demand_flow_states(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.demand_flow_sequence(uuid, text, work_area, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demand_stage_is_valid(uuid, text, work_area, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demand_stages_done_by_user(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_valid_stage_for_assignee(uuid, uuid, text, work_area, text, text, uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_valid_assignee_for_stage(uuid, text, work_area, uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_demand_v2(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_demand_flow_states(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_demand_flow_states(uuid, boolean) TO authenticated, service_role;