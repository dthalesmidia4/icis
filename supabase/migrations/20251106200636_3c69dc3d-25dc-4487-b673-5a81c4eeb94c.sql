-- Criar tabela para armazenar sessões de perguntas
CREATE TABLE IF NOT EXISTS public.question_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  company_id UUID NOT NULL,
  strategy_id UUID NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.question_sessions ENABLE ROW LEVEL SECURITY;

-- Política de isolamento por tenant
CREATE POLICY "tenant_isolation_question_sessions" 
ON public.question_sessions 
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  user_has_tenant_access(auth.uid(), tenant_id)
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_question_sessions_updated_at
BEFORE UPDATE ON public.question_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_question_sessions_tenant_id ON public.question_sessions(tenant_id);
CREATE INDEX idx_question_sessions_company_id ON public.question_sessions(company_id);
CREATE INDEX idx_question_sessions_strategy_id ON public.question_sessions(strategy_id);