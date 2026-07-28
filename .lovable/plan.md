## Ajustes no Modo Foco

### 1. Gatilho mais acionável
Tornar o cabeçalho inteiro da coluna clicável para entrar em foco (não só o ícone):
- O bloco `bolinha colorida + nome + contagem` vira um botão (`cursor-pointer`, hover sutil com leve elevação, `aria-label="Focar em <Nome>"`, tooltip "Clique para focar").
- O ícone `Focus` permanece como affordance visual à direita da contagem, mas o alvo de clique passa a ser a área toda do nome.
- Não afeta os botões de Registro/Reorganizar (continuam com `stopPropagation`).

### 2. Botões preservados e foco como toggle
Na primeira sub-coluna do modo foco (a que carrega a Produção do responsável):
- Manter os botões **Registro de entregas** (History) e **Reorganizar sequência (Wand2)** — eles operam sobre o responsável inteiro, então fazem sentido só ali, não em cada sub-agrupamento.
- Manter o ícone **Focus** visível e ativo — clicar sai do foco (toggle). Estado ativo com `text-primary bg-primary/10` para reforçar que está ligado.
- Ao ler `columnHistory` / abrir o modal de reorganizar, usar `columnUserId` (não `column.id`), para o estado casar com o modo normal quando o foco for desativado.

Nas demais sub-colunas (Avaliar / Aguardando clientes / Em revisão): não mostrar esses três botões — o cabeçalho fica limpo apenas com rótulo + contagem.

### 3. Nomenclatura das sub-colunas
- **Primeira sub-coluna** (Produção): usar o **nome do responsável** (ex.: "Lúcia"), espelhando o modo normal. Semanticamente é a "coluna do responsável" — as demais são recortes/agrupamentos daquela coluna.
- Demais sub-colunas mantêm rótulos do agrupamento: `Avaliar`, `Aguardando clientes`, `Em revisão`.
- O chip superior "Modo foco: <Nome> · Sair" já indica de quem é o foco, então não há redundância incômoda.

Alternativa considerada e descartada: "Atividades de <Nome>" — como o próprio usuário levantou, as sub-colunas também são atividades, então o rótulo confunde. Ficar só com o nome resolve.

### Arquivos afetados
- `src/pages/KanbanCentralPage.tsx`:
  - Gerador de `displayColumns` no modo foco: a sub-coluna `production` passa a receber `name: <nome do responsável>` em vez de `"Produção"`.
  - Cabeçalho da coluna (área do nome): envolver em `<button>` com handler `enterFocus(columnUserId)` quando `!focusKind && columnUserId !== "__unassigned__" && !isHistoryMode`.
  - Botão `Focus` no cabeçalho: exibir também quando `focusKind === 'production'`; nesse caso `onClick = exitFocus` e estilo ativo.
  - Botões `History` e `Wand2`: passar a condicionar por `(!focusKind || focusKind === 'production')` em vez de `!focusKind`; trocar leituras/gravações que usam `column.id` por `columnUserId` (`columnHistory.get`, `setColumnHistory`, `setReorderModalColumnId`, popover `open`).
