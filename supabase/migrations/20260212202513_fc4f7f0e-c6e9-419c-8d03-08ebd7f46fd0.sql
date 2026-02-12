
-- Backfill: archive demands from completed periods
UPDATE demands SET archived_at = NOW()
WHERE period_plan_id IN (
  SELECT id FROM period_plans WHERE operational_status = 'concluido'
) AND archived_at IS NULL;

-- Backfill: archive old loose demands (90+ days, no period)
UPDATE demands SET archived_at = NOW()
WHERE period_plan_id IS NULL
  AND created_at < NOW() - INTERVAL '90 days'
  AND archived_at IS NULL;
