## Objetivo

1. **Reorganizador automático não altera cards de captação** (etapa `captar`) — são compromissos com clientes/externos.
2. **Cards de captação podem ter múltiplos responsáveis**, aparecem na coluna de cada um, edição em qualquer coluna atualiza para todos, e continuam preservados pelo reorganizador.

---

## Parte 1 — Reorganizador preserva cards de captação

`src/lib/reorderSequence.ts` hoje só protege cards em `aguardando_cliente` (linhas 520-521 e 629-643). Estender a mesma lógica para `captar`:

- Criar um conjunto `PRESERVED_FUNCTION_KEYS = new Set(["aguardando_cliente", "captar"])`.
- Substituir os dois filtros `!== "aguardando_cliente"` / `=== "aguardando_cliente"` por checagens contra esse Set.
- No bloco final que gera propostas para cards não-reordenados, usar mensagens específicas:
  - `aguardando_cliente` → "Aguardando cliente — não reagendado." (mantida)
  - `captar` → "Captação com cliente — data mantida."

Em `ReorderSequenceModal.tsx`, atualizar a linha explicativa: "Cards em **Aguardando cliente** e **Captação** não são reagendados."

Nenhuma mudança no schema para esta parte.

---

## Parte 2 — Múltiplos responsáveis (foco em captação)

### 2.1 Schema

Migração adicionando uma coluna array em `public.demands`:

```sql
ALTER TABLE public.demands
  ADD COLUMN additional_assignees uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX demands_additional_assignees_gin
  ON public.demands USING gin (additional_assignees);
```

- Fonte de verdade permanece uma única linha por card — edição sincroniza automaticamente para todos os responsáveis (não há necessidade de duplicar).
- `assigned_to` continua sendo o responsável principal (quem pega o card no fluxo, quem valida o trigger `validate_demand_stage_assignment`); `additional_assignees` são co-responsáveis visíveis para exibição/filtragem.
- Não altera RLS: coluna herda as políticas existentes de `demands`.

### 2.2 UI — edição de responsáveis

No `TaskCard.tsx`, no seletor de responsável do card:

- Se `current_function_key === 'captar'` (ou tipo captação), exibir um **multi-select** de responsáveis (colaboradores do tenant).
- O primeiro selecionado grava em `assigned_to`; os demais em `additional_assignees` (uuids, sem duplicar o principal).
- Para os outros tipos, manter o seletor single-select atual (grava só `assigned_to`, `additional_assignees = []`).
- Mostrar um chip discreto no header do card ("+1", "+2 responsáveis") quando o array não estiver vazio.

Como envolve mudança de UX de um campo existente, é uma alteração de apresentação — não muda regras de fluxo, `validate_demand_stage_assignment` continua validando `assigned_to`.

### 2.3 Kanban — card aparece em várias colunas

Em `KanbanCentralPage.tsx`:

- No fetch de demandas: selecionar também `additional_assignees`.
- No agrupamento por coluna de colaborador (linhas ~2264, ~2291-2292), trocar a comparação:
  ```
  card.assigned_to === userId
    → card.assigned_to === userId || (card.additional_assignees || []).includes(userId)
  ```
- Aplicar o mesmo em `useCollaborators.tsx` para a contagem `demandCount` (contar cards onde o usuário é principal OU adicional).
- Ao mover o card entre colunas via drag: o comportamento continua trocando `assigned_to` (responsável principal); os adicionais permanecem. Se o card for arrastado para a coluna de alguém que já é adicional, esse usuário sai de `additional_assignees` e vira o principal (evita duplicação).
- Realtime já cobre: como é a mesma linha, qualquer edição feita em uma coluna reflete instantaneamente nas outras via `useRealtimeDemands`.

### 2.4 Reorganizador com múltiplos responsáveis

`ReorderSequenceModal` é aberto para uma coluna específica (um `assigneeId`). Regras:

- Cards de `captar` já são preservados na Parte 1 — independentemente de quantos responsáveis tenham.
- Nada mais precisa mudar: o reorganizador da coluna X só puxa os cards visíveis naquela coluna, e captações não são reagendadas. Cards não-captação continuam com um único responsável (fluxo atual).

---

## Fora de escopo

- Não mudar RLS/permissões.
- Não introduzir tabela M:N — o array cobre o caso sem custo de JOIN e mantém sincronização "grátis".
- Não expor multi-select em tipos que não sejam captação (evitar confusão).

## Verificação

- Build passa.
- Reorganizador rodando numa coluna com card em `captar`: card aparece na lista com badge "Captação — data mantida" e `changed=false`.
- Card de captação com 2 responsáveis aparece nas duas colunas; editar título/data numa reflete na outra em tempo real.
- Contadores de `useCollaborators` refletem cards compartilhados.
