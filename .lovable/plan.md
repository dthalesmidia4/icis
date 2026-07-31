## Objetivo
1. Modal de "Configurar funções do fluxo" mais largo (menos scroll horizontal).
2. Na aba "Tempo estimado", separar o tempo real de produção do tempo total (que inclui esperas e handoffs).

## 1. Largura do modal
Em `src/components/FunctionPermissionsModal.tsx`, o `DialogContent` hoje é `max-w-[95vw] xl:max-w-[1400px]`. Passa a usar praticamente toda a largura da tela (`w-[98vw] max-w-[98vw]`), com as tabelas continuando roláveis só quando realmente necessário. Também comprimo levemente as colunas (padding menor nas células e inputs `w-14`) para caber mais colunas sem scroll.

## 2. Classificação das colunas
Cada etapa recebe uma categoria:

```text
MÍDIA
 produção : planejar, criar_roteiro, criar_arte, captar,
            descarregar_captacao, gerar_video, editar_video
 revisão  : revisar_roteiro, revisar_captacao, revisar, revisar_publicacao
 espera/  : enviar_cliente, aguardando_cliente, publicar
 handoff

SISTEMAS
 produção : especificar, desenvolver, corrigir_bug_n1/n2/n3, ajustar
 revisão  : testar, revisar
 espera/  : entregar_cliente, aguardando_cliente, feedback_cliente
 handoff
```

Definição adotada: **Total produção = soma apenas das etapas de produção** (mão na massa). Revisão, envio/retorno de cliente e publicação são tempo de ciclo, não de produção.

## 3. Colunas de total
A tabela passa a ter duas colunas finais:
- **Total produção** — soma das etapas de produção marcadas como "Sim" (destacada, em negrito).
- **Total do ciclo** (renomeia o "Total" atual) — soma de todas as etapas, incluindo revisões e esperas. Fica em tom mais suave, com tooltip "Inclui revisões, envio/retorno de cliente e publicação".

Um cabeçalho de legenda curto acima da tabela explica a diferença.

## Detalhes técnicos
- Novo mapa `STAGE_KIND: Record<string, "producao" | "revisao" | "espera">` por área, no mesmo arquivo.
- `rowSubtotal(demandKey, group, kinds?)` ganha um filtro opcional de categorias; usado duas vezes por linha.
- Cabeçalhos das colunas de produção recebem um leve realce visual (fundo sutil) para deixar claro o que compõe o total de produção.
- Nenhuma mudança em banco de dados, cálculos de reorganização de sequência ou em `reorderSequence.ts` — é só apresentação.
