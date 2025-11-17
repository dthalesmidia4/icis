-- Add selected_month column back to marketing_plans table
ALTER TABLE public.marketing_plans 
ADD COLUMN selected_month TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN public.marketing_plans.selected_month IS 'Month selected by user for plan execution in YYYY-MM format';