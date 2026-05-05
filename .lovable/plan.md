## Correções

### 1. TaskCard — renomear "Atividade" → "Instruções de Produção"

**Arquivo**: `src/components/TaskCard.tsx`, linha 940.

Trocar o `<h3>` para `Instruções de Produção`. As 5 seções fixas finais ficam: **Objetivo → Conteúdo → Instruções de Produção → CTA Recomendado → Observações**.

Mapeamento (já implementado, mantido):

- `Conteúdo` → `card.description` (texto/copy markdown — confirmado: `- Troca de óleo... Pequenos cuidados hoje...`).
- `Instruções de Produção` → `card.instructions` (sem o sufixo `CTA:`).
- `CTA Recomendado` → trecho após `\n\nCTA:` em `card.instructions`.

### 2. Nome da empresa antes do título — via prompt da IA

Mover a responsabilidade do prefixo da marca da UI para o prompt, conforme pedido.

**2a. Edge function `supabase/functions/generate-period-plans/index.ts**` (linha 343):

Alterar a especificação do JSON da demanda para instruir a IA a já entregar o título prefixado com a marca:

```text
Cada demanda: {"tipo":"...","titulo":"<NOME_FANTASIA_DA_MARCA> – <título da demanda>","objetivo":"...","conteudo":"conteúdo markdown","instrucoes_de_producao":"...","cta_recomendado":"...","canal":"...","data_sugerida":"YYYY-MM-DD"}

REGRA OBRIGATÓRIA DE TÍTULO:
- O campo "titulo" DEVE começar com o nome fantasia da marca (ou nome oficial se não houver fantasia), seguido por " – " (espaço, en-dash, espaço), e então o título do post.
- Exemplo: "D'thales Veículos – Cuidados simples que preservam o valor do seu seminovo".
- NUNCA omita o nome da marca. NUNCA use outro separador.
```

A variável usada será `${truncateText(company.fantasy_name || company.name, 120)}` interpolada explicitamente na regra para reforçar o valor exato.

**2b. UI — remover prepend duplicado**:

- `src/components/KanbanCard.tsx`: remover a renderização do `subtitle` antes do `title` no `<CardTitle>` (correção da rodada anterior). Manter apenas `{title}`. O badge `demandType` continua isolado acima.
- `src/components/Scheduled.tsx` (e outros call sites do `KanbanCard`): manter passando `subtitle`, mas como o componente não vai mais usar, pode ser removido depois — não é crítico nesta rodada.

Resultado: para demandas novas geradas pela IA, o `title` no banco já vem com `D'thales Veículos – ...`. Para demandas antigas/manuais sem prefixo, o card simplesmente exibirá o título puro (sem o nome da empresa). Se isso for problema, podemos adicionar um fallback futuro, mas o usuário pediu explicitamente que o prefixo venha do prompt.

### 3. ApproveCards — sem alteração

O título recebido da IA já contém a marca; é gravado direto em `demands.title` (linha 213/230 de `ApproveCards.tsx`).

---

## Resumo

- `src/components/TaskCard.tsx` (linha 940): renomear "Atividade" → "Instruções de Produção".
- `supabase/functions/generate-period-plans/index.ts` (~linha 343): adicionar regra de título com prefixo da marca usando `fantasy_name`.
- `src/components/KanbanCard.tsx`: remover o prepend visual do `subtitle` no `CardTitle`.
- Sem migração de banco, sem alteração em `ApproveCards.tsx` ou em `auto-generate-post`.