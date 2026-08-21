import DemandDrawer from "@/components/client-hub/DemandDrawer";

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
  return (
    <DemandDrawer demandId={demandId} tenantId={tenantId} onClose={onClose} onPersisted={onPersisted} />
  );
}
