import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronDown, User, Palette } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
interface LayoutProps {
  children: ReactNode;
}
export const Layout = ({
  children
}: LayoutProps) => {
  const navigate = useNavigate();
  const {
    signOut
  } = useAuth();
  const {
    tenantName
  } = useTenant();
  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };
  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };
  return <SidebarProvider>
      <div className="min-h-screen w-full flex">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
          {/* Navbar - Informações da Empresa */}
          <nav className="w-full bg-card border-b border-border sticky top-0 z-40">
            <div className="container max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                {/* Trigger da Sidebar */}
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="hover:bg-accent hover:scale-105 transition-all duration-200" />
                  
                  {/* Logo e Nome da Empresa */}
                  <Avatar className="h-12 w-12 border-2 border-primary">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-lg font-bold">
                      {tenantName ? getInitials(tenantName) : 'EM'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{tenantName || 'Carregando...'}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem>
                          <User className="h-4 w-4 mr-2" />
                          Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Palette className="h-4 w-4 mr-2" />
                          Tema
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleSignOut}>
                          <LogOut className="h-4 w-4 mr-2" />
                          Sair
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
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