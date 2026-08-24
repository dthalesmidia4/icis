import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, MobileHeader } from "@/components/AppSidebar";
import { NavigationBreadcrumb, MobileBreadcrumb } from "@/components/NavigationBreadcrumb";
import { useBreadcrumb } from "@/hooks/useBreadcrumb";
import { useLocation } from "react-router-dom";

import { BreadcrumbOverrideProvider } from "@/contexts/BreadcrumbOverrideContext";

interface LayoutProps {
  children: ReactNode;
}

/**
 * Faixa de breadcrumb. Quando a rota não tem trilha real (só "Home"), a barra
 * não é renderizada — evita a sensação de header duplo com uma faixa vazia
 * acima do header próprio da página.
 */
const BreadcrumbBar = () => {
  const location = useLocation();
  const { hasMultipleLevels } = useBreadcrumb();
  if (!hasMultipleLevels || location.pathname === "/home") return null;

  return (
    <>
      <header className="hidden md:flex items-center px-6 py-3 border-b bg-background/95 backdrop-blur-sm flex-shrink-0">
        <NavigationBreadcrumb />
      </header>
      <div className="md:hidden px-4 py-2 border-b bg-background/95 backdrop-blur-sm">
        <MobileBreadcrumb />
      </div>
    </>
  );
};

export const Layout = ({ children }: LayoutProps) => {
  return (
    <BreadcrumbOverrideProvider>
    <SidebarProvider>
      <div className="h-screen w-full flex flex-col md:flex-row overflow-hidden">
        {/* Mobile Header - Fixed at top */}
        <MobileHeader />
        
        {/* Desktop Sidebar - Fixed */}
        <aside className="hidden md:flex flex-shrink-0 h-full">
          <AppSidebar />
        </aside>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <BreadcrumbBar />
          
          {/* Scrollable Content */}
          <main className="flex-1 overflow-auto bg-gradient-to-br from-background via-muted/30 to-background">
            {children}
          </main>
        </div>
        


      </div>
    </SidebarProvider>
    </BreadcrumbOverrideProvider>
  );
};
