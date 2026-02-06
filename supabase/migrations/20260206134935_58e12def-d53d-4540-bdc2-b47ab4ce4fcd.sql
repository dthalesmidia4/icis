-- Corrigir status_id baseado no column_name para demandas existentes
-- Isso sincroniza o status_id com o column_name correto

UPDATE demands d
SET status_id = ps.id
FROM pipeline_statuses ps
JOIN pipelines p ON ps.pipeline_id = p.id
WHERE d.column_name = ps.name
AND d.tenant_id = p.tenant_id
AND p.is_default = true
AND d.status_id != ps.id;