import { ChevronDown, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-xs">
          <LayoutGrid className="h-3.5 w-3.5" />
          Ações
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Operação do cliente
        </DropdownMenuLabel>
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={(e) => {
              if (a.disabled) {
                e.preventDefault();
                toast.error(a.disabledTooltip || "Ação indisponível");
                return;
              }
              a.action();
            }}
            className={cn("gap-2 text-xs", a.disabled && "text-muted-foreground/60")}
          >
            <a.icon className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{a.title}</span>
            {!!a.badge && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-black text-destructive-foreground">
                {a.badge}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
