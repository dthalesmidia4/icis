

## Plano: Corrigir Regeneração + Melhorar Qualidade Visual dos Posts

### Problemas Identificados

**1. Regeneração nao substitui os antigos**
O `handleRegenerateAll` no TaskCard salva os anexos antigos em `rejected_attachments` e remove os AI attachments, MAS as edge functions (`generate-post-image` e `auto-generate-carousel`) simplesmente APPENDAM os novos aos existentes. Resultado: duplicação.

**2. Posts sem personalidade/mascote**
A edge function `generate-post-image` (usada na regeneração manual) tem um prompt muito mais pobre que `auto-generate-post`:

| Recurso | `auto-generate-post` | `generate-post-image` |
|---------|---------------------|----------------------|
| Visual Identity Presets (4 cores) | Sim | Nao |
| Mascot images da galeria | Sim (company_mascot_images) | Nao (usa so mascot_url se keywords presentes) |
| Content Requirements | Sim | Nao |
| Mascote sempre quando has_mascot | Sim | Nao (exige keywords no texto) |
| Prompt rico com design rules | Sim | Basico |

---

### Alteracoes

**Arquivo 1: `supabase/functions/generate-post-image/index.ts`**
Alinhar com `auto-generate-post` para qualidade equivalente:
- Buscar `visual_identity_presets` (4 cores + fonte) em vez de usar so cores basicas
- Buscar mascot images de `company_mascot_images` (galeria) em vez de so `mascot_url`
- Sempre incluir mascote quando `has_mascot=true` (sem exigir keywords)
- Buscar `content_requirements` do cliente
- Enriquecer o prompt com regras de design mais detalhadas (cores vibrantes, contraste, composicao profissional, estilo 3D/ilustracao elaborada como na imagem de referencia)
- Adicionar instrucoes de estilo visual: ilustracoes 3D estilizadas, cenarios detalhados, tipografia bold integrada ao design

**Arquivo 2: `src/components/TaskCard.tsx`**
Corrigir fluxo de regeneracao:
- No `handleRegenerateAll`: apos salvar em `rejected_attachments` e limpar AI attachments, a edge function vai appendar novos. Isso ja funciona porque os AI attachments foram removidos antes da chamada. Verificar que o refetch final pega o estado correto.
- Problema real: a edge function `generate-post-image` le `demand.attachments` do banco no inicio da execucao, e no final faz `[...existingAttachments, ...generatedAttachments]`. Como o TaskCard ja limpou os AI attachments do banco ANTES de chamar a edge function, isso deve funcionar. Confirmar que nao ha race condition.

**Arquivo 3: `supabase/functions/auto-generate-carousel/index.ts`**
Mesmo ajuste de prompt: enriquecer instrucoes visuais para slides mais elaborados e dinamicos.

---

### Detalhes do Prompt Melhorado

Adicionar ao prompt de geracao (tanto posts quanto carrosseis):

```
ESTILO VISUAL OBRIGATORIO:
- Crie designs com estilo de ilustracao 3D estilizada, moderna e profissional
- Use cenarios detalhados e realistas como background (escritorios, ambientes tematicos)
- Tipografia bold, grande e impactante integrada ao design (nao sobreposta)
- Composicao dinamica com profundidade e camadas visuais
- Qualidade de design de agencia profissional
- Contraste alto entre texto e fundo para legibilidade
- Elementos graficos decorativos sutis que enriquecem o layout
```

### Resumo

| Arquivo | Mudanca |
|---------|---------|
| `generate-post-image/index.ts` | Buscar presets, mascot gallery, content_requirements; prompt enriquecido |
| `auto-generate-carousel/index.ts` | Prompt de imagem enriquecido com estilo visual elaborado |
| `TaskCard.tsx` | Verificar e corrigir fluxo de regeneracao (substituicao, nao duplicacao) |

