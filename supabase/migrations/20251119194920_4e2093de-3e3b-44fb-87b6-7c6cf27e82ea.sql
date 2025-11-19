-- Add observations column to strategies table
ALTER TABLE public.strategies
ADD COLUMN observations text;

COMMENT ON COLUMN public.strategies.observations IS 'Observações e restrições específicas do cliente que devem ser consideradas no planejamento';