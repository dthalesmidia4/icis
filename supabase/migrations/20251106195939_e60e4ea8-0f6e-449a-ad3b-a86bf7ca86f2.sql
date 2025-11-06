-- Criar tabela para armazenar prompts do sistema
CREATE TABLE IF NOT EXISTS public.system_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  prompt_key TEXT NOT NULL UNIQUE,
  prompt_title TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários do tenant vejam e editem seus prompts
CREATE POLICY "tenant_isolation_system_prompts" 
ON public.system_prompts 
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
CREATE TRIGGER update_system_prompts_updated_at
BEFORE UPDATE ON public.system_prompts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Inserir prompt padrão para geração de perguntas
INSERT INTO public.system_prompts (tenant_id, prompt_key, prompt_title, prompt_content)
SELECT 
  t.id,
  'generate_questions_prompt',
  'Prompt de geração de perguntas para o cronograma',
  'Você é um assistente especializado em marketing digital. Gere perguntas estratégicas baseadas nas informações da empresa para auxiliar na criação do cronograma de conteúdo.'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_prompts 
  WHERE prompt_key = 'generate_questions_prompt' AND tenant_id = t.id
);