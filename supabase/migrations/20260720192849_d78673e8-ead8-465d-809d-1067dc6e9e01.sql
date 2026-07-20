-- Backfill: cards ativos sem etapa → 'revisar'
-- Registra histórico e mantém assigned_to intacto.
WITH targets AS (
  SELECT d.id, d.tenant_id, d.assigned_to, d.current_function_key
  FROM public.demands d
  WHERE d.current_function_key IS NULL
    AND d.archived_at IS NULL
    AND d.is_draft IS NOT TRUE
), updated AS (
  UPDATE public.demands d
  SET current_function_key = 'revisar',
      updated_at = now()
  FROM targets t
  WHERE d.id = t.id
  RETURNING d.id, d.tenant_id, d.assigned_to
)
INSERT INTO public.demand_flow_history
  (tenant_id, demand_id, action, from_user_id, to_user_id, from_function_key, to_function_key, metadata, created_at)
SELECT
  u.tenant_id,
  u.id,
  'backfill_initial_function',
  NULL,
  u.assigned_to,
  NULL,
  'revisar',
  jsonb_build_object('source', 'sql_backfill_sem_etapa'),
  now()
FROM updated u;