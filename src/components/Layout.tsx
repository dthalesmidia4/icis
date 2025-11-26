import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({
  children
}: LayoutProps) => {
  return <SidebarProvider>
      <div className="min-h-screen w-full flex">
        <AppSidebar />
        
        <div className="flex-1 min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
          {children}
        </div>
      </div>
    </SidebarProvider>;
};