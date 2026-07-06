## Correção do fluxo de criação

Você quer eliminar o mini-modal "Nova Demanda" (image 367) e abrir direto o **card espelho** (image 368) com todos os campos: Cliente, Tipo, Responsável, Início de Produção, Data de Entrega, Data de Publicação, Objetivo, Conteúdo, Instruções, CTA, Observações, Descrição, Anexos.

## O que muda

### 1. Remover completamente o mini-modal
- O botão **"+ Criar Demanda Manual"** abre diretamente o `TaskCard` em **modo draft local** — sem criar nenhuma linha no banco ainda.
- Nada mais aparece antes do card.

### 2. TaskCard em modo draft = formulário 100% local
- Todos os campos (título, datas, horas, objetivo, conteúdo, instruções, CTA, observações, descrição, anexos, tipo) são editados em **estado local** dentro do card.
- Sem autosave campo-a-campo; nada vai ao banco até o usuário clicar **Salvar Demanda**.
- Header do card:
  - **Cliente** — novo seletor inline (só aparece em modo draft, porque em cards reais o cliente é imutável).
  - **Tipo da demanda** — usa o CTA "Definir tipo" que já existe no card.
- Botões do header: **Salvar Demanda** (verde) e **Descartar** (cinza).

### 3. Ao clicar "Salvar Demanda"
- Valida: Cliente e Tipo obrigatórios; Título obrigatório.
- Chama a RPC `create_demand_from_template` com todos os campos preenchidos de uma vez.
- Se o usuário anexou arquivos ou usou IA no draft (ver item 4), sobe/vincula após o `demand_id` existir.

### 4. Recursos que exigem `demand_id` real
Estes só funcionam depois que a demanda existe no banco:

- **Upload de anexos** — arquivos vão para storage indexados por `demand_id`.
- **Geração por IA** — edge functions precisam do `demand_id`.
- **Agendamento** (Agendar Publicação) — depende do `demand_id`.
- **Prosseguir / Entregar** — fluxo operacional, só faz sentido depois de criada.

**Decisão MVP recomendada:** desabilitar (com tooltip "Salve a demanda primeiro") esses 4 blocos durante o draft. O usuário salva → card recarrega no modo normal → anexa/gera/agenda normalmente.

Alternativa mais complexa (fora do MVP): permitir upload durante o draft usando um bucket temporário e mover arquivos após save. Não recomendo para MVP — pouco valor, muito código.

### 5. Filtros `is_draft`
Continuam ativos como já estão hoje. Nenhuma linha `is_draft = true` aparece em Kanban, Ver Conteúdos, Agendados, Completas, Cronograma, Colaboradores. Mas com essa abordagem quase nenhuma linha draft será criada (só em caso de recuperação futura).

## Arquivos a alterar

- `src/components/CreateDemandModal.tsx` → **deletar** (não é mais usado).
- `src/pages/KanbanCentralPage.tsx` → botão "+" abre TaskCard direto em modo draft com card em branco; handler `handleDraftSave` chama a RPC com todos os campos.
- `src/components/TaskCard.tsx`:
  - No modo draft, header mostra seletor de **Cliente** (nova UI, só draft).
  - Autosave (`handleFieldSave`, uploads, dispatches) fica **inerte** em modo draft — só atualiza estado local via `onCardChange`.
  - Bloqueia Anexos / IA / Agendar / Prosseguir com tooltip.
  - Botão Salvar Demanda envia o objeto completo para o parent via `onDraftSave(cardData)`.

## Checklist de verificação

1. Clicar em **+ Criar Demanda Manual** → abre direto o card em branco (sem mini-modal).
2. Ver seletor **Cliente** inline no header (só em draft).
3. Ver CTA **Definir tipo** já existente.
4. Preencher título, responsável, datas, objetivo, conteúdo, instruções, CTA, observações, descrição → tudo local.
5. Blocos Anexos / IA / Agendar aparecem desabilitados com tooltip explicativo.
6. Clicar **Salvar Demanda** → demanda aparece no Kanban com todos os campos.
7. Reabrir a demanda → agora sim, anexos / IA / agendar funcionam normalmente.
8. Clicar **Descartar** → nada foi criado no banco.
