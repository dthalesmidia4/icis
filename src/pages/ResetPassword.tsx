import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, ArrowLeft, ShieldAlert, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import logoIcis from '@/assets/logo-icis-new.png';
import ShaderBackground from '@/components/ui/shader-background';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import {
  PASSWORD_RESET_SUCCESS_QUERY,
  RECOVERY_ENTRY_QUERY,
  RECOVERY_OPEN_QUERY,
  classifyRecoveryUrl,
  clearRecoveryPending,
  hasValidRecoveryEvidence,
  isRecoveryEntryLocation,
  isRecoveryPending,
  markRecoveryPending,
  validateNewPassword,
} from '@/lib/passwordRecovery';

type Phase = 'validating' | 'ready' | 'invalid';

/**
 * Rota pública de recovery: primária em `/?recovery=1`, com `/reset-password`
 * apenas para compatibilidade com links antigos.
 *
 * Só aceita definir nova senha quando existe prova real de fluxo de recovery
 * (evento PASSWORD_RECOVERY, ou sessão estabelecida a partir do `code`/hash
 * desta navegação). Uma sessão comum pré-existente não é aceita.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('validating');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const recoveryEventRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryEventRef.current = true;
        markRecoveryPending();
        if (!cancelled) setPhase('ready');
      }
    });

    const classification = classifyRecoveryUrl(window.location.search, window.location.hash);
    const recoveryEntry = isRecoveryEntryLocation(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );

    const cleanUrl = (valid: boolean) => {
      if (classification.hasSensitiveParams || valid) {
        window.history.replaceState({}, '', `/?${RECOVERY_ENTRY_QUERY}`);
      }
    };

    const validate = async () => {
      let sessionFromCode = false;

      if (classification.kind === 'code' && classification.code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(classification.code);
          if (!error && data?.session) {
            sessionFromCode = true;
            markRecoveryPending();
          }
        } catch {
          sessionFromCode = false;
        }
      }

      // Dá uma janela curta para o cliente terminar de processar a URL
      // (detectSessionInUrl) e emitir PASSWORD_RECOVERY.
      let hasSession = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        hasSession = Boolean(data.session);
        if (classification.kind === 'recovery_hash' && hasSession) {
          markRecoveryPending();
        }
        if (recoveryEventRef.current || hasSession || sessionFromCode) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      if (cancelled) return;

      const valid = hasValidRecoveryEvidence({
        passwordRecoveryEvent: recoveryEventRef.current,
        sessionFromCode,
        urlKind: classification.kind,
        hasSession,
        recoveryPending: isRecoveryPending(),
        recoveryEntry,
      });

      if (!valid) {
        clearRecoveryPending();
        try {
          await supabase.auth.signOut();
        } catch {
          /* sessão pode já ter sido invalidada */
        }
        sessionStorage.removeItem('tempSession');
      }
      cleanUrl(valid);
      setPhase(valid ? 'ready' : 'invalid');
    };

    void validate();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const validation = validateNewPassword(password, confirmation);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error('Não foi possível redefinir a senha. Solicite um novo link e tente novamente.');
        setIsSaving(false);
        return;
      }

      toast.success('Senha alterada com sucesso.');
      clearRecoveryPending();

      // Encerra a sessão temporária de recovery: o usuário deve entrar
      // explicitamente com a nova senha.
      try {
        await supabase.auth.signOut();
      } catch {
        /* sessão pode já ter sido invalidada */
      }
      sessionStorage.removeItem('tempSession');

      navigate(`/auth?${PASSWORD_RESET_SUCCESS_QUERY}`, { replace: true });
    } catch {
      toast.error('Não foi possível redefinir a senha agora. Tente novamente.');
      setIsSaving(false);
    }
  }, [confirmation, isSaving, navigate, password]);

  const leaveRecovery = useCallback(async (target: string) => {
    clearRecoveryPending();
    try {
      await supabase.auth.signOut();
    } catch {
      /* sessão pode já ter sido invalidada */
    }
    sessionStorage.removeItem('tempSession');
    navigate(target, { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-start justify-center pt-8 md:pt-16 p-4 relative">
      <ShaderBackground />
      <div className="flex flex-col items-center gap-4 w-full max-w-md z-10">
        <img src={logoIcis} alt="ICIS Logo" className="h-40 md:h-48 w-auto" />
        <Card className="w-full bg-card/90 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Redefinir senha</CardTitle>
            <CardDescription className="text-center">
              {phase === 'ready'
                ? 'Defina a nova senha da sua conta'
                : phase === 'validating'
                  ? 'Estamos verificando seu link de recuperação'
                  : 'Não foi possível validar este link'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {phase === 'validating' && (
              <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm">Validando link...</p>
              </div>
            )}

            {phase === 'invalid' && (
              <div className="space-y-4 py-2">
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
                  <p className="text-sm text-foreground">
                    Este link de recuperação é inválido ou expirou.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => void leaveRecovery(`/auth?${RECOVERY_OPEN_QUERY}`)}
                >
                  Solicitar novo link
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => void leaveRecovery('/auth')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao login
                </Button>
              </div>
            )}

            {phase === 'ready' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Lock className="h-3 w-3" />
                  Mínimo de 6 caracteres.
                </p>
                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Redefinindo...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Redefinir senha
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => void leaveRecovery('/auth')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao login
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
