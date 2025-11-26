import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
interface LayoutProps {
  children: ReactNode;
}
export const Layout = ({
  children
}: LayoutProps) => {
  const navigate = useNavigate();

  return <SidebarProvider>
      <div className="min-h-screen w-full flex">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
          {/* Navbar - Trigger da Sidebar */}
          <nav className="w-full bg-card border-b border-border sticky top-0 z-40">
            <div className="container max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center">
                <SidebarTrigger className="hover:bg-accent hover:scale-105 transition-all duration-200" />
              </div>
            </div>
          </nav>

          {/* Conteúdo da Página */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>;
};