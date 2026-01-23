import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle, Loader2, Ticket } from 'lucide-react';

interface InviteCodeInputProps {
  onValidCode: (code: string, tenantId: string, role: string) => void;
  onInvalidCode: () => void;
}

interface InvitationInfo {
  tenant_name: string;
  role: string;
  tenant_type: string;
}

const roleLabels: Record<string, string> = {
  agency_admin: 'Admin da Agência',
  agency_user: 'Usuário da Agência',
  client_admin: 'Admin do Cliente',
  client_user: 'Usuário do Cliente',
};

export const InviteCodeInput = ({ onValidCode, onInvalidCode }: InviteCodeInputProps) => {
  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<'valid' | 'invalid' | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(null);

  const validateCode = async () => {
    if (!code.trim()) return;
    
    setIsValidating(true);
    setValidationResult(null);
    setInvitationInfo(null);

    try {
      // Use edge function to validate (bypasses RLS restrictions)
      const { data, error } = await supabase.functions.invoke('validate-invitation', {
        body: { code: code.trim() }
      });

      if (error) throw error;

      if (data.valid) {
        setValidationResult('valid');
        setInvitationInfo({
          tenant_name: data.tenant_name,
          role: data.role,
          tenant_type: data.tenant_type
        });
        onValidCode(code.toUpperCase().trim(), data.tenant_id, data.role);
      } else {
        setValidationResult('invalid');
        onInvalidCode();
      }
    } catch (error) {
      console.error('Error validating code:', error);
      setValidationResult('invalid');
      onInvalidCode();
    } finally {
      setIsValidating(false);
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase());
    setValidationResult(null);
    setInvitationInfo(null);
    onInvalidCode();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Ticket className="h-5 w-5 text-primary" />
        <Label className="text-base font-medium">Código de Convite</Label>
      </div>
      
      <div className="flex gap-2">
        <Input
          placeholder="XXXXXXXX"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          maxLength={8}
          className={`font-mono text-lg uppercase tracking-wider ${
            validationResult === 'valid' 
              ? 'border-green-500 focus-visible:ring-green-500' 
              : validationResult === 'invalid'
              ? 'border-destructive focus-visible:ring-destructive'
              : ''
          }`}
        />
        <Button 
          type="button"
          onClick={validateCode} 
          disabled={!code.trim() || isValidating}
          variant="secondary"
        >
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Validar'
          )}
        </Button>
      </div>

      {validationResult === 'valid' && invitationInfo && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Convite válido!
            </p>
            <p className="text-xs text-muted-foreground">
              Você será adicionado à <strong>{invitationInfo.tenant_name}</strong> como{' '}
              <Badge variant="outline" className="ml-1">
                {roleLabels[invitationInfo.role] || invitationInfo.role}
              </Badge>
            </p>
          </div>
        </div>
      )}

      {validationResult === 'invalid' && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <XCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-destructive">
            Código inválido ou expirado. Verifique e tente novamente.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Se você recebeu um código de convite, insira-o acima para se juntar a uma organização existente.
      </p>
    </div>
  );
};
