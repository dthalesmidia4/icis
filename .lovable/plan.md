## Problema

Hoje o fluxo "Criar Storyboard de Vídeo" acontece dentro de um `Dialog` (`sm:max-w-2xl` no passo 1, `sm:max-w-4xl` no passo 2) em `src/pages/ClientHub.tsx` (linhas ~2627-2820). Quando o Seedance sugere o plano, os clipes aparecem embutidos no mesmo modal, com `line-clamp-2` na descrição — daí o texto truncado no print. Além disso, o modal já contradiz o pedido anterior de ter um espaço de trabalho inline, leve e organizado.

## Objetivo

1. Tirar o storyboard do `Dialog` e transformá-lo em um workspace inline dentro do Client Hub.
2. Após o Seedance sugerir o plano, avançar automaticamente para uma tela dedicada de edição, onde:
   - os clipes aparecem por inteiro (sem truncar),
   - dá para editar cada clipe, adicionar/remover cenas,
   - as configurações finais por clipe (modelo Seedance, resolução, duração) vivem nessa tela.
3. Preservar o comportamento do Veo 3 (que já usa o editor de cenas no passo 2) — ele também passa a rodar inline.

## Estrutura proposta

```text
ClientHub (workspace principal)
├─ videoWorkspaceOpen === false → grid normal do hub
└─ videoWorkspaceOpen === true  → renderiza <VideoStoryboardWorkspace/>
      ├─ Passo 1: Briefing (inline, largura total do hub)
      │    Ideia + Motor + Formato + Preset + Mascote + botão principal
      │    (SEM preview de plano embutido)
      │
      └─ Passo 2: Editor de Cenas (inline, tela cheia do hub)
           Cabeçalho: título, botão "Voltar ao briefing", "Descartar rascunho"
           Corpo (Seedance):
             • Lista de clipes em cards largos, descrição SEM line-clamp
             • Por clipe: título editável, prompt/CUEs editáveis,
               selects de Modelo (2.0 / 2.0 Fast / 2.0 Mini / 1.0 Pro / 1.0 Lite),
               Resolução, Duração, CostBadge
             • Botões "Adicionar clipe", "Remover clipe", "Regerar plano"
           Corpo (Veo):
             • Mantém o editor atual (cena a cena) já existente
           Rodapé: "Gerar vídeos" (dispara pipeline atual)
```

## Passos técnicos

1. **Extrair o conteúdo do modal para um componente inline**
   - Criar `src/components/client-hub/VideoStoryboardWorkspace.tsx`.
   - Mover a JSX dos passos 1 e 2 que hoje vive dentro do `<Dialog>` de `ClientHub.tsx` (~2627-2820 e o editor de cenas que vem depois) para esse componente.
   - Receber por props todos os estados/handlers já existentes (`videoIdea`, `videoStep`, `videoScenes`, `seedancePlan`, `handleGenerateStoryboard`, `handleSuggestSeedancePlan`, `handleApplySeedancePlan`, presets, mascotes, etc.). Não recriar lógica — só reempacotar.

2. **Substituir o `Dialog` por render inline**
   - Trocar `videoModalOpen` por `videoWorkspaceOpen` (mesma flag, novo nome).
   - Em `ClientHub`, quando `videoWorkspaceOpen === true`, esconder o grid de botões do hub e renderizar `<VideoStoryboardWorkspace/>` ocupando a área principal (mesmo padrão já usado para outros fluxos inline do hub).
   - Manter breadcrumb/back button do hub para sair do workspace (equivale ao "X" atual).

3. **Auto-avançar para o editor após o plano**
   - Em `handleSuggestSeedancePlan`, após o sucesso, chamar `handleApplySeedancePlan()` diretamente (ou setar `videoStep = 2`) em vez de mostrar o preview embutido no passo 1.
   - Remover o bloco de "Plano sugerido pela IA" do passo 1 (linhas ~2775-2805) — ele reaparece, sem truncamento, dentro do passo 2.
   - Manter botão "Refazer plano" agora no passo 2 (volta ao passo 1 preservando a ideia).

4. **Passo 2 legível e editável (Seedance)**
   - Cards de clipe em largura total do workspace, `whitespace-pre-wrap`, sem `line-clamp`.
   - Campos editáveis: título (`title_pt`), descrição/CUEs (`description_en` / `scene_description`).
   - Controles por clipe: `Modelo Seedance` (Seedance 2.0, 2.0 Fast, 2.0 Mini, 1.0 Pro, 1.0 Lite), `Resolução` (480p→4K conforme modelo), `Duração` com clamp já existente, `<CostBadge/>` recalculando.
   - Ações: "Adicionar clipe" (respeitando o máximo de 5), "Duplicar", "Remover", "Regerar plano com IA".

5. **Persistência**
   - Manter `avulso_drafts` e `VIDEO_DRAFT_SCHEMA_VERSION = 3` — nenhum campo novo obrigatório. Só passa a serializar `videoWorkspaceOpen` no lugar de `videoModalOpen` (opcional; pode ficar apenas em memória).

6. **Limpeza**
   - Remover o `<Dialog>` do storyboard (linhas 2627-2820 e continuação do passo 2).
   - Remover o botão "X" do header do dialog; o "Descartar rascunho" e "Voltar" migram para o header do workspace inline.

## Fora do escopo

- Nenhuma mudança na edge function `suggest-seedance-storyboard`, no `generate-video-scene-seedance`, no pricing, ou no fluxo do Veo 3 além de renderizá-lo inline.
- Nenhuma mudança no motor de vídeo padrão nem no schema de rascunho.
