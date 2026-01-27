
# Plano de Correção: Persistência de Anexos em Demandas

## Diagnóstico do Problema

Identifiquei a **causa raiz** por que os anexos estão desaparecendo das demandas. O problema está nas funções de upload, remoção e reordenação de anexos em múltiplos arquivos:

### Problema Central
As funções `handleFileUpload`, `handleRemoveAttachment` e `handleReorderAttachments` estão **sempre atualizando a tabela `cards`**, mesmo quando o item é uma **demanda** (que deve usar a tabela `demands`).

Quando você faz upload de um anexo em uma demanda:
1. O arquivo é enviado para o storage corretamente
2. O sistema tenta salvar na tabela `cards` com o ID da demanda
3. Como não existe nenhum registro na tabela `cards` com esse ID, a atualização simplesmente não afeta nada
4. Resultado: o anexo parece salvo localmente (estado da UI) mas **nunca foi persistido**

### Arquivos Afetados

| Arquivo | Função | Status |
|---------|--------|--------|
| `src/pages/Schedule.tsx` | `handleFileUpload` | Sempre usa `cards` |
| `src/pages/Schedule.tsx` | `handleRemoveAttachment` | Sempre usa `cards` |
| `src/pages/Schedule.tsx` | `handleReorderAttachments` | Sempre usa `cards` |
| `src/components/CentralKanban.tsx` | `handleFileUpload` | Sempre usa `cards` |
| `src/components/CentralKanban.tsx` | `handleRemoveAttachment` | Sempre usa `cards` |
| `src/components/CentralKanban.tsx` | `handleReorderAttachments` | Sempre usa `cards` |
| `src/pages/KanbanCentralPage.tsx` | `handleFileUpload` | Sempre usa `cards` |
| `src/pages/KanbanCentralPage.tsx` | `handleRemoveAttachment` | Sempre usa `cards` |
| `src/pages/KanbanCentralPage.tsx` | `handleReorderAttachments` | Correto (já verifica source) |

---

## Solução Proposta

### Estratégia
Adicionar verificação `selectedCard.source === 'demand'` em todas as funções de manipulação de anexos para usar a tabela correta (`demands` ou `cards`).

### Alterações Detalhadas

#### 1. `src/pages/Schedule.tsx`

**handleFileUpload** (linhas ~747-753)
```typescript
// ANTES (errado)
const { error: updateError } = await supabase
  .from('cards')
  .update({ attachments: ... })
  .eq('id', selectedCard.id);

// DEPOIS (correto)
const tableName = selectedCard.source === 'demand' ? 'demands' : 'cards';
const { error: updateError } = await supabase
  .from(tableName)
  .update({ 
    attachments: updatedAttachments,
    updated_at: new Date().toISOString()
  })
  .eq('id', selectedCard.id);
```

**handleRemoveAttachment** (linhas ~836-842)
```typescript
// Mesma lógica: verificar source antes de escolher tabela
const tableName = selectedCard.source === 'demand' ? 'demands' : 'cards';
```

**handleReorderAttachments** (linhas ~873-879)
```typescript
// Mesma lógica: verificar source antes de escolher tabela
const tableName = selectedCard.source === 'demand' ? 'demands' : 'cards';
```

#### 2. `src/components/CentralKanban.tsx`

**handleFileUpload** (linhas ~497-501)
```typescript
// Adicionar verificação de source
if (selectedCard.source === 'demand') {
  await supabase.from('demands').update({ attachments: ... }).eq('id', ...);
} else {
  await supabase.from('cards').update({ attachments: ... }).eq('id', ...);
}
```

**handleRemoveAttachment** (linhas ~530-534)
```typescript
// Mesma correção
```

**handleReorderAttachments** (linhas ~557-563)
```typescript
// Mesma correção
```

#### 3. `src/pages/KanbanCentralPage.tsx`

**handleFileUpload** (linhas ~557-559)
```typescript
// Adicionar verificação de source (igual ao padrão já usado em handleReorderAttachments)
```

**handleRemoveAttachment** (linhas ~597-599)
```typescript
// Adicionar verificação de source
```

---

## Impacto das Mudanças

### O que será corrigido:
- Anexos em demandas serão persistidos corretamente na tabela `demands`
- Anexos aparecerão em todas as telas (Schedule, Kanban Central, Kanban Geral)
- Anexos permanecerão após recarregar a página
- Anexos permanecerão após fechar e reabrir o card
- Reordenação de anexos funcionará para demandas

### Comportamento esperado após correção:
1. Upload de anexo em demanda → Salva na tabela `demands.attachments`
2. Upload de anexo em card → Salva na tabela `cards.attachments`
3. Sincronização realtime → Já funciona (o hook já escuta ambas as tabelas)
4. Visualização em todas as telas → Todas carregam corretamente de ambas as tabelas

---

## Seção Técnica

### Padrão de Código a Seguir
O padrão correto já existe no `KanbanCentralPage.tsx` na função `handleReorderAttachments`:

```typescript
if (selectedCard.source === 'demand') {
  const { error } = await supabase
    .from('demands')
    .update({ 
      attachments: attachments as unknown as any,
      updated_at: new Date().toISOString()
    })
    .eq('id', selectedCard.id);
  if (error) throw error;
} else {
  const { error } = await supabase
    .from('cards')
    .update({ 
      attachments: attachments as unknown as any,
      updated_at: new Date().toISOString()
    })
    .eq('id', selectedCard.id);
  if (error) throw error;
}
```

### Arquivos Modificados
1. `src/pages/Schedule.tsx` - 3 funções
2. `src/components/CentralKanban.tsx` - 3 funções
3. `src/pages/KanbanCentralPage.tsx` - 2 funções (handleFileUpload, handleRemoveAttachment)

### Total de Alterações
~9 blocos de código a modificar para aplicar a mesma lógica de verificação de `source`.

---

## Validação Pós-Implementação

Após implementar as mudanças, você deve testar:

1. **Criar uma demanda** no /schedule
2. **Anexar uma imagem** na demanda
3. **Verificar no banco** se o anexo foi salvo na tabela `demands`
4. **Recarregar a página** - o anexo deve permanecer
5. **Abrir no Kanban Central** - o anexo deve estar visível
6. **Abrir no Kanban Geral** - o anexo deve estar visível
7. **Testar reordenação** - a nova ordem deve persistir
8. **Testar remoção** - o anexo deve ser removido corretamente
