
# Plano: Adicionar Logo ICIS na Tela de Login

## Objetivo
Adicionar a logo ICIS acima do container (Card) de login/cadastro na tela de autenticação.

---

## O que será feito

### 1. Copiar a imagem da logo para o projeto
- Salvar a logo em `src/assets/logo-icis.png`
- Usar o diretório `src/assets` para melhor integração com o bundler e imports ES6

### 2. Modificar a estrutura do Auth.tsx
- Envolver o Card em um container flex vertical
- Adicionar a imagem da logo acima do Card
- A logo terá tamanho adequado (aproximadamente 180-200px de largura)
- Manter o alinhamento centralizado

### Estrutura visual após a mudança:

```text
+----------------------------------+
|                                  |
|         [LOGO ICIS]              |
|                                  |
|   +------------------------+     |
|   |      Bem-vindo         |     |
|   |  Faça login ou ...     |     |
|   +------------------------+     |
|   |  Login  |  Cadastro    |     |
|   +------------------------+     |
|   |                        |     |
|   |      [Formulário]      |     |
|   |                        |     |
|   +------------------------+     |
|                                  |
+----------------------------------+
```

---

## Detalhes Técnicos

### Arquivo: `src/pages/Auth.tsx`

**Alterações:**
1. Adicionar import da logo:
   ```tsx
   import logoIcis from '@/assets/logo-icis.png';
   ```

2. Modificar o return para incluir a logo:
   ```tsx
   return (
     <div className="min-h-screen flex items-center justify-center p-4 relative">
       <ShaderBackground />
       <div className="flex flex-col items-center gap-6">
         <img 
           src={logoIcis} 
           alt="ICIS Logo" 
           className="h-20 w-auto"
         />
         <Card className="w-full max-w-4xl bg-card/90 backdrop-blur-sm border-border/50">
           ...
         </Card>
       </div>
     </div>
   );
   ```

---

## Resumo das Mudanças

| Arquivo | Ação |
|---------|------|
| `src/assets/logo-icis.png` | Criar (copiar logo) |
| `src/pages/Auth.tsx` | Editar (adicionar import e imagem) |

