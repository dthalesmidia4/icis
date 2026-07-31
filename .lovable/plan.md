## Problema

Hoje cada card do modal empilha 5–7 linhas com o mesmo peso visual: título, etapa/tipo/área, "Em execução desde → Novo término", "Na etapa atual desde…", badges de risco/folga, explicação de janela e aviso amarelo. Tudo em `text-xs`, quase tudo com cor de destaque (vermelho, âmbar, azul). O olho não sabe onde começar e as informações se repetem (risco aparece como badge e como texto; "extensão de 30%" aparece 3 vezes).

## Objetivo

Ler cada card em 2 segundos: **o que muda de horário** e **por quê**. Todo o resto continua acessível, mas em segundo plano ou sob clique. Nenhuma funcionalidade é removida (ajuste manual, fixados, toggle de publicação, desfazer, recalcular).

## Nova anatomia do card

```text
┌──────────────────────────────────────────────────────────────┐
│ 1  TESTE VÍDEO LEAL                          ⚠ risco   Ajustar│
│    Editar vídeo · Vídeo gerado · Mídia                        │
│                                                               │
│    31/07 12:00  →  03/08 09:20            20min   [detalhes ▾]│
│    ↳ Sem janela de Mídia após 14:40 em 31/07                  │
└──────────────────────────────────────────────────────────────┘
```

1. **Linha 1 (peso forte):** número + título. À direita, no máximo **um** selo de estado (`em execução`, `risco`, `fixado`, `não reagendado`) e o botão Ajustar como ícone discreto.
2. **Linha 2 (fraca):** etapa · tipo · área — cinza, sem badge.
3. **Linha 3 (a informação principal):** antes → depois em fonte tabular, com o "antes" riscado e discreto e o "depois" em destaque. Duração como texto simples à direita, não badge.
4. **Linha 4 (opcional, uma só):** o motivo — jumpReason, pausa por captação ou aviso de prazo — em cinza com ícone pequeno; âmbar só quando é aviso real de prazo de publicação.
5. **"detalhes"** (collapse por card, fechado por padrão): entrada na etapa, tempo planejado, extensão de 30%, folga aplicada, dias de extensão, prazo de publicação, tipo de fixação. Sai da leitura principal e para de competir.

## Regras de cor e ruído

- Uma cor de destaque por card, na seguinte prioridade: vermelho (risco) > âmbar (aviso de prazo) > azul (reagendado) > neutro.
- Cards não reagendados (Captar, Aguardando cliente, diários) ficam em bloco colapsado no fim: **"3 cards não reagendados"**, expansível, sem borda colorida.
- Badges "Produção/Revisão/Avaliar", "+folga", "N dias", "recém-chegado" saem da linha principal e passam a viver no collapse de detalhes ou como tooltip do selo único.
- Texto duplicado eliminado: risco descrito só uma vez (selo + tooltip com "faltam X, etapa leva ~Y").

## Cabeçalho e rodapé

- Descrição longa atual (janela, almoço, feriados, quem não é reagendado) vira um **"Como funciona"** colapsado; o padrão mostra só a linha: `Base 14:39 · janela 09:00–18:00 · recalcular`.
- Barra de resumo enxuta: `2 cards · 1 reagendado · 1 em risco` (chips neutros, um único com cor quando há risco).
- Toggle "Priorizar publicação" fica em linha única compacta, com a explicação como tooltip.
- Rodapé inalterado (Restaurar sugestão / Cancelar / Aplicar).

## Detalhes técnicos

- Arquivo principal: `src/components/kanban/ReorderSequenceModal.tsx`.
- Extrair a renderização de cada item para um subcomponente `ReorderProposalRow` no mesmo diretório (`src/components/kanban/ReorderProposalRow.tsx`) para o modal ficar legível: recebe `proposal`, `orig`, `index`, callbacks de edição.
- Selo único: função `primaryBadge(p)` que resolve estado por prioridade (execução > risco > fixado > skipped > reagendado).
- Motivo único: função `primaryReason(p)` que escolhe entre `jumpReason`, `pausedByCaptar` e `warning` (avisos restantes vão para o collapse).
- Usar `Collapsible` do shadcn já presente no projeto para "detalhes", "Como funciona" e o grupo de não reagendados.
- Sem mudanças em `src/lib/reorderSequence.ts` (motor), na aplicação das mudanças (`handleApply`) nem no fluxo de ajustes manuais — o painel de "Ajustar" continua igual, apenas aberto dentro do card.
- Números de horário com `tabular-nums` para alinhar as colunas antes/depois.
