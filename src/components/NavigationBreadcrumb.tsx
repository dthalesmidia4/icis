import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useBreadcrumb } from "@/hooks/useBreadcrumb";
import { cn } from "@/lib/utils";

interface NavigationBreadcrumbProps {
  className?: string;
}

export function NavigationBreadcrumb({ className }: NavigationBreadcrumbProps) {
  const location = useLocation();
  const { breadcrumbs, hasMultipleLevels } = useBreadcrumb();

  // Não mostrar breadcrumb na home
  if (location.pathname === '/home' || !hasMultipleLevels) {
    return null;
  }

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn(
        "flex items-center text-sm text-muted-foreground",
        className
      )}
    >
      <ol className="flex items-center gap-1 flex-wrap">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const Icon = item.icon;
          
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
              )}
              
              {isLast ? (
                // Item atual (não clicável)
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span className="max-w-[150px] truncate sm:max-w-none">
                    {item.label}
                  </span>
                </span>
              ) : item.href ? (
                // Link navegável
                <Link
                  to={item.href}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-accent"
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span className="max-w-[100px] truncate sm:max-w-[150px]">
                    {item.label}
                  </span>
                </Link>
              ) : (
                // Item sem link
                <span className="flex items-center gap-1.5">
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span className="max-w-[100px] truncate sm:max-w-[150px]">
                    {item.label}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Versão compacta para mobile
export function MobileBreadcrumb({ className }: NavigationBreadcrumbProps) {
  const location = useLocation();
  const { parentBreadcrumbs, currentPage, hasMultipleLevels } = useBreadcrumb();

  if (location.pathname === '/home' || !hasMultipleLevels) {
    return null;
  }

  // No mobile, mostrar apenas o pai imediato e a página atual
  const parentItem = parentBreadcrumbs[parentBreadcrumbs.length - 1];

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn(
        "flex items-center text-xs text-muted-foreground",
        className
      )}
    >
      {parentItem?.href ? (
        <Link
          to={parentItem.href}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {parentItem.icon && <parentItem.icon className="h-3 w-3" />}
          <span className="max-w-[80px] truncate">{parentItem.label}</span>
        </Link>
      ) : (
        <span className="flex items-center gap-1">
          <Home className="h-3 w-3" />
        </span>
      )}
      <ChevronRight className="h-3 w-3 mx-1 text-muted-foreground/50" />
      <span className="font-medium text-foreground max-w-[120px] truncate">
        {currentPage.label}
      </span>
    </nav>
  );
}
