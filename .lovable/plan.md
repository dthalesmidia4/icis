## Pré-seleção automática de ID Visual e modelo GPT Image 2

### Objetivo
Evitar gerações erradas por esquecimento de seleção de identidade visual e padronizar o modelo de imagem mais confiável (GPT Image 2) em todas as telas de geração do Client Hub.

### Mudanças no ClientHub.tsx

1. **Pré-selecionar primeiro preset de identidade visual**
   - No `useEffect` que carrega `presets` (linha 80-92), após `setPresets(data)`, definir `setSelectedPresetId(data[0].id)` se houver presets e `selectedPresetId` ainda for `null`.
   - Isso afeta automaticamente todos os modais que usam `selectedPresetId`: Post com IA, Post Manual, Carrossel com IA, Carrossel Manual.

2. **Alterar modelo padrão para GPT Image 2 (`gpt2`)**
   - Mudar `useState` padrão de `staticAiModel`: `'nanobanana3'` → `'gpt2'` (linha 58).
   - Mudar `useState` padrão de `carouselAiModel`: `'nanobanana3'` → `'gpt2'` (linha 57).
   - Mudar reset ao fechar modal de Post IA: `setStaticAiModel('nanobanana3')` → `setStaticAiModel('gpt2')` (linha 651).
   - Mudar reset ao fechar modal de Carrossel IA: `setCarouselAiModel('nanobanana3')` → `setCarouselAiModel('gpt2')` (linha 983).
   - Mudar valor hardcoded na geração manual de carrossel: `aiModel: 'nanobanana3'` → `aiModel: 'gpt2'` (linha 948).

### Resultado esperado
- Ao abrir qualquer modal de geração no Client Hub, o primeiro preset do cliente já estará selecionado.
- O modelo GPT Image 2 será o padrão em post estático, carrossel automático e carrossel manual.
- Nenhuma outra página é impactada (as outras telas de geração não expõem seleção de preset/modelo no frontend).
