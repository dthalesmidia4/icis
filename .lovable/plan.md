## Objetivo

Deixar o "Reorganizar sequência" mais fiel à realidade do trabalho: dividir cards longos entre dias, respeitando expediente e almoço; dar folga proporcional ao primeiro card quando há atraso; e usar a duração real quando o card é "Outros".

## Regras novas

### 1. Duração de "Outros"
- Quando `demand_type_key` ∈ {`outro`, vazio, null} **e** o card tem `due_date/due_time` e `delivery_date/delivery_time` válidos, usar o intervalo já agendado como duração (`delivery - due` em minutos de expediente).
- Se não houver esse intervalo, cai no fallback da matriz atual (`default` da etapa).
- Regra vale só para "Outros". Estático, Carrossel e Vídeos continuam usando a matriz `tipo × etapa`.

### 2. Slack proporcional para o primeiro card atrasado
- Se o primeiro card da fila (após ordenação por `publish_date`) já passou do prazo — critério: `delivery_date/delivery_time` atual < agora, ou `publish_date/publish_time` já passou — então:
  1. Preserva o **horário de início original** desse card (mantém `due_date/due_time` como estão).
  2. Calcula quanto já atrasou em minutos de expediente contra "agora".
  3. Adiciona **30% de folga** sobre a duração planejada, além do atraso acumulado, ao recalcular o `delivery_date/delivery_time`.
  4. Fórmula: `nova_duração = duração_planejada + atraso_acumulado + (duração_planejada × 0.30)`.
- Vale para qualquer tipo, desde que haja pelo menos 1 card em atraso no início da fila.
- Os cards seguintes seguem a duração normal da matriz (ou do intervalo, no caso de "Outros").

### 3. Split de duração entre dias (multi-day)
Trocar a lógica atual de "não coube hoje → empurra dia todo" por uma que **fatia** a duração em blocos de expediente:
- Fatia 1: do cursor atual até o fim do expediente do dia (ou até o início do almoço, o que vier primeiro).
- Se sobrar duração e ainda houver janela pós-almoço no mesmo dia, alocar Fatia 2 até o fim do expediente.
- Se ainda sobrar, pular para o próximo dia útil (pula fim de semana e feriados de `br_calendar_events`) e continuar até zerar a duração.
- O `startISO/startTime` fica no primeiro bloco, o `endISO/endTime` fica no último bloco.
- Cards multi-day ganham um `warning` informativo: "Se estende por N dias úteis".

### 4. Cenários adicionais tratados
- **Cursor durante o almoço**: já pula para depois do almoço (mantido).
- **Cursor após o fim do expediente e antes das 18h**: exemplo real do usuário (17h com 6h de duração) → Fatia 1 de 1h hoje (17-18h), retomada amanhã 9h; se cruzar almoço, fatia amanhã em 9-12h + 13:30-final.
- **Card com duração > jornada completa**: se sobrar mais de uma jornada, distribuir em vários dias úteis.
- **Deadline de publicação**: mantido o warning atual — se o `end` calculado ultrapassa `publish - 1h`, marca aviso vermelho.
- **Cards `aguardando_cliente`**: continuam sem reagendamento (comportamento atual).
- **Ordenação**: cards com `publish_date` continuam vindo antes; entre iguais, prioridade manual (ordem atual) é preservada.

## Impacto técnico

Escopo restrito a **um arquivo**: `src/lib/reorderSequence.ts`.

- Substituir o bloco monolítico do loop principal por uma função `allocateAcrossDays(dur, cursor, workCtx)` que retorna `{ startBlock, endBlock, blocks[] }`.
- Nova função `computeOutroDuration(card, workCtx)` para item 1.
- Nova função `computeStuckSlack(card, now, workCtx)` que retorna minutos extras para o primeiro card atrasado (item 2). Chamada só uma vez, para o primeiro card da fila.
- Ajustar o `ReorderProposal` opcionalmente com `spansDays?: number` para o modal exibir "3 dias úteis" quando aplicável.
- `ReorderSequenceModal.tsx` recebe uma linha extra na visualização quando `spansDays > 1` ou quando slack foi aplicado (para o usuário entender a proposta).

## Fora do escopo

- Não altera a UI de configuração de expediente (já implementada).
- Não altera schema do banco.
- Não adiciona campo manual de duração — "Outros" usa o intervalo já agendado no card.
