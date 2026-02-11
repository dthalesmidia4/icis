
# Fluxo Sequencial de Geracao de Demandas

## Resumo

Reestruturar o fluxo de geracao de demandas para ser sequencial e interativo:

1. Gerar apenas as demandas **Normais** (limite de 6)
2. Mostrar para o usuario avaliar e selecionar
3. Salvar as demandas normais selecionadas no Kanban
4. Gerar as demandas **Ultra** (limite de 3)
5. Mostrar para o usuario avaliar e selecionar
6. Salvar as demandas ultra selecionadas no Kanban
7. Tela de conclusao

## Mudancas no Fluxo (Steps)

O tipo `Step` atual e: `'form' | 'loading' | 'mode-selection' | 'optional-package' | 'completed'`

Sera alterado para: `'form' | 'loading-normal' | 'review-normal' | 'loading-ultra' | 'review-ultra' | 'completed'`

```text
[Formulario] 
    |
    v
[Loading Normal] --> Gera 6 demandas normais
    |
    v
[Review Normal] --> Usuario avalia/seleciona --> Salva no Kanban
    |
    v
[Loading Ultra] --> Gera 3 demandas ultra
    |
    v
[Review Ultra] --> Usuario avalia/seleciona --> Salva no Kanban
    |
    v
[Concluido]
```

## Detalhes Tecnicos

### 1. Edge Function (`supabase/functions/generate-period-plans/index.ts`)

- Adicionar instrucao de limite no prompt JSON:
  - Para `planType === 'default'`: "Gere exatamente 6 demandas"
  - Para `planType === 'ultra'`: "Gere exatamente 3 demandas"
- O resto da logica permanece igual

### 2. Frontend (`src/pages/PlanPeriod.tsx`)

**Novos Steps:**
- Alterar o tipo `Step` para os novos estados
- Remover a logica de `mode-selection` e `optional-package`

**handleSubmit (formulario):**
- Criar o `period_plan` no banco
- Chamar `generateSinglePlan(id, 'default')`
- Ao completar, ir para `'review-normal'`

**handleReviewNormalConfirm (novo):**
- Receber as demandas normais selecionadas
- Salvar imediatamente no Kanban (inserir na tabela `demands`)
- Iniciar geracao ultra: ir para `'loading-ultra'`
- Chamar `generateSinglePlan(id, 'ultra')`
- Ao completar, ir para `'review-ultra'`

**handleReviewUltraConfirm (novo):**
- Receber as demandas ultra selecionadas
- Salvar no Kanban
- Marcar `period_plan` como `status: 'completed'`
- Ir para `'completed'`

**Funcao auxiliar `saveDemandToKanban`:**
- Extrair a logica de insercao de demandas que ja existe em `handleReviewConfirm` para uma funcao reutilizavel
- Reutilizar nos dois fluxos (normal e ultra)

**UI Rendering:**
- Reutilizar o `DemandReviewModal` existente, mas sem o step 2 de "smart suggestions" (cada modal mostra apenas as demandas do seu tipo)
- Na tela de review normal, o botao de confirmar diz "Salvar e Gerar Ultra"
- Na tela de review ultra, o botao de confirmar diz "Confirmar Planejamento"
- Remover `renderModeSelection` e `renderOptionalPackage`
- Ajustar `renderCompleted` para mostrar totais combinados

**handleRegenerate:**
- Adaptar para regenerar apenas o plano do step atual (normal ou ultra)

### 3. DemandReviewModal (`src/components/DemandReviewModal.tsx`)

- Adicionar prop opcional `hideSmartSuggestions?: boolean` para pular o step 2
- Quando `hideSmartSuggestions` for true, o botao "Proximo" vira o botao de confirmacao diretamente
- Adicionar prop `confirmLabel?: string` para customizar o texto do botao de confirmar

### 4. Remocoes

- Remover estado `selectedMode`, `optionalPackage`, `reviewMode`
- Remover funcoes `handleModeSelection`, `handlePackageDecision`
- Remover `renderModeSelection` e `renderOptionalPackage`
- Simplificar `renderCompleted` removendo referencia a pacotes extras
