// Profile Settings Page
import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Upload, Building2, Palette, Image, Check, Loader2, User, Shield, Lock, Mail, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FormSection } from '@/components/ui/form-section';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useTheme, ThemeMode, PrimaryColor } from '@/contexts/ThemeContext';
import { useAgency } from '@/contexts/TenantContext';
import { useAgencyRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleBadge } from '@/components/RoleBadge';

const themeOptions: { value: ThemeMode; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'light', label: 'Claro', icon: Sun, description: 'Tema claro para ambientes bem iluminados' },
  { value: 'dark', label: 'Escuro', icon: Moon, description: 'Tema escuro para reduzir cansaço visual' },
  { value: 'system', label: 'Padrão do Sistema', icon: Monitor, description: 'Segue o tema do seu dispositivo automaticamente' },
];

const colorOptions: { value: PrimaryColor; label: string; hue: number; preview: string }[] = [
  { value: 'purple', label: 'Roxo', hue: 270, preview: 'hsl(270 50% 50%)' },
  { value: 'blue', label: 'Azul', hue: 220, preview: 'hsl(220 70% 50%)' },
  { value: 'pink', label: 'Rosa', hue: 330, preview: 'hsl(330 70% 50%)' },
  { value: 'red', label: 'Vermelho', hue: 0, preview: 'hsl(0 70% 50%)' },
  { value: 'brown', label: 'Marrom', hue: 30, preview: 'hsl(30 50% 40%)' },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  agency_admin: 'Administrador',
  agency_manager: 'Gestor',
  agency_user: 'Colaborador',
};

export default function ProfileSettings() {
  const { settings, updateSettings, isLoading: themeLoading } = useTheme();
  const { agencyId, agencyName, tenantId, tenantName, isLoading: tenantLoading } = useAgency();
  const { role, isAgencyAdmin, isSuperAdmin, isLoading: roleLoading } = useAgencyRole();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [originalFullName, setOriginalFullName] = useState('');

  const [localSettings, setLocalSettings] = useState({
    mode: 'system' as ThemeMode,
    primaryColor: 'purple' as PrimaryColor,
    companyName: '',
    logoUrl: null as string | null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Load profile name
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) {
          setFullName(data.full_name);
          setOriginalFullName(data.full_name);
        }
      });
  }, [user]);

  // Sync local state with context when loaded
  useEffect(() => {
    if (!themeLoading && !tenantLoading && !initialized) {
      setLocalSettings({
        mode: settings.mode,
        primaryColor: settings.primaryColor,
        companyName: settings.companyName || agencyName || tenantName || '',
        logoUrl: settings.logoUrl,
      });
      setPreviewLogo(settings.logoUrl);
      setInitialized(true);
    }
  }, [themeLoading, tenantLoading, settings, agencyName, tenantName, initialized]);

  const isLoading = themeLoading || tenantLoading || roleLoading || !initialized;
  const canManageAgency = isAgencyAdmin || isSuperAdmin;

  const handleThemeChange = (mode: ThemeMode) => {
    setLocalSettings(prev => ({ ...prev, mode }));
  };

  const handleColorChange = (primaryColor: PrimaryColor) => {
    setLocalSettings(prev => ({ ...prev, primaryColor }));
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const currentId = agencyId || tenantId;
    if (!file || !currentId) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Por favor, selecione uma imagem válida.', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 2MB.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewLogo(e.target?.result as string);
      reader.readAsDataURL(file);

      const fileName = `${currentId}/logo-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);

      setLocalSettings(prev => ({ ...prev, logoUrl: publicUrl }));
      setPreviewLogo(publicUrl);
      toast({ title: 'Logo enviado', description: 'Seu logo foi carregado com sucesso.' });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Erro ao enviar', description: 'Não foi possível enviar o logo.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save profile name if changed
      if (fullName !== originalFullName && user) {
        await supabase
          .from('profiles')
          .update({ full_name: fullName })
          .eq('id', user.id);
        setOriginalFullName(fullName);
      }

      // Save theme/agency settings
      await updateSettings(localSettings);
      toast({ title: 'Configurações salvas', description: 'Suas preferências foram atualizadas com sucesso.' });
    } catch (error) {
      toast({ title: 'Erro', description: 'Não foi possível salvar as configurações.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    fullName !== originalFullName ||
    localSettings.mode !== settings.mode ||
    localSettings.primaryColor !== settings.primaryColor ||
    localSettings.companyName !== (settings.companyName || tenantName || '') ||
    localSettings.logoUrl !== settings.logoUrl;

  if (isLoading) {
    return (
      <div className="pb-8">
        <PageHeader
          title="Editar Perfil"
          onBack={() => window.history.back()}
        />
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Editar Perfil"
        subtitle={hasChanges ? 'Você tem alterações não salvas' : 'Todas as alterações foram salvas'}
        onBack={() => window.history.back()}
        actions={[
          {
            label: isSaving ? 'Salvando...' : 'Salvar Alterações',
            onClick: handleSave,
            disabled: !hasChanges || isSaving,
            loading: isSaving,
          }
        ]}
      />

      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* ═══════════════════════════════════════════ */}
        {/* SEÇÃO 1 — PERFIL DO USUÁRIO                */}
        {/* ═══════════════════════════════════════════ */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Perfil do Usuário
          </h2>
          <p className="text-sm text-muted-foreground">
            Informações pessoais e preferências de uso
          </p>
        </div>

        <div className="space-y-6">
          {/* BLOCO 1: Informações Pessoais */}
          <FormSection
            title="Informações Pessoais"
            icon={User}
            description="Seus dados de identificação na plataforma."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome de Exibição</Label>
                <Input
                  id="fullName"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="max-w-md"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  E-mail
                </Label>
                <Input
                  value={user?.email || ''}
                  disabled
                  className="max-w-md bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado por aqui.</p>
              </div>

              {role && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Cargo
                  </Label>
                  <div>
                    <Badge variant="secondary" className="text-sm">
                      {ROLE_LABELS[role] || role}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* BLOCO 2: Aparência */}
          <FormSection
            title="Aparência"
            icon={Sun}
            description="Escolha como a interface deve ser exibida. Esta configuração afeta apenas o seu usuário."
          >
            <RadioGroup
              value={localSettings.mode}
              onValueChange={(v) => handleThemeChange(v as ThemeMode)}
              className="grid gap-4"
            >
              {themeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Label
                    key={option.value}
                    htmlFor={`theme-${option.value}`}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      localSettings.mode === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-accent/50'
                    }`}
                  >
                    <RadioGroupItem value={option.value} id={`theme-${option.value}`} className="sr-only" />
                    <div className={`p-2 rounded-lg ${localSettings.mode === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{option.label}</p>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                    {localSettings.mode === option.value && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </Label>
                );
              })}
            </RadioGroup>

            <Separator className="my-4" />

            {/* Color Picker */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Cor Primária</Label>
              <p className="text-xs text-muted-foreground">Aplicada a botões, links e destaques visuais da sua interface.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => handleColorChange(color.value)}
                    className={`relative p-4 rounded-xl border-2 transition-all ${
                      localSettings.primaryColor === color.value
                        ? 'border-foreground shadow-lg scale-105'
                        : 'border-border hover:border-foreground/50 hover:scale-102'
                    }`}
                  >
                    <div
                      className="w-full aspect-square rounded-lg mb-2"
                      style={{ backgroundColor: color.preview }}
                    />
                    <p className="text-sm font-medium text-center">{color.label}</p>
                    {localSettings.primaryColor === color.value && (
                      <div className="absolute -top-1 -right-1 bg-foreground text-background rounded-full p-1">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Color Preview */}
              <div className="mt-4 p-4 rounded-lg border bg-card">
                <p className="text-sm text-muted-foreground mb-3">Pré-visualização:</p>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    style={{
                      backgroundColor: colorOptions.find(c => c.value === localSettings.primaryColor)?.preview,
                      borderColor: colorOptions.find(c => c.value === localSettings.primaryColor)?.preview
                    }}
                  >
                    Botão Primário
                  </Button>
                  <span
                    className="text-sm font-medium"
                    style={{ color: colorOptions.find(c => c.value === localSettings.primaryColor)?.preview }}
                  >
                    Link de exemplo
                  </span>
                </div>
              </div>
            </div>
          </FormSection>

          {/* BLOCO 3: Segurança */}
          <FormSection
            title="Segurança"
            icon={Lock}
            description="Gerencie a segurança da sua conta."
          >
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Para alterar sua senha, utilize a opção de recuperação de senha na tela de login.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!user?.email) return;
                  try {
                    await supabase.auth.resetPasswordForEmail(user.email, {
                      redirectTo: `${window.location.origin}/auth`,
                    });
                    toast({ title: 'E-mail enviado', description: 'Verifique sua caixa de entrada para redefinir a senha.' });
                  } catch {
                    toast({ title: 'Erro', description: 'Não foi possível enviar o e-mail.', variant: 'destructive' });
                  }
                }}
              >
                <Lock className="h-4 w-4 mr-2" />
                Enviar e-mail de redefinição de senha
              </Button>
            </div>
          </FormSection>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* SEÇÃO 2 — CONFIGURAÇÕES DA AGÊNCIA         */}
        {/* (Somente AGENCY_ADMIN / SUPER_ADMIN)       */}
        {/* ═══════════════════════════════════════════ */}
        {canManageAgency && (
          <>
            <Separator className="my-2" />

            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Configurações da Agência
              </h2>
              <p className="text-sm text-muted-foreground">
                Dados visíveis para toda a equipe e clientes da agência
              </p>
            </div>

            <div className="space-y-6">
              {/* BLOCO A: Identidade da Agência */}
              <FormSection
                title="Identidade da Agência"
                icon={Building2}
                description="Nome e logotipo que representam sua agência na plataforma."
              >
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Nome Público da Empresa</Label>
                    <Input
                      id="companyName"
                      placeholder="Ex: Minha Agência"
                      value={localSettings.companyName}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, companyName: e.target.value }))}
                      className="max-w-md"
                    />
                  </div>

                  {/* Logo */}
                  <div className="space-y-3">
                    <Label>Logotipo da Empresa</Label>
                    <div className="flex items-start gap-6">
                      <div className="shrink-0">
                        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                          {previewLogo ? (
                            <img src={previewLogo} alt="Logo preview" className="w-full h-full object-contain" />
                          ) : (
                            <Building2 className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          className="w-full sm:w-auto"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Enviar Logo
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Formatos: PNG, JPG, SVG, WEBP · Máx: 2MB · Recomendado: 256×256px
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </FormSection>

              {/* BLOCO C: Informações Administrativas */}
              <FormSection
                title="Informações Administrativas"
                icon={Shield}
                description="Dados técnicos da agência (somente leitura)."
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">ID da Agência</Label>
                    <Input
                      value={agencyId || tenantId || '—'}
                      disabled
                      className="max-w-md bg-muted/50 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nome Registrado</Label>
                    <Input
                      value={agencyName || tenantName || '—'}
                      disabled
                      className="max-w-md bg-muted/50"
                    />
                  </div>
                </div>
              </FormSection>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
