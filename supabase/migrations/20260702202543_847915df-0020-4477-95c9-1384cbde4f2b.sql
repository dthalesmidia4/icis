ALTER TABLE public.demands
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_demands_assigned_to
ON public.demands(assigned_to);