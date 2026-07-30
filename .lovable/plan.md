## 1. Registro de entregas: mostrar a etapa realmente entregue

**Situação confirmada:** no Registro, o card renderizado é o card *ao vivo*, então o subtítulo mostra a etapa **atual** dele (`current_function_key = editar_video`). Mas a linha do histórico da Letícia hoje é `from_function_key = captar` → ela entregou a **captação**, não a edição de vídeo. Logo o card deve continuar aparecendo no registro (está certo), apenas com o rótulo correto.

Correção:
- `fetchColumnHistory` (`src/pages/KanbanCentralPage.tsx`) passa a selecionar também `from_function_key`, `to_function_key` e `action`, guardando-os junto de `demandId`/`lastSeenAt`.
- Ao montar `historyColumnCards` no modo Registro, sobrescrever o `current_function_key` do card clonado pela **etapa entregue** daquela linha (`from_function_key`), de modo que o subtítulo e o chip do card mostrem "Captar" em vez de "Editar vídeo".
- Se o mesmo colaborador entregou mais de uma etapa do mesmo card dentro do período filtrado, listar uma entrada por etapa (chave `demandId + etapa`), ordenadas pelo horário — assim "captar" e "editar vídeo" aparecem separadamente quando for o caso.
- Fallback: se `from_function_key` for nulo (histórico antigo), manter o comportamento atual.
- Nenhuma mudança em modo normal do Kanban, foco, reordenação ou gravação de histórico — só a leitura do Registro.

## 2. Botão "Cliente aprovou" mais útil

Hoje é um botão compacto alinhado à direita, sem indicar o destino. Novo comportamento em `src/components/kanban/AwaitingClientActions.tsx`:

- O botão passa a ocupar a largura do bloco (centralizado, logo abaixo do pill azul), com o rótulo:
  `Cliente aprovou · Enviar para {próxima etapa} →`
  Ex.: `Cliente aprovou · Enviar para Publicar →`
- A próxima etapa é resolvida com `getPipelineSequence(tenantId, demandTypeKey)` (já existente em `proceedDemand.ts`): pega a etapa seguinte a `aguardando_cliente` na sequência exigida do tipo do card.
- Enquanto carrega ou se não houver etapa seguinte identificável, o rótulo cai para `Cliente aprovou →` (sem quebrar nada).
- Mantém o clique em dois passos (segundo clique confirma), agora com texto `Confirmar envio para {etapa}?`.
- A ação executada continua exatamente a mesma (`proceedDemand`), sem alteração de fluxo.

## Detalhes técnicos

- Arquivos: `src/pages/KanbanCentralPage.tsx`, `src/components/kanban/AwaitingClientActions.tsx`, e ajuste mínimo de layout em `src/components/KanbanCard.tsx` (o container das ações passa de `justify-end` para largura total).
- A sequência de etapas é buscada uma vez por combinação tenant + tipo de card e memoizada em módulo, evitando uma query por card na coluna.
- Sem migrações de banco.
