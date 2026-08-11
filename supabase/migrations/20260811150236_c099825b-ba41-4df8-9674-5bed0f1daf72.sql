ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS image_aspect_ratio text NULL;

ALTER TABLE public.demands DROP CONSTRAINT IF EXISTS demands_image_aspect_ratio_check;
ALTER TABLE public.demands ADD CONSTRAINT demands_image_aspect_ratio_check
  CHECK (image_aspect_ratio IS NULL OR image_aspect_ratio IN ('4:5','1:1','9:16','16:9','3:4','4:3'));

UPDATE public.demands
SET image_aspect_ratio = '4:5'
WHERE demand_type_key IN ('criativo_estatico','carrossel')
  AND image_aspect_ratio IS NULL;