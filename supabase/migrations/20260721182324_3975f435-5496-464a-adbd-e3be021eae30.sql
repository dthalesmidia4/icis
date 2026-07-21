INSERT INTO public.flow_functions (tenant_id, function_key, name, position, active, config)
SELECT DISTINCT t.id, 'avaliar', 'Avaliar', -1, true, jsonb_build_object('color', '#a855f7')
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.flow_functions ff
  WHERE ff.tenant_id = t.id AND ff.function_key = 'avaliar'
);