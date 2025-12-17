-- Add publication_dates column to cards table
-- Stores array of publication date/time objects
ALTER TABLE public.cards 
ADD COLUMN IF NOT EXISTS publication_dates JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.cards.publication_dates IS 'Array of publication dates with format [{date: "YYYY-MM-DD", time: "HH:MM"}, ...]';