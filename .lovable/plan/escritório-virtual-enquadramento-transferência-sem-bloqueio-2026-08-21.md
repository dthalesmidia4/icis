# Escritório Virtual: enquadramento, transferência sem bloqueio e borda do monitor

Três ajustes, todos dentro do que já existe (nenhuma nova tabela, nenhum novo fluxo).

## 1. Subir e ampliar as estações

Hoje a parede foi reduzida para 20% da altura, mas as mesas continuam calculadas a partir da metade da sala para baixo (base entre 50% e ~96% da altura), então o espaço liberado no topo ficou vazio.

- Recalcular as posições em `src/lib/officeLayout.ts` para as fileiras começarem logo abaixo da parede e ocuparem toda a área útil da sala (fundo mais alto, frente mais próxima da base), mantendo a sensação de profundidade.
- Aumentar levemente a largura base das estações por faixa de quantidade, para os cards e nomes ficarem mais legíveis sem sobreposição.
- Manter a escala de profundidade (fundo menor, frente maior) e o jitter determinístico, para o ambiente continuar parecendo físico.
- Conferir também o modo mobile (estações empilhadas), que não usa esse cálculo e não deve mudar.

## 2. Arrastar não deve mais bloquear por etapa

O fluxo canônico avalia se o novo responsável tem a etapa atual; se não tiver, tenta remapear com o resolvedor. Quando o resolvedor não devolve nada, a transferência é bloqueada com "não tem etapa OPERACIONAL habilitada compatível".

- Acrescentar um último recurso ao resolvedor de etapa: quando o remapeamento normal falhar, buscar todas as funções habilitadas do destinatário na área do card e escolher a mais próxima — primeiro à frente da etapa atual, e só então a mais próxima atrás.
- Só bloquear quando o destinatário realmente não tiver nenhuma função habilitada naquela área (caso em que a gravação seria recusada pelo próprio banco).
- A etapa ajustada continua aparecendo como aviso ("Etapa ajustada: o card avançou/voltou para ..."), preservando histórico, validação de conflito de agenda e reagendamento.
- Esse ajuste vale para todo o sistema (Visão Geral, TaskCard, alocação em massa), não só para o arraste no Escritório, porque o avaliador é compartilhado.

## 3. Borda do monitor com a mesma semântica da barra

A barra de progresso fica vermelha só quando o tempo do card estourou; a borda do monitor usa outro critério (o horário de início já passou), por isso fica vermelha em cards que não estão atrasados.

- Passar a borda do monitor (e o ícone de alerta ao lado do status) a usar exatamente o mesmo sinal da barra de progresso: azul enquanto há tempo, vermelho apenas quando o prazo do card já venceu e ele continua na mesa.
- Sem card em produção, a borda permanece neutra, como hoje.

## Detalhes técnicos

- `src/lib/officeLayout.ts`: novos valores de `topPct`/`scale` em `computeDeskSlots` e de `deskBaseWidth`.
- `src/lib/reassignDemand.ts`: fallback de etapa usando `fetchUserAllowedFunctionKeys` + posições de `flow_functions` para escolher a etapa habilitada mais próxima; bloqueio por `function` só com conjunto vazio.
- `src/components/office/OfficeDesk.tsx`: borda e ícone passam a derivar de `progress >= 1` em vez de `current.isLate`.
