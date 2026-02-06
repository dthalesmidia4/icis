import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus, Mail, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';

type InviteRole = 'agency_admin' | 'agency_manager' | 'agency_user';

export default function InviteMember() {
  const navigate = useNavigate();
  const { agencyId } = useAgency();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('agency_user');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const roles = [
    { value: 'agency_admin', label: 'Administrador', description: 'Acesso total' },
    { value: 'agency_manager', label: 'Gestor Operacional', description: 'Gerencia clientes e demandas' },
    { value: 'agency_user', label: 'Colaborador', description: 'Acesso limitado' },
  ];

  const handleGenerateInvite = async () => {
    if (!agencyId || !user) {
      toast.error('Você precisa estar autenticado');
      return;
    }

    setIsLoading(true);

    try {
      // Gerar código de convite usando a função do banco
      const { data: code, error: codeError } = await supabase
        .rpc('generate_invitation_code');

      if (codeError) throw codeError;

      // Criar o convite
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expira em 7 dias

      const { error: insertError } = await supabase
        .from('invitations')
        .insert({
          code: code,
          tenant_id: agencyId,
          role: role,
          email: email || null,
          created_by: user.id,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) throw insertError;

      setGeneratedCode(code);
      toast.success('Convite gerado com sucesso!');

      // Tentar enviar email se tiver a função configurada
      if (email) {
        try {
          const { error: emailError } = await supabase.functions.invoke('send-invitation-email', {
            body: {
              email,
              code,
              role,
            },
          });

          if (!emailError) {
            toast.success(`Email de convite enviado para ${email}`);
          }
        } catch (emailErr) {
          // Email não configurado, apenas mostra o código
          console.log('Serviço de email não configurado');
        }
      }
    } catch (error: any) {
      console.error('Erro ao gerar convite:', error);
      toast.error(error.message || 'Erro ao gerar convite');
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar código');
    }
  };

  const handleNewInvite = () => {
    setGeneratedCode(null);
    setEmail('');
    setRole('agency_user');
  };

  return (
    <div className="container max-w-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <BackButton />
      </div>

      <Card className="shadow-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <UserPlus className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl sm:text-3xl">Convidar Colaborador</CardTitle>
          </div>
          <CardDescription className="text-base">
            Gere um código de convite para adicionar um novo membro à sua equipe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!generatedCode ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">
                  <Mail className="h-4 w-4 inline mr-1" />
                  E-mail do colaborador <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colaborador@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  Se informado, o convite será exclusivo para este email
                </p>
              </div>

              <div className="space-y-2">
                <Label>Nível de acesso</Label>
                <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.label}</span>
                          <span className="text-xs text-muted-foreground">{r.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => navigate('/minha-empresa')}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleGenerateInvite}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    'Gerar Convite'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div className="p-6 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Código do convite</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-mono font-bold tracking-wider text-primary">
                    {generatedCode}
                  </span>
                  <Button variant="ghost" size="icon" onClick={copyCode}>
                    {copied ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>Este código expira em <strong>7 dias</strong></p>
                {email && (
                  <p className="mt-1">Exclusivo para: <strong>{email}</strong></p>
                )}
                <p className="mt-1">
                  Nível de acesso: <strong>{roles.find(r => r.value === role)?.label}</strong>
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-sm">
                <p className="text-amber-700 dark:text-amber-300">
                  📧 Compartilhe este código com o colaborador para que ele possa se cadastrar na plataforma.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => navigate('/minha-empresa')}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleNewInvite}
                  className="flex-1"
                >
                  Novo Convite
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
