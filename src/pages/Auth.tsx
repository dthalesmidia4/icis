import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { loginSchema, signupSchema, type SignupFormData } from '@/lib/validations/authSchemas';
import { Building2, MapPin, Briefcase, Lock, Upload, LogIn } from 'lucide-react';
import { z } from 'zod';

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, isLoading: authLoading } = useAuth();
  
  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  // Signup state
  const [signupData, setSignupData] = useState<SignupFormData>({
    companyName: '',
    fantasyName: '',
    cnpjCpf: '',
    razaoSocial: '',
    corporateEmail: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'Brasil',
    website: '',
    sector: 'Outros',
    size: 'Micro (até 9 funcionários)',
    productsServices: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
    confirmPassword: ''
  });
  const [isSignupLoading, setIsSignupLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Load draft from localStorage
  useEffect(() => {
    const draft = localStorage.getItem('signup_draft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setSignupData(parsed);
        toast.info('Rascunho carregado automaticamente');
      } catch (e) {
        console.error('Erro ao carregar rascunho:', e);
      }
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (signupData.companyName || signupData.corporateEmail) {
        localStorage.setItem('signup_draft', JSON.stringify(signupData));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [signupData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoginLoading(true);

    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
      
      const { error } = await signIn(loginEmail, loginPassword);
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Email ou senha incorretos');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Login realizado com sucesso!');
        navigate('/');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => toast.error(err.message));
      } else {
        toast.error('Erro ao fazer login');
      }
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogoUpload = async (file: File): Promise<string | null> => {
    if (!file) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `logos/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('company-logos')
      .upload(filePath, file);
    
    if (uploadError) {
      console.error('Erro no upload:', uploadError);
      toast.error('Erro ao fazer upload da logo');
      return null;
    }
    
    const { data } = supabase.storage
      .from('company-logos')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSignupLoading(true);

    try {
      // Validate with Zod
      const validated = signupSchema.parse(signupData);
      
      // Upload logo if exists
      let logoUrl = null;
      if (logoFile) {
        logoUrl = await handleLogoUpload(logoFile);
      }
      
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: validated.adminEmail,
        password: validated.adminPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: validated.adminName,
            company_name: validated.companyName
          }
        }
      });
      
      if (authError) throw authError;
      if (!authData.user) throw new Error('Falha ao criar usuário');
      
      // Create slug from company name
      const slug = validated.companyName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      
      // Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          tenant_type: 'agency',
          name: validated.companyName,
          slug: slug,
          cnpj_cpf: validated.cnpjCpf,
          email: validated.corporateEmail,
          phone: validated.phone,
          metadata: {
            razao_social: validated.razaoSocial,
            nome_fantasia: validated.fantasyName,
            endereco: {
              rua: validated.street,
              cidade: validated.city,
              estado: validated.state,
              cep: validated.zipCode,
              pais: validated.country
            },
            setor: validated.sector,
            tamanho: validated.size,
            produtos_servicos: validated.productsServices,
            site: validated.website,
            logo_url: logoUrl
          }
        })
        .select()
        .single();
      
      if (tenantError) throw tenantError;
      
      // Update profile with tenant_id
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ tenant_id: tenant.id })
        .eq('id', authData.user.id);
      
      if (profileError) throw profileError;
      
      // Create admin role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          tenant_id: tenant.id,
          role: 'agency_admin'
        });
      
      if (roleError) throw roleError;
      
      // Clear draft and redirect
      localStorage.removeItem('signup_draft');
      toast.success('Empresa cadastrada com sucesso! Verifique seu email para confirmar.');
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach(err => {
          const field = err.path.join('.');
          errors[field] = err.message;
          toast.error(`${field}: ${err.message}`);
        });
        setFieldErrors(errors);
      } else {
        console.error('Erro no cadastro:', error);
        toast.error('Erro ao cadastrar empresa. Tente novamente.');
      }
    } finally {
      setIsSignupLoading(false);
    }
  };

  const handleSignupChange = (field: keyof SignupFormData, value: string) => {
    setSignupData(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background py-8 px-4">
      <div className="container mx-auto max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Plataforma de Marketing</h1>
          <p className="text-muted-foreground">
            Faça login ou cadastre sua empresa para começar
          </p>
        </div>

        {/* Layout: Login + Cadastro */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Login Section - 1/3 width on desktop */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Login
              </CardTitle>
              <CardDescription>
                Já possui uma conta? Entre aqui
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoginLoading}>
                  {isLoginLoading ? 'Entrando...' : 'Entrar'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  <a href="#" className="hover:underline">Esqueci minha senha</a>
                </p>
              </form>
            </CardContent>
          </Card>

          {/* Signup Section - 2/3 width on desktop */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Cadastro de Empresa</CardTitle>
              <CardDescription>
                Preencha os dados da sua empresa para criar uma conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignup} className="space-y-8">
                
                {/* Seção 1: Identificação Institucional */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                    <Building2 className="h-5 w-5" />
                    Identificação Institucional
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Nome da Empresa *</Label>
                      <Input
                        id="companyName"
                        value={signupData.companyName}
                        onChange={(e) => handleSignupChange('companyName', e.target.value)}
                        placeholder="Empresa XYZ Ltda"
                        required
                      />
                      {fieldErrors.companyName && (
                        <p className="text-xs text-destructive">{fieldErrors.companyName}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fantasyName">Nome Fantasia (opcional)</Label>
                      <Input
                        id="fantasyName"
                        value={signupData.fantasyName}
                        onChange={(e) => handleSignupChange('fantasyName', e.target.value)}
                        placeholder="XYZ"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnpjCpf">CNPJ ou CPF *</Label>
                      <Input
                        id="cnpjCpf"
                        value={signupData.cnpjCpf}
                        onChange={(e) => handleSignupChange('cnpjCpf', e.target.value)}
                        placeholder="00.000.000/0000-00"
                        required
                      />
                      {fieldErrors.cnpjCpf && (
                        <p className="text-xs text-destructive">{fieldErrors.cnpjCpf}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="razaoSocial">Razão Social (opcional)</Label>
                      <Input
                        id="razaoSocial"
                        value={signupData.razaoSocial}
                        onChange={(e) => handleSignupChange('razaoSocial', e.target.value)}
                        placeholder="Empresa XYZ Comércio Ltda"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 2: Contato e Localização */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                    <MapPin className="h-5 w-5" />
                    Contato e Localização
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="corporateEmail">Email Corporativo *</Label>
                      <Input
                        id="corporateEmail"
                        type="email"
                        value={signupData.corporateEmail}
                        onChange={(e) => handleSignupChange('corporateEmail', e.target.value)}
                        placeholder="contato@empresa.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone / WhatsApp *</Label>
                      <Input
                        id="phone"
                        value={signupData.phone}
                        onChange={(e) => handleSignupChange('phone', e.target.value)}
                        placeholder="(11) 99999-9999"
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="street">Endereço *</Label>
                      <Input
                        id="street"
                        value={signupData.street}
                        onChange={(e) => handleSignupChange('street', e.target.value)}
                        placeholder="Rua, número, complemento"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade *</Label>
                      <Input
                        id="city"
                        value={signupData.city}
                        onChange={(e) => handleSignupChange('city', e.target.value)}
                        placeholder="São Paulo"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">Estado *</Label>
                      <Input
                        id="state"
                        value={signupData.state}
                        onChange={(e) => handleSignupChange('state', e.target.value.toUpperCase())}
                        placeholder="SP"
                        maxLength={2}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zipCode">CEP *</Label>
                      <Input
                        id="zipCode"
                        value={signupData.zipCode}
                        onChange={(e) => handleSignupChange('zipCode', e.target.value)}
                        placeholder="00000-000"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Site (opcional)</Label>
                      <Input
                        id="website"
                        type="url"
                        value={signupData.website}
                        onChange={(e) => handleSignupChange('website', e.target.value)}
                        placeholder="https://www.empresa.com"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 3: Perfil da Empresa */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                    <Briefcase className="h-5 w-5" />
                    Perfil da Empresa
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sector">Setor de Atuação *</Label>
                      <Select
                        value={signupData.sector}
                        onValueChange={(value) => handleSignupChange('sector', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Serviços">Serviços</SelectItem>
                          <SelectItem value="Comércio">Comércio</SelectItem>
                          <SelectItem value="Indústria">Indústria</SelectItem>
                          <SelectItem value="Saúde">Saúde</SelectItem>
                          <SelectItem value="Educação">Educação</SelectItem>
                          <SelectItem value="Tecnologia">Tecnologia</SelectItem>
                          <SelectItem value="Alimentação">Alimentação</SelectItem>
                          <SelectItem value="Moda e Beleza">Moda e Beleza</SelectItem>
                          <SelectItem value="Construção">Construção</SelectItem>
                          <SelectItem value="Consultoria">Consultoria</SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="size">Tamanho da Empresa *</Label>
                      <Select
                        value={signupData.size}
                        onValueChange={(value) => handleSignupChange('size', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEI">MEI</SelectItem>
                          <SelectItem value="Micro (até 9 funcionários)">Micro (até 9 funcionários)</SelectItem>
                          <SelectItem value="Pequena (10-49 funcionários)">Pequena (10-49 funcionários)</SelectItem>
                          <SelectItem value="Média (50-249 funcionários)">Média (50-249 funcionários)</SelectItem>
                          <SelectItem value="Grande (250+ funcionários)">Grande (250+ funcionários)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="productsServices">Produtos/Serviços Oferecidos *</Label>
                      <Textarea
                        id="productsServices"
                        value={signupData.productsServices}
                        onChange={(e) => handleSignupChange('productsServices', e.target.value)}
                        placeholder="Descreva os principais produtos ou serviços oferecidos..."
                        rows={3}
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="logo">Logo da Empresa (opcional)</Label>
                      <div className="flex items-center gap-4">
                        <Input
                          id="logo"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="flex-1"
                        />
                        {logoPreview && (
                          <img src={logoPreview} alt="Preview" className="h-12 w-12 object-contain rounded border" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 4: Dados de Acesso */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
                    <Lock className="h-5 w-5" />
                    Dados de Acesso do Administrador
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="adminName">Nome do Administrador *</Label>
                      <Input
                        id="adminName"
                        value={signupData.adminName}
                        onChange={(e) => handleSignupChange('adminName', e.target.value)}
                        placeholder="João Silva"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminEmail">Email do Administrador *</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={signupData.adminEmail}
                        onChange={(e) => handleSignupChange('adminEmail', e.target.value)}
                        placeholder="admin@empresa.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminPassword">Senha *</Label>
                      <Input
                        id="adminPassword"
                        type="password"
                        value={signupData.adminPassword}
                        onChange={(e) => handleSignupChange('adminPassword', e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                      <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={signupData.confirmPassword}
                        onChange={(e) => handleSignupChange('confirmPassword', e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                      {fieldErrors.confirmPassword && (
                        <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Botões */}
                <div className="flex gap-4 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      localStorage.removeItem('signup_draft');
                      navigate('/');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSignupLoading}
                    className="flex-1"
                  >
                    {isSignupLoading ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-spin" />
                        Criando empresa...
                      </>
                    ) : (
                      'Finalizar Cadastro'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;
