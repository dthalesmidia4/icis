

## Refatoração do TaskCard baseada no Figma

### Visao geral

Reorganizar o layout do componente `TaskCard` para seguir o design do Figma, com header contextual, body em 2 colunas e seção de anexos separada. A API do componente (props) permanece identica.

### Mudancas no layout

**1. Header redesenhado**
- Linha 1: "Header da tarefa" (titulo editavel) + botao X no canto direito
- Linha 2: "Cliente **{clientName}**" + "Cronograma **{periodTitle}**" (metadados contextuais lado a lado)
- Linha 3: "Status" + badge colorido do status + separador + "Prioridade" + badge de prioridade (novo campo derivado ou hardcoded por enquanto)
- Remover: titulo centralizado gigante, controles archive/delete da toolbar (mover para menu de contexto ou footer)

**2. Body em 2 colunas (desktop)**
- Coluna esquerda (~65%): Card contendo Objetivo (colapsavel) e Atividade (BlockEditor) empilhados verticalmente, seguido de Observacoes
- Coluna direita (~35%): Card "Data de Publicacao" com date picker + time picker + label "Adicionar horario", e abaixo os controles secundarios (vincular periodo, archive, delete)
- Mobile: empilhar verticalmente (coluna direita acima da esquerda ou abaixo)

**3. Seção de Anexos redesenhada**
- Card separado abaixo do body de 2 colunas
- Header do card: "Anexos" + badge de contagem + botao "Gerar Estatico com IA" alinhado a direita na mesma linha
- Lista vertical de anexos (thumbnail quadrada 48x48 + nome do arquivo), ao inves do grid atual
- Manter drag-and-drop para reordenacao
- Manter upload button e remove/preview

### Sobre o campo "Prioridade"

O Figma mostra um badge "Alta" de prioridade. Existem 2 opcoes:

- **Opcao A (simples):** Derivar prioridade da proximidade da data de publicacao (ja existe `getPublicationPriority` no KanbanCentralPage). Exibir como badge read-only.
- **Opcao B (completa):** Adicionar coluna `priority` na tabela `demands` (enum: baixa/media/alta) com Select editavel no TaskCard. Requer migration.

Recomendacao: comecar com Opcao A para manter escopo menor.

### Detalhes tecnicos

**Arquivo: `src/components/TaskCard.tsx`**

Reestruturar o JSX do modal (linhas ~553-1130):

```
{/* HEADER */}
<div className="border-b px-6 py-4">
  {/* Linha 1: Titulo + Close */}
  <div className="flex items-center justify-between">
    <h1 onClick={edit} className="font-semibold text-xl">{card.title}</h1>
    <Button variant="ghost" size="icon" onClick={close}><X /></Button>
  </div>
  
  {/* Linha 2: Cliente + Cronograma */}
  <div className="flex items-center gap-6 mt-2 text-sm">
    <span>Cliente <strong>{card.clientName}</strong></span>
    <span>Cronograma <strong>{periodTitle}</strong></span>
  </div>
  
  {/* Linha 3: Status + Prioridade */}
  <div className="flex items-center gap-3 mt-3">
    <span className="text-sm text-muted-foreground">Status</span>
    <Select ...>{/* status atual */}</Select>
    <span>-</span>
    <span className="text-sm text-muted-foreground">Prioridade</span>
    <Badge variant="destructive">Alta</Badge>
  </div>
</div>

{/* BODY - 2 colunas */}
<div className="flex-1 overflow-y-auto">
  <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 p-6">
    {/* Coluna esquerda */}
    <div className="space-y-6">
      <Card className="p-5">
        {/* Objetivo (colapsavel) */}
        {/* Atividade (BlockEditor) */}
      </Card>
      <Card className="p-5">
        {/* Observacoes (BlockEditor) */}
      </Card>
    </div>
    
    {/* Coluna direita */}
    <div className="space-y-4">
      <Card className="p-4">
        <h3>Data de Publicacao</h3>
        {/* Date picker + Time picker */}
      </Card>
      {/* Controles secundarios */}
    </div>
  </div>
  
  {/* Anexos - full width */}
  <div className="px-6 pb-6">
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3>Anexos</h3>
          <Badge>{count}</Badge>
        </div>
        <Button>Gerar Estatico com IA</Button>
      </div>
      {/* Lista vertical de anexos */}
    </Card>
  </div>
</div>
```

**Para buscar o nome do periodo:**
- O componente ja recebe `card.period_plan_id`
- Adicionar um `useEffect` que busca `period_plans.period_title` quando `period_plan_id` existe
- Ou receber como prop do componente pai (ja disponivel no KanbanCentralPage)

**Layout responsivo:**
- Desktop: `grid-cols-[1fr_280px]`
- Mobile: `grid-cols-1` com coluna direita empilhada acima ou abaixo

### Arquivos impactados

- `src/components/TaskCard.tsx` -- refatoracao do layout JSX (sem mudanca de props/API)
- Nenhuma alteracao de banco de dados (usando prioridade derivada)
- Nenhum novo componente necessario

### O que NAO muda

- Props do TaskCard (mesma interface)
- Logica de save/upload/delete/archive
- BlockEditor e suas melhorias recentes
- Fluxo de geracao de imagens com IA
- DemandaCard (componente separado usado apenas no review modal)

