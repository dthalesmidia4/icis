

# Plano de Migracao Revisado: Remocao de Tabelas + Ajustes de Performance

## Resumo

Remover 2 tabelas (`client_demand_template_stats` e `demand_pattern_scores`), adicionar indices compostos em `demand_feedback_events`, limitar janelas de agregacao, e atualizar todas as RPCs afetadas -- tudo sem alterar o contrato da RPC `get_contextual_planning_input`.

---

## Ordem de Execucao (5 migracoes sequenciais)

### Migracao 1: Preparar infraestrutura

**Adicionar colunas em `client_demand_templates`:**
- `times_used` (integer, default 0)
- `last_used_at` (timestamptz, nullable)
- `times_matched` (integer, default 0)
- `last_matched_at` (timestamptz, nullable)

**Migrar os 2 registros existentes** de `client_demand_template_stats` para as novas colunas.

**Criar indices compostos em `demand_feedback_events`:**
- `(client_id, created_at DESC)` -- query principal de agregacao
- `(client_id, event_type, created_at DESC)` -- filtro por tipo de evento
- `(client_id, demand_type, channel)` -- agrupamento por tipo/canal
- `(client_id, publish_weekday)` -- agrupamento por dia da semana
- `(client_id, demand_fingerprint)` -- agrupamento por fingerprint

Nota: Uso `client_id` em vez de `tenant_id, client_id` porque as queries de `get_contextual_planning_input` filtram por `client_id` (que ja eh unico por tenant). Isso reduz o tamanho do indice.

### Migracao 2: Atualizar RPCs que escrevem em `client_demand_template_stats`

**`create_demand_from_template`**: Substituir o bloco de INSERT/ON CONFLICT em `client_demand_template_stats` por UPDATE direto em `client_demand_templates`:

```text
UPDATE client_demand_templates 
SET times_used = times_used + 1, last_used_at = now()
WHERE id = p_template_id;
```

**`refresh_client_templates`**: Substituir UPDATE em `client_demand_template_stats` por UPDATE direto em `client_demand_templates`:

```text
UPDATE client_demand_templates
SET times_matched = v_pattern.occurrences, last_matched_at = now()
WHERE id = v_template_id;
```

**`get_client_demand_suggestions`**: Remover o `LEFT JOIN client_demand_template_stats` e ler `times_used` diretamente de `client_demand_templates`.

### Migracao 3: Atualizar `record_demand_feedback` (remover chamada ao `calculate_pattern_scores`)

Remover a linha:

```text
PERFORM calculate_pattern_scores(v_demand.client_id);
```

Isso desacopla o feedback da tabela de scores ANTES de dropar a funcao. Deploy e validacao acontecem aqui.

### Migracao 4: Reescrever `get_contextual_planning_input`

Substituir todas as queries que leem de `demand_pattern_scores` por agregacoes diretas em `demand_feedback_events` com janela de 120 dias.

**Contrato de resposta mantido identico:**

```text
{
  "success": true,
  "calendar_events": [...],         -- sem mudanca (br_calendar_events)
  "successful_patterns": [          -- MESMO FORMATO
    { "type": "...", "value": "...", "success_rate": N, "net_score": N }
  ],
  "failed_patterns": [              -- MESMO FORMATO
    { "type": "...", "value": "...", "failure_rate": N }
  ],
  "recent_fingerprints": [...],     -- sem mudanca (demand_fingerprints)
  "top_demand_types": [             -- MESMO FORMATO
    { "demand_type": "...", "success_count": N }
  ],
  "avoid_fingerprints": [           -- MESMO FORMATO
    { "fingerprint": "...", "reason": "..." }
  ],
  "period": { "start": "...", "end": "..." }
}
```

**Logica das queries agregadas (todas com `WHERE created_at >= now() - interval '120 days'`):**

- **successful_patterns**: Agrupa por `demand_type` e `channel`, calcula success_rate baseado em published+scheduled vs total
- **failed_patterns**: Mesma logica, filtra onde falhas > sucessos
- **top_demand_types**: Agrupa por `demand_type`, conta published+scheduled
- **avoid_fingerprints**: Agrupa por `demand_fingerprint`, filtra onde deletados >= 2

### Migracao 5: Dropar tabelas e funcao

```text
DROP TABLE IF EXISTS client_demand_template_stats;
DROP TABLE IF EXISTS demand_pattern_scores;
DROP FUNCTION IF EXISTS calculate_pattern_scores;
```

Executada apenas DEPOIS de validar que as migracoes 2-4 estao funcionando.

---

## Indices Existentes vs Novos

**Existentes (individuais -- serao mantidos):**
- `idx_feedback_events_client (client_id)`
- `idx_feedback_events_created (created_at DESC)`
- `idx_feedback_events_type (event_type)`
- `idx_feedback_events_fingerprint (demand_fingerprint)`

**Novos (compostos -- otimizados para agregacao):**
- `idx_dfe_client_created (client_id, created_at DESC)`
- `idx_dfe_client_event_created (client_id, event_type, created_at DESC)`
- `idx_dfe_client_type_channel (client_id, demand_type, channel)`
- `idx_dfe_client_weekday (client_id, publish_weekday)`
- `idx_dfe_client_fingerprint (client_id, demand_fingerprint)`

Os indices individuais antigos podem ser removidos futuramente pois os compostos os cobrem, mas nao sao urgentes.

---

## Impacto no Frontend

Nenhum. O frontend chama RPCs que terao a mesma assinatura e retorno.

## Impacto na Edge Function

Nenhum. `generate-period-plans` chama `get_contextual_planning_input` via RPC e usa os campos `calendar_events`, `successful_patterns`, `failed_patterns`, `recent_fingerprints`, `avoid_fingerprints`. Todos mantidos no mesmo formato.

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| RPCs quebrarem durante deploy | Migracoes em ordem: preparar -> atualizar RPCs -> dropar por ultimo |
| Query agregada lenta | Indices compostos + janela de 120 dias limitam scan |
| Perda de dados stats | 2 registros migrados antes do DROP |
| calculate_pattern_scores chamada residual | Removida em migracao separada (3) antes do DROP da funcao (5) |

## Resultado Final

- -2 tabelas
- -1 funcao RPC
- -3 politicas RLS
- +5 indices compostos otimizados
- Janela de agregacao limitada a 120 dias
- Contrato da RPC 100% preservado
- Zero mudancas no frontend e Edge Function
