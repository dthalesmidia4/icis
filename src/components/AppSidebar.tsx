import { Home, Code, User, LogOut, Menu, Building2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useAgency } from "@/contexts/AgencyContext";
import { useHubPermissions } from "@/hooks/useHubPermissions";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/RoleBadge";
import { getFilteredNavigationItems, type NavigationItem } from "@/lib/constants/navigation";
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
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

// Menu developer
const devMenuItems = [
  { title: "Developer", url: "/dev-hub", icon: Code, adminOnly: true },
];

// Mobile Sidebar Content
function MobileSidebarContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const userName = user?.user_metadata?.full_name as string | undefined;
  const { canAccessAdmin, role } = useUserRole();
  const { agencyId } = useAgency();
  const { canAccess } = useHubPermissions();
  const { role: agencyRole } = useAgencyRole();

  const isAdmin = agencyRole === 'super_admin' || agencyRole === 'agency_admin' || agencyRole === 'agency_manager';
  const isAdminOnly = agencyRole === 'super_admin' || agencyRole === 'agency_admin';

  const navItems = useMemo(() => {
    return getFilteredNavigationItems({ agencyId, isAdmin, isAdminOnly, canAccess });
  }, [agencyId, isAdmin, isAdminOnly, canAccess]);

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
            {userName ? getInitials(userName) : 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{userName || 'Usuário'}</p>
          <RoleBadge role={role} className="mt-1" />
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 py-4 px-2 overflow-auto">
        <nav className="space-y-1">
          {/* Home (fixo) */}
          <button
            onClick={() => handleNavigate('/home')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left",
              isActive('/home')
                ? 'bg-primary text-primary-foreground shadow-lg'
                : 'hover:bg-accent text-foreground'
            )}
          >
            <Home className="h-5 w-5 flex-shrink-0" />
            <span className="font-medium">Home</span>
          </button>

          {/* Itens centralizados */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.route);
            return (
              <button
                key={item.route}
                onClick={() => handleNavigate(item.route)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left",
                  active
                    ? 'bg-primary text-primary-foreground shadow-lg'
                    : 'hover:bg-accent text-foreground'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">{item.title}</span>
              </button>
            );
          })}

          {/* Developer Menu */}
          {canAccessAdmin && (
            <div className="mt-4 pt-4 border-t">
              {devMenuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.url);
                return (
                  <button
                    key={item.title}
                    onClick={() => handleNavigate(item.url)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left",
                      active
                        ? 'bg-primary text-primary-foreground shadow-lg'
                        : 'hover:bg-accent text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">{item.title}</span>
                  </button>
                );
              })}
            </div>
          )}
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
  const { signOut, user } = useAuth();
  const userName = user?.user_metadata?.full_name as string | undefined;
  const { canAccessAdmin } = useUserRole();
  const { agencyId } = useAgency();
  const { canAccess } = useHubPermissions();
  const { role: agencyRole } = useAgencyRole();

  const isAdmin = agencyRole === 'super_admin' || agencyRole === 'agency_admin' || agencyRole === 'agency_manager';
  const isAdminOnly = agencyRole === 'super_admin' || agencyRole === 'agency_admin';

  const navItems = useMemo(() => {
    return getFilteredNavigationItems({ agencyId, isAdmin, isAdminOnly, canAccess });
  }, [agencyId, isAdmin, isAdminOnly, canAccess]);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Sidebar collapsible="none" className="border-r w-52 min-w-52 max-w-52 flex flex-col">
      {/* Header com Avatar */}
      <SidebarHeader className="border-b p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center w-full p-1 hover:bg-accent rounded-lg transition-all duration-300 hover:scale-110 group" aria-label="Menu do perfil">
              <Avatar className="h-10 w-10 border-2 border-primary transition-all duration-300 group-hover:border-primary/80 group-hover:shadow-lg group-hover:shadow-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm font-bold">
                  {userName ? getInitials(userName) : 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-56 z-50">
            <DropdownMenuItem onClick={() => navigate('/profile-settings')}>
              <User className="h-4 w-4 mr-2" />
              Editar Perfil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-2">
              {/* Home (fixo) */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigate('/home')}
                  isActive={isActive('/home')}
                  className={cn(
                    "h-10 flex items-center gap-3 px-3 rounded-xl transition-all duration-300 ease-out",
                    isActive('/home')
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                      : 'hover:bg-accent'
                  )}
                >
                  <Home className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Itens centralizados */}
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.route);
                return (
                  <SidebarMenuItem key={item.route}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.route)}
                      isActive={active}
                      className={cn(
                        "h-10 flex items-center gap-3 px-3 rounded-xl transition-all duration-300 ease-out",
                        active
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                          : 'hover:bg-accent'
                      )}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Developer Menu */}
        {canAccessAdmin && (
          <SidebarGroup className="mt-auto pt-2 border-t">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1 px-2">
                {devMenuItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => navigate(item.url)}
                        isActive={active}
                        className={cn(
                          "h-10 flex items-center gap-3 px-3 rounded-xl transition-all duration-300 ease-out",
                          active
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                            : 'hover:bg-accent'
                        )}
                      >
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer com botão de logout */}
      <SidebarFooter className="border-t p-2">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 h-10 rounded-xl transition-all duration-300 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          aria-label="Sair da conta"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">Sair</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

// Mobile Header with Hamburger
export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name as string | undefined;
  const { selectedClient } = useSelectedClient();

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
          <SheetContent side="left" className="w-[300px] p-0">
            <MobileSidebarContent onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        {selectedClient && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary max-w-[120px] truncate">
              {selectedClient.fantasy_name || selectedClient.name}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 border border-primary">
            <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xs font-bold">
              {userName ? getInitials(userName) : 'U'}
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
