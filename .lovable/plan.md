

# Colunas Flexiveis de Producao + Schedule Somente Leitura

## Resumo

Duas mudancas principais:
1. A pagina `/schedule` passa a ser somente leitura (sem arrastar cards, sem editar)
2. No Kanban Central, colunas fixas (Planejamento, Revisao, Aguardando Cliente, Agendar Publicacao, Publicado) nao podem ser renomeadas nem excluidas. Colunas customizadas (ex: nomes de colaboradores) sao sub-colunas de "Producao" e mostram um indicador visual "Em Producao"

## Arquitetura da Solucao

As colunas customizadas continuam sendo registros reais na tabela `pipeline_statuses`, mas com um campo `parent_status_id` apontando para "Producao". Isso permite:
- Saber em qual sub-coluna o card esta (via `status_id`)
- Identificar visualmente que todas pertencem a "Producao"
- Na pagina `/schedule`, agrupar todas sob "Producao"

## Mudancas

### 1. Migracao de banco de dados

Adicionar duas colunas a `pipeline_statuses`:
- `is_fixed` (boolean, default false) - impede renomear/excluir
- `parent_status_id` (uuid nullable, FK para pipeline_statuses) - indica que e sub-coluna

Marcar como fixas: Planejamento, Producao, Revisao, Aguardando Cliente, Agendar Publicacao, Publicado.

Vincular a coluna "Giovanna" existente como sub-coluna de "Producao".

### 2. `/schedule` - Somente Leitura (`src/pages/Schedule.tsx`)

- Remover `DragDropContext`, `Droppable`, `Draggable` e toda logica de drag-and-drop (`handleDragEnd`, `SchedulePublicationModal`)
- Remover botao "Nova Demanda" e modal de criacao
- Remover botao de excluir demanda
- Cards renderizados como elementos estaticos (sem drag handles)
- TaskCard abre em modo leitura: adicionar prop `readOnly` ao componente
- Agrupar cards de sub-colunas de producao sob a coluna visual "Producao"

### 3. TaskCard - Modo Leitura (`src/components/TaskCard.tsx`)

- Adicionar prop opcional `readOnly?: boolean`
- Quando `readOnly = true`: desabilitar edicao de campos, ocultar botao de upload, ocultar botao de excluir, ocultar seletor de status

### 4. Kanban Central - Indicador Visual (`src/pages/KanbanCentralPage.tsx`)

- Buscar `parent_status_id` junto com as colunas
- Para colunas com `parent_status_id` definido, exibir badge "Em Producao" abaixo do nome da coluna no header
- Usar a cor da coluna pai (Producao) como referencia visual secundaria

### 5. Gerenciar Colunas (`src/components/ManageColumnsModal.tsx`)

- Buscar `is_fixed` junto com as colunas
- Para colunas fixas: ocultar botao de excluir e icone de renomear
- Exibir um icone de cadeado ao lado de colunas fixas

### 6. Criar Coluna (`src/components/CreateColumnModal.tsx`)

- Ao criar nova coluna, automaticamente definir `parent_status_id` para o ID da coluna "Producao" do pipeline
- Buscar o ID de "Producao" ao abrir o modal

### 7. Atualizacao do `fetchColumns` (`src/pages/KanbanCentralPage.tsx`)

- Incluir `parent_status_id` e `is_fixed` no SELECT das colunas
- Atualizar a interface `PipelineStatus` para incluir esses campos

### 8. Logica de drag-and-drop no Kanban Central

- Ao mover um card para uma sub-coluna de producao, o `status_id` aponta para o ID da sub-coluna (nao para "Producao")
- Isso ja funciona automaticamente com a logica atual

## Detalhes Tecnicos

### Interface PipelineStatus atualizada

```text
interface PipelineStatus {
  id: string;
  name: string;
  color: string;
  position: number;
  pipeline_id: string;
  is_fixed: boolean;
  parent_status_id: string | null;
}
```

### SQL da migracao

```text
ALTER TABLE pipeline_statuses 
  ADD COLUMN is_fixed boolean NOT NULL DEFAULT false,
  ADD COLUMN parent_status_id uuid REFERENCES pipeline_statuses(id);

UPDATE pipeline_statuses SET is_fixed = true 
WHERE name IN ('Planejamento', 'Produção', 'Revisão', 'Aguardando Cliente', 'Agendar Publicação', 'Publicado');

UPDATE pipeline_statuses SET parent_status_id = (
  SELECT id FROM pipeline_statuses WHERE name = 'Produção' LIMIT 1
) WHERE name = 'Giovanna';
```

### Indicador visual no header da coluna

Colunas com `parent_status_id` mostrarao:
- Nome customizado (ex: "Giovanna")
- Badge pequeno abaixo: "Em Producao" com cor de destaque

### Arquivos modificados

| Arquivo | Tipo de mudanca |
|---|---|
| Nova migracao SQL | Adicionar `is_fixed` e `parent_status_id` |
| `src/pages/Schedule.tsx` | Remover drag-drop, tornar read-only |
| `src/components/TaskCard.tsx` | Adicionar prop `readOnly` |
| `src/pages/KanbanCentralPage.tsx` | Indicador visual, interface atualizada |
| `src/components/ManageColumnsModal.tsx` | Proteger colunas fixas |
| `src/components/CreateColumnModal.tsx` | Auto-vincular a Producao |

