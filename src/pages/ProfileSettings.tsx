// Profile Settings Page
import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Upload, Building2, Palette, Image, Check, Loader2, User, Shield, Lock, Mail, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FormSection } from '@/components/ui/form-section';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
const themeOptions: {
  value: ThemeMode;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [{
  value: 'light',
  label: 'Claro',
  icon: Sun,
  description: 'Tema claro para ambientes bem iluminados'
}, {
  value: 'dark',
  label: 'Escuro',
  icon: Moon,
  description: 'Tema escuro para reduzir cansaço visual'
}, {
  value: 'system',
  label: 'Padrão do Sistema',
  icon: Monitor,
  description: 'Segue o tema do seu dispositivo automaticamente'
}];
const colorOptions: {
  value: PrimaryColor;
  label: string;
  hue: number;
  preview: string;
}[] = [{
  value: 'purple',
  label: 'Roxo',
  hue: 270,
  preview: 'hsl(270 50% 50%)'
}, {
  value: 'blue',
  label: 'Azul',
  hue: 220,
  preview: 'hsl(220 70% 50%)'
}, {
  value: 'pink',
  label: 'Rosa',
  hue: 330,
  preview: 'hsl(330 70% 50%)'
}, {
  value: 'red',
  label: 'Vermelho',
  hue: 0,
  preview: 'hsl(0 70% 50%)'
}, {
  value: 'brown',
  label: 'Marrom',
  hue: 30,
  preview: 'hsl(30 50% 40%)'
}];
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  agency_admin: 'Administrador',
  agency_manager: 'Gestor',
  agency_user: 'Colaborador'
};
export default function ProfileSettings() {
  const {
    settings,
    updateSettings,
    isLoading: themeLoading
  } = useTheme();
  const {
    agencyId,
    agencyName,
    tenantId,
    tenantName,
    isLoading: tenantLoading
  } = useAgency();
  const {
    role,
    isAgencyAdmin,
    isSuperAdmin,
    isLoading: roleLoading
  } = useAgencyRole();
  const {
    user
  } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState('');
  const [originalFullName, setOriginalFullName] = useState('');
  const [localSettings, setLocalSettings] = useState({
    mode: 'system' as ThemeMode,
    primaryColor: 'purple' as PrimaryColor,
    companyName: '',
    logoUrl: null as string | null
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [activeSection, setActiveSection] = useState<'user' | 'agency'>('user');

  // Load profile name
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).single().then(({
      data
    }) => {
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
        logoUrl: settings.logoUrl
      });
      setPreviewLogo(settings.logoUrl);
      setInitialized(true);
    }
  }, [themeLoading, tenantLoading, settings, agencyName, tenantName, initialized]);
  const isLoading = themeLoading || tenantLoading || roleLoading || !initialized;
  const canManageAgency = isAgencyAdmin || isSuperAdmin;
  const handleThemeChange = (mode: ThemeMode) => {
    setLocalSettings(prev => ({
      ...prev,
      mode
    }));
  };
  const handleColorChange = (primaryColor: PrimaryColor) => {
    setLocalSettings(prev => ({
      ...prev,
      primaryColor
    }));
  };
  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const currentId = agencyId || tenantId;
    if (!file || !currentId) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Erro',
        description: 'Por favor, selecione uma imagem válida.',
        variant: 'destructive'
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Erro',
        description: 'A imagem deve ter no máximo 2MB.',
        variant: 'destructive'
      });
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = e => setPreviewLogo(e.target?.result as string);
      reader.readAsDataURL(file);
      const fileName = `${currentId}/logo-${Date.now()}.${file.name.split('.').pop()}`;
      const {
        error: uploadError
      } = await supabase.storage.from('company-logos').upload(fileName, file, {
        upsert: true
      });
      if (uploadError) throw uploadError;
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      setLocalSettings(prev => ({
        ...prev,
        logoUrl: publicUrl
      }));
      setPreviewLogo(publicUrl);
      toast({
        title: 'Logo enviado',
        description: 'Seu logo foi carregado com sucesso.'
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar o logo.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save profile name if changed
      if (fullName !== originalFullName && user) {
        await supabase.from('profiles').update({
          full_name: fullName
        }).eq('id', user.id);
        setOriginalFullName(fullName);
      }

      // Save theme/agency settings
      await updateSettings(localSettings);
      toast({
        title: 'Configurações salvas',
        description: 'Suas preferências foram atualizadas com sucesso.'
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };
  const hasChanges = fullName !== originalFullName || localSettings.mode !== settings.mode || localSettings.primaryColor !== settings.primaryColor || localSettings.companyName !== (settings.companyName || tenantName || '') || localSettings.logoUrl !== settings.logoUrl;
  if (isLoading) {
    return <div className="pb-8">
        <PageHeader title="Editar Perfil" onBack={() => window.history.back()} />
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {[1, 2, 3, 4].map(i => <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>)}
        </div>
      </div>;
  }
  return <div className="pb-8">
      <PageHeader title="Editar Perfil" onBack={() => window.history.back()} actions={[{
      label: isSaving ? 'Salvando...' : 'Salvar Alterações',
      onClick: handleSave,
      disabled: !hasChanges || isSaving,
      loading: isSaving
    }]} />

      <div className="max-w-3xl mx-auto p-6 space-y-6">

        {/* Tab-style section switcher */}
        {canManageAgency && <div className="flex items-center justify-center">
            <div className="inline-flex items-center rounded-lg border bg-muted/50 p-1 gap-1">
              <button onClick={() => setActiveSection('user')} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${activeSection === 'user' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <User className="h-4 w-4" />
                Usuário
              </button>
              <button onClick={() => setActiveSection('agency')} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${activeSection === 'agency' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Building2 className="h-4 w-4" />
                Agência
              </button>
            </div>
          </div>}

        {/* USER SECTION */}
        {activeSection === 'user' && <div className="space-y-6">
          {/* BLOCO 1: Informações Pessoais */}
          <FormSection title="Informações Pessoais" icon={User} description="Seus dados de identificação na plataforma.">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome de Exibição</Label>
                <Input id="fullName" placeholder="Seu nome completo" value={fullName} onChange={e => setFullName(e.target.value)} className="max-w-md" />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  E-mail
                </Label>
                <Input value={user?.email || ''} disabled className="max-w-md bg-muted/50" />
                <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado por aqui.</p>
              </div>

              {role && <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Cargo
                  </Label>
                  <div>
                    <Badge variant="secondary" className="text-sm">
                      {ROLE_LABELS[role] || role}
                    </Badge>
                  </div>
                </div>}
            </div>
          </FormSection>

          {/* BLOCO 2: Aparência */}
          <FormSection title="Aparência" icon={Sun} description="Escolha como a interface deve ser exibida. Esta configuração afeta apenas o seu usuário.">
            <Select value={localSettings.mode} onValueChange={v => handleThemeChange(v as ThemeMode)}>
              <SelectTrigger className="max-w-md">
                <div className="flex items-center gap-2">
                  {(() => {
                    const selected = themeOptions.find(o => o.value === localSettings.mode);
                    if (!selected) return <SelectValue placeholder="Selecione o tema" />;
                    const Icon = selected.icon;
                    return <>
                      <Icon className="h-4 w-4" />
                      <span>{selected.label}</span>
                    </>;
                  })()}
                </div>
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map(option => {
                  const Icon = option.icon;
                  return <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>;
                })}
              </SelectContent>
            </Select>

            <Separator className="my-4" />

            {/* Color Picker */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Cor Primária</Label>
              <p className="text-xs text-muted-foreground">Aplicada a botões, links e destaques visuais da sua interface.</p>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map(color => <button key={color.value} onClick={() => handleColorChange(color.value)} className={`relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm ${localSettings.primaryColor === color.value ? 'border-foreground shadow-sm' : 'border-border hover:border-foreground/50'}`}>
                    <div className="w-4 h-4 rounded-full shrink-0" style={{
                  backgroundColor: color.preview
                }} />
                    <span className="font-medium">{color.label}</span>
                    {localSettings.primaryColor === color.value && <Check className="h-3.5 w-3.5 text-foreground" />}
                  </button>)}
              </div>

              {/* Color Preview */}
              
            </div>
          </FormSection>

          {/* BLOCO 3: Segurança */}
          <FormSection title="Segurança" icon={Lock} description="Gerencie a segurança da sua conta.">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Para alterar sua senha, utilize a opção de recuperação de senha na tela de login.
              </p>
              <Button variant="outline" size="sm" onClick={async () => {
              if (!user?.email) return;
              try {
                await supabase.auth.resetPasswordForEmail(user.email, {
                  redirectTo: `${window.location.origin}/auth`
                });
                toast({
                  title: 'E-mail enviado',
                  description: 'Verifique sua caixa de entrada para redefinir a senha.'
                });
              } catch {
                toast({
                  title: 'Erro',
                  description: 'Não foi possível enviar o e-mail.',
                  variant: 'destructive'
                });
              }
            }}>
                <Lock className="h-4 w-4 mr-2" />
                Enviar e-mail de redefinição de senha
              </Button>
            </div>
          </FormSection>
        </div>}

        {/* AGENCY SECTION */}
        {canManageAgency && activeSection === 'agency' && <div className="space-y-6">
            {/* BLOCO A: Identidade da Agência */}
            <FormSection title="Identidade da Agência" icon={Building2} description="Nome e logotipo que representam sua agência na plataforma.">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome Público da Empresa</Label>
                  <Input id="companyName" placeholder="Ex: Minha Agência" value={localSettings.companyName} onChange={e => setLocalSettings(prev => ({
                ...prev,
                companyName: e.target.value
              }))} className="max-w-md" />
                </div>

                {/* Logo */}
                <div className="space-y-3">
                  <Label>Logotipo da Empresa</Label>
                  <div className="flex items-start gap-6">
                    <div className="shrink-0">
                      <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                        {previewLogo ? <img src={previewLogo} alt="Logo preview" className="w-full h-full object-contain" /> : <Building2 className="h-8 w-8 text-muted-foreground" />}
                      </div>
                    </div>

                    <div className="flex-1 space-y-3">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full sm:w-auto">
                        {isUploading ? <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Enviando...
                          </> : <>
                            <Upload className="h-4 w-4 mr-2" />
                            Enviar Logo
                          </>}
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
            <FormSection title="Informações Administrativas" icon={Shield} description="Dados técnicos da agência (somente leitura).">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">ID da Agência</Label>
                  <Input value={agencyId || tenantId || '—'} disabled className="max-w-md bg-muted/50 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nome Registrado</Label>
                  <Input value={agencyName || tenantName || '—'} disabled className="max-w-md bg-muted/50" />
                </div>
              </div>
            </FormSection>
          </div>}
      </div>
    </div>;
}