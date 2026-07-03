import { Home, Code, User, LogOut, Menu, Building2, Briefcase, DollarSign, KeyRound, Sparkles, Settings as SettingsIcon } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAgency } from "@/contexts/AgencyContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/RoleBadge";
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
import { useState } from "react";
import { cn } from "@/lib/utils";

// Menu principal (após Home)
const mainMenuItems = [
  { title: "Minha Empresa", url: "/minha-empresa", icon: Briefcase, requiresAgency: true },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Configurações", url: "/configuracoes", icon: SettingsIcon },
];

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
  const visibleMainItems = mainMenuItems.filter((i) => !i.requiresAgency || !!agencyId);

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

          {/* Main menu items */}
          {visibleMainItems.map((item) => {
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
  const visibleMainItems = mainMenuItems.filter((i) => !i.requiresAgency || !!agencyId);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        "border-r flex flex-col bg-sidebar h-full transition-all duration-300 ease-in-out overflow-hidden",
        expanded ? "w-52" : "w-16"
      )}
    >
      {/* Header com Avatar */}
      <div className="border-b p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-1 hover:bg-accent rounded-lg transition-all duration-300 group" aria-label="Menu do perfil">
              <Avatar className="h-10 w-10 flex-shrink-0 border-2 border-primary transition-all duration-300 group-hover:border-primary/80">
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm font-bold">
                  {userName ? getInitials(userName) : 'U'}
                </AvatarFallback>
              </Avatar>
              {expanded && (
                <span className="text-sm font-medium truncate animate-in fade-in duration-200">
                  {userName || 'Usuário'}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-56 z-50">
            <DropdownMenuItem onClick={() => navigate('/profile-settings')}>
              <User className="h-4 w-4 mr-2" />
              Editar Perfil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav Items */}
      <div className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        <nav className="flex flex-col gap-1 px-2">
          {/* Home */}
          {expanded ? (
            <button
              onClick={() => navigate('/home')}
              className={cn(
                "h-10 flex items-center gap-3 px-3 rounded-xl transition-all duration-300",
                isActive('/home')
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : 'hover:bg-accent text-sidebar-foreground'
              )}
            >
              <Home className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm font-medium truncate">Home</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/home')}
                  className={cn(
                    "h-10 w-10 mx-auto flex items-center justify-center rounded-xl transition-all duration-300",
                    isActive('/home')
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                      : 'hover:bg-accent text-sidebar-foreground'
                  )}
                >
                  <Home className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>Home</TooltipContent>
            </Tooltip>
          )}

          {/* Main menu items */}
          {visibleMainItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.url);
            return expanded ? (
              <button
                key={item.title}
                onClick={() => navigate(item.url)}
                className={cn(
                  "h-10 flex items-center gap-3 px-3 rounded-xl transition-all duration-300",
                  active
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'hover:bg-accent text-sidebar-foreground'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium truncate">{item.title}</span>
              </button>
            ) : (
              <Tooltip key={item.title}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(item.url)}
                    className={cn(
                      "h-10 w-10 mx-auto flex items-center justify-center rounded-xl transition-all duration-300",
                      active
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                        : 'hover:bg-accent text-sidebar-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>{item.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Developer Menu */}
        {canAccessAdmin && (

          <div className="mt-4 pt-2 border-t mx-2">
            <nav className="flex flex-col gap-1">
              {devMenuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.url);
                return expanded ? (
                  <button
                    key={item.title}
                    onClick={() => navigate(item.url)}
                    className={cn(
                      "h-10 flex items-center gap-3 px-3 rounded-xl transition-all duration-300",
                      active
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                        : 'hover:bg-accent text-sidebar-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </button>
                ) : (
                  <Tooltip key={item.title}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => navigate(item.url)}
                        className={cn(
                          "h-10 w-10 mx-auto flex items-center justify-center rounded-xl transition-all duration-300",
                          active
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                            : 'hover:bg-accent text-sidebar-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>{item.title}</TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Footer - Logout */}
      <div className="border-t p-2">
        {expanded ? (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 h-10 w-full rounded-xl transition-all duration-300 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-300 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>Sair</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
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
