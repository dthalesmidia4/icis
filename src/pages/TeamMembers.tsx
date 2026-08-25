import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAgency } from '@/contexts/AgencyContext';
import { useRealtimeFlowConfig, useDebouncedCallback } from '@/hooks/realtime';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Users, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgencyRole } from '@/hooks/useAgencyRole';
import { useFinanceAccessScope } from '@/hooks/useFinanceAccessScope';
import { INVITE_ROLE_OPTIONS, MANAGER_AREA_LABELS, MANAGER_AREA_OPTIONS, type ValidAgencyRole } from '@/lib/constants/roles';
import { useAuth } from '@/hooks/useAuth';
import MemberAvatarUpload from '@/components/team/MemberAvatarUpload';
import {
  HOME_PERMISSION_ITEMS,
  buildFinanceUpdate,
  buildHomePermissionUpserts,
  canEditPermissions,
  effectiveFinanceToolsAccess,
  resolveHomePermissionState,
  visibleFinanceCapabilities,
  type HomePermissionId,
} from '@/lib/permissionDelegation';


interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  manager_work_area: 'midia' | 'sistemas' | null;
  email: string;
}

interface FinanceFlagsState {
  finance_access: boolean;
  finance_tools_access: boolean;
}

export default function TeamMembers() {
  const navigate = useNavigate();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [homePermissions, setHomePermissions] = useState<Record<HomePermissionId, boolean>>(() =>
    resolveHomePermissionState([]),
  );
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const { role: editorRole, isSuperAdmin, isAgencyAdmin } = useAgencyRole();
  const { scope: editorFinanceScope } = useFinanceAccessScope();
  const canEditRoles = isSuperAdmin || isAgencyAdmin;
  const canEditPerms = canEditPermissions(editorRole);
  const financeGrantable = visibleFinanceCapabilities(

    editorRole,
    editorFinanceScope,
    selectedMember?.role,
  );

  // Permissões do Financeiro (colunas de `user_roles`).
  const [financeFlags, setFinanceFlags] = useState<FinanceFlagsState>({
    finance_access: false,
    finance_tools_access: false,
  });
  const [savedFinanceFlags, setSavedFinanceFlags] = useState<FinanceFlagsState>({
    finance_access: false,
    finance_tools_access: false,
  });

  useEffect(() => {
    if (!agencyLoading && agencyId) {
      loadMembers();
    }
  }, [agencyId, agencyLoading]);


  const debouncedReload = useDebouncedCallback(() => {
    if (!agencyId) return;
    loadMembers();
    if (selectedMember) loadMemberPermissions(selectedMember.id);
  }, 300);

  useRealtimeFlowConfig({
    tenantId: agencyId ?? null,
    enabled: !!agencyId,
    onChange: () => debouncedReload(),
  });

  // Realtime para profiles/user_roles do tenant
  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`rt-team-members-${agencyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles', filter: `tenant_id=eq.${agencyId}` }, () => debouncedReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => debouncedReload())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agencyId]);

  const loadMembers = async () => {
    if (!agencyId) return;

    try {
      // Buscar user_roles do tenant
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, manager_work_area')
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
          manager_work_area: ((role as any).manager_work_area as 'midia' | 'sistemas' | null) ?? null,
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

  const loadMemberPermissions = async (userId: string) => {
    if (!agencyId) return;

    try {
      // Tela inicial: somente os ids atuais são considerados.
      const { data: hubPerms } = await supabase
        .from('user_hub_permissions')
        .select('hub_section, can_access')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId);

      setHomePermissions(resolveHomePermissionState(hubPerms ?? []));

      // Permissões do Financeiro: nunca concedidas automaticamente.
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('finance_access, finance_tools_access')
        .eq('user_id', userId)
        .eq('tenant_id', agencyId)
        .maybeSingle();

      const flags: FinanceFlagsState = {
        finance_access: !!(roleRow as any)?.finance_access,
        finance_tools_access: !!(roleRow as any)?.finance_tools_access,
      };
      setFinanceFlags(flags);
      setSavedFinanceFlags(flags);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
    }
  };

  const handleOpenPermissions = async (member: TeamMember) => {
    setSelectedMember(member);
    await loadMemberPermissions(member.id);
  };

  const toggleHomePermission = (sectionId: HomePermissionId) => {
    setHomePermissions(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };


  const savePermissions = async () => {
    if (!selectedMember || !agencyId) return;

    setIsSavingPermissions(true);

    try {
      // Tela inicial: UPSERT somente dos ids atuais (rows legadas ficam intocadas).
      const rows = buildHomePermissionUpserts(selectedMember.id, agencyId, homePermissions);
      const { error: hubError } = await supabase
        .from('user_hub_permissions')
        .upsert(rows, { onConflict: 'user_id,tenant_id,hub_section' });
      if (hubError) throw hubError;

      // Financeiro: grava apenas os campos que o editor pode delegar.
      const financePayload = buildFinanceUpdate(financeGrantable, financeFlags, savedFinanceFlags);
      if (financePayload) {
        const { error: financeError } = await supabase
          .from('user_roles')
          .update(financePayload as any)
          .eq('user_id', selectedMember.id)
          .eq('tenant_id', agencyId);
        if (financeError) throw financeError;
      }


      toast.success('Permissões salvas com sucesso!');
      setSelectedMember(null);
    } catch (error: any) {
      console.error('Erro ao salvar permissões:', error);
      toast.error(error.message || 'Erro ao salvar permissões');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const getRoleBadge = (role: string, managerWorkArea?: string | null) => {
    const roleLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      'super_admin': { label: 'Super Admin', variant: 'destructive' },
      'agency_admin': { label: 'Administrador', variant: 'default' },
      'agency_manager': { label: 'Gestor', variant: 'secondary' },
      'agency_user': { label: 'Colaborador', variant: 'outline' },
    };
    
    const roleInfo = roleLabels[role] || { label: role, variant: 'outline' as const };
    const areaSuffix =
      role === 'agency_manager' && managerWorkArea
        ? ` · ${MANAGER_AREA_LABELS[managerWorkArea as 'midia' | 'sistemas'] ?? managerWorkArea}`
        : '';
    return <Badge variant={roleInfo.variant}>{roleInfo.label}{areaSuffix}</Badge>;
  };

  const changeMemberRole = async (member: TeamMember, role: ValidAgencyRole) => {
    if (!agencyId || role === member.role) return;
    setSavingRoleId(member.id);
    try {
      // Área só faz sentido para o Gestor Operacional
      const nextArea = role === 'agency_manager' ? member.manager_work_area : null;
      const { data, error } = await supabase
        .from('user_roles')
        .update({ role: role as any, manager_work_area: nextArea as any })
        .eq('user_id', member.id)
        .eq('tenant_id', agencyId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Sem permissão para alterar a função deste membro.');
      }
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role, manager_work_area: nextArea } : m)));
      toast.success('Função atualizada.');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível alterar a função.');
    } finally {
      setSavingRoleId(null);
    }
  };

  const changeManagerArea = async (member: TeamMember, value: string) => {
    if (!agencyId) return;
    const nextArea = value === 'ambas' ? null : (value as 'midia' | 'sistemas');
    if (nextArea === member.manager_work_area) return;
    setSavingRoleId(member.id);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .update({ manager_work_area: nextArea as any })
        .eq('user_id', member.id)
        .eq('tenant_id', agencyId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Sem permissão para alterar a área deste gestor.');
      }
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, manager_work_area: nextArea } : m)));
      toast.success('Área do gestor atualizada.');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível alterar a área.');
    } finally {
      setSavingRoleId(null);
    }
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

      <Accordion type="single" collapsible className="mb-6 rounded-lg border bg-card px-4">
        <AccordionItem value="perms" className="border-0">
          <AccordionTrigger className="text-sm font-semibold">
            O que cada função pode fazer
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <div>
              <p className="font-medium text-foreground">Administrador da Agência</p>
              <p>Tudo o que o gestor faz, mais alterar funções da equipe e configurações da agência.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Gestor Operacional</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Vê a seção "Ainda não liberadas" e libera ou devolve demandas na fila.</li>
                <li>Usa o botão de reorganizar sequência nas colunas.</li>
                <li>Enxerga as colunas de todos os colaboradores na visão geral.</li>
                <li>Cria demandas e acessa a área administrativa.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">Colaborador</p>
              <p>Abre a visão geral focada na própria coluna e vê apenas as demandas já liberadas.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Liberação automática</p>
              <p>Ao concluir uma demanda, o sistema libera a próxima da fila respeitando o limite configurado em Configurações de fluxo → Prioridade e risco.</p>
            </div>
            <p className="text-xs">
              A área do Gestor Operacional (Mídia ou Sistemas) é apenas identificação: ela não restringe nem amplia nenhuma dessas ações.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>


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
                  <MemberAvatarUpload
                    userId={member.id}
                    fullName={member.full_name}
                    avatarUrl={member.avatar_url}
                    initials={getInitials(member.full_name)}
                    editable={member.id === currentUserId || canEditRoles}
                    onChanged={(url) =>
                      setMembers((prev) =>
                        prev.map((m) => (m.id === member.id ? { ...m, avatar_url: url } : m)),
                      )
                    }
                  />
                  <div>
                    <h3 className="font-semibold">{member.full_name}</h3>
                    {canEditRoles && member.role !== 'super_admin' ? (
                      <div className="mt-1 flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(v) => changeMemberRole(member, v as ValidAgencyRole)}
                          disabled={savingRoleId === member.id}
                        >
                          <SelectTrigger className="h-8 w-56 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITE_ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {member.role === 'agency_manager' && (
                          <Select
                            value={member.manager_work_area ?? 'ambas'}
                            onValueChange={(v) => changeManagerArea(member, v)}
                            disabled={savingRoleId === member.id}
                          >
                            <SelectTrigger className="h-8 w-40 text-xs">
                              <SelectValue placeholder="Área" />
                            </SelectTrigger>
                            <SelectContent>
                              {MANAGER_AREA_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {savingRoleId === member.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                    ) : (
                      getRoleBadge(member.role, member.manager_work_area)
                    )}

                  </div>
                </div>
                {canEditPerms && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenPermissions(member)}
                  >
                    <Settings2 className="h-4 w-4 mr-2" />
                    Permissões
                  </Button>
                )}

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Permissões — seções empilhadas, sem tabs comprimidas */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent className="max-w-[720px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Permissões de {selectedMember?.full_name}
            </DialogTitle>
            <DialogDescription>
              Controle o que este colaborador enxerga no ICIS atual.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-8 py-2 pr-1">
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">Início</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha quais áreas aparecem na tela inicial deste colaborador.
                </p>
              </div>

              <div className="space-y-2">
                {HOME_PERMISSION_ITEMS.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch
                      checked={homePermissions[item.id]}
                      disabled={!canEditPerms}
                      onCheckedChange={() => toggleHomePermission(item.id)}
                    />
                  </div>
                ))}
              </div>
            </section>

            {financeGrantable.any && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold">Financeiro</h3>
                  <p className="text-sm text-muted-foreground">
                    Você só concede o que você mesmo possui.
                  </p>
                </div>

                {selectedMember?.role === 'super_admin' ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    Acesso total por função — não há chaves a configurar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {financeGrantable.full && (
                      <div className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">Financeiro completo</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Resumo do mês, pagamentos, cartões e faturas, orçamento e ajustes.
                            Já inclui assinaturas e ferramentas.
                          </p>
                        </div>
                        <Switch
                          checked={financeFlags.finance_access}
                          disabled={!canEditPerms}
                          onCheckedChange={(v) =>
                            setFinanceFlags(prev => ({ ...prev, finance_access: v }))
                          }
                        />
                      </div>
                    )}

                    {financeGrantable.tools && (
                      <div className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">Assinaturas e ferramentas</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {financeFlags.finance_access
                              ? 'Incluído no Financeiro completo — não é necessário ativar esta chave.'
                              : 'Permite cadastrar e manter ferramentas, assinaturas e pacotes, sem acesso ao resumo financeiro, faturas, orçamento ou despesas administrativas.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {financeFlags.finance_access && (
                            <Badge variant="secondary">Incluído</Badge>
                          )}
                          <Switch
                            checked={effectiveFinanceToolsAccess(financeFlags)}
                            disabled={!canEditPerms || financeFlags.finance_access}
                            onCheckedChange={(v) =>
                              setFinanceFlags(prev => ({ ...prev, finance_tools_access: v }))
                            }
                          />
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </section>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="outline" onClick={() => setSelectedMember(null)}>
              Cancelar
            </Button>
            <Button onClick={savePermissions} disabled={isSavingPermissions || !canEditPerms}>
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
