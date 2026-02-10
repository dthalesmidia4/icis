
-- Add is_fixed and parent_status_id columns to pipeline_statuses
ALTER TABLE public.pipeline_statuses 
  ADD COLUMN is_fixed boolean NOT NULL DEFAULT false,
  ADD COLUMN parent_status_id uuid REFERENCES public.pipeline_statuses(id) ON DELETE SET NULL;

-- Mark core statuses as fixed
UPDATE public.pipeline_statuses SET is_fixed = true 
WHERE name IN ('Planejamento', 'Produção', 'Revisão', 'Aguardando Cliente', 'Agendar Publicação', 'Publicado');

-- Link existing custom columns (non-fixed, non-core) to Produção as parent
UPDATE public.pipeline_statuses ps
SET parent_status_id = (
  SELECT id FROM public.pipeline_statuses 
  WHERE name = 'Produção' AND pipeline_id = ps.pipeline_id 
  LIMIT 1
)
WHERE ps.is_fixed = false 
  AND ps.name NOT IN ('Planejamento', 'Produção', 'Revisão', 'Aguardando Cliente', 'Agendar Publicação', 'Publicado');
