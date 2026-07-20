## Ajustes UI Kanban Central + Backfill "Sem etapa"

### 1. InlineDates: uma linha só (voltar layout anterior)
Em `src/components/KanbanCard.tsx`, o componente `InlineDates` voltará ao layout horizontal em linha única: início à esquerda, término à direita, no formato compacto (ex.: `Ini: 20/07 15:30 · Fim: 20/07 16:30`), truncando com ellipsis se faltar espaço. O popover continua abrindo os dois calendários lado a lado ao clicar.

### 2. Tab entre horários no popover de datas
No popover de `InlineDates`, os inputs `time` de início e término receberão `tabIndex` sequenciais e o input de início terá `onKeyDown` que intercepta `Tab` (sem shift) para focar explicitamente o input de término via `ref`. Isso garante que Tab pule do hh:mm de início direto para o hh:mm de término, ignorando eventuais botões do calendário entre eles.

### 3. Respiro lateral na tela Visão Geral
Em `src/pages/KanbanCentralPage.tsx`, ajustar o container raiz para incluir padding horizontal (ex.: `px-6`) para que:
- Cabeçalho ("Visão geral das Tarefas" + botões Registro/Novo Status/Nova Demanda) não encoste na sidebar à esquerda nem na borda direita.
- Barra de busca e filtros também respeitem o mesmo respiro.

### 4. Alinhamento do avatar "DM" na sidebar com o cabeçalho
Na sidebar (`src/components/AppSidebar.tsx` ou equivalente), reduzir a altura do bloco superior do avatar de usuário para que sua base inferior alinhe com a base inferior do cabeçalho "Visão geral das Tarefas". Ajuste via `h-*`/`py-*` no header da sidebar para bater com a altura efetiva do header da página (a confirmar lendo os dois arquivos).

### 5. Migração: backfill dos cards "Sem etapa" da Lúcia (e demais órfãos)
Migration SQL que:
- Seleciona demandas ativas (não arquivadas, não em `feito`/`enviar_cliente`) com `current_function_key IS NULL`.
- Para cada uma, resolve a primeira função ativa de revisão do fluxo do tenant/tipo (mesma lógica de `resolveInitialFunction`, priorizando função de revisão quando existir; caso contrário, primeira função ativa do fluxo).
- Atualiza `current_function_key` e, se `assigned_to` estiver nulo, atribui ao responsável padrão da função.
- Insere linha em `demand_flow_history` marcando o backfill (`action = 'backfill_initial_function'`).

Executada uma vez para corrigir os ~22 cards órfãos existentes (incluindo os da coluna Lúcia visíveis como "Sem etapa" em Agendar Publicação).

### Detalhes técnicos
- Arquivos alterados: `src/components/KanbanCard.tsx`, `src/pages/KanbanCentralPage.tsx`, arquivo da sidebar (a identificar), + 1 migração SQL.
- Sem alteração de contratos de dados; sem novos endpoints.
- Realtime e demais fluxos permanecem intactos.
