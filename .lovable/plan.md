
# Prioridade e risco: linguagem humana + correções da implantação

## 1. O que os dois campos realmente fazem (hoje)

- **Fator da janela de risco (3):** multiplicador, não horas. O motor compara `prazo − agora` com `fator × duração estimada da etapa atual`. Se a folga é menor ou igual a essa janela, o card fura a fila. Com etapa de 60 min e fator 3, o card entra na frente quando faltam menos de 3 h para o prazo.
- **Carência de entrada (60):** minutos. Card que chegou na coluna há menos de 60 min e não está em risco vai para o fim da fila, para não atropelar o que já estava lá.

Ninguém deveria precisar dessa explicação lendo a tela — daí a reescrita abaixo.

## 2. Reescrever a aba com linguagem operacional

Trocar os dois campos técnicos por controles autoexplicativos:

**"Quando um card fura a fila"** — três opções em vez de número solto:
- Só no limite (fator 2)
- Equilibrado (fator 3, padrão)
- Antecipar bastante (fator 5)
- Personalizado (mostra o número, para quem quiser)

Abaixo, uma frase viva com números do próprio tenant:
"Um card cuja etapa leva cerca de 1 h passa à frente quando faltam menos de 3 h para o prazo."

**"Tempo de acomodação de cards novos"** — slider/seletor em minutos (0 / 30 / 60 / 120), com a frase:
"Cards que entraram na coluna nos últimos 60 min e não estão atrasados entram no fim da fila."

Manter "Restaurar padrão". Remover a explicação matemática (`prazo − agora ≤ fator × ciclo restante`) do rosto da tela e deixá-la num tooltip "como isso é calculado".

## 3. Pontas soltas a fechar

**a) Salvar não funciona para quem não é super admin (bug real)**
A tabela `tenants` só tem policy de alteração para super admin, então `saveReorderPriority` grava 0 linhas sem erro visível. Corrigir com migração: permitir que admin/gestor da própria agência altere o registro do seu tenant. Além disso, fazer o save confirmar a linha gravada e mostrar erro quando nada mudar (hoje o toast diz "atualizado" mesmo sem gravar).

**b) Fila e badge usam contas diferentes**
A ordenação estima a duração com jornada padrão e sem os ajustes de duração configurados, enquanto o badge da proposta usa a duração com ajustes. Passar a mesma base de duração para os dois, para que "⚠ risco de atraso" sempre explique a posição real na fila.

**c) Rótulo enganoso**
Onde está escrito "ciclo restante", passar a escrever "etapa atual" — ou, se preferir, mudar o cálculo para somar de fato as etapas seguintes até a entrega. Decidir isso é a única escolha de comportamento aqui; por padrão vou apenas corrigir o texto para refletir o que o motor faz.

**d) Coluna com áreas misturadas**
Hoje o modal aplica a config da área "dominante" da coluna. Passar a avaliar cada card com a config da sua própria área (Mídia ou Sistemas).

**e) Cobertura**
A config só é lida no modal de reorganização (único consumidor existente) — isso está correto, não há reorganização automática em outro ponto. Sem ação.

## Detalhes técnicos

- `src/components/FunctionPermissionsModal.tsx`: novo layout da aba (presets + personalizado + exemplo calculado), save com verificação de linha afetada.
- `src/lib/reorderPriority.ts`: `saveReorderPriority` retorna a linha gravada (`.select()`) e lança erro se vazio.
- Migração: policy de UPDATE em `public.tenants` para admin/gestor do próprio tenant (mantendo super admin).
- `src/lib/reorderSequence.ts`: `sortForReorder` recebe a função de duração já contextualizada (mesma usada em `computeReorder`); ajuste de nomes/labels de `remainingCycleMin`.
- `src/components/kanban/ReorderSequenceModal.tsx`: config por área do card em vez de área dominante; texto dos badges alinhado ("faltam X · etapa ~Y").
