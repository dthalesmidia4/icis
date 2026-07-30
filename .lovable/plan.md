## O erro

O cabeçalho do layout (a faixa branca no topo, ao lado do menu) renderiza apenas o breadcrumb de navegação. Em `src/hooks/useBreadcrumb.tsx` o mapa `routeConfig` **não tem entradas** para `/customer-success-sistemas` nem `/clientes-sistemas`.

Sem entrada, o hook cai no fallback (`[{ label: 'Home' }]`), `hasMultipleLevels` fica `false` e o `NavigationBreadcrumb` retorna `null` — resultado: a faixa do topo aparece completamente vazia, exatamente como no print. O título da página ("Customer Success · Sistemas") continua no corpo porque é ele quem carrega a identidade da tela, como na Visão Geral.

## Correção

Em `src/hooks/useBreadcrumb.tsx`, adicionar ao `routeConfig`:

- `/customer-success-sistemas`: Home → Visão Geral (`/kanban-central`) → "Customer Success" (ícone `HeartPulse`)
- `/clientes-sistemas`: Home → Visão Geral (`/kanban-central`) → "Customer Success" (`/customer-success-sistemas`) → "Clientes Sistemas" (ícone `Building2`)

Importar `HeartPulse` e `Building2` do `lucide-react` no arquivo.

## Verificação

Abrir `/customer-success-sistemas` e `/clientes-sistemas` no preview e confirmar que a faixa superior mostra o caminho navegável (Home › Visão Geral › Customer Success), sem faixa vazia e sem botão "voltar" solto.
