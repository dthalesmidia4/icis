-- Add new columns to strategies table for better organization
ALTER TABLE public.strategies
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Em elaboração' CHECK (status IN ('Em elaboração', 'Aprovada', 'Em execução')),
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE;

-- Add strategy_id to marketing_plans to link plans to strategies
ALTER TABLE public.marketing_plans
ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE;

-- Update existing strategies to have a name (use first 50 chars of strategy_text)
UPDATE public.strategies
SET name = CASE 
  WHEN LENGTH(strategy_text) > 50 THEN LEFT(strategy_text, 50) || '...'
  ELSE strategy_text
END
WHERE name IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_marketing_plans_strategy_id ON public.marketing_plans(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategies_status ON public.strategies(status);
CREATE INDEX IF NOT EXISTS idx_strategies_company_tenant ON public.strategies(company_id, tenant_id);