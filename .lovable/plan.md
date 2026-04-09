

# Plano de Correção de Segurança

## Problemas Identificados

Dos 5 erros listados, 3 estão marcados como "outdated" (já podem ter sido corrigidos). Os 2 problemas ativos são:

### Erro 1: Códigos de convite e emails publicamente legíveis
A política `anyone_can_validate_invitation` na tabela `invitations` permite que **qualquer usuário anônimo** leia convites ativos — expondo códigos e emails.

**Correção:** Substituir a política SELECT pública por uma função `SECURITY DEFINER` que valida o código sem expor dados diretamente. A Edge Function `validate-invitation` já usa `SERVICE_ROLE_KEY`, então podemos restringir o SELECT apenas para usuários autenticados com acesso ao tenant, sem quebrar o fluxo de validação.

**Migração SQL:**
```sql
-- Remover política permissiva
DROP POLICY IF EXISTS "anyone_can_validate_invitation" ON public.invitations;

-- Permitir leitura apenas para admins do tenant (listagem)
CREATE POLICY "tenant_admins_read_invitations" ON public.invitations
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR is_agency_admin(tenant_id)
);
```

A validação de convites continua funcionando porque a Edge Function usa a `SERVICE_ROLE_KEY` que ignora RLS.

### Erro 2: Vulnerabilidades críticas no jsPDF
O pacote `jspdf` tem vulnerabilidades conhecidas (Path Traversal, PDF Injection, DoS).

**Correção:** Atualizar o `jspdf` para a versão mais recente disponível que contenha os patches. Caso não haja versão corrigida, avaliar alternativa como `@react-pdf/renderer`.

**Ação:**
- Executar `npm update jspdf` ou substituir por alternativa segura.

---

### Erros "outdated" (verificação rápida)

3. **Legacy Companies Table** — Verificar se a tabela `companies` ainda existe e dropar a política permissiva.
4. **API Keys acessíveis** — Já corrigido (política atual `super_admins_manage_api_keys` restringe a super admins).
5. **Edge Functions sem validação** — Adicionar validação de input básica nas funções críticas.

## Resumo de Ações

| # | Ação | Dificuldade |
|---|------|-------------|
| 1 | Migração SQL: restringir política da tabela `invitations` | Fácil |
| 2 | Atualizar/substituir `jspdf` | Fácil |
| 3 | Verificar e limpar tabela `companies` legada | Fácil |
| 4 | Já corrigido — nenhuma ação | — |
| 5 | Adicionar validação de input nas Edge Functions | Médio |

