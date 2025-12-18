-- Update remaining cards with "Planejamento Automatizado" to "Planejamento"
UPDATE public.cards 
SET column_name = 'Planejamento' 
WHERE column_name = 'Planejamento Automatizado';