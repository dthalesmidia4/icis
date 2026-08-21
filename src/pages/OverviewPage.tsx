import { useEffect, useState } from "react";
import { Building2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import {
  DEFAULT_OVERVIEW_MODE,
  OVERVIEW_MODES,
  readOverviewMode,
  writeOverviewMode,
  type OverviewMode,
} from "@/lib/overviewMode";
import Office from "./Office";
import KanbanCentralPage from "./KanbanCentralPage";

const MODE_ICONS = { escritorio: Building2, operacional: LayoutGrid } as const;

interface OverviewPageProps {
  /** Deep links antigos (`/escritorio`, `/kanban-central`) forçam o modo inicial. */
  forcedMode?: OverviewMode;
}

/**
 * Visão Geral unificada: um único cabeçalho alterna entre o Escritório virtual
 * e a Visão operacional. Nenhuma lógica é duplicada — cada modo renderiza o
 * componente canônico existente (`Office` / `KanbanCentralPage`).
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur-sm sm:px-6">
        <h1 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Visão Geral</h1>
        <div className="flex rounded-lg border border-border p-0.5">
          {OVERVIEW_MODES.map((m) => {
            const Icon = MODE_ICONS[m.id];
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => changeMode(m.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "escritorio" ? <Office /> : <KanbanCentralPage />}
      </div>
    </div>
  );
}
