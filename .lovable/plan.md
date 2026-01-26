

# Plano: Corrigir Recursão Infinita na Tabela `super_admins`

## Problema Identificado

A tabela `super_admins` possui políticas RLS que consultam a própria tabela para verificar permissões, criando um loop infinito:

```sql
-- Política atual (problemática)
CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));
```

Quando um usuário tenta ler a tabela `super_admins`, a política executa uma query na própria tabela, que por sua vez ativa a mesma política, resultando no erro `42P17 - infinite recursion detected`.

## Solução

A correção envolve duas partes:

### Parte 1: Atualizar Políticas RLS no Banco de Dados

Substituir as políticas atuais por versões que usam a função `is_super_admin()` já existente (que é `SECURITY DEFINER` e bypassa RLS):

```sql
-- 1. Remover políticas problemáticas
DROP POLICY IF EXISTS "super_admins_select" ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_manage" ON public.super_admins;

-- 2. Criar novas políticas usando a função SECURITY DEFINER
CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "super_admins_manage" ON public.super_admins
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
```

### Parte 2: Atualizar Frontend para Usar RPC

Modificar o hook `useUserRole.tsx` para chamar a função `is_super_admin()` via RPC ao invés de consultar diretamente a tabela:

```tsx
// Antes (problemático)
const { data: superAdmin } = await supabase
  .from('super_admins')
  .select('id')
  .eq('user_id', user.id)
  .maybeSingle();

// Depois (correto)
const { data: isSuperAdminResult } = await supabase
  .rpc('is_super_admin');

if (isSuperAdminResult === true) {
  setIsSuperAdmin(true);
  setRole('super_admin');
  setIsLoading(false);
  return;
}
```

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| Nova migração SQL | Recria políticas RLS usando `is_super_admin()` |
| `src/hooks/useUserRole.tsx` | Substitui query direta por chamada RPC |

## Resultado Esperado

- Erro 500 eliminado ao carregar permissões
- Super admins conseguem acessar e gerenciar a tabela normalmente
- Usuários não-super-admin não têm acesso à tabela (comportamento correto)
- Logs de console limpos, sem erros de recursão

---

## Detalhes Técnicos

### Por que a função `is_super_admin()` resolve o problema?

A função usa `SECURITY DEFINER`, o que significa que ela executa com os privilégios do usuário que a criou (geralmente `postgres`), ignorando completamente as políticas RLS. Isso quebra o ciclo de recursão.

### Sequência de Execução

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUXO ATUAL (ERRO)                           │
├─────────────────────────────────────────────────────────────────────┤
│  1. Frontend: SELECT FROM super_admins WHERE user_id = X            │
│  2. RLS: Executa USING (EXISTS SELECT FROM super_admins...)         │
│  3. RLS: Executa USING novamente para a subquery                    │
│  4. Loop infinito -> Erro 42P17                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      FLUXO CORRIGIDO                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. Frontend: SELECT is_super_admin() (RPC)                         │
│  2. Função SECURITY DEFINER executa (bypassa RLS)                   │
│  3. Retorna true/false                                              │
│  4. Sem recursão!                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

