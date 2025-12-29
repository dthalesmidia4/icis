import { Home, Code, User, LogOut, Menu, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const menuItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Developer", url: "/dev-hub", icon: Code },
];

// Mobile Sidebar Content
function MobileSidebarContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { tenantName } = useTenant();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
    onClose();
  };

  const handleNavigate = (url: string) => {
    navigate(url);
    onClose();
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header com Avatar e Nome */}
      <div className="border-b p-4 flex items-center gap-3">
        <Avatar className="h-12 w-12 border-2 border-primary">
          <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-base font-bold">
            {tenantName ? getInitials(tenantName) : 'EM'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{tenantName || 'Minha Empresa'}</p>
          <p className="text-xs text-muted-foreground">Administrador</p>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 py-4 px-2">
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.url);
            return (
              <button
                key={item.title}
                onClick={() => handleNavigate(item.url)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl
                  transition-all duration-200 text-left
                  ${active 
                    ? 'bg-primary text-primary-foreground shadow-lg' 
                    : 'hover:bg-accent text-foreground'
                  }
                `}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">{item.title}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Actions */}
      <div className="border-t p-4 space-y-2">
        <button
          onClick={() => handleNavigate('/profile-settings')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent text-foreground transition-colors"
        >
          <User className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">Editar Perfil</span>
        </button>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-destructive/10 text-destructive transition-colors"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">Sair</span>
        </button>
      </div>
    </div>
  );
}

// Desktop Sidebar
function DesktopSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { tenantName } = useTenant();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Sidebar collapsible="none" className="border-r w-16 min-w-16 max-w-16 flex flex-col">
      {/* Header com Avatar */}
      <SidebarHeader className="border-b p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center w-full p-1 hover:bg-accent rounded-lg transition-all duration-300 hover:scale-110 group" aria-label="Menu do perfil">
              <Avatar className="h-10 w-10 border-2 border-primary transition-all duration-300 group-hover:border-primary/80 group-hover:shadow-lg group-hover:shadow-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm font-bold">
                  {tenantName ? getInitials(tenantName) : 'EM'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-56 z-50">
            <DropdownMenuItem onClick={() => navigate('/profile-settings')}>
              <User className="h-4 w-4 mr-2" />
              Editar Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2 px-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          isActive={active}
                          className={`
                            h-10 w-10 p-0 flex items-center justify-center mx-auto rounded-xl
                            transition-all duration-300 ease-out
                            hover:scale-110 hover:shadow-lg
                            ${active 
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
                              : 'hover:bg-accent hover:shadow-accent/20'
                            }
                          `}
                        >
                          <Icon className={`h-5 w-5 transition-transform duration-300 ${active ? '' : 'group-hover:scale-110'}`} />
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10}>
                        <p>{item.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer com botão de logout */}
      <SidebarFooter className="border-t p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-300 hover:scale-110 hover:bg-destructive/10 hover:shadow-lg hover:shadow-destructive/20 text-muted-foreground hover:text-destructive"
              aria-label="Sair da conta"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            <p>Sair</p>
          </TooltipContent>
        </Tooltip>
      </SidebarFooter>
    </Sidebar>
  );
}

// Mobile Header with Hamburger
export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { tenantName } = useTenant();

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <header className="md:hidden sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="flex items-center justify-between px-4 py-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <MobileSidebarContent onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 border border-primary">
            <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xs font-bold">
              {tenantName ? getInitials(tenantName) : 'EM'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

export function AppSidebar() {
  return <DesktopSidebar />;
}
