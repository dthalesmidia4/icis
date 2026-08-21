import { Suspense, lazy } from "react";

// O TaskCard completo (via DemandDrawer) é o maior grafo do app: só é baixado
// quando o usuário abre um card sobre o cenário, nunca no load do Escritório.
const LazyDemandDrawer = lazy(() => import("@/components/client-hub/DemandDrawer"));

interface OfficeCardOverlayProps {
  demandId: string | null;
  tenantId: string | null | undefined;
  onClose: () => void;
  onPersisted?: () => void;
}

/**
 * Abre a demanda SOBRE o cenário do escritório, reaproveitando o TaskCard
 * completo (mesma implementação usada no Hub do Cliente). Nunca navega
 * para fora de `/escritorio`.
 */
export default function OfficeCardOverlay({
  demandId,
  tenantId,
  onClose,
  onPersisted,
}: OfficeCardOverlayProps) {
  if (!demandId) return null;
  return (
    <Suspense fallback={null}>
      <LazyDemandDrawer
        demandId={demandId}
        tenantId={tenantId}
        onClose={onClose}
        onPersisted={onPersisted}
      />
    </Suspense>
  );
}
