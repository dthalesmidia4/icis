## Diagnóstico real (verificado no código e no banco)

O rótulo "em andamento" hoje é calculado assim (`KanbanCentralPage.tsx`, ~2406-2438):

```
candidatos = cards ativos do colaborador
             − aguardando_cliente − captar − com dispatch ativo − daily cards
ordenados por (início, tier)
em andamento = primeiro candidato com  início <= Date.now()
próximo      = o candidato seguinte
```

Dois problemas de fundo, e o segundo é o que você apontou:

1. **`Date.now()` é lido só na renderização.** Não existe nenhum `setInterval` na página. A tela aberta às 09:55 continua comparando com 09:55 — a fila nunca "vira" sozinha.
2. **A regra usa relógio como se fosse estado de execução.** "Passou da hora agendada" não significa "está sendo feita", e "ainda não chegou a hora" não significa "não está sendo feita". Foi exatamente o que aconteceu com a Lúcia: fila dela começa 10:05, agora 10:05 — nada atrasado, logo nada "em andamento", só "próximo".

**O que de fato define execução neste sistema:** a coluna do colaborador só contém cards **pendentes**. Quando ele entrega, o card muda de `current_function_key`/`assigned_to` e sai da coluna (ou vira `aguardando_cliente`/`publicar agendado`). Portanto o estado de "a anterior foi entregue?" já está representado pela própria presença dos cards. O trabalho corrente de uma pessoa é, por definição, **o primeiro card pendente da fila dela que já é para hoje ou antes** — não o que o relógio diz.

## Nova regra de "Em andamento"

Fila operacional do colaborador (mantendo as exclusões atuais, que estão corretas):
- fora: `aguardando_cliente` / envio ao cliente já feito, `captar` (tem pausa própria), cards com dispatch de publicação ativo, cards diários sem ocorrência para hoje, cards arquivados.
- dentro: produção, `enviar_cliente`, revisão e avaliar — ordenados por data+hora de início e, em empate, por tier (produção → revisão → avaliar).

Definição:
- **Em andamento** = primeiro card da fila cuja **data de início é hoje ou anterior**. Independe da hora: se é o primeiro pendente do dia dela, é o que ela está (ou deveria estar) fazendo agora.
- **Próximo** = o card seguinte na fila.
- Se a fila só tem cards de dias futuros → **nenhum** "em andamento"; o primeiro recebe "próximo".
- **Atrasado** continua sendo sinal separado (hora de término já passou), acumulável com "em andamento" — atraso é uma condição do card, não o critério de quem é o atual.

Exclusão adicional, para não marcar como "em andamento" algo que a pessoa já entregou:
- em cards multi-responsável (`additional_assignees`), se o colaborador já tem `partial_delivered`/`delivered` registrado em `demand_flow_history` para a etapa atual do card, esse card sai da fila **dele** (continua na fila de quem falta).

## Implementação

### 1. `src/hooks/useNowTick.ts` (novo)
Hook simples que devolve um timestamp atualizado a cada 60s (`setInterval`, limpo no unmount). Usado para virada de dia e para o cálculo de "atrasado", que continuam dependendo do tempo real — sem ele qualquer regra temporal fica congelada na sessão.

### 2. `src/lib/currentWorkCard.ts` (novo)
Função pura `resolveCurrentAndNext(cards, { now, deliveredStageKeysByCard })` que:
- aplica as exclusões acima;
- ordena por `YYYY-MM-DDTHH:MM` completo + tier;
- devolve `{ currentId, nextId }` conforme a definição acima.
Concentrar isso num módulo evita que Kanban, modo foco e a lista do colaborador divirjam de novo.

### 3. `src/pages/KanbanCentralPage.tsx`
- Substituir o bloco inline (~2406-2438) por `resolveCurrentAndNext`, passando o `now` do ticker.
- Buscar, junto com os cards, as entregas parciais (`demand_flow_history` com `action in ('partial_delivered','delivered','proceeded')`) apenas dos cards que têm `additional_assignees` — consulta pequena e feita uma vez por carga, com invalidação no realtime já existente.
- Modo foco usa o mesmo resultado (hoje replica o filtro por conta própria).

### 4. `src/pages/CollaboratorDemands.tsx`
Usar o mesmo helper para que a lista do colaborador mostre o mesmo "em andamento" do Kanban.

## Correção pontual do card do Hospital Veterinário Leal

Confirmado no banco: ele está em `captar` com a Letícia, embora o histórico mostre `partial_delivered` dela em captar e um `proceeded` de `editar_video` → `revisar` feito pelo Eric. É resíduo do bug antigo de reatribuição gravado nos dados — a regra forward-only só age no momento de prosseguir/reatribuir e não reescreve cards já corrompidos. **Sim, esse precisa ser movido manualmente uma vez** (Voltar demanda → Editar vídeo, ou enviar direto para Revisar). Os próximos já roteiam corretamente.

## Fora do escopo
Nenhuma alteração em banco, no reordenador automático ou nas regras de fluxo — só o cálculo/rotulagem de qual card é o atual.
