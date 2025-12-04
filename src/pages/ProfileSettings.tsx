import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon, Monitor, Upload, Building2, Palette, Image, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTheme, ThemeMode, PrimaryColor } from '@/contexts/ThemeContext';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Layout } from '@/components/Layout';

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

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { settings, updateSettings, isLoading: themeLoading } = useTheme();
  const { tenantId, tenantName } = useTenant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [localSettings, setLocalSettings] = useState({
    mode: settings.mode,
    primaryColor: settings.primaryColor,
    companyName: settings.companyName || tenantName || '',
    logoUrl: settings.logoUrl,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState<string | null>(settings.logoUrl);

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

  return (
    <Layout>
      <div className="min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex items-center justify-between h-16 px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="hover:bg-accent"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold">Editar Perfil</h1>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="max-w-3xl mx-auto p-6 pb-24 space-y-6">
          {/* Theme Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" />
                Tema da Interface
              </CardTitle>
              <CardDescription>
                Escolha como a interface deve ser exibida. Esta configuração afeta apenas o seu usuário.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Primary Color Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Cor Primária da Identidade Visual
              </CardTitle>
              <CardDescription>
                A cor primária será aplicada a botões, links e destaques visuais em toda a interface.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Logo Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5 text-primary" />
                Logotipo da Empresa
              </CardTitle>
              <CardDescription>
                Faça upload do logo da sua empresa. Tamanho recomendado: 256x256px. Máximo: 2MB.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Company Name Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Nome Público da Empresa
              </CardTitle>
              <CardDescription>
                Este nome será exibido na interface e identificará sua empresa dentro da plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        {/* Fixed Footer */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t p-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {hasChanges ? 'Você tem alterações não salvas' : 'Todas as alterações foram salvas'}
            </p>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="min-w-32"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
