
## Diagnóstico confirmado

Em `src/lib/reorderSequence.ts`, `sortForReorder` (linhas 409-419) ordena os cards **apenas por `publish_date`** e joga os sem publish_date para o fim. Isso descarta a ordem manual da coluna e desloca o card que o colaborador já está executando. Como a regra "primeiro card em atraso preserva início + ganha folga" (linhas 466-485) usa o índice **após** o sort, ela cai no card errado — no seu print, iria beneficiar "Revisar aquisição" no lugar de "Liberar Taxas".

## Correções

### 1. Card em execução sempre no topo

O primeiro card da coluna pela ordem atual (menor `due_date`+`due_time`) é o "em execução". Ele sempre ocupa o índice 0 do resultado, preserva o `due_date`/`due_time` original como início e ganha folga proporcional se atrasado. Vale independente do modo escolhido abaixo.

### 2. Modo de priorização escolhido pelo usuário

Adicionar um toggle no `ReorderSequenceModal` que aparece **somente quando houver ≥ 1 card ativo (fora o em execução) com `publish_date` definido**. Se todos os ativos restantes forem sem `publish_date`, o toggle nem é renderizado e o modo é fixo "sequência atual".

Dois modos:

- **Preservar sequência atual** (padrão): cards restantes ordenados pela ordem atual da coluna (`due_date`+`due_time` ascendente, nulos ao fim). Ignora `publish_date` no sort — ele continua sendo usado só para gerar aviso quando o cronograma final passar do prazo.
- **Priorizar data de publicação**: cards restantes ordenados por `publish_date`+`publish_time` ascendente; nulos vão depois, mantendo entre si a ordem atual da coluna (estável).

O card em execução (índice 0) **não** é afetado pelo modo — é sempre preservado.

### 3. Persistência da escolha

Salvar em `localStorage` por tenant (`reorder-priority-mode:<tenantId>`) apenas para lembrar a preferência entre aberturas do modal. Sem migração, sem tabela.

## Alterações por arquivo

**`src/lib/reorderSequence.ts`**
- Reescrever `sortForReorder(cards, opts?: { prioritizePublishDate?: boolean })`:
  - Identificar `inProgress` = primeiro card ativo por `due_date`+`due_time` asc.
  - Restante ordenado conforme `prioritizePublishDate` (padrão `false` = ordem atual da coluna).
  - Retornar `[inProgress, ...rest]`.
- `computeReorder(cards, opts?)` recebe `prioritizePublishDate?: boolean` e repassa para `sortForReorder`. Nenhuma outra mudança na lógica (folga, split multi-dia, feriados, almoço, matriz de duração).
- Expor helper `hasPublishDateCandidates(cards)` para o modal decidir se mostra o toggle.

**`src/components/kanban/ReorderSequenceModal.tsx`**
- Estado local `prioritizeByPublish` inicializado a partir do `localStorage`.
- Renderizar toggle (Switch + label curto: "Priorizar cards com data de publicação") apenas se `hasPublishDateCandidates(activeCards)` for verdadeiro.
- Recalcular a proposta quando o toggle muda (chamar `computeReorder` de novo com o novo modo).
- Persistir escolha no `localStorage` ao alternar.

## Verificação mental (seu print)

Ativos do Eric: Liberar Taxas (due 27/07 13:30, sem publish), Revisar aquisição (due 27/07 17:00), SESMAP (due 27/07 17:30), Templates (due 29/07 08:00).

- Nenhum card restante tem `publish_date` → toggle **não aparece** → modo "sequência atual" aplicado.
- `inProgress` = Liberar Taxas → índice 0, preserva 27/07 13:30, ganha folga (atraso + 30%).
- Restante: Revisar aquisição → SESMAP → Templates.

Se algum tivesse `publish_date`, o toggle apareceria e você decidiria se ele sobe entre os "rest" ou não; o Liberar Taxas seguiria em 1º de qualquer forma.

## Detalhes técnicos

- Escopo: `src/lib/reorderSequence.ts` e `src/components/kanban/ReorderSequenceModal.tsx`. Sem migrações, edge functions, contextos globais ou mudança no schema.
- Backward compatível: chamadas sem `prioritizePublishDate` mantêm padrão "sequência atual", que é o comportamento correto pedido.
- Nada muda em `allocateAcrossDays`, `estimateDurationBase`, matriz de duração, tratamento de feriados/almoço ou de `aguardando_cliente`.
