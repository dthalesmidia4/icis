# Novo Hub do Cliente (Mídia)

Substituir a grade de 10 botões por uma tela de trabalho do cliente, no formato do app de referência: cabeçalho com o **período planejado em andamento** + 4 abas.

## Estrutura da tela

```text
[ voltar ]  NOME DO CLIENTE                       [ 16 ago — 04 out ]
PERÍODO EM ANDAMENTO • <título do período>
Título grande + subtítulo curto           [ 35 publicações ] [ 49 dias ] [ 10 anúncios ]

Barra de ações:  Anamnese · Estratégia · Identidade Visual · Planejar Período · Avaliar Demandas (badge) · Cadastro do cliente · Criar conteúdo

Abas:  Estratégia | Calendário | Demandas | Cuidados fundamentais
```

- Cabeçalho lê o período em andamento do cliente (o mais recente não arquivado) e mostra intervalo de datas + 3 métricas derivadas das demandas do período.
- Sem período em andamento: cabeçalho vira estado vazio com o caminho de preparação (Anamnese → Estratégia → Identidade Visual → Planejar Período), e as abas mostram vazio orientado.
- Barra de ações compacta (chips), não cards grandes. Mantém as permissões atuais por botão (`canAccessButton`) e o bloqueio de "Planejar Período" sem Identidade Visual.

## Abas

**Estratégia** — resumo estratégico do período: arquitetura/eixos do plano, distribuição por tipo de conteúdo (estáticos, vídeos, carrosséis), critério de aprovação e rotina diária, a partir do JSON do período e da estratégia geral do cliente.

**Calendário** — visão de calendário/timeline do período com as demandas por dia (absorve o "Cronograma Atual"), com o dia de hoje destacado e clique abrindo o card.

**Demandas** — lista densa, buscável e filtrável por tipo/etapa, com data, título, tipo, responsável e status; inclui a leitura de progresso hoje presente em "Evolução das Demandas" (atenuando concluídos e "publicar agendado"). Link secundário para "Histórico de Períodos".

**Cuidados fundamentais** — exigências de conteúdo do cliente (`content_requirements`) + diretrizes estratégicas da anamnese, em lista numerada, com edição inline (mesmo salvamento atual) e painel lateral de responsáveis/fontes.

## O que acontece com as telas atuais

- `Cronograma Atual`, `Evolução das Demandas` e `Histórico de Períodos` deixam de ser botões: são absorvidos nas abas Calendário/Demandas; `Histórico` fica como link discreto na aba Demandas.
- As páginas `/client-evolution`, `/plan-period`, `/approve-cards`, `/rejected-cards`, `/content-history`, `/strategies`, `/client-guide` continuam existindo (rotas intactas) — nada é removido.
- "Evolução das Demandas" continua acessível dentro da Visão Geral das Tarefas, como hoje.
- Conteúdo Avulso e Demanda Planejada continuam nos modais atuais, acionados pela barra de ações.

## Detalhes técnicos

- `src/pages/ClientHub.tsx` (3.9k linhas) fica só como container: novo `src/components/client-hub/ClientHubHeader.tsx`, `ClientHubActionBar.tsx` e as abas `StrategyTab.tsx`, `CalendarTab.tsx`, `DemandsTab.tsx`, `GuidelinesTab.tsx`. Toda a lógica dos modais de geração (vídeo/carrossel/post/Seedance) permanece intacta no arquivo atual.
- Aba controlada por query param (`/client-hub?tab=calendario`) para manter link direto e voltar sem perder contexto.
- Dados: `period_plans` (período em andamento, `final_plan`/`ultra_plan`), `demands` filtradas por `client_id` + `period_plan_id`, `tenant_companies.content_requirements`, estratégia/anamnese existentes. Nenhuma mudança de banco.
- Estilo com tokens do design system (primary azul, sem cores hardcoded), tipografia grande no cabeçalho e linhas de lista finas, como no app de referência.
