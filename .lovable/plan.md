## Plano corrigido

### 1. Nome da empresa antes do título do card (KanbanCard)

**Arquivo**: `src/components/KanbanCard.tsx` + `src/components/Scheduled.tsx` (origem do `subtitle`).

Hoje `subtitle` (nome da empresa, ex: "D'thales Veículos") é renderizado em uma linha **acima** do título, em texto pequeno cinza (linha 71–73). O usuário quer o nome da empresa **no mesmo h3 do título**, antes dele — formato `D'thales Veículos – Cuidados simples...`.

Mudança em `KanbanCard.tsx` (linhas 70–82):

- Remover a linha separada do `subtitle`.
- Manter o badge `demandType` na linha de cima (sozinho).
- Renderizar `<CardTitle>` como: `{subtitle && <span className="text-muted-foreground font-normal">{subtitle} – </span>}{title}`.

Sem alterações em `auto-generate-post` (a imagem continua sem nome da marca como sobre-título — não era o desejo).

### 2. Adicionar seções "Conteúdo" e "CTA Recomendado" no TaskCard (não colapsáveis)

**Arquivo**: `src/components/TaskCard.tsx`.

Mapeamento correto (confirmado pelo usuário):

- **Atividade** → continua exibindo `card.instructions` (Instruções de Produção). Apenas trocar a fonte de dados de `description` para `instructions` e ajustar o `placeholder` para "Instruções de produção visual...".
- **Conteúdo** (NOVA seção) → exibe `card.description`. Inserir entre "Objetivo" e "Atividade".
- **CTA Recomendado** (NOVA seção) → extrair o sufixo `CTA: ...` de `card.instructions` ao exibir; salvar de volta concatenando em `instructions`. Inserir entre "Atividade" e "Observações".

Todas as 5 seções renderizadas de forma **fixa** (sem botão de colapsar / sem ChevronRight/Down). Mantém o ícone + título uppercase + `BlockEditor` no padrão visual atual, apenas substituindo o `<button onClick={toggleSection}>` por uma `<div>` estática.

Persistência:

- "Conteúdo" usa `handleFieldSave('description', ...)`.
- "Atividade" e "CTA Recomendado" usam `handleFieldSave('instructions', ...)`. O CTA é serializado como sufixo `\n\nCTA: <texto>` — na leitura, separamos: tudo antes de `\n\nCTA:` vai para Atividade, o resto para CTA. Isso evita migração de schema.

### 3. ApproveCards.tsx — ajuste de separador

Garantir que a aprovação grave `instructions` no formato esperado pelo parser:

```ts
const instructionParts = [
  instrucoes || '',
  cta ? `CTA: ${cta}` : ''
].filter(Boolean);
// join com '\n\n'
```

(praticamente igual ao atual; só padroniza o separador exato `\n\nCTA:` para o split funcionar).

### 4. Item 3 do usuário (título card vs imagem)

Sem ação. Confirmado que ambos usam `demand.title`.

---

## Resumo das mudanças

- `KanbanCard.tsx`: nome da empresa colado antes do título no `<CardTitle>`.
- `TaskCard.tsx`: 5 seções fixas — Objetivo, **Conteúdo** (nova, lê `description`), Atividade (passa a ler `instructions`), **CTA Recomendado** (nova, parseado de `instructions`), Observações. Sem colapsáveis.
- `ApproveCards.tsx`: padronizar separador `\n\nCTA:` ao salvar.
- Sem migração de banco, sem mudança em edge functions.