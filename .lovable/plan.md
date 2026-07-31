## Situação

A auditoria confirmou que os 4 pontos principais do plano anterior estão implantados (política de UPDATE em `tenants` + grant verificados no banco, ordenação e badges usando a mesma base de duração, config aplicada por área de cada card, e rótulos corrigidos para "etapa atual"). Restam três ajustes finos.

## Ajustes a fazer

### 1. Erro de permissão volta a ficar invisível
Em `src/components/FunctionPermissionsModal.tsx`, `savePriorityCfg` captura a exceção e mostra sempre "Não foi possível salvar a prioridade.", descartando a mensagem específica ("Sem permissão para salvar as configurações desta agência.") que `saveReorderPriority` passou a lançar. Exibir a mensagem real do erro no toast, com o texto genérico apenas como fallback.

### 2. Estado "Personalizado" não reseta ao trocar de área
O `customRisk` permanece ativo quando o usuário alterna entre Mídia e Sistemas, podendo mostrar o campo numérico mesmo quando a área carregada corresponde a um preset. Resetar `customRisk` no mesmo efeito que carrega a config da área.

### 3. Comentários de código desatualizados
Ainda descrevem a regra como "ciclo restante", o que contradiz o comportamento real (só a etapa atual):
- `src/lib/reorderPriority.ts` — comentário do campo `riskFactor`.
- `src/lib/reorderSequence.ts` — comentário dentro de `sortForReorder` sobre a janela de risco.

Atualizar para "duração estimada da etapa atual".

## Escopo

Somente frontend e comentários; nenhuma mudança de banco, de motor de ordenação ou de contrato de dados.
