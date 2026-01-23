// Profile Settings Page
import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Upload, Building2, Palette, Image, Check, Loader2, UserPlus, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FormSection } from '@/components/ui/form-section';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme, ThemeMode, PrimaryColor } from '@/contexts/ThemeContext';
import { useTenant } from '@/contexts/TenantContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { InvitationList } from '@/components/InvitationList';
import type { Database } from '@/integrations/supabase/types';

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

type AppRole = Database['public']['Enums']['app_role'];

const roleOptions: { value: AppRole; label: string }[] = [
  { value: 'agency_admin', label: 'Admin da Agência' },
  { value: 'agency_user', label: 'Usuário da Agência' },
];

export default function ProfileSettings() {
  const { settings, updateSettings, isLoading: themeLoading } = useTheme();
  const { tenantId, tenantName, isLoading: tenantLoading } = useTenant();
  const { isAgencyAdmin, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  // Invitation states
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invitationRefresh, setInvitationRefresh] = useState(0);

  const canInvite = isAgencyAdmin || isSuperAdmin;

  // Sync local state with context when loaded
  useEffect(() => {
    if (!themeLoading && !tenantLoading && !initialized) {
      setLocalSettings({
        mode: settings.mode,
        primaryColor: settings.primaryColor,
        companyName: settings.companyName || tenantName || '',
        logoUrl: settings.logoUrl,
      });
      setPreviewLogo(settings.logoUrl);
      setInitialized(true);
    }
  }, [themeLoading, tenantLoading, settings, tenantName, initialized]);

  const isLoading = themeLoading || tenantLoading || roleLoading || !initialized;

  const handleThemeChange = (mode: ThemeMode) => {
    setLocalSettings(prev => ({ ...prev, mode }));
  };

  const handleColorChange = (primaryColor: PrimaryColor) => {
    setLocalSettings(prev => ({ ...prev, primaryColor }));
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !tenantId) return;

    // Validate file
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
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreviewLogo(e.target?.result as string);
      reader.readAsDataURL(file);

      // Upload to storage
      const fileName = `${tenantId}/logo-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
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

  const handleGenerateInvite = async () => {
    if (!selectedRole || !tenantId) return;
    
    setIsGenerating(true);
    try {
      // Get user id for created_by
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Generate code via RPC
      const { data: code, error: codeError } = await supabase.rpc('generate_invitation_code');
      if (codeError) throw codeError;

      // Calculate expiration (7 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Insert invitation
      const { error: insertError } = await supabase
        .from('invitations')
        .insert({
          code,
          tenant_id: tenantId,
          role: selectedRole,
          created_by: user.id,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) throw insertError;

      setGeneratedCode(code);
      setInvitationRefresh(prev => prev + 1); // Trigger list refresh
      toast({ title: 'Convite gerado', description: 'O código de convite foi criado com sucesso.' });
    } catch (error) {
      console.error('Error generating invite:', error);
      toast({ title: 'Erro', description: 'Não foi possível gerar o convite.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      toast({ title: 'Copiado!', description: 'Código copiado para a área de transferência.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar o código.', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      toast({ title: 'Configurações salvas', description: 'Suas preferências foram atualizadas com sucesso.' });
    } catch (error) {
      toast({ title: 'Erro', description: 'Não foi possível salvar as configurações.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = 
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

      {/* Content */}
      <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Theme Section */}
          <FormSection 
            title="Tema da Interface" 
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
          </FormSection>

          {/* Primary Color Section */}
          <FormSection 
            title="Cor Primária da Identidade Visual" 
            icon={Palette}
            description="A cor primária será aplicada a botões, links e destaques visuais em toda a interface."
          >
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
              <div className="mt-6 p-4 rounded-lg border bg-card">
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
          </FormSection>

          {/* Logo Section */}
          <FormSection 
            title="Logotipo da Empresa" 
            icon={Image}
            description="Faça upload do logo da sua empresa. Tamanho recomendado: 256x256px. Máximo: 2MB."
          >
              <div className="flex items-start gap-6">
                {/* Preview */}
                <div className="shrink-0">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                    {previewLogo ? (
                      <img src={previewLogo} alt="Logo preview" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Upload */}
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
                    Formatos aceitos: PNG, JPG, SVG, WEBP
                  </p>
                </div>
              </div>
          </FormSection>

          {/* Company Name Section */}
          <FormSection 
            title="Nome Público da Empresa" 
            icon={Building2}
            description="Este nome será exibido na interface e identificará sua empresa dentro da plataforma."
          >
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome Fantasia</Label>
                <Input
                  id="companyName"
                  placeholder="Ex: Minha Empresa"
                  value={localSettings.companyName}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, companyName: e.target.value }))}
                  className="max-w-md"
                />
              </div>
          </FormSection>

          {/* Invitation Section - Only for agency_admin or super_admin */}
          {canInvite && (
            <FormSection 
              title="Convidar" 
              icon={UserPlus}
              description="Gere códigos de convite para novos membros da equipe"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Nível de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button 
                  onClick={handleGenerateInvite} 
                  disabled={!selectedRole || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    'Gerar convite'
                  )}
                </Button>

                <div className="relative flex-1 min-w-[180px] max-w-[220px]">
                  <Input 
                    value={generatedCode} 
                    readOnly 
                    placeholder="--------"
                    className="font-mono pr-16 text-center tracking-wider"
                  />
                  {generatedCode && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs px-2"
                      onClick={copyCode}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </Button>
                  )}
                </div>
              </div>

              {/* Invitation History */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium mb-4">Histórico de Convites</h4>
                <InvitationList tenantId={tenantId!} refreshTrigger={invitationRefresh} />
              </div>
            </FormSection>
          )}
        </div>
      </div>
  );
}
