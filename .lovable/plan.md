## Escopo

1. Restaurar o botão global **"Registro de cards"** no header da Visão Geral, coexistindo com o botão por coluna.
2. Reescrever a estimativa de duração de `computeReorder` para levar em conta **tipo de demanda × etapa do fluxo**.
3. Corrigir fuso (UTC-3), adicionar intervalo de almoço e ler janela de trabalho configurável.
4. Adicionar em **Minha Empresa (agência)** a configuração de horário de trabalho + intervalo.

---

## 1. Registro global (voltar botão superior)

- Reintroduzir no header do `KanbanCentralPage.tsx` um botão `Registro de cards` (ao lado de "Modo foco global").
- Ao ativar, aplica o mesmo filtro a TODAS as colunas de colaborador (popula `columnHistory` para cada coluna). Ao desativar, limpa `columnHistory`.
- Popover ao lado escolhe preset (Hoje / 7d / 30d / data específica) e replica para todas as colunas.
- O botão por coluna continua funcionando — se o usuário ajustar uma coluna específica depois, ela sobrepõe o global localmente.

## 2. Duração por (tipo × etapa) em `src/lib/reorderSequence.ts`

Etapas ativas hoje: `avaliar, planejar, criar_roteiro, criar_arte, captar, gerar_video, editar_video, revisar, enviar_cliente, aguardando_cliente, publicar, revisar_publicacao`.

**Matriz de duração padrão (minutos):**

| Etapa | estático | carrossel | vídeo curto | vídeo longo | outro/default |
|---|---|---|---|---|---|
| avaliar | 5 | 5 | 5 | 5 | 5 |
| planejar | 10 | 15 | 15 | 20 | 10 |
| criar_roteiro | 10 | 20 | 25 | 40 | 15 |
| criar_arte | 20 | 40 | — | — | 20 |
| captar | — | — | 60 | 120 | 30 |
| gerar_video | — | — | 60 | 90 | 30 |
| editar_video | — | — | 60 | 120 | 30 |
| revisar | 5 | 10 | 15 | 20 | 10 |
| enviar_cliente | 5 | 5 | 5 | 5 | 5 |
| publicar | 5 | 5 | 5 | 5 | 5 |
| revisar_publicacao | 5 | 5 | 5 | 5 | 5 |
| aguardando_cliente | **0 (ignorado)** — não consome tempo do colaborador |

Regras:
- Chave normalizada: usa `demand_type_key` primeiro; fallback para substring de `demand_type`.
- Se o par `(tipo, etapa)` não existir na matriz, cai para `default` daquela etapa.
- Cards com `current_function_key = 'aguardando_cliente'` são pulados na reorganização.
- `is_daily_card` continua com override de 20min.

A matriz vive em `src/lib/reorderSequence.ts` como constante exportada, para poder ser reaproveitada em UI futura de configuração.

## 3. Ajustes de tempo/fuso em `computeReorder`

**a) Timezone São Paulo (UTC-3) fixo:**
Substituir `new Date()` / `getHours()` locais por leitura em `Intl.DateTimeFormat({ timeZone: "America/Sao_Paulo" })`. Cursor e comparações sempre BRT, independente do navegador.

**b) Intervalo de almoço (default 12:00–13:30):**
- Se o start cair dentro do intervalo → saltar para o fim do intervalo.
- Se o card cruzar o intervalo → empurrar o start para depois do intervalo (não parte o card).

**c) Janela vinda de config:**
`computeReorder` passa a aceitar `opts.workHours?: { start, end, lunchStart, lunchEnd, tz }`. `ReorderSequenceModal` busca a config do tenant e injeta.

**d) Texto do modal atualizado** para refletir os valores configurados (janela, almoço, e resumo por etapa).

## 4. Configuração em Minha Empresa

- Persistência: `tenants.settings` (jsonb existente) recebe:
  ```json
  {
    "work_hours": {
      "start": "09:00",
      "end": "18:00",
      "lunch_start": "12:00",
      "lunch_end": "13:30",
      "tz": "America/Sao_Paulo"
    }
  }
  ```
- UI: em `src/pages/MyCompany.tsx` (aba principal da agência) adicionar seção **"Horário de expediente"** com 4 inputs `type="time"` + botão salvar. Visível apenas para `agency_admin`/`super_admin`.
- Hook `useWorkHoursConfig(tenantId)` retornando a config com defaults; usado pelo `ReorderSequenceModal`.

## 5. Validação

- Botão global "Registro de cards" ativa/desativa histórico em todas as colunas simultaneamente.
- Reorganizar mistura carrossel em `criar_arte` (40min) e carrossel em `revisar` (10min) → durações diferentes aplicadas.
- Card em `aguardando_cliente` não entra no cursor de tempo.
- Cross-over de 11:45 + 40min é empurrado para 13:30.
- Alterar TZ do navegador não altera o "agora" usado pelo cursor.
- Mudar horários em Minha Empresa reflete imediatamente ao reabrir o modal.

## Fora do escopo
- UI para editar a matriz `(tipo × etapa)` — fica hardcoded neste ciclo, com constante exportada para editar depois.
- Configuração por colaborador.
