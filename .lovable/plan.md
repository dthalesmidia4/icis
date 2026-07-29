## Auditoria: Reorganizador Automático de Sequência

Percorri `computeReorder`, o modal e a integração no Kanban Central. **Base funcional está sólida** (respeita expediente, almoço, área, feriados, blocos por dia, atraso com folga, `aguardando_cliente` e `captar` protegidos). Mas há **6 pontas soltas** — 2 delas com potencial de causar decisões erradas em produção.

### Riscos identificados

**🔴 Alto risco**

1. **Reorganiza sobre um recorte filtrado** — `KanbanCentralPage.tsx` passa `filteredCards` para o modal. Se o gestor tem filtro ativo (cliente/período/área), a sequência é calculada ignorando cards que ficam fora do filtro mas continuam ocupando a agenda do colaborador. Resultado: **colisões silenciosas** com cards não visíveis. Deve usar o conjunto completo daquele colaborador (independente de filtros), ou avisar no modal que há filtros ativos.

2. **Sem lock otimista no `handleApply`** — o loop faz `update` por card sem checar `updated_at`. Se o card foi movido/editado enquanto o modal estava aberto (Realtime rodando), a reorganização sobrescreve mudanças recentes sem aviso. Falhas no meio do loop deixam o estado parcialmente aplicado, sem rollback nem toast de detalhe.

**🟡 Médio risco**

3. **Cards com `additional_assignees` (co-responsáveis de `captar`)** — o filtro `c.assigned_to === reorderModalColumnId` só pega o primário. Como `captar` já é skipped, o único efeito é o co-responsável não ver o card fixo na sua proposta. Cosmético, mas confuso.

4. **`is_daily_card` entra na fila** — recebe `20min` e é reagendado, mas cards diários têm ciclo próprio (`daily_next_date`). Reordenar `due_date/delivery_date` deles pode conflitar com a lógica de recorrência. Devem ser skipped como `captar`/`aguardando_cliente`.

**🟢 Baixo risco (documentar)**

5. **Etapas `enviar_cliente` / `publicar` / `revisar_publicacao`** entram no reorder ativo com duração de 5min. Não tocam `publish_date` (dispatch fica intacto), então é seguro — mas o reagendamento do `due_date` pode dar sinal visual esquisito ("prazo passou") em cards já publicáveis. Considerar tratar como fixed.

6. **Sem "desfazer"** — não há snapshot pré-aplicação. Um clique desatento em "Aplicar reorganização" mexe em N cards e o único caminho de volta é editar um a um.

### Correções propostas (mínimas, escopo cirúrgico)

- **Modal (`ReorderSequenceModal.tsx`)**
  - Aplicar em batch com `Promise.all` + captura de `updated_at` original por card; adicionar cláusula `.eq('updated_at', original)` no update; contar conflitos e exibir toast dedicado ("N cards mudaram durante a análise — reabra o modal").
  - Adicionar banner quando `props.hasActiveFilters` for true: "Filtros ativos — a sequência considera apenas os cards visíveis."

- **KanbanCentralPage (integração)**
  - Buscar os cards do colaborador a partir de `allCards` (não `filteredCards`), OU passar `hasActiveFilters` para o banner acima.
  - Alternativa preferida: usar `allCards.filter(c => c.assigned_to === reorderModalColumnId || (c.additional_assignees||[]).includes(reorderModalColumnId))` — fecha o item 3 no mesmo passo.

- **`reorderSequence.ts`**
  - Adicionar `is_daily_card` ao filtro fixo (mesmo tratamento de `captar`): retorna proposta `skipped:true` com aviso "Card diário — ciclo próprio".
  - Opcional: incluir `publicar` e `revisar_publicacao` como fixos se o card já tiver `publish_date` futura agendada.

- **UX (opcional)**
  - Em `handleApply`, antes do loop, guardar `{id, due_date, due_time, delivery_date, delivery_time}` de cada card afetado num ref. Toast final com botão "Desfazer" que reaplica o snapshot (10s).

### Fora de escopo
- Não mudar duração da matriz.
- Não alterar cálculo de atraso/slack — está correto.
- Não tocar `scheduled_publication_dispatches` (o reorder já não mexe em `publish_date`, e deve continuar assim).

### Verificação após aplicação
- Filtrar por 1 cliente e reorganizar: banner aparece; se ignorar o banner, os cards de outros clientes do mesmo colaborador continuam intactos.
- Editar um card em outra aba enquanto o modal está aberto → aplicar → toast informa conflito, card editado não é sobrescrito.
- Card `is_daily_card` na coluna aparece com badge "diário — não reagendado".
- Erro no meio do loop → toast lista IDs que falharam; sucessos permanecem.
