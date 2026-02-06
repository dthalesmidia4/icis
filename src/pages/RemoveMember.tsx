import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, UserMinus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';

interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

export default function RemoveMember() {
  const navigate = useNavigate();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (!agencyLoading && agencyId) {
      loadMembers();
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

      // Filtrar o usuário atual (não pode remover a si mesmo)
      const membersData: TeamMember[] = roles
        .filter(role => role.user_id !== user?.id)
        .map(role => {
          const profile = profiles?.find(p => p.id === role.user_id);
          return {
            id: role.user_id,
            full_name: profile?.full_name || 'Usuário',
            avatar_url: profile?.avatar_url || null,
            role: role.role,
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

  const handleRemoveMember = async () => {
    if (!memberToRemove || !agencyId) return;

    setIsRemoving(true);

    try {
      // 1. Remover permissões de colunas
      await supabase
        .from('user_column_permissions')
        .delete()
        .eq('user_id', memberToRemove.id)
        .eq('tenant_id', agencyId);

      // 2. Remover user_role
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', memberToRemove.id)
        .eq('tenant_id', agencyId);

      if (roleError) throw roleError;

      // 3. Limpar tenant_id do profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ tenant_id: null })
        .eq('id', memberToRemove.id);

      if (profileError) {
        console.warn('Erro ao limpar tenant_id do profile:', profileError);
        // Não bloqueia a remoção
      }

      toast.success(`${memberToRemove.full_name} foi removido da equipe`);
      setMemberToRemove(null);
      
      // Atualizar lista
      setMembers(prev => prev.filter(m => m.id !== memberToRemove.id));
    } catch (error: any) {
      console.error('Erro ao remover membro:', error);
      toast.error(error.message || 'Erro ao remover colaborador');
    } finally {
      setIsRemoving(false);
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
          <UserMinus className="h-8 w-8 text-destructive" />
          <h1 className="text-2xl sm:text-3xl font-bold">Remover Colaborador</h1>
        </div>
        <p className="text-muted-foreground">
          Remova membros da sua equipe permanentemente
        </p>
      </div>

      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Atenção!</p>
            <p className="text-muted-foreground">
              A remoção é permanente. O colaborador perderá todo o acesso à plataforma e precisará de um novo convite para retornar.
            </p>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            Não há colaboradores para remover (você não pode remover a si mesmo)
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {members.map(member => (
            <Card key={member.id} className="hover:shadow-md transition-shadow border-destructive/20 hover:border-destructive/40">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-destructive/10 text-destructive">
                      {getInitials(member.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{member.full_name}</h3>
                    {getRoleBadge(member.role)}
                  </div>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setMemberToRemove(member)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Confirmação */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Remoção
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{memberToRemove?.full_name}</strong> da equipe?
              <br /><br />
              Esta ação é <strong>permanente</strong> e não pode ser desfeita. O colaborador perderá todo o acesso à plataforma imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={isRemoving}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Sim, remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
