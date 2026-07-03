
# Padronização segura de tipo de demanda — implementação (código)

Migration já rodada com sucesso (coluna `demand_type_key`, CHECK, índice e backfill conservador). Falta aplicar as mudanças de código.

## Arquivos a alterar

**1. `src/lib/proceedDemand.ts` (reescrever)**
- Adiciona `DemandTypeKey`, `OFFICIAL_DEMAND_TYPES`, `DEMAND_TYPE_LABEL`, `coerceDemandTypeKey`.
- `normalizeDemandTypeKey` novo comportamento:
  - Contém `+` → `null` (compostos).
  - `carrossel`/`carousel` → `carrossel`.
  - `captad` → `video_captado`.
  - `gerad`/`gerar` + vídeo → `video_gerado`.
  - Só `vídeo`/`reels`/`tiktok`/`vídeos curtos` → `null` (ambíguo).
  - `estát`/`post`/`story`/`stories` → `criativo_estatico`.
  - Sem match → `null`. Sem fallback.
- `proceedDemand` recebe `demandTypeKey` (não `demandType`); se nulo → `{ success:false, needsTypeKey:true, message:"Defina o tipo da demanda antes de prosseguir." }`.

**2. `src/components/TaskCard.tsx`**
- `KanbanCardData`: adicionar `demand_type_key?: string | null`.
- Importar `OFFICIAL_DEMAND_TYPES`, `DEMAND_TYPE_LABEL`, `DemandTypeKey`.
- `handleProceed`: bloquear com toast quando `demand_type_key` for null; usar `demandTypeKey` no `proceedDemand`.
- Novo `handleSetDemandType(key)`: `UPDATE demands SET demand_type=<label>, demand_type_key=<key>` + `onCardChange`.
- UI "Definir tipo": quando `card.demand_type_key` for null, renderizar um bloco (badge amarelo + 4 botões) no topo do modal, próximo ao título/tipo. Botão Prosseguir fica `disabled` com tooltip explicando.

**3. `src/pages/KanbanCentralPage.tsx`**
- `CentralKanbanCard` já herda `demand_type_key` de `KanbanCardData`.
- Selects usam `*` → já vem. Adicionar `demand_type_key: data.demand_type_key ?? null` em: `handleDemandInsert` (l.323), `mapDemand` (l.548), `handleDemandFullUpdate` (l.248) e `handleCardChange` (l.622).

**4. `src/pages/CollaboratorDemands.tsx`, `CronogramaGlobal.tsx`, `CompletedDemands.tsx`**
- Adicionar `demand_type_key: d.demand_type_key ?? null` no mapping (`select("*")` já traz o campo).

**5. `src/pages/PeriodClientList.tsx`**
- Incluir `demand_type_key` na string do `.select(...)` (linha ~254, que é explícita, não `*`).

**6. `src/pages/ApproveCards.tsx`**
- No `handleApprove` (l.212–260):
  - Importar `normalizeDemandTypeKey`, `coerceDemandTypeKey` de `@/lib/proceedDemand`.
  - `const explicitKey = coerceDemandTypeKey((card as any).demand_type_key || (card as any).type_key);`
  - `const demandTypeKey = explicitKey ?? normalizeDemandTypeKey(tipo);`
  - Adicionar `demand_type_key: demandTypeKey` no `insert`.

**7. `src/pages/RejectedCards.tsx`**
- Mesmo tratamento no `insert` (l.362).

**8. `src/pages/PlanPeriod.tsx`**
- No `demandsToInsert.map` (l.525–553):
  - `const explicitKey = coerceDemandTypeKey(anyItem.demand_type_key || anyItem.type_key);`
  - `demand_type_key: explicitKey ?? normalizeDemandTypeKey(tipo)`.

**9. `src/components/CreateDemandModal.tsx`**
- Substituir `DEMAND_TYPES` pelas 4 opções oficiais (`OFFICIAL_DEMAND_TYPES` importado de `@/lib/proceedDemand`), com rótulos "Criativo estático", "Carrossel", "Vídeo captado", "Vídeo gerado".
- Novo state `demandTypeKey: DemandTypeKey | ""`.
- Select passa a gravar `demandTypeKey` (key) e derivar `demand_type` do label.
- Validação: exigir escolha antes de salvar.
- Como o RPC `create_demand_from_template` não aceita `p_demand_type_key`, gravar depois via `UPDATE demands SET demand_type_key=<key> WHERE id=<result.demand_id>` (mesma abordagem já usada para `delivery_date` no arquivo).

**10. `supabase/functions/generate-period-plans/index.ts`**
- Adicionar helper server-side:
  - `BATCH_TO_KEY = { 'Post Estático':'criativo_estatico', 'Carrossel':'carrossel', 'Vídeos Curtos': null }`.
  - `normalizeTypeKey(text)` (mesmas regras do TS).
- No `jsonInstruction`, incluir campo `type_key` obrigatório: enum `"criativo_estatico" | "carrossel" | "video_captado" | "video_gerado" | null`, com instrução clara:
  - `video_captado` quando precisar gravação real (pessoa/local/produto/depoimento).
  - `video_gerado` quando puder ser 100% IA/animação/motion/stock.
  - Se não tiver certeza → `null`.
- Após parse (l.457–460), enriquecer cada item:
  ```ts
  const forcedKey = batchType ? BATCH_TO_KEY[batchType] ?? null : null;
  const iaKey = coerceKey(d.type_key);
  const type_key = forcedKey ?? iaKey ?? normalizeTypeKey(d.tipo);
  ```
  e salvar `type_key` junto de `tipo` no objeto persistido em `default_plan`/`ultra_plan`.

## Fora do escopo (não fazer agora)

Catálogo `demand_types`, `is_ad`, mudanças em `anuncio`, fluxo, status, Kanban, publicação, agendamento, permissões, auto-generate-post/carousel/aspect/dispatch (continuam usando substring por ora).

## Testes manuais após deploy

1. Rodar `SELECT demand_type, demand_type_key FROM demands` → confirmar backfill (Post Estático → `criativo_estatico`, Carrossel* → `carrossel`, vídeos/ambíguos → `NULL`).
2. Abrir card com `demand_type_key = NULL` → aparece CTA "Definir tipo"; Prosseguir bloqueado.
3. Escolher "Carrossel" → grava rótulo + key; Prosseguir volta a funcionar.
4. Criar demanda manual → obriga escolha das 4 opções; grava ambos os campos.
5. Aprovar card do Planejar com `tipo="Post Estático"` → demanda com `demand_type_key="criativo_estatico"`.
6. Aprovar card com `tipo="Vídeos Curtos"` sem `type_key` → demanda com `demand_type_key=NULL`; CTA aparece.
7. Gerar novo Planejar → checar logs da edge: cada item traz `type_key` ou explicitamente `null`.
