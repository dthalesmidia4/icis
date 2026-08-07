import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface HubAction {
  id: string;
  title: string;
  icon: React.ElementType;
  action: () => void;
  badge?: number;
  disabled?: boolean;
  disabledTooltip?: string;
}

interface ClientHubActionBarProps {
  actions: HubAction[];
}

export default function ClientHubActionBar({ actions }: ClientHubActionBarProps) {
  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          title={a.disabled ? a.disabledTooltip : a.title}
          onClick={() => {
            if (a.disabled) {
              toast.error(a.disabledTooltip || "Ação indisponível");
              return;
            }
            a.action();
          }}
          className={cn(
            "group inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors",
            a.disabled
              ? "cursor-not-allowed text-muted-foreground/50"
              : "text-muted-foreground hover:text-primary"
          )}
        >
          <a.icon className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{a.title}</span>
          {!!a.badge && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-black text-destructive-foreground">
              {a.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );

}
