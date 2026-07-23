# Atualizar preços oficiais do Seedance (BytePlus Model Ark)

## Objetivo
Reescrever a tabela `seedance_pricing` com os valores oficiais colados do console BytePlus, substituindo os valores estimados atuais. Nenhuma mudança de código — apenas dados.

## Modelos e preços a aplicar

Conversão: 1 USD ≈ R$ 5,50 · custo interno 1 crédito = R$ 0,22 (mantido).

| model_key | Modelo oficial | Preço oficial (online) | Notas |
|---|---|---|---|
| `v15_pro` | ByteDance-Seedance-1.5-pro | US$ 0,0024/K tokens **com áudio** · US$ 0,0012/K tokens **sem áudio** | Áudio nativo |
| `v2` | Dreamina-Seedance-2.0 | US$ 0,0040/K tokens (sem vídeo de entrada) · US$ 0,0024/K tokens (com vídeo) | Não-4K compartilhado |
| `v2_fast` | Dreamina-Seedance-2.0-fast | US$ 0,0056/K tokens (sem vídeo) · US$ 0,0033/K tokens (com vídeo) | 720p apenas |
| `v2_mini` | Dreamina-Seedance-2.0-mini | US$ 0,0035/K tokens (sem vídeo) · US$ 0,0021/K tokens (com vídeo) | 720p apenas |
| `pro_fast` | ByteDance-Seedance-1.0-pro-fast | US$ 0,0010/K tokens (i2v e t2v) | Fallback barato, sem áudio |

## Ações

1. **Migration única** (`UPDATE public.seedance_pricing ...`) via `supabase--insert`:
   - Atualiza `usd_per_1k_tokens`, `usd_per_1k_tokens_with_audio` (onde aplicável), `credit_per_1k_tokens` (recalculado a partir do USD × 5,50 / 0,22) para cada `model_key` acima.
   - Preserva linhas existentes; apenas faz `UPDATE` (ou `INSERT ... ON CONFLICT`) por `model_key`.

2. **Verificação**: `SELECT` final para confirmar as 5 linhas atualizadas.

## Fora de escopo
- Não altera `useSeedancePricing`, `CostBadge`, edge functions ou UI.
- Não adiciona modelos Seedream/3D (decisão do usuário).
- Não altera a taxa de conversão R$ 0,22/crédito.
