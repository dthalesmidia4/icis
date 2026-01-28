import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, MobileHeader } from "@/components/AppSidebar";
import { NavigationBreadcrumb, MobileBreadcrumb } from "@/components/NavigationBreadcrumb";
import { GlobalClientSelector } from "@/components/GlobalClientSelector";
import { useUserRole } from "@/hooks/useUserRole";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { canAccessAdmin } = useUserRole();

  return (
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
          {/* Desktop Header with Client Selector and Breadcrumb */}
          <header className="hidden md:flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur-sm flex-shrink-0">
            <NavigationBreadcrumb />
            {canAccessAdmin && (
              <GlobalClientSelector className="ml-auto" />
            )}
          </header>

          {/* Mobile Breadcrumb */}
          <div className="md:hidden px-4 py-2 border-b bg-background/95 backdrop-blur-sm">
            <MobileBreadcrumb />
          </div>
          
          {/* Scrollable Content */}
          <main className="flex-1 overflow-auto bg-gradient-to-br from-background via-muted/30 to-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
