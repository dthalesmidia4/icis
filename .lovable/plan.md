

## Geracao de Posts Estaticos com IA (Imagens)

### Visao Geral

Criar um fluxo que, a partir de cada demanda no Kanban, gere imagens estaticas usando GPT-5 (via OpenAI API) com base no prompt de Posts configurado em `/dev/prompts`, no conteudo da demanda (slides/descricao) e nas informacoes de branding do cliente. As imagens geradas serao salvas no storage e adicionadas como anexos da demanda automaticamente.

---

### Etapa 1: Armazenar Branding do Cliente

**Onde guardar as informacoes de marca?**

Recomendo adicionar colunas diretamente na tabela `tenant_companies`, ja que e o cadastro do cliente e mantem tudo centralizado:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `brand_primary_color` | text | Cor primaria hex (ex: #1A2B3C) |
| `brand_secondary_color` | text | Cor secundaria hex |
| `brand_font` | text | Tipografia principal (ex: "Montserrat", "Roboto") |
| `brand_logo_url` | text | URL do logo (ja existe `logo_url`) |

**Alternativa considerada**: criar uma tabela separada `client_branding`. Porem, como sao poucos campos e estao 1:1 com o cliente, manter em `tenant_companies` e mais simples e evita JOINs desnecessarios.

**Impacto**: Atualizar o formulario de cadastro/edicao do cliente (CompanyRegistration / ClientDetails) para incluir os campos de cor primaria, secundaria e tipografia.

---

### Etapa 2: Edge Function `generate-post-image`

Nova edge function que:

1. Recebe: `demandId`, `tenantId`, `slideNumber` (opcional, para gerar slide especifico ou todos)
2. Busca a demanda (titulo, descricao, demand_type, channel)
3. Busca o prompt de posts (`generate_posts_prompt` da tabela `system_prompts`)
4. Busca dados de branding do cliente (`tenant_companies`)
5. Busca a estrategia ativa do cliente (tom de voz)
6. Monta o prompt de geracao de imagem combinando:
   - Prompt base de posts
   - Slide N: texto principal extraido da descricao da demanda
   - Aspect ratio baseado no tipo de conteudo (1:1 para estatico, 9:16 para reels/stories)
   - Branding: cores primaria/secundaria + tipografia
   - Layout: padrao consistente para todos os clientes
   - Logo/marca do cliente
7. Chama a API OpenAI GPT-5 com capacidade de geracao de imagem
8. Recebe a imagem base64
9. Faz upload no bucket `card-attachments` do Supabase Storage
10. Atualiza o campo `attachments` (JSONB) da demanda com o novo anexo

**Modelo**: `openai/gpt-5` (via API direta OpenAI, ja configurada com `OPENAI_API_KEY` na tabela `api_keys`)

**Aspect Ratio por tipo de conteudo**:
- Estatico / Post / Carrossel -> 1:1 (1024x1024)
- Reels / Stories / Video Curto -> 9:16 (1024x1792)
- Cover / Banner -> 16:9 (1792x1024)

---

### Etapa 3: Parsing dos Slides da Descricao

A descricao da demanda contem slides no formato markdown (ex: "SLIDE 1 — ...", "SLIDE 2 — ..."). A edge function precisa:

1. Fazer parse da descricao para extrair cada slide
2. Para cada slide, identificar o texto principal (titulo + corpo)
3. Gerar uma imagem por slide
4. Cada imagem vira um anexo separado na demanda

---

### Etapa 4: Botao "Gerar Imagens" no TaskCard

Adicionar um botao na interface do TaskCard (na secao de Anexos ou no header) que:

1. Dispara a geracao de imagens para aquela demanda
2. Mostra estado de loading (pode demorar 10-30s por imagem)
3. Ao concluir, as imagens aparecem nos anexos automaticamente (via realtime ou refetch)

O botao so aparece quando:
- A demanda tem `description` preenchida
- O tipo de conteudo e compativel (estatico, carrossel, etc.)
- Nao esta em modo readOnly

---

### Etapa 5: Configuracao do config.toml

Adicionar a nova edge function:

```
[functions.generate-post-image]
verify_jwt = false
```

---

### Resumo de Arquivos Alterados/Criados

| Arquivo | Acao |
|---------|------|
| **Migration SQL** | Adicionar colunas `brand_primary_color`, `brand_secondary_color`, `brand_font` em `tenant_companies` |
| **supabase/functions/generate-post-image/index.ts** | Nova edge function |
| **supabase/config.toml** | Registrar nova function |
| **src/components/TaskCard.tsx** | Botao "Gerar Imagens" |
| **src/pages/CompanyRegistration.tsx** | Campos de branding no cadastro |
| **src/pages/ClientDetails.tsx** | Campos de branding na edicao |

---

### Riscos e Consideracoes

- **Custo**: Geracao de imagens via GPT-5 tem custo por chamada. Cada carrossel de 5 slides = 5 chamadas.
- **Tempo**: Cada imagem pode levar 10-30s. Para carrosseis, considerar geracao sequencial com feedback de progresso.
- **Qualidade**: A qualidade depende muito do prompt. O prompt de posts em `/dev/prompts` sera a base editavel para ajustar resultados.
- **Storage**: Imagens geradas serao armazenadas no bucket `card-attachments` (ja existente e publico).

### Proximos Passos Apos Aprovacao

1. Criar migration para colunas de branding
2. Atualizar formularios de cadastro
3. Criar edge function `generate-post-image`
4. Integrar botao no TaskCard
5. Testar end-to-end com uma demanda real

