import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trash2, Copy, Loader2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { getRoleLabel } from '@/lib/constants/roles';

interface Invitation {
  id: string;
  code: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface InvitationListProps {
  /** @deprecated Use agencyId */
  tenantId?: string;
  agencyId?: string;
  refreshTrigger?: number;
}

type InvitationStatus = 'active' | 'used' | 'expired';

function getStatus(invitation: Invitation): InvitationStatus {
  if (invitation.used_at) return 'used';
  if (new Date(invitation.expires_at) < new Date()) return 'expired';
  return 'active';
}

function StatusBadge({ status }: { status: InvitationStatus }) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Ativo
        </Badge>
      );
    case 'used':
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Usado
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-muted">
          <XCircle className="h-3 w-3 mr-1" />
          Expirado
        </Badge>
      );
  }
}

export function InvitationList({ tenantId, agencyId, refreshTrigger }: InvitationListProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Usar agencyId com fallback para tenantId
  const currentId = agencyId || tenantId;

  const fetchInvitations = async () => {
    if (!currentId) return;
    
    try {
      // Buscar invitations usando tenant_id (schema atual)
      // A coluna agency_id ainda não existe na tabela invitations
      const { data, error } = await supabase
        .from('invitations')
        .select('id, code, role, expires_at, used_at, created_at')
        .eq('tenant_id', currentId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setInvitations((data || []) as Invitation[]);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os convites.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentId) {
      fetchInvitations();
    }
  }, [currentId, refreshTrigger]);

  const handleRevoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
      toast({ title: 'Convite revogado', description: 'O convite foi cancelado com sucesso.' });
    } catch (error) {
      console.error('Error revoking invitation:', error);
      toast({ title: 'Erro', description: 'Não foi possível revogar o convite.', variant: 'destructive' });
    } finally {
      setRevokingId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: 'Copiado!', description: 'Código copiado para a área de transferência.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar o código.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Nenhum convite gerado ainda.</p>
        <p className="text-sm">Use o formulário acima para criar um novo convite.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nível de Acesso</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expira em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => {
            const status = getStatus(invitation);
            const isActive = status === 'active';

            return (
              <TableRow key={invitation.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                      {invitation.code}
                    </code>
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyCode(invitation.code)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {getRoleLabel(invitation.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(invitation.expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  {isActive && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={revokingId === invitation.id}
                        >
                          {revokingId === invitation.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revogar convite?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O código <strong>{invitation.code}</strong> será invalidado e não poderá mais ser utilizado para cadastro.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRevoke(invitation.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Revogar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
