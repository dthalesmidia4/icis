import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAgency } from '@/contexts/AgencyContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Users, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';

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

export default function TeamMembers() {
  const navigate = useNavigate();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [columns, setColumns] = useState<PipelineStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [permissions, setPermissions] = useState<ColumnPermission[]>([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

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
      const { data } = await supabase
        .from('user_column_permissions')
        .select('status_id, can_view')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId);

      if (data && data.length > 0) {
        setPermissions(data);
      } else {
        // Se não tem permissões, assume que pode ver tudo
        setPermissions(columns.map(col => ({ status_id: col.id, can_view: true })));
      }
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    }
  };

  const handleOpenPermissions = async (member: TeamMember) => {
    setSelectedMember(member);
    await loadMemberPermissions(member.id);
  };

  const togglePermission = (statusId: string) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.status_id === statusId);
      if (existing) {
        return prev.map(p => p.status_id === statusId ? { ...p, can_view: !p.can_view } : p);
      } else {
        return [...prev, { status_id: statusId, can_view: false }];
      }
    });
  };

  const savePermissions = async () => {
    if (!selectedMember || !agencyId) return;

    setIsSavingPermissions(true);

    try {
      // Deletar permissões existentes
      await supabase
        .from('user_column_permissions')
        .delete()
        .eq('user_id', selectedMember.id)
        .eq('tenant_id', agencyId);

      // Inserir novas permissões
      const permissionsToInsert = permissions.map(p => ({
        user_id: selectedMember.id,
        tenant_id: agencyId,
        status_id: p.status_id,
        can_view: p.can_view,
      }));

      const { error } = await supabase
        .from('user_column_permissions')
        .insert(permissionsToInsert);

      if (error) throw error;

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

      {/* Modal de Permissões de Colunas */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Permissões de Colunas
            </DialogTitle>
            <DialogDescription>
              Selecione quais colunas do Kanban <strong>{selectedMember?.full_name}</strong> pode visualizar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {columns.map(column => {
              const permission = permissions.find(p => p.status_id === column.id);
              const canView = permission?.can_view ?? true;

              return (
                <div
                  key={column.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={column.id}
                    checked={canView}
                    onCheckedChange={() => togglePermission(column.id)}
                  />
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <label htmlFor={column.id} className="flex-1 cursor-pointer font-medium">
                    {column.name}
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 justify-end">
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
