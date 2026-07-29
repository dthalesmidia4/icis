-- Add "revisar_captacao" stage between captar and editar_video, only for tenants that have captar
DO $$
DECLARE
  t RECORD;
  new_pos integer;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM public.flow_functions WHERE function_key = 'captar' AND active = true
  LOOP
    -- skip if already exists
    IF EXISTS (SELECT 1 FROM public.flow_functions WHERE tenant_id = t.tenant_id AND function_key = 'revisar_captacao') THEN
      CONTINUE;
    END IF;

    SELECT position INTO new_pos FROM public.flow_functions WHERE tenant_id = t.tenant_id AND function_key = 'captar';

    -- shift positions after captar
    UPDATE public.flow_functions
       SET position = position + 1
     WHERE tenant_id = t.tenant_id AND position > new_pos;

    INSERT INTO public.flow_functions (tenant_id, function_key, name, position, active, config)
    VALUES (t.tenant_id, 'revisar_captacao', 'Revisar captação', new_pos + 1, true, '{}'::jsonb);
  END LOOP;
END $$;

-- Add pipeline rules per demand_type
INSERT INTO public.demand_type_flow_rules (tenant_id, demand_type_key, demand_type_name, function_key, requirement)
SELECT DISTINCT r.tenant_id, r.demand_type_key, r.demand_type_name, 'revisar_captacao',
  CASE WHEN r.demand_type_key = 'video_captado' THEN 'required' ELSE 'disabled' END
FROM public.demand_type_flow_rules r
WHERE r.function_key = 'captar'
  AND NOT EXISTS (
    SELECT 1 FROM public.demand_type_flow_rules r2
     WHERE r2.tenant_id = r.tenant_id
       AND r2.demand_type_key = r.demand_type_key
       AND r2.function_key = 'revisar_captacao'
  );

-- Ensure collaborator function assignments follow existing "revisar" allowances for users who can revisar (safe default: mirror revisar)
INSERT INTO public.collaborator_function_assignments (tenant_id, user_id, function_key, allowed)
SELECT c.tenant_id, c.user_id, 'revisar_captacao', c.allowed
FROM public.collaborator_function_assignments c
WHERE c.function_key = 'revisar'
  AND NOT EXISTS (
    SELECT 1 FROM public.collaborator_function_assignments c2
     WHERE c2.tenant_id = c.tenant_id
       AND c2.user_id = c.user_id
       AND c2.function_key = 'revisar_captacao'
  );