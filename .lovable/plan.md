## Diagnóstico (verificado no código)

1. **Duração absurda (2250 min / 6 dias)** — em `src/lib/reorderSequence.ts`, cards do tipo "Outro" não usam a matriz de durações: usam o intervalo agendado (`scheduledSpanMinutes`, linhas 387-409). Essa função calcula o span em **tempo corrido de relógio** (`deliv - due`) e só desconta o almoço — **não desconta noites, fins de semana, feriados nem os blocos de área (mídia × sistemas)**. Para o card "Templates personalizados" (28/07 14:35 → 30/07 14:00) isso dá ~2575 min, que é então cortado pelo teto de 5 jornadas = **2250 min**. Como uma jornada útil tem 450 min, 2250 min = 5 dias úteis inteiros, e com o resto da fila o fim cai em 06/08. Ou seja: o problema não é a folga de 30% (ela só é aplicada ao primeiro card atrasado), é a duração inflada.

2. **"Fim 14h" vs "13:35" no modal** — a linha riscada mostra **apenas a data de início original** (28/07 14:35); o fim original (30/07 14:00) não aparece. O 13:35 é o **novo início** proposto (agora). A leitura fica ambígua.

## O que será feito

### 1. Duração realista para cards "Outro" (`src/lib/reorderSequence.ts`)
- Reescrever `scheduledSpanMinutes` para somar **apenas minutos úteis** dentro da janela original: itera dia a dia, ignora fins de semana e feriados, e soma a interseção com os blocos do dia (`dayBlocks`, já respeita área mídia × sistemas e almoço).
- Reduzir o teto de 5 jornadas para **1 jornada útil** por padrão (≈450 min); acima disso, o span é considerado "resíduo de agendamento antigo" e cai na matriz/override da etapa. Um card "Outro" só ganha duração maior que uma jornada se houver override explícito de duração cadastrado.
- Efeito: o card 1 deixa de valer 5 dias úteis; a fila do Eric volta a caber em 30/07–31/07.

### 2. Modal mais legível (`src/components/kanban/ReorderSequenceModal.tsx`)
- Mostrar o intervalo original completo riscado (`28/07 14:35 → 30/07 14:00`) antes da seta, e depois o novo intervalo — acabando com a confusão de fim.
- Badge de duração passa a exibir formato humano (`2h30` em vez de `150min`) quando > 60 min.

### 3. Edição manual da proposta com recálculo em cascata
- Cada linha do modal ganha um controle discreto de **início** (data + hora) e de **duração** (minutos), aberto por um botão "ajustar".
- `computeReorder` recebe um novo parâmetro `overrides?: Record<string, { startISO?: string; startTime?: string; durationMin?: number }>`:
  - um card com início fixado é alocado exatamente naquele instante (marcado como "fixado" na UI);
  - a duração informada substitui a estimada;
  - **todos os cards seguintes são recalculados automaticamente** a partir do fim do card fixado, respeitando jornada, almoço, blocos de área, fins de semana e feriados — logo, alterar o primeiro card adianta/posterga a fila inteira pelo mesmo delta, preservando as durações individuais (ex.: a atividade de 2h continua com 2h).
- Botão "Restaurar sugestão" limpa os ajustes manuais e volta ao cálculo automático.
- O estado editado vive apenas no modal; ao aplicar, grava os mesmos campos já usados hoje (`due_date/due_time/delivery_date/delivery_time`) com o mesmo lock otimista.

## Detalhes técnicos
- Sem mudanças de banco.
- `sortForReorder` continua definindo a ordem; overrides de início não reordenam a fila, apenas deslocam o cursor (um início fixado anterior ao cursor é respeitado; se colidir com bloqueios de `captar`/diário, o card seguinte contorna normalmente).
- `estimateDurationMinutes` (usado fora do modal) mantém a assinatura atual.
