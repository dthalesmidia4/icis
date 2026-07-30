## Resposta direta: sim, havia redundância

O conjunto anterior misturava quatro coisas. Definição final, sem sobreposição:

| Etapa | O que é | Quem age |
|---|---|---|
| ~~`triagem`~~ | **Removida.** Era o mesmo que `especificar` (entender/dimensionar o pedido). | — |
| `especificar` | Entender o pedido, definir escopo, nível/estimativa | Equipe |
| `entregar_cliente` | Colocar em produção/entregar e **avisar** o cliente | Equipe |
| `aguardando_cliente` | Card parado esperando **validação/homologação** do cliente | Cliente |
| `feedback_cliente` | Contato de **relacionamento** depois da entrega validada: como está, o que melhorou, o que falta | Equipe (CS) |

`entregar_cliente` é ação, `aguardando_cliente` é espera, `feedback_cliente` é relacionamento — são momentos distintos. Para demanda **interna** as três desaparecem do fluxo.

## Fluxo por origem

Nova coluna `demands.origin`:

- `interno` — ideia/manutenção da própria equipe
- `cliente_solicitacao` — o cliente pediu
- `cliente_feedback` — veio de visita/reunião/feedback coletado
- `suporte` — chamado/incidente do cliente

Regra: as etapas marcadas como **"só com origem cliente"** (`entregar_cliente`, `aguardando_cliente`, `feedback_cliente`) são automaticamente puladas quando `origin = 'interno'`, reaproveitando o mecanismo de skip em cascata que já existe no `proceedDemand`. Sem duplicar configuração de fluxo: a mesma sequência serve às duas origens.

```text
cliente_solicitacao / cliente_feedback / suporte:
  especificar → desenvolver|corrigir_bug_N → testar → entregar_cliente
              → aguardando_cliente → feedback_cliente → concluído

interno:
  especificar → desenvolver|corrigir_bug_N → testar → revisar → concluído
```

Origem é escolhida na criação da demanda de Sistemas (default `interno`); trocar a origem no card recalcula as etapas restantes.

## Etapas de Sistemas (final)

| key | Nome | Duração | Tipo |
|---|---|---|---|
| `especificar` | Especificar | 30 min | produção |
| `desenvolver` | Em desenvolvimento | 4 h | produção (sticky) |
| `corrigir_bug_n1` | Correção de bug — Nível 1 | 30 min | produção |
| `corrigir_bug_n2` | Correção de bug — Nível 2 | 2 h | produção |
| `corrigir_bug_n3` | Correção de bug — Nível 3 | 8 h (quebra em dias) | produção |
| `testar` | Testar | 30 min | revisão (nunca auto-revisão) |
| `ajustar` | Ajustar | 1 h | produção |
| `entregar_cliente` | Entregar ao cliente | 15 min | só origem cliente |
| `aguardando_cliente` | Aguardando cliente | — | só origem cliente |
| `feedback_cliente` | Feedback ao cliente | 15 min | só origem cliente |

Tipos de demanda de Sistemas: `bug_n1`, `bug_n2`, `bug_n3`, `desenvolvimento`, `melhoria`, `suporte`.
`flow_functions` e `demand_type_flow_rules` ganham `work_area`, então Mídia e Sistemas passam a ter fluxos independentes e a tela de configuração ganha abas por área.

## Cadastro leve de cliente (Sistemas)

- Campos hoje obrigatórios em `tenant_companies` (cnpj_cpf, sector, size, products_services, email, phone) passam a opcionais com default `''` — o cadastro completo de mídia continua igual.
- Modal **"Novo cliente (Sistemas)"**: só **nome** obrigatório; contato, responsável e observação opcionais; grava `default_work_area = 'sistemas'`.
- Criável direto do formulário de demanda, sem passar por identidade visual/estratégia.
- Campo por cliente: **cadência de contato desejada** (`contact_cadence_days`, default 30) — base do termômetro de relacionamento.

## Customer Success de Sistemas — relacionamento medido, não adivinhado

### Fonte de verdade: pontos de contato

Nova tabela `client_touchpoints` (tenant, client, tipo, data, autor, resumo, `demand_id` opcional). É alimentada de duas formas:

1. **Automática** — cada `entregar_cliente`, `aguardando_cliente` e `feedback_cliente` concluído grava um touchpoint vinculado à demanda (aproveita `demand_flow_history`, que já registra tudo).
2. **Manual** — botão "Registrar contato": visita, reunião, ligação, WhatsApp/e-mail, treinamento. Com resumo curto e opção de gerar demanda a partir do que foi coletado (origem `cliente_feedback`).

### Termômetro de relacionamento

Para cada cliente: `dias_sem_contato = hoje − último touchpoint`, comparado com a cadência do cliente.

| Faixa | Estado |
|---|---|
| ≤ 50% da cadência | Quente |
| 50–100% | Morno |
| 100–200% | Esfriando |
| > 200% ou nunca contatado | Frio |

Score de saúde (0–100), transparente e auditável no hover: recência de contato (peso 40), feedbacks pós-entrega dados vs. devidos (25), volume entregue no período (15), demandas atrasadas/travadas com o cliente (−15), tempo médio de resposta do cliente (5).

### Tela

- **Fila de ação no topo**: "entregues sem feedback", "clientes frios", "aguardando cliente há mais de X dias" — cada item com atalho para o card ou para registrar contato.
- **Gráfico de último contato** (barras horizontais por cliente, ordenado por dias sem contato, colorido pela faixa do termômetro, com linha-alvo da cadência) — responde "com quem preciso falar agora".
- **Timeline/heatmap de contatos** (12 meses × clientes): mostra visualmente relação que esfriou.
- **Linha de contatos por mês** (total e por tipo), para acompanhar a rotina de CS.
- **Detalhe do cliente**: histórico de touchpoints, demandas por origem e status, feedbacks pendentes, cadência editável.
- Badge de "feedback pendente"/"cliente frio" na Home, no padrão dos alertas atuais.

## Técnico

- Migração 1 (estrutura): `flow_functions.work_area`, `demand_type_flow_rules.work_area`, etapas + tipos de Sistemas, `demands.origin`/`origin_note`, `tenant_companies` NOT NULLs afrouxados + `contact_cadence_days`.
- Migração 2 (CS): tabela `client_touchpoints` com GRANTs (`authenticated`, `service_role`), RLS por tenant via `user_has_tenant_access`, trigger de `updated_at`, e backfill dos touchpoints históricos a partir de `demand_flow_history`.
- `src/lib/proceedDemand.ts`: keys novas em `DemandTypeKey`, sequência filtrada por `work_area`, skip das etapas de cliente quando `origin = 'interno'`, sticky nas etapas de desenvolvimento/bug.
- `src/lib/reorderSequence.ts`: grupos de duração `bug_n1|bug_n2|bug_n3|dev` e entradas na `DURATION_MATRIX` (N3 já respeita a quebra multi-dia existente).
- `src/lib/clientHealth.ts` (novo): cálculo de dias sem contato, faixa do termômetro e score — puro, testável, usado pela tela e pelos badges.
- `src/components/FunctionPermissionsModal.tsx`: abas Mídia/Sistemas lendo etapas e tipos do banco.
- Novos: `src/components/SystemsClientQuickCreateModal.tsx`, `src/components/cs/RegisterTouchpointModal.tsx`, `src/pages/CustomerSuccessSistemas.tsx` (+ rota, card na Home e realtime em `client_touchpoints`).
