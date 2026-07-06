## Objetivo

Substituir o `CreateDemandModal` atual (formulário compacto de 3–4 campos) por um modal que é o **espelho visual 100% idêntico** do `TaskCard` — mesmo layout de 2 colunas (65/35), mesmo editor de blocos, mesmos campos laterais, mesmos blocos avançados —, porém em branco na abertura.

## Abordagem recomendada: "Draft‑first"

O `TaskCard` é fortemente acoplado a um `demand_id` real (autosave por campo, uploads no storage vinculados ao card, edge functions de IA, agendamento, fluxo operacional). Reimplementar toda essa UI em modo "sem id" duplicaria ~2000 linhas e sairia dessincronizado em 1 semana.

Solução: quando o usuário clica em **"+ Criar Demanda Manual"**, criamos imediatamente uma **demanda draft** (rascunho invisível no Kanban) e abrimos o `TaskCard` sobre ela. O usuário edita tudo exatamente como um card normal. Ao fechar/salvar, o draft vira demanda real; se ele cancelar, o draft é descartado.

### Fluxo

```text
[+ Criar Demanda Manual]
        │
        ▼
Mini‑seletor inicial (Cliente + Tipo)   ← 2 campos obrigatórios mínimos
        │
        ▼
RPC create_demand_from_template          ← cria draft com is_draft=true
        │
        ▼
Abre <TaskCard> exatamente como hoje     ← espelho 100%, vazio
        │
        ├── Salvar/Fechar → UPDATE is_draft=false → aparece no Kanban
        └── Cancelar      → DELETE do draft
```

## Por que o mini‑seletor de 2 campos

`Cliente` e `Tipo da Demanda` são pré‑requisitos técnicos:
- Cliente define `tenant_id`, RLS de anexos, permissões de IA, sugestões, contas sociais.
- Tipo define o fluxo (`flow_functions` por tipo), status inicial e permissões operacionais.

Sem esses dois, o `TaskCard` não consegue montar nem o menu de funções nem o botão "Prosseguir". Todos os outros campos (título, descrição, datas, anexos, agendamento, etc.) ficam em branco dentro do próprio card espelho.

## Mudanças no código

### 1. Banco (mínimo)
Adicionar coluna `is_draft boolean default false` em `demands`, com índice parcial. Filtros existentes do Kanban / Ver Conteúdos / Demandas Completas passam a excluir `is_draft = true`.

### 2. `CreateDemandModal.tsx` (reescrito, curto)
- Vira um modal pequeno com apenas **Cliente** e **Tipo da Demanda**.
- Botão "Continuar" → cria draft via RPC → chama `onOpenCard(demandId)`.
- Botão "Cancelar" → fecha sem criar nada.
- Remove sugestões, período, canal, datas, descrição — tudo isso vai para dentro do TaskCard.

### 3. Página que abre o modal (Kanban / Home)
- Após o "Continuar", abre o `<TaskCard>` já existente com o `demand_id` do draft.
- Ao fechar o TaskCard, roda `UPDATE demands SET is_draft=false` se o usuário confirmou, ou `DELETE` se cancelou.
- Marca a demanda como "salva" no primeiro autosave de qualquer campo além dos mínimos (opcional — mais seguro exigir botão "Salvar" explícito no header do card em modo draft).

### 4. `TaskCard.tsx` (ajustes cirúrgicos)
- Detectar prop `mode: 'draft' | 'normal'`.
- Em modo draft: header mostra "Nova demanda" + botões **Salvar** / **Descartar**; esconde botão "Prosseguir" e "Entregar" (não há fluxo antes de existir).
- Restante do card idêntico, permitindo preencher título, descrição, datas, anexos, agendamento, etc.

### 5. Filtros de listagem
- Kanban Central, Ver Conteúdos, Ver Agendados, Demandas Completas, Home: adicionar `.eq('is_draft', false)` (ou `.or('is_draft.is.null,is_draft.eq.false')`).

## Fora do MVP

- Auto‑save incremental do draft (fica com "Salvar/Descartar" explícito, mais previsível).
- Recuperação de drafts órfãos (usuário fechou aba sem salvar) — pode ser um cron `DELETE FROM demands WHERE is_draft=true AND created_at < now()-interval '24h'` num passo futuro.

## Checklist de verificação

1. Clicar em "+ Criar Demanda Manual" → mini‑modal com Cliente + Tipo.
2. Selecionar ambos → abre TaskCard vazio, layout idêntico ao de um card real.
3. Preencher título e descrição → clicar Salvar → card aparece no Kanban.
4. Reabrir → todos os blocos (anexos, agendamento, funções, IA) funcionam.
5. Criar draft e clicar Descartar → nada aparece no Kanban.
6. Confirmar que drafts NÃO aparecem em Ver Conteúdos, Ver Agendados, Demandas Completas, Home.
