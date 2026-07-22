
## 1. Preview mostrando versões antigas (PWA/Service Worker)

**Causa raiz confirmada:** `vite.config.ts` registra o `VitePWA` com `registerType: "autoUpdate"` sem restringir ao modo `production`. Isso instala um Service Worker também no preview do editor (`id-preview--*.lovable.app`) e no dev; o SW passa a servir a versão em cache mesmo após deploys/edits, exatamente o sintoma relatado.

**Correção:**
- Em `vite.config.ts`, habilitar o `VitePWA` somente quando `mode === "production"` (o plugin sai do array via `.filter(Boolean)`, mesmo padrão já usado para `componentTagger`).
- Adicionar `devOptions: { enabled: false }` para garantir que nada seja registrado no dev.
- Manter `registerType: "autoUpdate"` para produção (`icis.lovable.app`).

Isso encerra a instalação do SW no preview a partir do próximo build. Para navegadores que já pegaram o SW antigo, um hard-reload uma única vez (ou "Unregister" em DevTools → Application) resolve — não há como forçar unregister remoto sem manter um SW ativo, então essa é a via padrão.

## 2. Modelo de imagem: unificar em GPT Image 2 (fonte única de verdade)

**Diagnóstico das fontes de verdade hoje:**

| Fluxo | Onde | Modelo efetivo |
|---|---|---|
| Conteúdo avulso (ClientHub → Gerar estático/carrossel com IA) | `src/pages/ClientHub.tsx` | ✅ `gpt2` (default do estado) |
| Aprovação de plano dispara auto-geração | `src/lib/evaluatePlanCard.ts` invoca `auto-generate-post` **sem `aiModel`** | ❌ cai no `DEFAULT_IMAGE_MODEL = "nanobanana3"` de `supabase/functions/_shared/models.ts` |
| TaskCard → "Gerar estático com IA" / "Regerar tudo" / "Regerar slide" | `src/components/TaskCard.tsx` invoca `generate-post-image` / `auto-generate-carousel` **sem `aiModel`** | ❌ mesmo default `nanobanana3` |
| Backend default | `supabase/functions/_shared/models.ts` → `DEFAULT_IMAGE_MODEL` | ❌ `nanobanana3` |

**Correção (mesma fonte de verdade, alinhada ao que ClientHub já usa):**

1. `supabase/functions/_shared/models.ts`: trocar `DEFAULT_IMAGE_MODEL` de `"nanobanana3"` para `"gpt2"`. Isso já resolve os fluxos que não passam `aiModel` (evaluate/aprovação e TaskCard), sem precisar alterar cada call site.
2. `src/lib/evaluatePlanCard.ts`: passar `aiModel: "gpt2"` explicitamente no `invoke("auto-generate-post" | "auto-generate-carousel")`, para deixar a intenção clara no client e não depender só do default do server.
3. `src/components/TaskCard.tsx`: nos três `invoke` (`handleGenerateImages`, `handleRegenerateAll`, `handleRegenerateSlide`) enviar `aiModel: "gpt2"` no body — mesma razão.
4. Não alterar os `<Select>` do ClientHub — o usuário continua podendo trocar de modelo quando quiser.

## 3. Card "Yön Contadores – Como ler seu Demonstrativo Financeiro em 5 minutos" sem anexo

**Estado atual (consulta ao banco):** `id=8636b9a7-5054-45cf-bc85-d264001a445d`, `demand_type_key=criativo_estatico`, `source=ultra_card`, `attachments=[]`. O card foi criado por aprovação (auto-geração de estático), mas a geração inicial não produziu imagem — provavelmente falhou silenciosamente (o card fica no fluxo mesmo sem anexo).

**Correção:** não precisa migração — basta o usuário clicar em **"Gerar estático com IA"** no card **depois** dos ajustes do item 2. Com o default em `gpt2` e o TaskCard enviando `aiModel: "gpt2"`, a geração vai usar GPT Image 2 e preencher o anexo.

Se preferir, posso disparar manualmente a função `auto-generate-post` para esse `demandId` uma única vez em modo build, para não depender do clique.

## Detalhes técnicos

- Arquivos alterados: `vite.config.ts`, `supabase/functions/_shared/models.ts`, `src/lib/evaluatePlanCard.ts`, `src/components/TaskCard.tsx`.
- Sem migração de banco.
- Sem mudança nos prompts, tamanhos de imagem, ou lógica de anexos.
- Sem mexer nos seletores de modelo do ClientHub (usuário continua podendo escolher Nanobanana 3/2.5).
