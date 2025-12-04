-- Add attachments column to cards table
ALTER TABLE public.cards 
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;