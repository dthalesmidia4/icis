import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
  disabled?: boolean;
  loading?: boolean;
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

  return (
    <div
      className={`${
        sticky ? "sticky top-0 z-10" : ""
      } bg-background/80 backdrop-blur-sm border-b`}
    >
      <div className="container max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {(backTo || onBack) && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <div>
              <h1 className="text-xl font-bold">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || "default"}
                onClick={action.onClick}
                className={action.className}
                disabled={action.disabled || action.loading}
              >
                {action.loading ? (
                  <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  action.icon && <span className="mr-2">{action.icon}</span>
                )}
                {action.label}
              </Button>
            ))}
            {rightContent}
          </div>
        </div>
      </div>
    </div>
  );
}
