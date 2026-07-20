## Objetivo
Levar duas melhorias do Kanban Central para o **Modo Foco** (`/colaboradores/:userId`):

1. Agrupar demandas **Aguardando clientes** e **Em revisão**, com as mesmas regras e comportamento de colapso do Kanban.
2. Exibir o **nome da empresa antes do título** na linha da tabela, como já aparece nos cards.

## Regras de agrupamento (idênticas ao Kanban Central)
- **Aguardando clientes**: cards cujo `current_function_key === 'aguardando_cliente'`. Sempre agrupa quando há ao menos 1.
- **Em revisão**: cards cujo `isReviewFunction(current_function_key)` retorna true. Só agrupa quando houver **3 ou mais**; caso contrário, ficam misturados na lista principal.
- **Principais**: todos os demais.
- Ambos os grupos iniciam **recolhidos** por padrão. O estado de expansão é local à página (não precisa persistir entre sessões).

## Layout
Manter a tabela atual, mas quebrá-la em seções:

```text
[Tabela principal]  cards que não são awaiting nem review
[Header colapsável] Aguardando clientes (N)
   [Tabela filha]   linhas dos awaiting (quando expandido)
[Header colapsável] Em revisão (N)
   [Tabela filha]   linhas dos review (quando expandido, só se >=3)
```

- Os headers de grupo usam o mesmo visual dos grupos do Kanban Central (chevron + rótulo + contador).
- As tabelas filhas reutilizam o mesmo `<TableHeader>` (ordenação já se aplica dentro de cada grupo via a mesma `sortedCards`).
- Se algum grupo está vazio, não renderiza.

## Nome da empresa antes do título
Na coluna "Nome da demanda", substituir apenas o título por:

```tsx
<div className="flex flex-col gap-0.5">
  {card.clientName && (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
      {card.clientName}
    </span>
  )}
  <span className="uppercase tracking-wide text-sm">{card.title}</span>
</div>
```

- `clientName` já é populado no fetch atual (via `tenant_companies`), sem mudança de query.
- Preservar o modo de edição inline sem alterar sua UI.

## Detalhes técnicos
- Adicionar `import { isReviewFunction } from "@/lib/flowFunctions"`.
- Estados: `const [awaitingOpen, setAwaitingOpen] = useState(false)` e `const [reviewOpen, setReviewOpen] = useState(false)`.
- Derivar `awaitingCards`, `reviewCards` e `mainCards` a partir de `sortedCards`. Usar `shouldGroupReview = reviewCandidateCards.length >= 3` para decidir se o grupo Em revisão aparece.
- Reaproveitar o componente `TableRow` já existente encapsulando o render de uma linha em uma função local `renderRow(card)` para evitar duplicação entre as três seções.
- `totalCards` continua sendo `cards.length` (não muda o badge do header).

## Fora de escopo
- Alterar ordenação, edição inline, `TaskCard` modal ou realtime.
- Mudar a coluna "Responsável" (segue mostrando o nome do colaborador atual).
