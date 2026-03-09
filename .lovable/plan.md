

# Unificar Campos de Descricao no Padrao ClickUp

## Analise: O que ja temos vs O que precisa mudar

### O que ja temos (e esta funcionando bem)

| Recurso ClickUp | Status atual | Detalhes |
|---|---|---|
| Editor TipTap com blocos | Ja implementado | StarterKit completo com headings, listas, code blocks, blockquote |
| Slash commands (/) | Ja implementado | Menu com 12 tipos de bloco, filtro por texto, navegacao por teclado |
| Checklists interativas | Ja implementado | TaskList/TaskItem com aninhamento via Tab/Shift+Tab |
| Blocos colapsaveis (Toggle) | Ja implementado | Extension Details com summary/content |
| Autosave com debounce | Ja implementado | 300ms debounce + indicador saving/saved |
| Toolbar fixa | Ja implementada | Undo/Redo, formatacao, blocos, link |
| BubbleMenu (selecao) | Ja implementado | Formatacao rapida ao selecionar texto |
| Header com titulo editavel | Ja implementado | Titulo inline + status + prioridade derivada |
| Layout 2 colunas | Ja implementado | 65% conteudo / 35% metadados |
| Campos estruturados separados | Ja implementado | Status, datas, responsaveis no header e sidebar direita |

### O que NAO vamos implementar (fora de escopo)

- Comentarios / threads (usuario descartou explicitamente)
- Activity log (usuario descartou explicitamente)
- @Mencoes (fase futura)
- Migracao HTML para JSON (fase futura - risco alto, baixo beneficio imediato)
- Colaboracao real-time (fase futura)
- Tabelas no editor (pode ser adicionado depois como slash command)

---

## Mudanca principal: Unificar 3 campos em 1 editor unico

### Problema atual

O TaskCard tem 3 BlockEditors separados, cada um com sua propria toolbar, dentro de secoes colapsaveis:

```text
+---------------------------+
| [v] Objetivo              |  <- BlockEditor proprio (minHeight 80px)
|   [toolbar completa]      |
|   [area de edicao]        |
|---------------------------|
| [v] Atividade             |  <- BlockEditor proprio (minHeight 200px)
|   [toolbar completa]      |
|   [area de edicao]        |
+---------------------------+

+---------------------------+
| [v] Observacoes           |  <- BlockEditor proprio (minHeight 100px)
|   [toolbar completa]      |
|   [area de edicao]        |
+---------------------------+
```

Isso resulta em:
- 3 toolbars repetidas (poluicao visual)
- 3 instancias de TipTap rodando simultaneamente
- Campos com tamanhos exorbitantes que ocupam muito espaco
- Experiencia fragmentada - nao parece um documento unico

### Solucao: 1 editor unico com separadores internos

Juntar os 3 campos (`objective`, `description`, `observations`) em um unico campo `description` usando separadores visuais (headings) dentro do proprio editor, no estilo ClickUp onde a descricao e um unico documento livre.

```text
+------------------------------------------+
| [toolbar unica]                          |
|------------------------------------------|
| ## Objetivo                              |
| Qual e a finalidade estrategica...       |
|                                          |
| ## Atividade                             |
| Copy, roteiros, frames...               |
|                                          |
| ## Observacoes                           |
| Feedbacks, ajustes...                    |
+------------------------------------------+
```

---

## Plano tecnico

### 1. Criar funcao de merge dos 3 campos em 1

No `TaskCard.tsx`, criar uma funcao que concatena o conteudo dos 3 campos em um unico HTML com headings como separadores:

- Se `objective` tem conteudo -> adiciona `<h2>Objetivo</h2>` + conteudo
- Se `description` tem conteudo -> adiciona `<h2>Atividade</h2>` + conteudo
- Se `observations` tem conteudo -> adiciona `<h2>Observacoes</h2>` + conteudo

### 2. Criar funcao de split para salvar

Ao salvar, parsear o HTML do editor e dividir de volta nos 3 campos do banco:
- Conteudo antes do primeiro H2 ou entre `## Objetivo` e proximo H2 -> salva em `objective`
- Conteudo entre `## Atividade` e proximo H2 -> salva em `description`
- Conteudo apos `## Observacoes` -> salva em `observations`

Isso mantem compatibilidade total com o banco de dados existente (sem migracoes).

### 3. Substituir os 3 BlockEditors por 1

No `TaskCard.tsx`:
- Remover as 3 secoes colapsaveis (Objetivo, Atividade, Observacoes)
- Colocar um unico `BlockEditor` que ocupa a coluna esquerda inteira
- Aumentar o `minHeight` para algo como `400px` para dar espaco ao documento completo
- O placeholder inicial tera os 3 headings pre-populados quando o documento esta vazio

### 4. Ajuste no BlockEditor.tsx

- Nenhuma mudanca estrutural necessaria no componente em si
- O editor ja suporta headings, todos os blocos, slash commands, etc.
- Apenas garantir que o `minHeight` funcione bem para documentos maiores

### 5. Ajuste na funcao `parseClientSlides`

- Continua funcionando pois le o campo `description` que sera salvo normalmente

### 6. Leitura read-only

- Substituir os 3 `dangerouslySetInnerHTML` por um unico bloco renderizando o documento mergeado

---

## Arquivos impactados

| Arquivo | Mudanca |
|---|---|
| `src/components/TaskCard.tsx` | Substituir 3 editors por 1; funcoes merge/split; remover secoes colapsaveis de conteudo |

### O que NAO muda

- `BlockEditor.tsx` - nenhuma alteracao
- Banco de dados - nenhuma migracao (os 3 campos continuam existindo)
- Props/API do TaskCard - mesma interface
- Sidebar direita (datas, acoes, anexos) - intocada
- Header (titulo, status, prioridade) - intocado
- Logica de save/upload/delete - mesma
- Paginas consumidoras (KanbanCentralPage, PeriodClientList, Scheduled) - sem mudanca

