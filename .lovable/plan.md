# Reorganização do fluxo de Storyboard de Vídeo

Você tem razão nos três pontos. O fluxo atual mistura decisões que pertencem a etapas diferentes e usa rótulos (`lite`/`pro`/`v2`) que não batem com o que a BytePlus mostra no site. A ideia é enxugar o passo 1 para uma única decisão (motor) e empurrar toda a configuração técnica do Seedance para o passo 2, onde ela faz sentido por cena.

## Mudanças

### 1. Passo 1 — só motor e ideia
- Padrão do motor passa a ser **Veo 3** (mais barato / previsível). Seedance vira opção secundária.
- Remove do passo 1: seletor "Modelo Seedance" (lite/pro/v2) e qualquer resolução implícita.
- Mantém no passo 1: ideia do vídeo, motor, formato (9:16/16:9/1:1/4:5), predefinição visual, mascote.
- Botão principal:
  - Veo 3 → "Criar cenas" (fluxo atual de N cenas de 8s).
  - Seedance → "Planejar Storyboard Seedance" (chama o planner de IA como hoje, mas sem forçar modelo — o planner devolve só a quantidade de clipes e as descrições multi-shot).

### 2. Passo 2 — configuração técnica por cena (Seedance)
Cada card de cena passa a expor, quando o motor é Seedance:
- **Modelo Seedance** com rótulos alinhados ao site oficial da BytePlus:
  - `Seedance 2.0` (padrão) — duração 4–15s, resoluções `480p` / `720p` / `1080p` / `4K`.
  - `Seedance 2.0 Fast` — duração 4–15s, resoluções `480p` / `720p`.
  - `Seedance 2.0 Mini` — duração 4–15s, resoluções `480p` / `720p`.
  - (Mantém internamente `lite`/`pro` do Seedance 1.x apenas se ainda tivermos acesso pela chave — mas escondidos por trás de um "Avançado" para não confundir. Se preferir remover totalmente, é só dizer.)
- **Resolução** — chips filtrados dinamicamente pelo modelo escolhido (só mostra o que aquele modelo aceita).
- **Duração** — slider 4–15s (limite do 2.0). Some o clamp 5–10s do 1.x.
- **Custo estimado** via `CostBadge` recalcula em tempo real conforme modelo × resolução × duração.

### 3. Ajustes de backend
- `generate-video-scene-seedance/index.ts`:
  - Novo mapa `MODEL_ID` cobrindo `seedance-2-0`, `seedance-2-0-fast`, `seedance-2-0-mini` (IDs oficiais confirmados na chamada de create). Legados `lite`/`pro` ficam como aliases se mantivermos o "Avançado".
  - Ranges de duração unificados em 4–15s para 2.0 e submodelos.
  - Validação de resolução por modelo (Fast/Mini rejeitam 1080p/4K).
- `suggest-seedance-storyboard/index.ts`:
  - Deixa de decidir modelo. Devolve só `clips[]` com `target_duration_seconds` já dentro de 4–15s.
  - O `handleApplySeedancePlan` no `ClientHub.tsx` cria as cenas já com `model = seedance-2-0` e `resolution = 1080p` como defaults, editáveis por cena.
- `seedance_pricing` (Dev › Preços): reseed com as linhas exatas do print (Seedance 2.0 × 480/720/1080/4K, Fast × 480/720, Mini × 480/720). Remove linhas `lite`/`pro` antigas se decidirmos aposentá-las.

### 4. Draft / persistência
- `VIDEO_DRAFT_SCHEMA_VERSION` sobe para `3` (novo shape do passo 1 sem `seedanceDefaultModel`, motor default = `veo`). Drafts antigos são descartados automaticamente pelo guard existente.
- `videoScenes[i]` ganha `model`, `resolution`, `durationSeconds` como campos por cena (hoje já existem no editor de cena; passam a ser autoritativos e não dependem mais do "modelo padrão" do passo 1).

## Detalhes técnicos

Arquivos tocados:
- `src/pages/ClientHub.tsx` — remove `seedanceDefaultModel` do passo 1, muda default de `videoEngineChoice` para `'veo'`, migra seletor de modelo/resolução para dentro do editor de cena, sobe `VIDEO_DRAFT_SCHEMA_VERSION`.
- `supabase/functions/generate-video-scene-seedance/index.ts` — atualiza `MODEL_ID`, limites de duração e validação de resolução.
- `supabase/functions/suggest-seedance-storyboard/index.ts` — remove `model` do payload/prompt, ajusta range de duração para 4–15s independentemente do modelo.
- `src/hooks/useSeedancePricing.ts` + `src/components/avulso/CostBadge.tsx` — passam a aceitar as novas chaves de modelo (`seedance-2-0`, `seedance-2-0-fast`, `seedance-2-0-mini`).
- Migração SQL: `UPDATE`/`INSERT` em `seedance_pricing` para refletir a tabela oficial do print.

Ponto a confirmar antes de eu implementar:
- **Você quer remover totalmente os modelos Seedance 1.x (`lite`/`pro`) ou mantê-los escondidos num "Avançado"?** Eles ainda funcionam pela chave BytePlus e são mais baratos, mas se você prefere só o 2.0 no site, eu limpo tudo.

Diagrama do novo fluxo:

```text
Passo 1 (modal)
  Ideia + Motor (Veo padrão | Seedance) + Formato + Identidade + Mascote
        │
        ├── Veo 3 ─────► "Criar cenas" (N cenas fixas de 8s)
        │
        └── Seedance ──► "Planejar Storyboard Seedance" (IA sugere 1–3 clipes)
                                │
                                ▼
Passo 2 (editor de cenas)
  Por cena: prompt + [Modelo 2.0 / Fast / Mini] + [Resolução compatível]
            + [Duração 4–15s] + CostBadge ao vivo
```