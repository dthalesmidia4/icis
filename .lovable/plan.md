## Objetivo

Cards em `aguardando_cliente` saíram da fila operacional, mas ainda exibem "Ini/Fim" como se tivessem execução agendada. Vamos trocar essa exibição por "Enviado ao cliente" e permitir aprovar o card direto na coluna, sem abrir o modal.

## 1. Exibição: trocar Ini/Fim por "Enviado ao cliente + Data e Horário de Envio"

Em `src/components/KanbanCard.tsx`, adicionar um modo alternativo de rodapé (nova prop, ex. `awaitingClientSince?: string | null` + `hideExecutionDates?: boolean`):

- Quando ativo, no lugar do bloco `InlineDates` mostrar uma pílula azul: `Enviado ao cliente · 29/07 15:40`.
- Formato relativo curto ao lado quando fizer sentido (`há 2h`, `há 3d`) — reaproveitando o cálculo que hoje já existe na seção "Aguardando clientes".
- Sem estado "atrasado" vermelho: esses cards não têm prazo operacional, então o destaque vermelho atual desaparece.
- Sem popover de edição de datas nesse modo (as datas voltam a ser editáveis quando o card retorna ao fluxo).

A data usada é `client_wait_started_at`, já preenchido em `src/lib/proceedDemand.ts` na transição `enviar_cliente → aguardando_cliente`. Se estiver nulo (cards antigos), mostrar apenas "Aguardando cliente" sem hora.

## 2. Aprovação rápida na coluna

Abaixo de cada card da seção "Aguardando clientes" (em `src/pages/KanbanCentralPage.tsx`), adicionar um botão discreto **"Cliente aprovou"**:

- Ao clicar (com `stopPropagation` para não abrir o card), chama `proceedDemand` com o card atual — mesma função usada hoje pelo botão dentro do modal, o que garante limpeza de `client_wait_started_at` / `client_resend_count` e o registro em `demand_flow_history`.
- Confirmação leve inline (o botão vira "Confirmar?" antes de executar) para evitar clique acidental, com estado de loading e proteção contra clique duplo.
- Toast de sucesso informando a etapa de destino, e toast de erro em caso de falha.
- Realtime já atualiza a coluna; a lista é recarregada via o mesmo callback usado pelas outras ações.

O botão respeita as permissões já existentes na coluna (só aparece para quem pode operar aquele card).

## 3. Onde mais aplicar

Aplicar o mesmo tratamento visual na lista equivalente de `src/pages/CollaboratorDemands.tsx` (seção `aguardando_cliente`) e no Modo Foco, que reutiliza a mesma seção do Kanban Central — assim a leitura fica consistente em todas as visões.

## Detalhes técnicos

- Arquivos: `src/components/KanbanCard.tsx`, `src/pages/KanbanCentralPage.tsx`, `src/pages/CollaboratorDemands.tsx`.
- Nenhuma migração de banco: `client_wait_started_at`, `client_resend_count` e `demand_flow_history` já existem.
- Nenhuma mudança em `reorderSequence.ts` — esses cards já estão fora da fila operacional.
- Cores via tokens semânticos existentes (paleta azul já usada na seção "Aguardando clientes").