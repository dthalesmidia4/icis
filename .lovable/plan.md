
# Plano: Corrigir Redirecionamento Após Login

## Problema Identificado

Quando o usuário faz login, ele é redirecionado incorretamente para `/agency-setup` em vez de permanecer na página inicial `/`. 

### Causa Raiz
Existe uma **condição de corrida (race condition)** entre o carregamento do `AgencyContext` e a verificação de redirecionamento na página `Index.tsx`.

A página `Index.tsx` (linhas 21-25) tem seu próprio `useEffect` que verifica se `tenantId` existe:

```typescript
useEffect(() => {
  if (!tenantLoading && user && !tenantId) {
    navigate('/agency-setup', { replace: true });
  }
}, [tenantLoading, user, tenantId, navigate]);
```

O problema é que essa verificação pode disparar **antes** do `AgencyContext` terminar de buscar os dados do banco, causando um redirecionamento indevido.

### Pontos de Redirecionamento Duplicados

Atualmente há 3 lugares que verificam o tenant e redirecionam:
1. `Index.tsx` - Verifica e redireciona imediatamente
2. `RequireTenant.tsx` - Verifica com delay de 2 segundos
3. `CompanyRegistration.tsx` - Verifica no submit do formulário

---

## Solução Proposta

### 1. Remover a Lógica de Redirecionamento Duplicada do Index.tsx

O componente `RequireTenant` já faz essa verificação de forma mais robusta (com delay e estados de fallback). Não há necessidade de ter a mesma lógica duplicada dentro da página `Index.tsx`.

**Arquivo:** `src/pages/Index.tsx`

**Mudança:** Remover completamente o `useEffect` que redireciona para `/agency-setup` (linhas 20-25).

```typescript
// REMOVER este bloco:
useEffect(() => {
  if (!tenantLoading && user && !tenantId) {
    navigate('/agency-setup', { replace: true });
  }
}, [tenantLoading, user, tenantId, navigate]);
```

O `RequireTenant` já envolve a rota `/` no `App.tsx`, então ele já cuida dessa verificação:

```tsx
<Route path="/" element={
  <ProtectedRoute>
    <RequireTenant>  {/* ← Já verifica o tenant aqui */}
      <Layout>
        <Home />
      </Layout>
    </RequireTenant>
  </ProtectedRoute>
} />
```

---

### 2. (Opcional) Melhorar o RequireTenant

Se necessário, podemos ajustar o `RequireTenant` para ter um comportamento mais previsível:

- Aumentar o delay antes de redirecionar (de 2s para 3s)
- Adicionar mais logs para debug
- Verificar se o contexto realmente terminou de carregar antes de decidir redirecionar

---

## Diagrama do Fluxo Corrigido

```
Login bem-sucedido
       │
       ▼
ProtectedRoute (verifica autenticação)
       │
       ▼
RequireTenant (verifica se tem agency)
       │
       ├─── isLoading? → Mostra "Carregando..."
       │
       ├─── error? → Mostra tela de erro com retry
       │
       ├─── agencyId existe? → Renderiza conteúdo (Home)
       │
       └─── agencyId não existe após delay? → Redireciona para /agency-setup
```

---

## Resultado Esperado

Após a correção:
1. Usuário faz login
2. Passa pelo `ProtectedRoute` (autenticado)
3. `RequireTenant` mostra loading enquanto carrega o tenant
4. Tenant é encontrado → página Home é exibida normalmente
5. Sem redirecionamento indevido para `/agency-setup`

---

## Resumo das Alterações

| Arquivo | Ação |
|---------|------|
| `src/pages/Index.tsx` | Remover useEffect de redirecionamento (linhas 20-25) e imports não utilizados (`useTenant`, `supabase`, `useQuery`) |

Esta é uma correção simples de 1 arquivo que resolve o problema de redirecionamento duplicado.
