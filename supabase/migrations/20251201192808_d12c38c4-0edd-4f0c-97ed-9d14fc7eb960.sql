-- Add period_plan_id column to cards table to support period-based cards
ALTER TABLE public.cards 
ADD COLUMN period_plan_id UUID REFERENCES public.period_plans(id) ON DELETE CASCADE;

-- Make plan_id nullable since cards can now come from period_plans
ALTER TABLE public.cards 
ALTER COLUMN plan_id DROP NOT NULL;

-- Add index for period_plan_id
CREATE INDEX idx_cards_period_plan_id ON public.cards(period_plan_id);

-- Add check constraint to ensure at least one of plan_id or period_plan_id is set
ALTER TABLE public.cards
ADD CONSTRAINT cards_source_check 
CHECK (plan_id IS NOT NULL OR period_plan_id IS NOT NULL);