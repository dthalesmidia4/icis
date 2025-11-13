-- Insert default plan generation prompt for all tenants
INSERT INTO public.system_prompts (prompt_key, prompt_title, prompt_content, tenant_id)
SELECT 
  'generate_plan_prompt',
  'Prompt de Geração de Plano de Marketing',
  'Com base nos dados fornecidos acima, crie um plano de marketing detalhado e estruturado para o mês especificado. O plano deve incluir:

1. RESUMO EXECUTIVO
- Visão geral do plano de marketing
- Principais objetivos e metas

2. ANÁLISE DE SITUAÇÃO
- Contexto do negócio
- Público-alvo principal
- Oportunidades identificadas

3. ESTRATÉGIA DE MARKETING
- Pilares estratégicos baseados nas informações fornecidas
- Posicionamento de marca
- Mensagens-chave

4. CRONOGRAMA DE AÇÕES (DETALHADO POR SEMANA)
Para cada semana do mês, especifique:
- Semana X (DD/MM - DD/MM)
  * Segunda-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Quarta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação
  * Sexta-feira: [Tipo de conteúdo] no [Canal] - Descrição da ação

Tipos de conteúdo sugeridos: Post, Vídeo, Story, Reels, E-mail, Blog, Anúncio
Canais sugeridos: Instagram, Facebook, LinkedIn, YouTube, E-mail, WhatsApp, Site

5. MÉTRICAS E KPIs
- Principais indicadores de desempenho a serem acompanhados
- Metas quantitativas quando aplicável

6. RECOMENDAÇÕES FINAIS
- Dicas práticas de implementação
- Pontos de atenção

INSTRUÇÕES IMPORTANTES:
- Seja específico e prático nas recomendações
- Considere o tamanho e setor da empresa ao sugerir ações
- Priorize qualidade sobre quantidade
- Adapte a linguagem ao público-alvo identificado
- Seja realista quanto aos recursos necessários

Formate o plano de forma clara e organizada, usando títulos, subtítulos e bullets para facilitar a leitura.',
  t.id
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_prompts 
  WHERE prompt_key = 'generate_plan_prompt' AND tenant_id = t.id
);