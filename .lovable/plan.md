## Aferição dos modelos vs. sua nova chave

Confirmei na documentação oficial do BytePlus Model Ark (região ap-southeast-1, endpoint `https://ark.ap-southeast.bytepluses.com/api/v3`) — que é exatamente o endpoint que já usamos — quais IDs de vídeo estão ativos hoje:

| Nosso alias | ID atual no código | ID oficial correto | Status |
|---|---|---|---|
| `v2` | `dreamina-seedance-2-0-260128` | `dreamina-seedance-2-0-260128` | ✅ correto |
| `pro` | `seedance-1-0-pro-250528` | `seedance-1-0-pro-250528` | ✅ correto |
| `lite` | `seedance-1.0-lite` | **não existe nesse formato** | ❌ inválido (pontos + sem sufixo de versão). O Ark hoje não lista mais um Seedance 1.0 lite genérico — expõe apenas variantes `t2v` / `i2v` datadas |

Além disso, sua chave habilita 4 modelos de vídeo que hoje o código **não usa**:
- `dreamina-seedance-2-0-fast-260128` — 2.0 Fast (480p/720p, mais barato, mesma duração 4-15s)
- `dreamina-seedance-2-0-mini-260615` — 2.0 Mini (idem, ainda mais barato)
- `seedance-1-5-pro-251215` — 1.5 pro (480p/720p/1080p, 4-12s, sync audiovisual)
- `seedance-1-0-pro-fast-251015` — 1.0 pro fast (versão barata do 1.0 pro)

## O que corrigir

### 1. `supabase/functions/generate-video-scene-seedance/index.ts`
Substituir o mapa `MODEL_ID` por IDs oficiais e adicionar as novas tiers:

```ts
const MODEL_ID = {
  pro_1_0:      "seedance-1-0-pro-250528",      // hoje "pro"
  pro_1_0_fast: "seedance-1-0-pro-fast-251015", // novo
  pro_1_5:      "seedance-1-5-pro-251215",      // novo (recomendado como default)
  v2:           "dreamina-seedance-2-0-260128", // com áudio
  v2_fast:      "dreamina-seedance-2-0-fast-260128",
  v2_mini:      "dreamina-seedance-2-0-mini-260615",
};
```

- **Remover o `lite`** (o ID atual não resolve na Ark direta).
- Manter compatibilidade: se `body.model === "lite"` chegar de UI antiga, mapear para `pro_1_0_fast`.
- Ajustar `isV2` para incluir os 3 aliases da família 2.0 (todos aceitam `generate_audio` e áudio de voz).
- Ajustar limites de duração conforme docs: família 2.0 = 4-15s; 1.5 pro = 4-12s; 1.0 pro = 2-12s.
- Ajustar `maxRefs`: apenas 2.0 aceita multi-reference (até 9); demais = 2 imagens (first+last).

### 2. `supabase/migrations/…` — `seedance_pricing`
A tabela hoje tem `CHECK (model_key IN ('lite','pro','v2'))`. Criar migração para:
- `DROP` constraint e recriar com o novo enum: `('pro_1_0','pro_1_0_fast','pro_1_5','v2','v2_fast','v2_mini')`.
- Substituir linhas antigas pelas novas taxas por resolução (buscar da página oficial de Pricing do BytePlus antes de aplicar).
- `GRANT` já cobertos.

### 3. UI: `src/pages/ClientHub.tsx` (seletor de engine no fluxo Seedance)
- Renomear o dropdown de engines: **Seedance 1.5 Pro** (default recomendado), **Seedance 2.0** (com áudio), **2.0 Fast**, **2.0 Mini**, **1.0 Pro**, **1.0 Pro Fast**.
- `CostBadge` já lê `seedance_pricing`; passa a receber a nova key.
- Manter Veo 3 como opção paralela.

### 4. Sem mudança de segredos
`SEEDANCE_ARK_API_KEY` já está atualizada com a chave direta do console BytePlus — nenhum ajuste adicional.

## Diagnóstico honesto

- ✅ O `pro` (1.0) e o `v2` (2.0) estão corretos e devem ter funcionado na sua última geração — a chave nova é aceita, só não usou o áudio nem 1.5.
- ❌ Se alguém selecionar `lite` na UI, o Ark retorna 4xx (ID inválido). Provavelmente ninguém está selecionando — mas é uma bomba-relógio.
- ➕ Vale muito ativar **1.5 pro** como default (mais barato que 2.0, tem qualidade próxima, aceita first+last frame) e expor **2.0 Fast/Mini** para quando o cliente quer volume barato.

## Detalhes técnicos

- Endpoint continua `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` — não muda.
- Payload continua idêntico (`model`, `content[]` com `text` + `image_url`, `ratio`, `duration`, `resolution`, `watermark`, `generate_audio`).
- Áudio de voz (`audio_url` no content) é aceito **apenas** pela família 2.0 — manter guard.
- Precisamos consultar a página de Pricing oficial (docs 1544106) antes de aplicar as novas linhas de `seedance_pricing` para não chutar valor.

Quer que eu prossiga com essas 3 alterações (edge function + migração de pricing + seletor no ClientHub)?
