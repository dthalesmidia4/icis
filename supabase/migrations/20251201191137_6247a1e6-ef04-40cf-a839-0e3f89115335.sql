-- Create period_plans table for storing period planning data
CREATE TABLE public.period_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.tenant_companies(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  
  -- Period information
  period_title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  budget TEXT,
  objective TEXT NOT NULL,
  priority_channel TEXT NOT NULL,
  observations TEXT,
  
  -- Generated plans
  default_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultra_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- User choices
  primary_mode TEXT CHECK (primary_mode IN ('normal', 'ultra')),
  optional_package JSONB,
  package_accepted BOOLEAN DEFAULT false,
  
  -- Final approved set
  final_plan JSONB DEFAULT '[]'::jsonb,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'mode_selected', 'completed')),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.period_plans ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for tenant isolation
CREATE POLICY "tenant_isolation_period_plans" ON public.period_plans
  AS RESTRICTIVE
  FOR ALL
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    user_has_tenant_access(auth.uid(), tenant_id)
  );

-- Create index for faster queries
CREATE INDEX idx_period_plans_company_id ON public.period_plans(company_id);
CREATE INDEX idx_period_plans_tenant_id ON public.period_plans(tenant_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_period_plans_updated_at
  BEFORE UPDATE ON public.period_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();