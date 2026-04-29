Diagnóstico atual

A geração ainda está falhando no backend antes de salvar qualquer demanda.

Evidências confirmadas:
- O último período criado (`a40b7e08-6343-4e1f-a56e-a074f1ebee4a`, 20:51 UTC) continua com `status = draft` e `default_plan = 0`, `ultra_plan = 0`, `final_plan = 0`.
- Os 4 últimos testes recentes estão no mesmo padrão: criam o registro, mas não persistem demandas.
- Os logs da Edge Function `generate-period-plans` mostram a sequência:
  1. início normal da função
  2. prompts carregados com sucesso
  3. chamada ao OpenAI para `planType: default`
  4. aborto após 110s
  5. erro: “A geração demorou muito...”
- O payload ainda está pesado: prompts ativos com ~6.6k + ~5.8k caracteres, além de respostas da anamnese com ~5.4k caracteres. Mesmo com truncamentos, a chamada continua grande para uma geração única.
- No frontend, a barra de progresso ainda é sintética e o polling pode continuar por até 180s, então o usuário vê “carregando” por bastante tempo mesmo quando o backend já falhou.
- A lógica de retomada não cobre bem esse caso porque os registros presos continuam em `draft`, então não entram como “período incompleto”.

Conclusão

As correções anteriores melhoraram a estabilidade da tela, mas o gargalo principal continua sendo a geração do plano default em uma única chamada muito pesada. O problema agora é predominantemente de arquitetura do fluxo de geração, não mais apenas de navegação/redirect.

Plano de correção

1. Tornar o status persistente desde o primeiro segundo
- Atualizar o fluxo para gravar `status = generating_default` imediatamente antes da chamada pesada.
- Garantir que timeout/erro gravem um estado recuperável em vez de deixar o período preso em `draft`.
- Fazer a retomada considerar também drafts recentes sem plano salvo, para não “sumirem” da recuperação.

2. Quebrar a geração default em lotes menores
- Em vez de pedir todas as demandas de uma vez, dividir a geração do plano normal em blocos menores.
- A melhor divisão aqui é por linha de produção ou pequenos batches (ex.: 4 estáticos, 2 vídeos, 4 carrosséis em etapas separadas).
- Salvar parcialmente no `default_plan` após cada lote concluído.
- Se um lote falhar, preservar o que já foi gerado e permitir retomada.

3. Enxugar o contexto enviado para a IA
- Reduzir o contexto da chamada default para o estritamente necessário.
- Usar uma versão resumida da estratégia/perguntas para o plano normal.
- Reservar instruções mais extensas e “macro” para o plano ultra, onde faz mais sentido.
- Revisar o limite de tokens e o modelo usado na chamada default para priorizar velocidade.

4. Corrigir o feedback do frontend
- Parar o polling assim que a invoke retornar erro real, sem manter a barra falsa por muito tempo.
- Mostrar erro específico de timeout logo que ele acontecer.
- Exibir opção clara de “retomar geração” ou “tentar novamente a partir do que já foi salvo”.
- Ajustar o critério de período incompleto para incluir esse cenário atual.

5. Validar com teste real do fluxo
- Executar novo teste no mesmo cliente.
- Confirmar no banco que o período sai de `draft` imediatamente.
- Confirmar nos logs que cada lote conclui dentro da janela.
- Confirmar que, se houver falha, o usuário consegue retomar sem perder tudo.

Detalhes técnicos

Arquivos mais prováveis de alteração:
- `supabase/functions/generate-period-plans/index.ts`
- `src/pages/PlanPeriod.tsx`

Mudanças técnicas previstas:
- Persistência antecipada de status.
- Geração incremental com early save parcial.
- Redução do payload/contexto do plano normal.
- Polling alinhado ao estado real da Edge Function.
- Reidratação/retomada para períodos presos em `draft` ou parcialmente gerados.

Resultado esperado

Após essas mudanças, o fluxo deixa de depender de uma única resposta longa da IA. Mesmo se houver lentidão, o sistema passa a:
- mostrar estado correto,
- salvar progresso parcial,
- permitir retomada,
- e evitar que o usuário fique preso vendo porcentagem sem geração concluída.

Se você aprovar, eu sigo com essa correção estrutural agora.