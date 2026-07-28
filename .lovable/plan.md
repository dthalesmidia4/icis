## Contexto

Hoje o Client Hub tem "Cronograma Atual", mas ele leva para `/plan-period?tab=history&view=latest`, ou seja, depende de um **período planejado**. Para clientes como o SmartVety, que operam por **demandas avulsas sem período**, não existe uma tela que mostre a evolução geral: o que já foi entregue, o que está em produção, em qual etapa do fluxo cada card está e o que vem a seguir.

A `CronogramaGlobal` mostra os cards do cliente em uma tabela plana ordenável, mas não expressa a **jornada pelas etapas do fluxo** (`flow_functions` + `current_function_key`) nem separa entregues × em andamento × próximos.

## Proposta: nova visão "Evolução das Demandas"

Criar uma nova página `src/pages/ClientEvolution.tsx`, acessível a partir de um novo botão no Client Hub — **"Evolução das Demandas"** — posicionado ao lado de "Cronograma Atual". Funciona para qualquer cliente, com ou sem período ativo.

### Layout

Três blocos verticais, do mais recente ao futuro:

```text
┌─────────────────────────────────────────────────────────┐
│ Resumo                                                  │
│  Total: 42   Concluídas: 18   Em andamento: 20   Fila: 4│
│  Barra de progresso (concluídas/total)                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Pipeline por etapa (visual horizontal)                  │
│                                                         │
│  Planejar → Criar arte → Revisar → Enviar cliente →     │
│  Aguardando → Publicar → Feito                          │
│   (3)         (5)         (4)       (2)     (1)  (2) (18)│
│                                                         │
│  Cada etapa clicável: expande lista dos cards nela.     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Linha do tempo por demanda                              │
│                                                         │
│  ● Card A  [Planejar][Criar arte][Revisar]…[Feito]      │
│    entregue em 12/07 · responsável atual: Lúcia          │
│  ● Card B  [Planejar][✓Criar arte][●Revisar]…            │
│    em revisão há 2 dias                                  │
│  ● Card C  [●Planejar]…                                  │
│    próxima etapa: Criar arte (Lúcia)                     │
│                                                         │
│  Cada item mostra micro-stepper com etapas: concluídas  │
│  (preenchidas), atual (destacada), futuras (outline).   │
│  Clique no card → abre o TaskCard existente.            │
└─────────────────────────────────────────────────────────┘
```

Filtros no topo: status (concluído / em andamento / atrasado), área (Mídia / Sistemas), responsável, intervalo de data (opcional).

### Fontes de dados

- **Cards**: `demands` do cliente selecionado (`client_id`), não arquivados, `is_draft=false` — igual `CronogramaGlobal`.
- **Sequência de etapas**: `flow_functions` da tenant (`active=true`, ordenado por `position`, excluindo `avaliar`), refinada por `demand_type_flow_rules` quando `requirement='required'` para o `demand_type_key` do card (mesma lógica de `resolveInitialFunction`).
- **Etapa atual do card**: `demands.current_function_key`.
- **Concluído**: status pertencente a `FINAL_STATUSES` (`feito`, `feitos`, `publicado`) — mesma regra que já usamos em `CronogramaGlobal` e no arquivamento.
- **Histórico por etapa** (opcional, tooltip): `demand_flow_history` já preenchida por `recordFlowHistory` — mostrar quando o card entrou em cada etapa.
- **Responsável atual**: `demands.assigned_to` + `profiles`.

Realtime via `useRealtimeDemands` (já existente) para refletir mudanças de etapa/assignee instantaneamente.

### Onde exibir

1. **Client Hub** (`src/pages/ClientHub.tsx`): adicionar novo card **"Evolução das Demandas"** no grid, próximo a "Cronograma Atual". Rota: `/client-evolution`.
2. Registrar a rota em `src/App.tsx` protegida por `ProtectedRoute` + `RequireTenant`, exigindo `selectedClient`.
3. Não substitui "Cronograma Atual" — este continua útil para tabela ordenável de datas.

### Detalhes técnicos

- Novos arquivos:
  - `src/pages/ClientEvolution.tsx` — página com os três blocos.
  - `src/components/evolution/StageProgressBar.tsx` — pipeline horizontal com contagem por etapa.
  - `src/components/evolution/DemandTimelineRow.tsx` — micro-stepper por card.
- Reuso:
  - `TaskCard` para edição ao clicar no card.
  - `resolveInitialFunction` / lógica de `demand_type_flow_rules` para calcular a sequência esperada por tipo de demanda.
  - Hook `useRealtimeDemands` para live-update.
- Sem migração de banco. Sem alteração em edge functions.
- Ordenação padrão da linha do tempo: cards em andamento primeiro (por `updated_at desc`), depois concluídos (por `updated_at desc`), fila/sem etapa por último.

### Fora do escopo

- Não altera "Cronograma Atual" nem `CronogramaGlobal`.
- Não muda fluxo, permissões, ou schema.
- Não gera relatórios exportáveis (pode ser feito depois se pedido).