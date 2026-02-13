

## Linha de Producao Obrigatoria no Planejamento de Periodo

Adicionar um bloco obrigatorio de "Linha de Producao" na tela de criacao de periodo. Sem ele preenchido, o botao de gerar demandas fica desabilitado. A IA passa a gerar exatamente as quantidades definidas por formato.

---

### 1. Migracao de banco de dados

Adicionar coluna `production_line` na tabela `period_plans`:

```text
ALTER TABLE period_plans
ADD COLUMN production_line jsonb DEFAULT '[]'::jsonb;
```

Estrutura do JSON:
```text
[
  { "type": "Reels", "quantity": 1 },
  { "type": "Carrossel", "quantity": 2 },
  { "type": "Post Estatico", "quantity": 2 },
  { "type": "Stories", "quantity": 4 }
]
```

---

### 2. `src/pages/PlanPeriod.tsx` - Novo bloco no formulario

**Estado novo:**
- `productionLine`: array de `{ type: string; quantity: number }` com os 4 formatos padrao (Reels, Carrossel, Post Estatico, Stories), todos iniciando em 0

**Novo Card "Linha de Producao"** posicionado entre o card de canais e o de restricoes:
- Icone: `List` (ja importado)
- Cada formato com label + input numerico (min 0)
- Total calculado dinamicamente e exibido: "Total: X conteudos"
- Extensivel: botao futuro para adicionar formatos personalizados (nao nesta versao)

**Validacao no `handleSubmit`:**
- O total da linha de producao deve ser maior que 0
- Se for 0, exibir `toast.error("Defina a linha de producao antes de gerar")` e bloquear
- Salvar `production_line` no insert do `period_plans`
- Passar `productionLine` no body da chamada `generateSinglePlan`

**Botao de submit:**
- Desabilitado visualmente quando total da linha de producao for 0 (alem das validacoes ja existentes de titulo e datas)

---

### 3. `supabase/functions/generate-period-plans/index.ts` - Integracao com IA

**Receber `production_line`:**
- Ler do `periodPlanData.production_line` (ja carregado via `select('*')`)
- Se existir e tiver itens com quantity > 0, usar como regra

**Alterar o prompt (`jsonInstruction`):**
- Quando `production_line` existir, substituir o `demandLimit` fixo (6/3) pelo total calculado
- Adicionar instrucao explicita no prompt:

```text
REGRA OBRIGATORIA DE VOLUME:
Gere exatamente: 1 Reels, 2 Carrossel, 2 Post Estatico, 4 Stories.
Total: 9 demandas. O campo "tipo" de cada demanda DEVE corresponder
exatamente ao tipo definido. NAO gere formatos nao listados.
NAO compense quantidade de um formato com outro.
```

- Quando `production_line` NAO existir (periodos antigos), manter comportamento atual (6 normal, 3 ultra)

**Validacao do retorno:**
- Apos parsear a resposta da IA, contar quantos itens de cada `tipo` foram gerados
- Comparar com `production_line`
- Se divergir: uma segunda tentativa automatica (re-chamar a OpenAI)
- Se a segunda tentativa tambem divergir: retornar sucesso com aviso no log, sem bloquear (para evitar loops infinitos e custos excessivos)

**Fluxo Normal vs Ultra com linha de producao:**
- Normal: gera o total da linha de producao
- Ultra: continua gerando 3 demandas criativas extras (sem restricao de linha de producao, mantendo o comportamento ousado)

---

### Resumo visual do fluxo

```text
Formulario de Periodo
  |
  +-- Card: Informacoes do Periodo (titulo, datas, canais)
  |
  +-- Card: LINHA DE PRODUCAO (NOVO - obrigatorio)
  |     Reels: [input]  Carrossel: [input]
  |     Post Estatico: [input]  Stories: [input]
  |     Total: X conteudos
  |
  +-- Card: Restricoes do Periodo
  |
  +-- Botao: Gerar Demandas (desabilitado se total = 0)
```

---

### Detalhes tecnicos

- A coluna `production_line` usa `jsonb` para flexibilidade futura (novos formatos)
- O prompt envia a linha como regra obrigatoria, nao como sugestao
- O campo `tipo` retornado pela IA ja e usado no titulo do card Kanban (`tipo - titulo`)
- Nenhuma mudanca no Kanban, DemandaCard ou DemandReviewModal
- A interface usa grid de 2 colunas no desktop e 1 no mobile

