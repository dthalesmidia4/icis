

## Plano: Classificação nos Cards do Kanban + Regeneração de Conteúdo

### Problema atual
1. Os cards no Kanban mostram apenas "Cliente - Título", sem indicar o tipo (Carrossel, Post Estático, etc.)
2. Não existe forma de regenerar conteúdo gerado por IA dentro do TaskCard -- só gerar do zero

---

### Parte 1: Mostrar classificação no KanbanCard

O campo `demand_type` já existe na tabela `demands` e no `KanbanCardData`. Só precisa ser exibido.

**Arquivo: `src/components/KanbanCard.tsx`**
- Adicionar prop `demandType?: string`
- Exibir um Badge ao lado do subtitle (nome do cliente) com o tipo, ex: `Statera - Carrossel`
- Formato visual: `subtitle` fica "Cliente • Tipo" ou Badge colorido separado

**Arquivo: `src/pages/KanbanCentralPage.tsx`**
- Passar `demandType={card.demand_type}` para o `KanbanCard`
- O subtitle que hoje é `card.clientName` passaria a incluir o tipo: `${card.clientName} • ${card.demand_type}`

Impacto mínimo -- só adição de uma prop e ajuste de texto.

---

### Parte 2: Botões de regeneração na aba Anexos do TaskCard

**Arquivo: `src/components/TaskCard.tsx`**

Adicionar dois botões na seção de Anexos (abaixo do botão "Gerar estáticos com IA" existente):

1. **"Regenerar tudo"** -- Regenera todas as imagens do card
   - Move os anexos atuais (gerados por IA) para um histórico salvo no campo `observations` ou em metadata
   - Chama `generate-post-image` (para estáticos) ou `auto-generate-carousel` (para carrosséis) baseado no `demand_type`
   - Os anexos antigos ficam registrados para referência

2. **"Regenerar Slide X"** -- Aparece apenas para carrosséis (quando há múltiplos anexos)
   - Mostra um dropdown/lista dos slides existentes
   - Ao selecionar um slide, chama `generate-post-image` com `slideNumber` específico
   - Substitui apenas aquele anexo na lista, mantendo os demais

**Lógica de detecção do tipo:**
- Se `card.demand_type` contém "Carrossel" → mostra opção de slide individual
- Se "Post Estático" ou outro → mostra apenas regeneração completa

**Histórico de rejeições:**
- Antes de regenerar, os anexos atuais são salvos no campo `observations` do card como referência (ex: "[Versão anterior: URL1, URL2]")
- Alternativa mais limpa: criar um array `rejected_attachments` no JSON de `attachments` ou usar o campo `metadata` da demands (não existe ainda -- seria necessária migração)

---

### Parte 3: Edge function - suporte a regeneração de slide individual

**Arquivo: `supabase/functions/generate-post-image/index.ts`**
- Já aceita `slideNumber` como parâmetro -- verificar se funciona para substituir um slide específico sem afetar os outros
- Ajustar para que, quando `slideNumber` é passado, apenas aquele slide seja substituído nos `attachments`

**Arquivo: `supabase/functions/auto-generate-carousel/index.ts`**
- Já suporta regeneração completa -- nenhuma alteração necessária

---

### Parte 4: Migração (opcional mas recomendada)

Adicionar campo na tabela `demands` para guardar histórico de versões rejeitadas:

```sql
ALTER TABLE demands ADD COLUMN IF NOT EXISTS rejected_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Isso permite salvar os anexos anteriores de forma estruturada em vez de jogá-los em `observations`.

---

### Resumo das alterações

| Arquivo | Mudança |
|---------|---------|
| `KanbanCard.tsx` | Mostrar `demand_type` como badge/texto junto ao cliente |
| `KanbanCentralPage.tsx` | Passar `demand_type` no subtitle do KanbanCard |
| `TaskCard.tsx` | Adicionar botões "Regenerar tudo" e "Regenerar Slide X" na seção Anexos |
| `generate-post-image/index.ts` | Verificar suporte a substituição de slide individual |
| Migração SQL | Adicionar coluna `rejected_attachments` em `demands` |

