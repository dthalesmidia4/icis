
INSERT INTO public.demand_type_flow_rules (tenant_id, demand_type_key, demand_type_name, function_key, requirement)
SELECT tenant_id, demand_type_key, demand_type_name,
  'aguardando_cliente',
  CASE WHEN demand_type_key = 'outro' THEN 'disabled' ELSE 'required' END
FROM public.demand_type_flow_rules
WHERE function_key = 'enviar_cliente'
ON CONFLICT DO NOTHING;
