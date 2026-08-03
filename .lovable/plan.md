# Atraso visível nos agrupamentos + novo visual do card atrasado

## O que está acontecendo (verificado no banco)

Os três cards de "Em revisão" da Lúcia (Nosso centro cirúrgico, L&C Insalubre, Falar sobre como muitos homens…) têm prazo de fim em **29/07**, portanto estão atrasados. Mas o status de pipeline deles é **"Publicado"**, e a regra atual de atraso na Visão Geral desliga o vermelho para qualquer card cujo status seja "feito", "feitos" ou "publicado" — mesmo que a etapa do fluxo ainda esteja pendente (aqui: `revisar_publicacao`).

Ou seja: o agrupamento não é a causa; a causa é o status de pipeline "Publicado" mascarando o atraso de cards que ainda têm trabalho pendente.

## Correção

- Passar a considerar um card concluído (e portanto sem atraso) apenas quando ele está **arquivado** (`archived_at` preenchido) ou não tem mais etapa de fluxo pendente — em vez de olhar o nome do status de pipeline.
- Manter a exceção atual de "Aguardando cliente", que já mostra o selo de envio ao cliente em vez de prazos.
- Aplicar a mesma regra nos três lugares onde o card é renderizado (grupos por data, "Em revisão" e fila não liberada), garantindo que atraso dentro de agrupamento fique vermelho igual ao fora.
- Sinalizar o atraso também no **título do agrupamento**: quando o grupo tiver cards atrasados, o cabeçalho ganha um pequeno indicador vermelho com a contagem, para o atraso não desaparecer quando o grupo estiver recolhido.

## Atualização visual do card atrasado

Hoje o card atrasado fica com fundo vermelho inteiro, o que compete com o restante da coluna e some quando o card está agrupado. Nova proposta, mais integrada à leitura da Visão Geral:

- Fundo do card volta ao neutro; o atraso passa a ser marcado por uma **faixa vertical vermelha à esquerda** (mesma linguagem já usada por Card Diário e Aguardando cliente) mais um leve tom avermelhado apenas na base do card.
- Um **selo discreto "Atrasado · Xd"** (ou "Atrasado · Xh" quando é no mesmo dia) ao lado do cliente/etapa, com ícone de alerta — comunica o tamanho do atraso, não só que existe.
- A pílula de datas destaca apenas o **Fim** em vermelho, deixando o Início neutro, para o olho ir direto ao prazo estourado.
- Contorno vermelho suave em vez de fundo preenchido, preservando legibilidade em tema claro e escuro.

```text
▌ SmartVety · Revisar        ⚠ Atrasado · 5d
▌ Nosso centro cirúrgico…
▌ Ini: 29/07 11:35   Fim: 29/07 11:40
```

## Detalhes técnicos

- `src/pages/KanbanCentralPage.tsx`: `isCardOverdue` deixa de usar `FINAL_STATUS_NAMES` e passa a checar `archived_at`/ausência de etapa pendente; cabeçalhos de grupo (data, Em revisão, Aguardando clientes) recebem contagem de atrasados.
- `src/components/KanbanCard.tsx`: nova prop opcional `overdueSince` (ISO do prazo) para calcular o texto do selo; troca do bloco `bg-red-500/10` por barra lateral + borda suave; `InlineDates` marca só o "Fim" em vermelho.
- Nenhuma mudança de dados ou de regras de fluxo.

## Verificação

- Os três cards de 29/07 na coluna da Lúcia aparecem vermelhos dentro de "Em revisão", com selo de dias de atraso.
- Cards realmente finalizados/arquivados continuam sem marcação de atraso.
- Grupo recolhido mostra a contagem de atrasados no título.
