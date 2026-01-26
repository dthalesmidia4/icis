import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, UserCog, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/constants/roles";
import type { AgencyRole } from "@/hooks/useAgencyRole";

interface RoleBadgeProps {
  role: AgencyRole;
  variant?: "default" | "compact";
  className?: string;
}

const roleConfig: Record<string, {
  icon: React.ElementType;
  className: string;
}> = {
  super_admin: {
    icon: ShieldCheck,
    className: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20",
  },
  agency_admin: {
    icon: Shield,
    className: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20",
  },
  agency_manager: {
    icon: UserCog,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
  },
  agency_user: {
    icon: User,
    className: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  },
};

export function RoleBadge({ role, variant = "default", className }: RoleBadgeProps) {
  if (!role) return null;

  const config = roleConfig[role] || roleConfig.agency_user;
  const Icon = config.icon;
  const label = getRoleLabel(role);

  if (variant === "compact") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "h-6 w-6 p-0 flex items-center justify-center rounded-full border",
          config.className,
          className
        )}
        title={label}
      >
        <Icon className="h-3.5 w-3.5" />
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-2.5 py-1 font-medium border transition-colors",
        config.className,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs">{label}</span>
    </Badge>
  );
}
