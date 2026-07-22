## Objetivo
Corrigir três problemas independentes: preview servindo versão antiga (SW/PWA), fonte de verdade da IA de imagem no card (texto e seletor) e fluxo travado em "Reavaliar Conteúdo" em Demandas Reprovadas, incluindo o botão "Descartar" definido anteriormente.

---

### 1) Preview mostrando versão antiga (Kanban Central / gemini-2.0)
**Causa provável:** um Service Worker do `vite-plugin-pwa` anterior ficou registrado no navegador (do build antigo, quando o plugin rodava em modo dev também). Como agora o plugin só roda em produção, nada substitui o SW instalado — o browser continua servindo `index.html` e chunks antigos do cache Workbox.

**Correção (segue o skill/pwa "Existing Broken PWA"):**
- Adicionar `public/sw.js` como **kill-switch worker**: no `activate`, apaga apenas os caches Workbox desta origem, faz `clients.claim()`, força `navigate(client.url)` em todas as abas, e chama `self.registration.unregister()` dentro de `finally`.
- Manter `public/service-worker.js` (mesmo conteúdo) caso algum browser tenha registrado nesse path.
- Não alterar `vite.config.ts` (o VitePWA já está `mode === "production"`); o kill-switch destrona o registro antigo na próxima visita ao preview/publicado.

Efeito: na próxima abertura do preview, o SW antigo é substituído, caches Workbox são limpos, todas as abas fazem reload — e passam a ver a versão nova (com "Visão Geral" no header, gpt-image-2, etc.).

---

### 2) TaskCard → "Gerar estático com IA" continua mostrando Gemini
**Estado atual (verificado):**
- `handleGenerateImages` **já envia** `aiModel: "gpt2"` para `auto-generate-post`/`generate-post-image`/`auto-generate-carousel` (as edges usam `IMAGE_MODELS[aiModel]` corretamente).
- O que está desatualizado é **apenas o texto** do AlertDialog (`src/components/TaskCard.tsx` linha ~2370): `"Google Gemini (gemini-2.0-flash-exp-image-generation) via Google AI Studio"`.
- O fluxo "avulso" tem seletor de modelo, o do card não tem.

**Correção em `src/components/TaskCard.tsx`:**
- Remover o texto hardcoded de "Google Gemini …".
- Adicionar dentro do AlertDialog um **seletor de modelo** (`<Select>`) com as 3 opções de `IMAGE_MODELS` (rótulos: "GPT Image 2 (recomendado)", "Nanobanana 3 (Gemini Pro)", "Nanobanana 2.5 (Gemini Flash)"), default `"gpt2"`, salvo em estado local `selectedAiModel`.
- Passar `aiModel: selectedAiModel` (em vez do literal `"gpt2"`) em `handleGenerateImages` e `handleRegenerateAll`.
- Mostrar abaixo do select uma linha discreta com o `id` do modelo escolhido (para transparência), usando `IMAGE_MODELS[selectedAiModel].id`.

Nenhuma mudança de backend — as edges já respeitam `aiModel`.

---

### 3) "Reavaliar Conteúdo" em Demandas Reprovadas não avança
**O que o fluxo faz hoje** (`src/pages/RejectedCards.tsx` + `reevaluate-card` edge):
1. Usuário clica em Reavaliar → abre modal → digita motivo → clica "Reavaliar com IA".
2. Chama a edge `reevaluate-card` (2 chamadas OpenAI: reescrever o card e classificar aprendizado).
3. Se `learningStatus === 'meaningful'` ou `'ambiguous'`, abre o `ContentRequirementsDiffModal`. Se `'none'`, persiste direto.

**Prováveis causas de "não sai daí":**
- A edge falha (chave OpenAI ausente, timeout, parse) e o toast some rapidamente; ou
- A edge responde mas `handleDiffConfirm` fica travado no `diffSaving`; ou
- Persistência via `.update({ rejected_plan: … })` está falhando por RLS/coluna e o erro está sendo engolido.

**Correção em `src/pages/RejectedCards.tsx`:**
- Instrumentar melhor os erros: log completo do `error` da edge, toast persistente (`duration: 8000`) com a mensagem real, e reset garantido de `reevalLoading`/`diffSaving` em `finally`.
- Se a edge retornar 500, mostrar mensagem específica ("Verifique OPENAI_API_KEY em Dev → APIs") em vez do genérico.
- Consertar o bug do double-toast em `handleApproveCard` (linhas 441–454 disparam `toast.success` e `triggerAutoGenerate` duas vezes) — sintoma paralelo.
- Adicionar botão **"Descartar"** por card (definido no histórico como parte do fluxo de reprovação): remove o item de `rejected_plan` sem regerar nada, com `AlertDialog` de confirmação, atualiza estado localmente.

**Fluxo de reprovação consolidado (como ficou definido no histórico):**
- **Reprovar** (na tela de avaliação) → move para `rejected_plan` com motivo (aprendizado pode ser aplicado às exigências do cliente). Nada regenera automaticamente.
- Em **Demandas Reprovadas** o usuário decide:
  - **Reavaliar Conteúdo** → IA reescreve o card usando o motivo/estratégia; card volta reescrito, ainda em `rejected_plan`.
  - **Aprovar** → materializa como demand no Kanban.
  - **Descartar** (novo botão) → apaga o card definitivamente do `rejected_plan`. Sistema já aprendeu o motivo na hora da reprovação; não regenera.

---

### Detalhes técnicos
- Arquivos alterados: `public/sw.js` (novo), `public/service-worker.js` (novo), `src/components/TaskCard.tsx`, `src/pages/RejectedCards.tsx`.
- Sem migração de banco. Sem alteração em edge functions.
- `vite.config.ts` intocado — o kill-switch é servido como arquivo estático em `/sw.js` e o VitePWA em produção sobrescreve com o SW real do build atual, então em prod a substituição ocorre naturalmente após uma visita.

### Fora do escopo
- Refatorar `reevaluate-card` para trocar de modelo LLM.
- Mudar a lógica de "aprendizado" das exigências de conteúdo.
- Qualquer alteração no fluxo de aprovação em `ApproveCards.tsx` (já refatorado antes).
