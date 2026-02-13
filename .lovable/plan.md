
## Tornar Geração Ultra Opcional

### Objetivo
Após a avaliação das demandas normais, apresentar ao usuário dois botões de escolha: **Finalizar Planejamento** ou **Gerar Planos Ultra**, em vez de gerar automaticamente os planos ultra.

### Mudanças

**Arquivo: `src/pages/PlanPeriod.tsx`**

1. **Novo step no fluxo**: Adicionar `'choose-ultra'` ao tipo `Step`, ficando entre `'review-normal'` e `'loading-ultra'`.

2. **Alterar `handleReviewNormalConfirm`**: Após salvar as demandas normais no Kanban, em vez de ir direto para `'loading-ultra'`, ir para o novo step `'choose-ultra'`.

3. **Nova funcao `handleFinalizePlanning`**: Marca o period_plan como `completed` (sem ultra) e vai para o step `'completed'`.

4. **Nova funcao `handleGenerateUltra`**: Inicia a geração ultra (mesmo codigo que estava no `handleReviewNormalConfirm` antes).

5. **Novo render do step `'choose-ultra'`**: Tela com dois cards/botoes:
   - **Finalizar Planejamento** - com descrição curta: "Salvar as demandas geradas e concluir o planejamento do período."
   - **Gerar Planos Ultra** (com icone Zap) - com descrição curta: "Criar 3 demandas extras de alto impacto com ideias criativas e diferenciadas."

### Detalhes Tecnicos

- O tipo `Step` passa de `'form' | 'loading-normal' | 'review-normal' | 'loading-ultra' | 'review-ultra' | 'completed'` para incluir `'choose-ultra'` apos `'review-normal'`.
- O render condicional no JSX principal recebe um novo bloco para `currentStep === 'choose-ultra'`.
- Nenhuma alteração na edge function ou banco de dados.
