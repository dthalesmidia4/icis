# Preenchimento por voz — Anamnese e Planejar Período (v4)

Único ajuste em relação ao v3: `disponibilidadeVideo` usa o enum canônico do sistema **`sim | nao | parcial`** (nunca `talvez` nem boolean).

## 1. Valor canônico de `disponibilidadeVideo`

- Tipo canônico: `"sim" | "nao" | "parcial"`.
- Frontend, edge, IA e persistência usam **os mesmos três literais**.
- A IA pode ouvir "talvez" na fala; o normalizador converte para `"parcial"` antes de aplicar.

Mapeamento de fala natural → valor canônico:
- `sim` — "consigo gravar vídeos", "temos disponibilidade para vídeo", "sim, vamos gravar", "com certeza".
- `nao` — "não teremos vídeos", "sem vídeos esse mês", "não conseguimos gravar", "impossível".
- `parcial` — "talvez alguns vídeos", "pouca disponibilidade", "podemos gravar parcialmente", "depende", "alguns vídeos", "as vezes".

## 2. Arquivos e trechos afetados por esse ajuste

### `src/lib/voiceFieldSchemas.ts`
- `VoiceFieldType`: renomeia `enum_sim_nao_talvez` → `enum_disponibilidade_video`.
- `PERIOD_PLANNING_FIELDS` → entrada `disponibilidadeVideo` fica com `type: "enum_disponibilidade_video"` e `hint: "sim | nao | parcial"`.
- Remove `normalizeSimNaoTalvez`; adiciona:
  ```ts
  export function normalizeDisponibilidadeVideo(v: unknown): "sim" | "nao" | "parcial" | null
  ```
  que aceita boolean, `"sim"/"nao"/"parcial"` diretos, e sinônimos ("talvez", "as vezes", "às vezes", "pouca", "depende", "parcialmente" → `parcial`).

### `supabase/functions/transcribe-and-map-form-voice/index.ts`
- Whitelist replicada declara `disponibilidadeVideo` como enum `sim | nao | parcial`.
- Prompt da IA (system) inclui explicitamente:
  > `disponibilidadeVideo`: retorne **apenas** um destes três valores literais: `"sim"`, `"nao"` ou `"parcial"`. "Talvez", "às vezes", "pouca disponibilidade", "depende" → `"parcial"`. Não invente outros valores.
- Zod: `disponibilidadeVideo: z.enum(["sim","nao","parcial"])`.
- Validação de saída: qualquer valor fora do enum → campo descartado.

### `src/pages/PlanPeriod.tsx`
- Altera o tipo do state para acompanhar o enum canônico:
  ```ts
  const [disponibilidadeVideo, setDisponibilidadeVideo] =
    useState<"sim" | "nao" | "parcial" | "">("");
  ```
  (única alteração no arquivo além da injeção do `VoiceFillPanel`; a UI de seleção existente passa a expor `parcial` no lugar de `talvez`, mantendo os mesmos três botões.)
- No `aplicaComSetters` do painel de voz:
  ```ts
  case "disponibilidadeVideo": {
    const v = normalizeDisponibilidadeVideo(mapped.value);
    if (v) setDisponibilidadeVideo(v);
    break;
  }
  ```
- Persistência de rascunho (`buildDraftPayload` / `loadDraft`) continua igual — apenas o literal muda de `talvez` para `parcial`.

## 3. Restante da proposta (inalterado em relação ao v3)

Arquitetura completa aprovada, mantida sem mudanças:

- Edge Function `transcribe-and-map-form-voice` com `verify_jwt = true`.
- Validações em ordem: auth (`getClaims`), acesso ao tenant (`user_roles` ou super_admin), cliente pertence ao tenant (`tenant_companies`), whitelist de campos por `formType`.
- `tenantId`/`clientId` do frontend **nunca** confiados cegamente — sempre revalidados no servidor.
- Áudio nunca persistido (nem Storage, nem tabela).
- Transcrição via gateway `/v1/audio/transcriptions` com `openai/gpt-4o-transcribe`, `LOVABLE_API_KEY` do ambiente.
- Interpretação via `/v1/chat/completions` com `response_format: { type: "json_object" }` usando o modelo do `_shared/models.ts`.
- Retorno: `{ transcript, mappedFields: { key: { value, sourceText, confidence } }, unmappedText }`.
- Frontend: `VoiceFillPanel` (toggle escrita/voz + gravação + envio) + `VoiceReviewPanel` (revisão com Substituir/Adicionar/Ignorar por campo). Campos preenchidos nunca sobrescritos sem escolha.
- Gravação: Web Audio API → WAV 16 kHz mono, corte automático em 60 s.
- Sem salvamento automático. Usuário salva com os botões existentes **Salvar Anamnese** e **Salvar Rascunho do Planejamento**.
- Whitelist canônica única em `src/lib/voiceFieldSchemas.ts` + espelho no `index.ts` da edge, com comentário `// Mantenha sincronizado com src/lib/voiceFieldSchemas.ts` nos dois lados.
- Booleanos (`temPromocao`, `temNovidade`, `temDataComemorativa`, `temMateriaisNovos`) permanecem `boolean_sim_nao` → armazenados como `"sim"` / `"nao"`.
- Nenhuma alteração em perguntas da anamnese, geração de estratégia, geração de planejamento, Kanban, cards, demandas, publicação, aprovação, identidade visual ou realtime.

## 4. Arquivos

Novos:
- `supabase/functions/transcribe-and-map-form-voice/index.ts`
- `src/components/voice/VoiceFillPanel.tsx`
- `src/components/voice/VoiceReviewPanel.tsx`
- `src/hooks/useVoiceRecorder.ts`
- `src/lib/wavEncoder.ts`
- `src/lib/voiceFieldSchemas.ts`

Editados:
- `supabase/config.toml` (registra `[functions.transcribe-and-map-form-voice] verify_jwt = true`)
- `src/pages/GenerateQuestions.tsx` (injeta painel; sem outras mudanças)
- `src/pages/PlanPeriod.tsx` (injeta painel + troca literal `talvez` → `parcial` no state/UI de `disponibilidadeVideo`)
