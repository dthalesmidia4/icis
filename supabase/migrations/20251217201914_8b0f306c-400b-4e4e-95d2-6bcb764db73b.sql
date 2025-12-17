-- Update existing cards with old column name to new column name
UPDATE public.cards 
SET column_name = 'Planejamento'
WHERE column_name = 'Planejamento Automatizado';