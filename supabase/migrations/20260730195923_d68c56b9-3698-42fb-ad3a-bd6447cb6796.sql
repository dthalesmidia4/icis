ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS subclient_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.demands
SET subclient_ids = ARRAY[subclient_id]
WHERE subclient_id IS NOT NULL
  AND (subclient_ids IS NULL OR array_length(subclient_ids, 1) IS NULL);

CREATE INDEX IF NOT EXISTS demands_subclient_ids_gin
  ON public.demands USING GIN (subclient_ids);