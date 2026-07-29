ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS additional_assignees uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS demands_additional_assignees_gin
  ON public.demands USING gin (additional_assignees);