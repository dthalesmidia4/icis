import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAgency } from '@/contexts/AgencyContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Users, Settings2, LayoutGrid, Home, Bell, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import { HUB_SECTIONS, CLIENT_HUB_BUTTONS } from '@/hooks/useHubPermissions';

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  email: string;
}

interface PipelineStatus {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface ColumnPermission {
  status_id: string;
  can_view: boolean;
}

interface HubPermission {
  hub_section: string;
  can_access: boolean;
}

interface ClientButtonPermission {
  hub_section: string;
  can_access: boolean;
}

export default function TeamMembers() {
  const navigate = useNavigate();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [columns, setColumns] = useState<PipelineStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [columnPermissions, setColumnPermissions] = useState<ColumnPermission[]>([]);
  const [hubPermissions, setHubPermissions] = useState<HubPermission[]>([]);
  const [clientButtonPermissions, setClientButtonPermissions] = useState<ClientButtonPermission[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [activeTab, setActiveTab] = useState<'columns' | 'hub' | 'client_buttons' | 'notifications'>('columns');
  const [lateNotificationEnabled, setLateNotificationEnabled] = useState(false);

  useEffect(() => {
    if (!agencyLoading && agencyId) {
      loadMembers();
      loadColumns();
    }
  }, [agencyId, agencyLoading]);

  const loadMembers = async () => {
    if (!agencyId) return;

    try {
      // Buscar user_roles do tenant
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('tenant_id', agencyId);

      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) {
        setMembers([]);
        setIsLoading(false);
        return;
      }

      // Buscar profiles dos usuários
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Buscar emails do auth (via profiles que tem tenant_id)
      const membersData: TeamMember[] = roles.map(role => {
        const profile = profiles?.find(p => p.id === role.user_id);
        return {
          id: role.user_id,
          full_name: profile?.full_name || 'Usuário',
          avatar_url: profile?.avatar_url || null,
          role: role.role,
          email: '', // Será preenchido se possível
        };
      });

      setMembers(membersData);
    } catch (error) {
      console.error('Erro ao carregar membros:', error);
      toast.error('Erro ao carregar membros da equipe');
    } finally {
      setIsLoading(false);
    }
  };

  const loadColumns = async () => {
    if (!agencyId) return;

    try {
      // Buscar pipeline padrão
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('tenant_id', agencyId)
        .eq('is_default', true)
        .single();

      if (!pipeline) return;

      // Buscar status do pipeline
      const { data: statuses } = await supabase
        .from('pipeline_statuses')
        .select('id, name, color, position')
        .eq('pipeline_id', pipeline.id)
        .order('position');

      if (statuses) {
        setColumns(statuses);
      }
    } catch (error) {
      console.error('Erro ao carregar colunas:', error);
    }
  };

  const loadMemberPermissions = async (userId: string) => {
    if (!agencyId) return;

    try {
      // Carregar permissões de colunas
      const { data: colPerms } = await supabase
        .from('user_column_permissions')
        .select('status_id, can_view')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId);

      if (colPerms && colPerms.length > 0) {
        // Mesclar com colunas existentes para incluir novas colunas criadas depois
        const mergedPerms = columns.map(col => {
          const existing = colPerms.find(p => p.status_id === col.id);
          return { status_id: col.id, can_view: existing?.can_view ?? false };
        });
        setColumnPermissions(mergedPerms);
      } else {
        // Se não tem permissões, assume deny-by-default
        setColumnPermissions(columns.map(col => ({ status_id: col.id, can_view: false })));
      }

      // Carregar permissões de hub
      const { data: hubPerms } = await supabase
        .from('user_hub_permissions')
        .select('hub_section, can_access')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId);

      if (hubPerms && hubPerms.length > 0) {
        setHubPermissions(hubPerms);
      } else {
        // Se não tem permissões, assume que pode acessar tudo
        setHubPermissions(HUB_SECTIONS.map(s => ({ hub_section: s.id, can_access: true })));
      }

      // Carregar permissões de botões do cliente
      const { data: clientBtnPerms } = await supabase
        .from('user_hub_permissions')
        .select('hub_section, can_access')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId)
        .like('hub_section', 'client_%');

      if (clientBtnPerms && clientBtnPerms.length > 0) {
        // Merge with all available buttons
        const merged = CLIENT_HUB_BUTTONS.map(btn => {
          const existing = clientBtnPerms.find(p => p.hub_section === btn.id);
          return { hub_section: btn.id, can_access: existing?.can_access ?? true };
        });
        setClientButtonPermissions(merged);
      } else {
        setClientButtonPermissions(CLIENT_HUB_BUTTONS.map(b => ({ hub_section: b.id, can_access: true })));
      }

      // Carregar configuração de notificações de atraso
      const { data: lateNotif } = await supabase
        .from('user_late_notification_settings')
        .select('enabled')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId)
        .maybeSingle();

      setLateNotificationEnabled(lateNotif?.enabled ?? false);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    }
  };

  const handleOpenPermissions = async (member: TeamMember) => {
    setSelectedMember(member);
    setActiveTab('columns');
    await loadMemberPermissions(member.id);
  };

  const toggleColumnPermission = (statusId: string) => {
    setColumnPermissions(prev => {
      const existing = prev.find(p => p.status_id === statusId);
      if (existing) {
        return prev.map(p => p.status_id === statusId ? { ...p, can_view: !p.can_view } : p);
      } else {
        return [...prev, { status_id: statusId, can_view: true }];
      }
    });
  };

  const toggleHubPermission = (sectionId: string) => {
    setHubPermissions(prev => {
      const existing = prev.find(p => p.hub_section === sectionId);
      if (existing) {
        return prev.map(p => p.hub_section === sectionId ? { ...p, can_access: !p.can_access } : p);
      } else {
        return [...prev, { hub_section: sectionId, can_access: true }];
      }
    });
  };

  const toggleClientButtonPermission = (buttonId: string) => {
    setClientButtonPermissions(prev => {
      const existing = prev.find(p => p.hub_section === buttonId);
      if (existing) {
        return prev.map(p => p.hub_section === buttonId ? { ...p, can_access: !p.can_access } : p);
      } else {
        return [...prev, { hub_section: buttonId, can_access: true }];
      }
    });
  };

  const savePermissions = async () => {
    if (!selectedMember || !agencyId) return;

    setIsSavingPermissions(true);

    try {
      // Salvar permissões de colunas
      await supabase
        .from('user_column_permissions')
        .delete()
        .eq('user_id', selectedMember.id)
        .eq('tenant_id', agencyId);

      const columnPermsToInsert = columnPermissions.map(p => ({
        user_id: selectedMember.id,
        tenant_id: agencyId,
        status_id: p.status_id,
        can_view: p.can_view,
      }));

      if (columnPermsToInsert.length > 0) {
        const { error: colError } = await supabase
          .from('user_column_permissions')
          .insert(columnPermsToInsert);
        if (colError) throw colError;
      }

      // Salvar permissões de hub + botões do cliente juntos
      await supabase
        .from('user_hub_permissions')
        .delete()
        .eq('user_id', selectedMember.id)
        .eq('tenant_id', agencyId);

      const allHubPerms = [
        ...hubPermissions.map(p => ({
          user_id: selectedMember.id,
          tenant_id: agencyId,
          hub_section: p.hub_section,
          can_access: p.can_access,
        })),
        ...clientButtonPermissions.map(p => ({
          user_id: selectedMember.id,
          tenant_id: agencyId,
          hub_section: p.hub_section,
          can_access: p.can_access,
        })),
      ];

      if (allHubPerms.length > 0) {
        const { error: hubError } = await supabase
          .from('user_hub_permissions')
          .insert(allHubPerms);
        if (hubError) throw hubError;
      }

      // Salvar configuração de notificações de atraso
      const { error: lateError } = await supabase
        .from('user_late_notification_settings')
        .upsert({
          user_id: selectedMember.id,
          tenant_id: agencyId,
          enabled: lateNotificationEnabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,tenant_id' });
      if (lateError) throw lateError;

      toast.success('Permissões salvas com sucesso!');
      setSelectedMember(null);
    } catch (error: any) {
      console.error('Erro ao salvar permissões:', error);
      toast.error(error.message || 'Erro ao salvar permissões');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const roleLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      'super_admin': { label: 'Super Admin', variant: 'destructive' },
      'agency_admin': { label: 'Administrador', variant: 'default' },
      'agency_manager': { label: 'Gestor', variant: 'secondary' },
      'agency_user': { label: 'Colaborador', variant: 'outline' },
    };
    
    const roleInfo = roleLabels[role] || { label: role, variant: 'outline' as const };
    return <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading || agencyLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <BackButton />
      </div>

      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold">Acesso dos Colaboradores</h1>
        </div>
        <p className="text-muted-foreground">
          Veja todos os membros da sua equipe e configure suas permissões
        </p>
      </div>

      {members.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Nenhum colaborador encontrado</p>
          <Button onClick={() => navigate('/minha-empresa/convidar')}>
            Convidar Colaborador
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {members.map(member => (
            <Card key={member.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(member.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{member.full_name}</h3>
                    {getRoleBadge(member.role)}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenPermissions(member)}
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Permissões
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Permissões */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Permissões de {selectedMember?.full_name}
            </DialogTitle>
            <DialogDescription>
              Configure as permissões de acesso para este colaborador
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'columns' | 'hub' | 'client_buttons' | 'notifications')} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="columns" className="gap-1 text-xs sm:text-sm">
                <LayoutGrid className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Colunas</span> Kanban
              </TabsTrigger>
              <TabsTrigger value="hub" className="gap-1 text-xs sm:text-sm">
                <Home className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Botões do</span> Hub
              </TabsTrigger>
              <TabsTrigger value="client_buttons" className="gap-1 text-xs sm:text-sm">
                <MousePointerClick className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Botões</span> Cliente
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1 text-xs sm:text-sm">
                <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
                Alertas
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-4">
              <TabsContent value="columns" className="mt-0 space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione quais colunas do Kanban este colaborador pode visualizar:
                </p>
                {columns.map(column => {
                  const permission = columnPermissions.find(p => p.status_id === column.id);
                  const canView = permission?.can_view ?? false;

                  return (
                    <div
                      key={column.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`col-${column.id}`}
                        checked={canView}
                        onCheckedChange={() => toggleColumnPermission(column.id)}
                      />
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: column.color }}
                      />
                      <label htmlFor={`col-${column.id}`} className="flex-1 cursor-pointer font-medium">
                        {column.name}
                      </label>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="hub" className="mt-0 space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione quais seções do Hub este colaborador pode acessar:
                </p>
                {HUB_SECTIONS.map(section => {
                  const permission = hubPermissions.find(p => p.hub_section === section.id);
                  const canAccess = permission?.can_access ?? true;

                  return (
                    <div
                      key={section.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`hub-${section.id}`}
                        checked={canAccess}
                        onCheckedChange={() => toggleHubPermission(section.id)}
                      />
                      <div className="flex-1">
                        <label htmlFor={`hub-${section.id}`} className="cursor-pointer font-medium block">
                          {section.label}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {section.description}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="client_buttons" className="mt-0 space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione quais botões dentro do Hub do Cliente este colaborador pode acessar:
                </p>
                {CLIENT_HUB_BUTTONS.map(button => {
                  const permission = clientButtonPermissions.find(p => p.hub_section === button.id);
                  const canAccess = permission?.can_access ?? true;

                  return (
                    <div
                      key={button.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`btn-${button.id}`}
                        checked={canAccess}
                        onCheckedChange={() => toggleClientButtonPermission(button.id)}
                      />
                      <div className="flex-1">
                        <label htmlFor={`btn-${button.id}`} className="cursor-pointer font-medium block">
                          {button.label}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {button.description}
                        </span>
                      </div>
                    </div>
                  );
                })}

              <TabsContent value="notifications" className="mt-0 space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  Configure os alertas que este colaborador vai receber:
                </p>
                <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium">Demandas em atraso</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Esta pessoa vai receber alertas quando demandas entrarem em atraso
                    </p>
                  </div>
                  <Switch
                    checked={lateNotificationEnabled}
                    onCheckedChange={setLateNotificationEnabled}
                  />
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setSelectedMember(null)}>
              Cancelar
            </Button>
            <Button onClick={savePermissions} disabled={isSavingPermissions}>
              {isSavingPermissions ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
