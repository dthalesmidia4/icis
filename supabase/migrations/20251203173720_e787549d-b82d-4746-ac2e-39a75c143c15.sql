-- Add new columns for structured card content
ALTER TABLE public.cards 
ADD COLUMN objetivo text,
ADD COLUMN instrucoes text;