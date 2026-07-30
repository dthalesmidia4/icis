## Extensão de atraso baseada na etapa atual

### Princípio
O acréscimo de 30% incide sobre o tempo útil planejado **dentro da etapa atual**, não sobre a vida inteira do card. Ao mudar de etapa, a base de cálculo reinicia.

Neste exemplo, o histórico confirma que o card permaneceu sempre em `planejar`, então toda a janela pertence a essa etapa:
- Janela da etapa: **28/07/2026 14:35 → 30/07/2026 14:00** = **14h25 úteis**.
- Extensão: 30% = aproximadamente **4h20 úteis**.

Se o card estivesse, por exemplo, em `revisar` desde 30/07 09:00, a base seria apenas o tempo dessa etapa, e não as 14h25 de planejamento.

### Implementação
1. **Determinar o início da etapa atual**
   - Buscar no histórico de fluxo o último evento que levou o card à etapa atual.
   - Base da etapa = o mais recente entre esse evento e o início registrado do card.
   - Sem histórico disponível, usar o início registrado como base.

2. **Medir o tempo útil planejado da etapa**
   - Somar apenas minutos dentro do expediente, respeitando almoço, fins de semana, feriados e horários por área.
   - Ignorar o teto de uma jornada nesse cálculo, para não reduzir 14h25 a 15 minutos.

3. **Aplicar a extensão apenas se a etapa estiver atrasada**
   - Extensão = 30% do tempo útil planejado da etapa.
   - Distribuir esse acréscimo a partir do instante-base, dentro do expediente.
   - Preservar o início histórico do card: **28/07/2026 14:35** permanece.

4. **Reiniciar a base ao trocar de etapa**
   - Depois de uma transição, a etapa nova passa a usar a duração configurada do tipo × etapa.
   - O tempo acumulado em etapas anteriores não influencia mais o cálculo.

5. **Exibir de forma auditável no modal**
   - `Etapa atual: Planejar desde 28/07/2026 14:35`
   - `Tempo planejado na etapa: 14h25`
   - `Extensão por atraso: 30% = 4h20`
   - `Nova previsão de término: [calculada pelo expediente]`
   - Não apresentar novo início para o card em execução.

6. **Encadeamento e validação**
   - Próximos cards seguem cinco minutos após a nova previsão de término.
   - Validar: etapa longa atrasada, etapa recém-iniciada, troca de etapa, cards no prazo e cards futuros.