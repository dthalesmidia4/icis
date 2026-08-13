ALTER TABLE public.demands
ADD COLUMN IF NOT EXISTS reference_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.demands
DROP CONSTRAINT IF EXISTS demands_reference_attachments_array_check;

ALTER TABLE public.demands
ADD CONSTRAINT demands_reference_attachments_array_check
CHECK (jsonb_typeof(reference_attachments) = 'array');