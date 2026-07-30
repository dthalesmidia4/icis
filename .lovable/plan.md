## Corrigir os horários do reorganizador

1. **Normalizar o instante-base para o fuso do expediente**
   - Converter o `startFrom` congelado do modal para o relógio virtual de `America/Sao_Paulo` antes de iniciar o cálculo.
   - A base visual **13:57** passará a ser calculada como **13:57**, e não como **16:57 UTC** arredondado para **17:00**.

2. **Preservar corretamente o card em andamento**
   - Se o primeiro card começou antes da base e ainda termina no futuro, manter o término original quando ele continuar válido.
   - No exemplo, o intervalo antigo que termina às **14:00** não será substituído por **17:00–17:20**.

3. **Tornar a comparação visual inequívoca**
   - Manter o horário anterior riscado, mas identificar claramente os blocos como **Anterior** e **Proposto**, evitando interpretar 14h, 17h e 17h20 como partes do mesmo intervalo.

4. **Validar regressões**
   - Conferir base local, arredondamento de cinco minutos, primeiro card em andamento, almoço, horários por área e encadeamento dos cards seguintes.