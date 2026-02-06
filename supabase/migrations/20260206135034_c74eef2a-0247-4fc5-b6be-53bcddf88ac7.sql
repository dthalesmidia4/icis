-- Corrigir column_name 'Em Produção' para 'Produção' (nome correto do status)
UPDATE demands
SET column_name = 'Produção'
WHERE column_name = 'Em Produção';

-- Atualizar status_id para corresponder ao novo column_name
UPDATE demands d
SET status_id = ps.id
FROM pipeline_statuses ps
JOIN pipelines p ON ps.pipeline_id = p.id
WHERE d.column_name = ps.name
AND d.tenant_id = p.tenant_id
AND p.is_default = true
AND (d.status_id IS NULL OR d.status_id != ps.id);