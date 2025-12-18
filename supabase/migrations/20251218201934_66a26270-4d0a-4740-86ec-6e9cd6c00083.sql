-- Add operational_status column to period_plans table
-- This status is independent from the plan status and tracks operational progress
ALTER TABLE public.period_plans 
ADD COLUMN operational_status text NOT NULL DEFAULT 'em_andamento';

-- Add comment to explain the column
COMMENT ON COLUMN public.period_plans.operational_status IS 'Operational status of the period plan: em_andamento (in progress) or concluido (completed). Independent from plan workflow status.';