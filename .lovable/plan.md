## Objetivo
Adicionar duas novas opções de posição da logo no dropdown de Identidade Visual e garantir que a IA respeite ambas ao gerar posts/carrosséis. Vale automaticamente para todos os clientes (a configuração é por cliente e usa a mesma lista compartilhada).

## Alterações

### 1. `src/components/VisualIdentityModal.tsx` (linhas 64–70)
Atualizar a lista `LOGO_POSITIONS` para incluir `top-center` e renomear `bottom-center` para "Inferior Centralizado" (mantendo o mesmo `value` para não quebrar clientes já configurados):

```ts
const LOGO_POSITIONS = [
  { value: "top-left", label: "Canto Superior Esquerdo" },
  { value: "top-center", label: "Superior Centralizado" },
  { value: "top-right", label: "Canto Superior Direito" },
  { value: "bottom-left", label: "Canto Inferior Esquerdo" },
  { value: "bottom-center", label: "Inferior Centralizado" },
  { value: "bottom-right", label: "Canto Inferior Direito" },
];
```

### 2. `supabase/functions/_shared/visual-identity.ts` (linhas 133–139)
Adicionar `top-center` no `LOGO_POSITION_MAP` (consumido por todas as edge functions de geração — `generate-standalone-post`, `auto-generate-post`, `auto-generate-carousel`, `generate-carousel-images`, etc., via `renderLogoBlock`):

```ts
const LOGO_POSITION_MAP: Record<string, string> = {
  "top-left": "canto superior esquerdo",
  "top-center": "centro superior (topo centralizado horizontalmente)",
  "top-right": "canto superior direito",
  "bottom-left": "canto inferior esquerdo",
  "bottom-center": "centro inferior (base centralizada horizontalmente)",
  "bottom-right": "canto inferior direito",
};
```

## Por que funciona para todos os clientes
- A posição é salva como string (`logo_position`) na tabela do cliente. Apenas o dropdown e o mapa de tradução para o prompt da IA precisam conhecer os novos valores.
- Clientes existentes continuam com sua posição atual; quem quiser usar as novas opções é só editar a Identidade Visual.
- Não requer migração de banco.

## Verificação
- Abrir Identidade Visual → Logo da Marca → conferir as 6 opções no dropdown.
- Gerar um Conteúdo Avulso com `Superior Centralizado` e confirmar nos logs da edge function que o prompt recebe "centro superior...".
