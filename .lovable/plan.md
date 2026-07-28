## Diagnóstico da aba "Alocação por área"

Verifiquei o código: `FunctionPermissionsModal.tsx` já renderiza 3 tabs (`grid-cols-3`) com Participação / Tempo estimado / Alocação por área, importando `AreaAllocationTab` de `src/components/config/AreaAllocationTab.tsx`. Não há gate por role, feature flag ou condicional escondendo o terceiro TabsTrigger. O print mostra apenas 2 abas → é preview servindo bundle antigo (mesmo cenário do kill-switch anterior, agora aparentemente reincidente para esse deploy específico).

## Plano

### 1. Forçar refresh do modal (segurança contra cache)
- Adicionar `key` versionado no `<Tabs>` para invalidar componente em clientes que hidratarem versão antiga.
- Confirmar que `AreaAllocationTab` está no grafo de imports (já está — import estático no topo). Sem lazy/dynamic import, o Vite empacota junto.
- Nenhuma outra alteração de código necessária para "aparecer" — se ainda não aparecer após rebuild, orientar hard reload (Ctrl+Shift+R). O kill-switch do `index.html` já faz unregister de SW + `caches.delete` em toda origem no load.

### 2. `reorderSequence.ts` respeitando `user_area_schedules`

Hoje, `reorderSequence` usa `tenants.settings.work_hours` (janela genérica única). Vou torná-lo consciente de área:

- Aceitar novo parâmetro `workArea: 'midia' | 'sistemas'` (derivado de `demand.work_area`) e `assigneeId`.
- Buscar `user_area_schedules` do responsável para aquela área (todos os weekdays). Se houver linhas → usar como janelas válidas do dia (podem ser múltiplas por dia; mesclar/ordenar).
- Fallback: se colaborador não tem alocação naquela área, usar `tenants.settings.work_hours` como hoje (mantém compatibilidade).
- Ajustar o loop de preenchimento diário:
  - Para cada dia, iterar sobre os blocos ordenados; consumir minutos até esgotar duração, pular gaps de almoço/entre-blocos automaticamente (já não são blocos válidos).
  - Ao passar de 12h ou fim do bloco, saltar para próximo bloco daquele dia; se acabaram, ir ao próximo dia hábil.
- Reordenar por coluna hoje mistura cards das duas áreas na mesma fila do responsável. Corrigir: agrupar cards por `work_area` do card e alocar cada grupo dentro dos horários da sua área. Dessa forma, "cards de mídia ao chegarem em 12h já começam a considerar conclusão no próximo dia" (se o colaborador só tem 8h–12h em mídia naquele dia).

### 3. Hard-block de conflito entre áreas (opcional-forte)

Hoje `areaConflicts.ts` retorna aviso soft ao mudar data/hora no `TaskCard`. Objetivo: bloquear quando houver sobreposição de janela do MESMO responsável entre um card da outra área.

- Manter `areaConflicts.ts` como fonte de verdade da checagem.
- Novo modo `mode: 'warn' | 'block'`. `block` roda a mesma query mas retorna lista de conflitos hard (mesmo responsável, outra área, janelas sobrepostas em `publish_date/publish_time` + duração estimada via matriz).
- No `TaskCard.tsx`, ao salvar mudança de responsável/data/hora/área:
  - Se conflitos hard existem → abrir `AlertDialog` "Este horário já está ocupado por demandas de {outra área}. Escolha outra data/horário." com botões "Cancelar" e "Manter mesmo assim" (para não engessar 100% — decisão explícita).
  - Se apenas soft (mesma área, mesmo dia próximo) → toast amarelo como já é hoje.
- No formulário de criação (`createCardFromContent.ts` / form manual) aplicar mesma checagem antes do INSERT.
- Não alterar realtime nem migrations — é lógica cliente/edge apenas.

### Arquivos a alterar

```text
src/lib/reorderSequence.ts        // área-aware + múltiplos blocos por dia
src/lib/areaConflicts.ts          // adicionar modo 'block'
src/components/TaskCard.tsx       // AlertDialog para conflito hard
src/lib/createCardFromContent.ts  // checagem no create
src/components/FunctionPermissionsModal.tsx  // key de versão no Tabs
```

Sem migrations. Após aplicar, testar reagendando um card de sistemas sobre janela de mídia do mesmo responsável para validar o hard-block.
