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
    <div className="flex flex-wrap items-center gap-2">
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
            "group relative inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs sm:text-sm font-medium transition-all active:scale-[0.97]",
            a.disabled
              ? "cursor-not-allowed opacity-50"
              : "hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          )}
        >
          <a.icon className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{a.title}</span>
          {!!a.badge && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {a.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
