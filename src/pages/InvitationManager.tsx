import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormSection } from '@/components/ui/form-section';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, UserPlus, Building2, Clock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Tenant {
  id: string;
  name: string;
  tenant_type: string;
}

interface Invitation {
  id: string;
  code: string;
  tenant_id: string;
  role: string;
  email: string | null;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
  tenant?: Tenant;
}

const roleLabels: Record<string, string> = {
  agency_admin: 'Admin da Agência',
  agency_user: 'Usuário da Agência',
  client_admin: 'Admin do Cliente',
  client_user: 'Usuário do Cliente',
};

const InvitationManager = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [expirationDays, setExpirationDays] = useState('7');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, tenant_type')
        .order('name');
      
      if (tenantsError) throw tenantsError;
      setTenants(tenantsData || []);

      // Load invitations
      const { data: invitationsData, error: invitationsError } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (invitationsError) throw invitationsError;
      
      // Enrich with tenant names
      const enrichedInvitations = (invitationsData || []).map(inv => ({
        ...inv,
        tenant: tenantsData?.find(t => t.id === inv.tenant_id)
      }));
      
      setInvitations(enrichedInvitations);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const createInvitation = async () => {
    if (!selectedTenantId || !selectedRole) {
      toast.error('Selecione o tenant e a role');
      return;
    }

    setIsCreating(true);
    try {
      // Generate code via RPC
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_invitation_code');
      
      if (codeError) throw codeError;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expirationDays));

      const { data: user } = await supabase.auth.getUser();
      
      const { error: insertError } = await supabase
        .from('invitations')
        .insert({
          code: codeData,
          tenant_id: selectedTenantId,
          role: selectedRole as 'agency_admin' | 'agency_user' | 'client_admin' | 'client_user' | 'subclient_user' | 'super_admin',
          email: inviteEmail || null,
          expires_at: expiresAt.toISOString(),
          created_by: user.user?.id || ''
        });

      if (insertError) throw insertError;

      toast.success('Convite criado com sucesso!');
      setSelectedTenantId('');
      setSelectedRole('');
      setInviteEmail('');
      loadData();
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      toast.error(error.message || 'Erro ao criar convite');
    } finally {
      setIsCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Código copiado!');
  };

  const deleteInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Convite excluído');
      loadData();
    } catch (error) {
      console.error('Error deleting invitation:', error);
      toast.error('Erro ao excluir convite');
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerenciar Convites</h1>
        <p className="text-muted-foreground mt-2">
          Crie códigos de convite para novos usuários acessarem o sistema
        </p>
      </div>

      {/* Criar novo convite */}
      <FormSection title="Criar Novo Convite" icon={UserPlus}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Tenant *</Label>
            <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(tenant => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.tenant_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agency_admin">Admin da Agência</SelectItem>
                <SelectItem value="agency_user">Usuário da Agência</SelectItem>
                <SelectItem value="client_admin">Admin do Cliente</SelectItem>
                <SelectItem value="client_user">Usuário do Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Email (opcional)</Label>
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Validade (dias)</Label>
            <Select value={expirationDays} onValueChange={setExpirationDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia</SelectItem>
                <SelectItem value="3">3 dias</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <Button onClick={createInvitation} disabled={isCreating}>
            <Plus className="h-4 w-4 mr-2" />
            {isCreating ? 'Criando...' : 'Criar Convite'}
          </Button>
        </div>
      </FormSection>

      {/* Lista de convites */}
      <FormSection title="Convites Criados" icon={Building2}>
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum convite criado ainda
          </p>
        ) : (
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="font-mono text-lg font-bold bg-muted px-3 py-1 rounded">
                    {invitation.code}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{invitation.tenant?.name}</span>
                      <Badge variant="outline">
                        {roleLabels[invitation.role] || invitation.role}
                      </Badge>
                      {invitation.used_at ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Usado
                        </Badge>
                      ) : isExpired(invitation.expires_at) ? (
                        <Badge variant="destructive">Expirado</Badge>
                      ) : (
                        <Badge variant="default" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {invitation.email && `Para: ${invitation.email} • `}
                      Expira em: {format(new Date(invitation.expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!invitation.used_at && !isExpired(invitation.expires_at) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyCode(invitation.code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteInvitation(invitation.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
};

export default InvitationManager;
