
-- 1) Abrir espaço para enviar_cliente na posição 7 (empurra publicar e revisar_publicacao)
UPDATE public.flow_functions
SET position = position + 1
WHERE function_key IN ('publicar', 'revisar_publicacao');

-- 2) Inserir a nova função para todos os tenants existentes que ainda não a possuam
INSERT INTO public.flow_functions (tenant_id, function_key, name, position, active)
SELECT DISTINCT ff.tenant_id, 'enviar_cliente', 'Enviar cliente', 7, true
FROM public.flow_functions ff
WHERE NOT EXISTS (
  SELECT 1 FROM public.flow_functions ff2
  WHERE ff2.tenant_id = ff.tenant_id AND ff2.function_key = 'enviar_cliente'
);

-- 3) Regras padrão por tipo — required para os principais, disabled para outro
INSERT INTO public.demand_type_flow_rules (tenant_id, demand_type_key, demand_type_name, function_key, requirement)
SELECT t.tenant_id, t.demand_type_key, t.demand_type_name, 'enviar_cliente',
  CASE WHEN t.demand_type_key = 'outro' THEN 'disabled' ELSE 'required' END
FROM (
  SELECT DISTINCT tenant_id, demand_type_key, demand_type_name
  FROM public.demand_type_flow_rules
) t
ON CONFLICT (tenant_id, demand_type_key, function_key) DO NOTHING;
