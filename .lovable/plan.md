## Diagnóstico

Após analisar `auto-generate-carousel/index.ts` e `auto-generate-post/index.ts`, identifiquei **três causas raiz** dos problemas:

### 1. Indicador "1/5" aparecendo no carrossel
`auto-generate-carousel/index.ts` **linha 458** instrui explicitamente o modelo:
```
REGRAS: Formato 1:1 (1024x1024). O texto "..." DEVE aparecer legível.
Design coerente entre slides. Indicador {N}/{total} discreto.
```
A frase "Indicador N/total discreto" **manda o modelo desenhar o número**. É exatamente por isso que o "1/5" aparece nas imagens enviadas.

### 2. Mascote sempre na mesma posição/pose
Tanto no carrossel (linhas 350–354) quanto no post estático (linhas 176–180), o prompt de mascote diz:
```
Reproduza o mascote EXATAMENTE como na imagem de referência —
mesma aparência, cabelo, roupa, proporções...
NÃO altere nenhuma característica do mascote.
```
Sem distinguir **identidade** (que deve ser preservada) de **pose/posição/expressão/ângulo** (que devem variar entre slides). O modelo trata "exatamente como na referência" literalmente — mesma pose em todo slide.

### 3. Fundo genérico / poucos elementos
A regra "ESTILO VISUAL OBRIGATÓRIO" pede cenário detalhado, mas é **enfraquecida** por outras regras que pedem "boxes coloridos grandes" ocupando a tela. Faltam exigências explícitas anti-fundo-chapado: ambientação contextual ao tema, props/objetos relevantes em cena, profundidade real, e proibição de fundo plano com apenas shapes geométricos.

---

## Plano de Correção (apenas prompts — sem mudança de lógica)

### Arquivo: `supabase/functions/auto-generate-carousel/index.ts`

**A. Remover indicador de página (linha 458)**
Trocar:
```
REGRAS: Formato 1:1 (1024x1024). O texto "..." DEVE aparecer legível. Design coerente entre slides. Indicador {N}/{total} discreto.
```
por:
```
REGRAS: Formato 1:1 (1024x1024). O texto DEVE aparecer legível. Design coerente entre slides.
PROIBIDO: NÃO desenhe nenhum número de página, contador, "1/5", "2/5", paginação, dots indicadores ou qualquer marcação de sequência. O Instagram já mostra a posição do slide.
```

**B. Variação de pose do mascote (linhas 350–354)**
Refinar o `mascotSection` para separar identidade vs pose:
```
MASCOTE: A marca possui um mascote oficial. {descrição}
OBRIGATÓRIO PRESERVAR (identidade): mesma espécie, cores, roupa/uniforme, proporções, traços faciais e estilo de arte da imagem de referência — ele deve ser RECONHECIDO como o mesmo personagem.
OBRIGATÓRIO VARIAR (composição por slide): pose corporal, expressão facial, ângulo da câmera, gesto das mãos, posicionamento na cena (esquerda/direita/centro), interação com objetos do cenário e enquadramento (close, médio, plano inteiro). NUNCA repita a mesma pose/posição do slide anterior nem da imagem de referência.
Para o slide {N}, escolha uma pose/ângulo DIFERENTE dos demais slides.
```

**C. Cenário rico (reforço dentro do bloco ESTILO VISUAL, ~linha 437)**
Adicionar:
```
CENÁRIO E AMBIENTAÇÃO (OBRIGATÓRIO):
- PROIBIDO fundo chapado, gradiente puro ou apenas shapes geométricos abstratos como cenário.
- O fundo DEVE ser um ambiente 3D real e contextual ao tema do slide (ex.: clínica, sala de espera, casa, rua, escritório), com props e objetos relevantes em cena.
- Inclua múltiplas camadas de profundidade: primeiro plano (mascote + objetos próximos), plano médio (mobiliário/elementos do tema) e fundo (paredes, janelas, ambientação).
- Use iluminação cinematográfica com sombras realistas para criar volume.
- Os boxes/banners de texto devem CONVIVER com o cenário, não substituí-lo.
```

### Arquivo: `supabase/functions/auto-generate-post/index.ts`

**D. Aplicar as mesmas correções B e C** no `mascotSection` (linhas 176–180) e no bloco "ESTILO VISUAL OBRIGATÓRIO" (linhas 217–226), com a mesma regra anti-fundo-chapado e mascote variando pose. (Para post estático único, B fica simplificada: "escolha uma pose adequada ao tema, evitando a pose neutra padrão da imagem de referência".)

---

## Detalhes técnicos

- Edição é **somente em strings de prompt** — nenhuma mudança em fluxo, schema, modelo ou banco.
- Modelo continua `gemini-3-pro-image-preview` (Nano Banana Pro), conforme já validado.
- Após editar, deploy das duas funções e testar em uma demanda de carrossel + uma demanda de post estático no Kanban Central, conferindo: (i) sem "1/5" na imagem, (ii) mascote em poses diferentes entre slides, (iii) fundo com cenário detalhado.
