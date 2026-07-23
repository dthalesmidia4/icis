## Simplificar Passo 1 do Seedance

Voltar o Passo 1 a ser leve: **só a ideia + formato + preset visual + mascote**. A IA decide quantos clipes, sugere a duração de cada um e escreve a fala se — e somente se — a ideia pedir.

### Passo 1 (workspace inline) — Seedance
Remover do Passo 1:
- Bloco "MODELO / RESOLUÇÃO / DURAÇÃO / Gerar áudio sincronizado"
- Textarea "Fala do apresentador / mascote"
- Dropdown "Estratégia da logo"
- CostBadge (nada a estimar sem modelo/resolução)

Mantém no Passo 1: Ideia, Motor de Vídeo (Veo/Seedance), Formato, Predefinição Visual, Mascote. Botão único: **Planejar Storyboard Seedance**.

### Edge function `suggest-seedance-storyboard`
- Deixa de exigir `targetDurationSeconds`, `mascotSpeech`, `logoStrategy`.
- System prompt novo: a IA analisa a ideia e retorna, para cada clipe, `target_duration_seconds` proporcional ao conteúdo daquele clipe (dentro do range do modelo padrão — v2 = 4–15s).
- Adiciona campo opcional `mascot_speech_pt` por clipe: preenchido só quando a ideia menciona alguém falando/narrando; caso contrário fica vazio.
- Servidor apenas faz clamp de segurança ao range do modelo — não força mais um valor fixo.

### Passo 2 (editor de cenas Seedance)
Recebe agora TODAS as configurações técnicas:
- Modelo (Seedance 2.0 / 1.0 Pro / 1.0 Lite) + Resolução + Gerar áudio sincronizado
- Duração por clipe: slider próprio em cada card (pré-preenchido com a sugestão da IA, editável dentro do range do modelo)
- Estratégia da logo (nenhuma / contextual / end card)
- Fala do apresentador por clipe: textarea pré-preenchida com o que a IA gerou (vazia se não aplicável), editável
- CostBadge por clipe reagindo em tempo real (modelo × resolução × duração)
- Custo total somado no rodapé

### Arquivos afetados
- `src/pages/ClientHub.tsx` — remove UI técnica do Passo 1 Seedance; move controles para o card de clipe no Passo 2; renderiza slider de duração e textarea de fala por clipe; usa `mascot_speech_pt` retornado pela IA
- `supabase/functions/suggest-seedance-storyboard/index.ts` — remove trava de duração fixa; volta a decidir por clipe; adiciona `mascot_speech_pt` opcional ao schema; ajusta prompt para gerar fala só quando faz sentido
- `avulso_drafts.form_data` (schema v4) — clipes passam a incluir `mascot_speech_pt` e `duration_seconds` individuais; bump `VIDEO_DRAFT_SCHEMA_VERSION`

Sem migração de banco.