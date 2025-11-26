-- Tornar a coluna strategy_id opcional na tabela question_sessions
ALTER TABLE public.question_sessions 
  ALTER COLUMN strategy_id DROP NOT NULL;

-- Adicionar índice para melhorar a performance de busca por company_id e tenant_id
CREATE INDEX IF NOT EXISTS idx_question_sessions_company_tenant 
  ON public.question_sessions(company_id, tenant_id, created_at DESC);