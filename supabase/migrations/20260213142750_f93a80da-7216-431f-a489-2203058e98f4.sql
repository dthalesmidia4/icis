ALTER TABLE period_plans
ADD COLUMN production_line jsonb DEFAULT '[]'::jsonb;