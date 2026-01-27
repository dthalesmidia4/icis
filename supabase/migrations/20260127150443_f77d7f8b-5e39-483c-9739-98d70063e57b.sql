-- STEP 1: Add missing columns to demands table to accommodate cards data
ALTER TABLE public.demands 
ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.marketing_plans(id),
ADD COLUMN IF NOT EXISTS column_name text,
ADD COLUMN IF NOT EXISTS publication_dates jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS delivery_date date,
ADD COLUMN IF NOT EXISTS file_location text,
ADD COLUMN IF NOT EXISTS objetivo text,
ADD COLUMN IF NOT EXISTS instrucoes text,
ADD COLUMN IF NOT EXISTS observations text;

-- STEP 2: Migrate data from cards to demands
INSERT INTO public.demands (
  id,
  tenant_id,
  client_id,
  period_plan_id,
  plan_id,
  pipeline_id,
  status_id,
  title,
  description,
  objective,
  instructions,
  observations,
  attachments,
  source,
  column_name,
  publication_dates,
  delivery_date,
  file_location,
  publish_date,
  created_at,
  updated_at
)
SELECT 
  c.id,
  c.tenant_id,
  -- Get company_id from period_plan or marketing_plan
  COALESCE(
    pp.company_id,
    mp.company_id,
    (SELECT id FROM public.tenant_companies WHERE tenant_id = c.tenant_id LIMIT 1)
  ) as client_id,
  c.period_plan_id,
  c.plan_id,
  -- Get default pipeline for tenant
  (SELECT p.id FROM public.pipelines p WHERE p.tenant_id = c.tenant_id AND p.is_default = true LIMIT 1) as pipeline_id,
  -- Get initial status from that pipeline
  (SELECT ps.id FROM public.pipeline_statuses ps 
   WHERE ps.pipeline_id = (SELECT p.id FROM public.pipelines p WHERE p.tenant_id = c.tenant_id AND p.is_default = true LIMIT 1)
   AND ps.is_initial = true LIMIT 1) as status_id,
  c.title,
  c.description,
  c.objetivo,
  c.instrucoes,
  c.observations,
  COALESCE(c.attachments, '[]'::jsonb),
  'card' as source,
  c.column_name,
  COALESCE(c.publication_dates, '[]'::jsonb),
  c.delivery_date,
  c.file_location,
  -- Extract first publication date if available
  CASE 
    WHEN c.publication_dates IS NOT NULL AND jsonb_array_length(c.publication_dates) > 0 
    THEN (c.publication_dates->0->>'date')::date
    ELSE c.delivery_date
  END as publish_date,
  c.created_at,
  c.updated_at
FROM public.cards c
LEFT JOIN public.period_plans pp ON pp.id = c.period_plan_id
LEFT JOIN public.marketing_plans mp ON mp.id = c.plan_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.demands d WHERE d.id = c.id
);

-- STEP 3: Create index for better performance on source queries
CREATE INDEX IF NOT EXISTS idx_demands_source ON public.demands(source);
CREATE INDEX IF NOT EXISTS idx_demands_publication_dates ON public.demands USING GIN(publication_dates);

-- STEP 4: Update the source field to properly distinguish between card and demand
-- Cards migrated will have source = 'card', existing demands keep their source

-- STEP 5: Comment for documentation
COMMENT ON COLUMN public.demands.source IS 'Origin of the demand: manual, template, card (AI-generated from planning)';
COMMENT ON COLUMN public.demands.publication_dates IS 'JSONB array of publication dates for cards with multiple dates';
COMMENT ON COLUMN public.demands.column_name IS 'Legacy column name from cards table for backward compatibility';