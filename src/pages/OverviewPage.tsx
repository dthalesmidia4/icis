import { Suspense, lazy, useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import OverviewModeSwitch from "@/components/overview/OverviewModeSwitch";
import OverviewHeader from "@/components/overview/OverviewHeader";
import {
  DEFAULT_OVERVIEW_MODE,
  readOverviewMode,
  writeOverviewMode,
  type OverviewMode,
} from "@/lib/overviewMode";

// Code splitting real: o chunk pesado do Kanban só é baixado quando o usuário
// realmente entra na Visão geral operacional.
const Office = lazy(() => import("./Office"));
const KanbanCentralPage = lazy(() => import("./KanbanCentralPage"));

interface OverviewPageProps {
  /** Deep links antigos (`/escritorio`, `/kanban-central`) forçam o modo inicial. */
  forcedMode?: OverviewMode;
}

const Fallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

/**
 * Visão Geral unificada. Cada modo monta SOMENTE o que precisa: o Escritório
 * virtual usa o header leve compartilhado (`OverviewHeader`) e nunca monta o
 * Kanban; a Visão geral monta o Kanban, que renderiza o mesmo header.
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
    return (
      <Suspense fallback={<Fallback />}>
        <KanbanCentralPage modeSelector={selector} headerTitle="Visão geral das Tarefas" />
      </Suspense>
    );
  }

  return (
    <div className="mt-4 flex h-full min-h-0 flex-col px-3 sm:px-4">
      <OverviewHeader
        tenantId={tenantId}
        title="Escritório virtual"
        icon={<Building2 className="h-5 w-5 text-primary" />}
        modeSelector={selector}
        onRequestOperationalMode={() => changeMode("operacional")}
      />
      <div className="min-h-0 flex-1">
        <Suspense fallback={<Fallback />}>
          <Office />
        </Suspense>
      </div>
    </div>
  );
}
