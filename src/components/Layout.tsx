import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, MobileHeader } from "@/components/AppSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <SidebarProvider>
      <div className="h-screen w-full flex flex-col md:flex-row overflow-hidden">
        {/* Mobile Header - Fixed at top */}
        <MobileHeader />
        
        {/* Desktop Sidebar - Fixed */}
        <aside className="hidden md:flex flex-shrink-0 h-full">
          <AppSidebar />
        </aside>
        
        {/* Main Content - Scrollable */}
        <main className="flex-1 overflow-auto bg-gradient-to-br from-background via-muted/30 to-background">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
};
