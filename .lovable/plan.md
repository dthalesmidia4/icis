## Contexto

O código do Seedance já chama a **BytePlus Model Ark** diretamente (`https://ark.ap-southeast.bytepluses.com/api/v3`) — o intermediário `seedance2ai` nunca esteve no código, ele apenas revendia a mesma chave Ark. Ou seja, **a única coisa que precisa mudar é o valor do secret `SEEDANCE_ARK_API_KEY`**. Endpoints, modelos (`seedance-1.0-lite`, `seedance-1-0-pro-250528`, `dreamina-seedance-2-0-260128`), payload e polling continuam idênticos.

Sobre o problema "1 clipe de 15s falando demais": o storyboard já tem regra de orçamento de palavras (~2,3 palavras/s em PT-BR), mas o prompt do `suggest-seedance-storyboard` diz "**Bias HARD toward FEWER clips**", o que sobrepõe a regra e faz a IA empilhar fala num único clipe de 15s. Vou reequilibrar.

Sobre preço: BytePlus vende por **plano** (Plano de Luz $30.10 / 7M tokens; Produção $43 / 10M tokens; Premium $55.90 / 13M tokens) — não tem preço fixo por segundo. Vou manter a tabela `seedance_pricing` como está por enquanto (é o custo interno estimado que exibimos ao usuário); ela não afeta a geração. Se quiser recalibrar depois de rodar alguns vídeos, faço numa iteração separada.

## Mudanças

### 1. Trocar a chave do secret
- Rotacionar `SEEDANCE_ARK_API_KEY` para a nova chave gerada no console BytePlus Model Ark (via `update_secret`, abre formulário seguro).
- Nada mais no código precisa mudar para isso funcionar.

### 2. Rebalancear `suggest-seedance-storyboard/index.ts`
- Trocar "Bias hard toward FEWER clips" por regra explícita: **o orçamento de palavras por clipe é inviolável — se a narrativa exige mais fala do que `duração × 2,3` palavras cabem, dividir em mais clipes ao invés de espremer tudo num só de 15s**.
- Manter o teto de 5 clipes e a preferência por narrativa enxuta quando NÃO há fala.
- Adicionar exemplo no prompt: "se a ideia tem 40 palavras faladas naturais, prefira 2 clipes de 8s (≈18 palavras cada) a 1 clipe de 15s (≈34 palavras, acelerado)."

### 3. Corrigir bug secundário em `generate-video-scene-seedance/index.ts`
- Existe uma chave duplicada `sceneDescription: body.prompt,` nas linhas 110–111 do `buildSeedancePrompt(...)`. Não quebra em runtime (a segunda sobrescreve a primeira com o mesmo valor), mas é ruído. Removo a duplicata.

### 4. Verificação após deploy
- Depois que a nova chave for salva, testo a geração de 1 vídeo (Seedance 2.0, 8s, 720p) para confirmar que a Ark aceita a chave nova e que o vídeo baixa/uploada para o storage sem erro. Se falhar com 401/403, aviso e paro — a chave estaria errada.

## Fora de escopo

- Ajustar `seedance_pricing` para o novo modelo de planos por token — os planos BytePlus não mapeiam 1:1 para "créditos por segundo". Posso revisar depois que você usar um pouco e comparar consumo real de tokens x segundos gerados.
- Alterar modelos, resoluções ou limites de duração — a API direta Ark aceita exatamente os mesmos valores.
