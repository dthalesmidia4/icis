import { Building2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { OVERVIEW_MODES, type OverviewMode } from "@/lib/overviewMode";

const MODE_ICONS = { escritorio: Building2, operacional: LayoutGrid } as const;

interface OverviewModeSwitchProps {
  mode: OverviewMode;
  onChange: (mode: OverviewMode) => void;
  className?: string;
}

/**
 * Segmented control do modo da Visão Geral. Vive DENTRO da barra principal
 * compartilhada (header do Kanban) — nunca em uma faixa própria.
 */
export default function OverviewModeSwitch({ mode, onChange, className }: OverviewModeSwitchProps) {
  return (
    <div
      role="tablist"
      aria-label="Modo da Visão Geral"
      className={cn("inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5", className)}
    >
      {OVERVIEW_MODES.map((m) => {
        const Icon = MODE_ICONS[m.id];
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
