import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  hideOnMobile?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
  actions?: PageHeaderAction[];
  rightContent?: ReactNode;
  sticky?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  backTo,
  onBack,
  actions = [],
  rightContent,
  sticky = true,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  // Separate primary action (first one) from others for mobile
  const primaryAction = actions[0];
  const secondaryActions = actions.slice(1);

  return (
    <div
      className={`${
        sticky ? "sticky top-0 z-10" : ""
      } bg-background/80 backdrop-blur-sm border-b`}
    >
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back button + Title */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            {(backTo || onBack) && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Desktop: Show all actions */}
            <div className="hidden sm:flex items-center gap-2">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || "default"}
                  onClick={action.onClick}
                  className={action.className}
                  disabled={action.disabled || action.loading}
                  size="sm"
                >
                  {action.loading ? (
                    <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    action.icon && <span className="mr-2">{action.icon}</span>
                  )}
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Mobile: Primary action + dropdown for others */}
            <div className="flex sm:hidden items-center gap-2">
              {primaryAction && !primaryAction.hideOnMobile && (
                <Button
                  variant={primaryAction.variant || "default"}
                  onClick={primaryAction.onClick}
                  className={primaryAction.className}
                  disabled={primaryAction.disabled || primaryAction.loading}
                  size="sm"
                >
                  {primaryAction.loading ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    primaryAction.icon
                  )}
                  <span className="ml-1 max-w-[80px] truncate">{primaryAction.label}</span>
                </Button>
              )}
              
              {secondaryActions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {secondaryActions.map((action, index) => (
                      <DropdownMenuItem
                        key={index}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={action.variant === "destructive" ? "text-destructive focus:text-destructive" : ""}
                      >
                        {action.icon && <span className="mr-2">{action.icon}</span>}
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {rightContent}
          </div>
        </div>
      </div>
    </div>
  );
}
