import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, MobileHeader } from "@/components/AppSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex flex-col md:flex-row">
        {/* Mobile Header */}
        <MobileHeader />
        
        {/* Desktop Sidebar */}
        <aside className="sticky top-0 h-screen hidden md:flex flex-shrink-0">
          <AppSidebar />
        </aside>
        
        {/* Main Content */}
        <div className="flex-1 min-h-screen overflow-auto bg-gradient-to-br from-background via-muted/30 to-background">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
};
