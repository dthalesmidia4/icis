## Objetivo

1. **Reorganizador automático não altera cards de captação** (etapa `captar`).
2. **Cards de captação podem ter múltiplos responsáveis**, aparecem na coluna de cada um, edição sincroniza.
3. **Ao prosseguir a etapa**, o card volta a ter um único responsável (o co-responsáveis se aplica só à captação).
4. **Registro de entregas** aparece corretamente na coluna de todos os responsáveis envolvidos na captação.

---

## Parte 1 — Reorganizador preserva captações

`src/lib/reorderSequence.ts`:
- `PRESERVED_FUNCTION_KEYS = new Set(["aguardando_cliente", "captar"])`.
- Trocar os dois filtros que hoje isolam `aguardando_cliente` (linhas 520-521 e 629) por checagem contra o Set.
- Mensagem por chave:
  - `aguardando_cliente` → "Aguardando cliente — não reagendado."
  - `captar` → "Captação com cliente — data mantida."
- Texto explicativo no `ReorderSequenceModal.tsx`: incluir "Captação" ao lado de "Aguardando cliente".

## Parte 2 — Múltiplos responsáveis (captação)

### 2.1 Schema
```sql
ALTER TABLE public.demands
  ADD COLUMN additional_assignees uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX demands_additional_assignees_gin
  ON public.demands USING gin (additional_assignees);
```
- Fonte de verdade continua uma única linha → edição já sincroniza via Realtime.
- `assigned_to` = responsável principal (valida `validate_demand_stage_assignment`).
- `additional_assignees` = co-responsáveis visíveis para agrupamento/registro.

### 2.2 UI — seleção de responsáveis
No `TaskCard.tsx`, quando `current_function_key === 'captar'`:
- Multi-select de colaboradores. Primeiro selecionado → `assigned_to`; demais → `additional_assignees` (sem duplicar).
- Nos demais tipos, seletor single mantém `additional_assignees = []`.
- Chip discreto no header do card ("+1", "+2 responsáveis") quando o array não estiver vazio.

### 2.3 Kanban — exibição em várias colunas
Em `KanbanCentralPage.tsx`:
- Fetch inclui `additional_assignees`.
- Agrupamento por coluna (linhas ~2264, 2291-2292):
  ```
  card.assigned_to === userId
    → card.assigned_to === userId || (card.additional_assignees || []).includes(userId)
  ```
- Aplicar mesma lógica em `useCollaborators.tsx` para `demandCount`.
- Drag para a coluna de um co-responsável: promover esse usuário a `assigned_to` e removê-lo de `additional_assignees` (evita duplicar).
- Uma única linha no banco → Realtime já sincroniza edições feitas em qualquer coluna.

## Parte 3 — Proceed / prosseguir de etapa (NOVO)

`src/lib/proceedDemand.ts` — nas funções que avançam o card (`proceedDemand`, `assignAndProceed`, `regressDemand`):

- Detectar quando o card **está saindo** de `captar` (`OLD.current_function_key === 'captar' && NEW.current_function_key !== 'captar'`).
- Nesse caso, incluir no `updatePayload`:
  ```
  additional_assignees: []
  ```
- Efeito: fora da captação, o card volta a ter um único responsável (o novo `assigned_to` escolhido pelo fluxo). Os co-responsáveis pararam de vê-lo em suas colunas.
- Regressão (retornar a etapa anterior): também zera `additional_assignees` — quem quiser reconstituir a co-responsabilidade seleciona no card.

Nada muda para cards que já estavam em outras etapas: o array já é `{}` por default.

## Parte 4 — Registro de entregas em ambas as colunas (NOVO)

Hoje `demand_flow_history` grava uma única linha por transição, com `from_user_id = assigned_to`. O painel "Registro de entregas do colaborador" filtra por `from_user_id = <userId da coluna>`. Se só logarmos o principal, os co-responsáveis não veriam a entrega.

Correção em `proceedDemand.ts` (e onde mais chamamos `logFlowTransition`):

- Antes de zerar `additional_assignees` (Parte 3), coletar a lista `deliveringUsers = [assigned_to, ...additional_assignees]` (deduplicada, ignorando nulls).
- Ao gravar o histórico da transição, inserir **uma linha por usuário** em `demand_flow_history`, todas com o mesmo `demand_id`, `action`, `to_user_id`, `to_function_key`, `created_at`, `metadata`, variando apenas `from_user_id` e `from_function_key`.
- Como o `fetchColumnHistory` já deduplica por `demand_id` (`Map<demandId, lastSeenAt>`), o card aparece uma vez em cada coluna dos responsáveis envolvidos — que é exatamente o comportamento pedido.

`src/lib/flowHistory.ts` ganha uma variante `logFlowTransitionForUsers(userIds: string[], ...)` ou aceita `fromUserIds: string[]` opcional; o call site em `proceedDemand.ts` passa a lista completa quando o card estava em `captar`; nos demais casos passa `[assigned_to]` (comportamento atual, sem regressão).

## Fora de escopo
- Nada de RLS/permissões novo.
- Sem tabela M:N.
- Multi-select exposto só na captação.

## Verificação
- Reorganizador: card em `captar` aparece na proposta como preservado ("Captação com cliente — data mantida"), `changed=false`.
- Captação com 2 responsáveis: card aparece nas duas colunas; editar em uma reflete na outra via Realtime.
- Ao prosseguir do `captar`: `additional_assignees` fica `[]`; card some das colunas dos co-responsáveis e aparece só na do novo responsável.
- Registro de entregas: card aparece no histórico das duas colunas de origem.
- Contadores `useCollaborators.demandCount` refletem cards compartilhados enquanto o card está em `captar`.
