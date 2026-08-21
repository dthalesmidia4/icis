import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import OverviewModeSwitch from "@/components/overview/OverviewModeSwitch";
import {
  DEFAULT_OVERVIEW_MODE,
  readOverviewMode,
  writeOverviewMode,
  type OverviewMode,
} from "@/lib/overviewMode";
import Office from "./Office";
import KanbanCentralPage from "./KanbanCentralPage";

interface OverviewPageProps {
  /** Deep links antigos (`/escritorio`, `/kanban-central`) forçam o modo inicial. */
  forcedMode?: OverviewMode;
}

/**
 * Visão Geral unificada. A barra principal é a própria barra do Kanban
 * (`KanbanCentralPage`), compartilhada pelos dois modos: no Escritório virtual
 * ela é renderizada em `headerOnly`, evitando qualquer duplicação de lógica
 * das ações globais e do total canônico de demandas.
 */
export default function OverviewPage({ forcedMode }: OverviewPageProps) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [mode, setMode] = useState<OverviewMode>(forcedMode ?? DEFAULT_OVERVIEW_MODE);

  // Restaura a preferência do usuário quando não há modo forçado pela rota.
  useEffect(() => {
    if (forcedMode) return;
    const stored = readOverviewMode(user?.id, tenantId);
    if (stored) setMode(stored);
  }, [forcedMode, user?.id, tenantId]);

  const changeMode = (next: OverviewMode) => {
    setMode(next);
    writeOverviewMode(user?.id, tenantId, next);
  };

  const selector = <OverviewModeSwitch mode={mode} onChange={changeMode} />;

  if (mode === "operacional") {
    return <KanbanCentralPage modeSelector={selector} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <KanbanCentralPage headerOnly modeSelector={selector} />
      <div className="min-h-0 flex-1">
        <Office />
      </div>
    </div>
  );
}
