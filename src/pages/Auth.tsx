import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { signupSchema } from '@/lib/validations/authSchemas';
import { Building2, MapPin, Briefcase, Lock, Upload, UserPlus, Ticket, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { getRoleLabel } from '@/lib/constants/roles';

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup mode state
  const [signupMode, setSignupMode] = useState<'select' | 'company' | 'invite-validate' | 'invite-register'>('select');
  
  // Invite validation state
  const [inviteCode, setInviteCode] = useState('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [validatedInvite, setValidatedInvite] = useState<{
    code: string;
    tenantId: string;
    tenantName: string;
    role: string;
  } | null>(null);

  // Signup state - Cadastro completo da empresa
  const [signupData, setSignupData] = useState({
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
    sector: '',
    size: '',
    productsServices: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
    confirmPassword: ''
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
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
      toast.error('Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save rascunho
  useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.values(signupData).some(v => v !== '' && v !== 'Brasil')) {
        localStorage.setItem('signup_draft', JSON.stringify(signupData));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [signupData]);

  // Carregar rascunho
  useEffect(() => {
    const draft = localStorage.getItem('signup_draft');
    if (draft) {
      try {
        setSignupData(JSON.parse(draft));
      } catch (e) {
        console.error('Erro ao carregar rascunho:', e);
      }
    }
  }, []);

  const handleSignupChange = (field: string, value: string) => {
    setSignupData(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Logo deve ter no máximo 2MB');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadLogo = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);
      
      return data.publicUrl;
    } catch (error) {
      console.error('Erro no upload da logo:', error);
      toast.error('Erro ao fazer upload da logo');
      return null;
    }
  };

  // Validar código de convite
  const handleValidateInviteCode = async () => {
    if (!inviteCode || inviteCode.length < 8) {
      toast.error('Digite um código válido de 8 caracteres');
      return;
    }

    setIsValidatingCode(true);

    try {
      const { data, error } = await supabase.functions.invoke('validate-invitation', {
        body: { code: inviteCode.toUpperCase() }
      });

      if (error) throw error;

      if (data.valid) {
        setValidatedInvite({
          code: inviteCode.toUpperCase(),
          tenantId: data.tenant_id,
          tenantName: data.tenant_name,
          role: data.role
        });
        setSignupMode('invite-register');
        toast.success('Código válido! Preencha seus dados para continuar.');
      } else {
        toast.error(data.error || 'Código inválido ou expirado');
      }
    } catch (error: any) {
      console.error('Erro ao validar código:', error);
      toast.error('Erro ao validar código. Tente novamente.');
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFieldErrors({});

    try {
      console.log('🚀 Iniciando cadastro...');
      
      // Validar com Zod
      const validated = signupSchema.parse(signupData);
      console.log('✅ Validação concluída');
      
      // Upload da logo (se existir)
      let logoUrl = null;
      if (logoFile) {
        console.log('📤 Fazendo upload da logo...');
        logoUrl = await uploadLogo(logoFile);
        console.log('✅ Logo uploaded:', logoUrl);
      }
      
      // Criar conta de autenticação
      console.log('👤 Criando conta de usuário...');
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
      console.log('✅ Usuário criado:', authData.user.id);
      
      // Aguardar um pouco para garantir que o trigger de criação do profile seja executado
      console.log('⏳ Aguardando criação do profile...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fazer login imediato para estabelecer a sessão
      console.log('🔐 Fazendo login automático...');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: validated.adminEmail,
        password: validated.adminPassword
      });
      
      if (signInError) throw signInError;
      console.log('✅ Sessão estabelecida');
      
      // Aguardar a sessão ser estabelecida
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Criar tenant
      console.log('🏢 Criando tenant...');
      const slug = validated.companyName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
        
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: validated.companyName,
          slug: slug,
          tenant_type: 'agency',
          cnpj_cpf: validated.cnpjCpf,
          email: validated.corporateEmail,
          phone: validated.phone,
          settings: {
            razao_social: validated.razaoSocial || null,
            nome_fantasia: validated.fantasyName || null,
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
            site: validated.website || null,
            logo_url: logoUrl
          }
        })
        .select()
        .single();
      
      if (tenantError) {
        console.error('❌ Erro ao criar tenant:', tenantError);
        throw tenantError;
      }
      console.log('✅ Tenant criado:', tenant?.id);
      
      // Atualizar profile com tenant_id
      console.log('👤 Atualizando profile...');
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ tenant_id: tenant?.id })
        .eq('id', authData.user.id);
      
      if (profileError) {
        console.error('❌ Erro ao atualizar profile:', profileError);
        throw profileError;
      }
      console.log('✅ Profile atualizado');
      
      // Criar user_role
      console.log('🎭 Criando user_role...');
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          tenant_id: tenant?.id,
          role: 'agency_admin'
        });
      
      if (roleError) {
        console.error('❌ Erro ao criar user_role:', roleError);
        throw roleError;
      }
      console.log('✅ User role criado');
      
      // Limpar rascunho e redirecionar
      localStorage.removeItem('signup_draft');
      console.log('✅ Cadastro concluído com sucesso!');
      toast.success('Empresa cadastrada com sucesso!');
      navigate('/');
      
    } catch (error: any) {
      console.error('Erro completo no cadastro:', error);
      
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach(err => {
          const field = err.path[0] as string;
          errors[field] = err.message;
        });
        setFieldErrors(errors);
        toast.error('Por favor, corrija os campos destacados');
      } else {
        if (error?.message?.includes('User already registered')) {
          toast.error('Este email já está cadastrado. Tente fazer login.');
        } else if (error?.message?.includes('row-level security') || error?.message?.includes('RLS')) {
          toast.error('Erro de permissão ao criar empresa. Aguarde alguns segundos e tente novamente.');
        } else if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
          toast.error('CNPJ/CPF ou email já cadastrado no sistema.');
        } else {
          toast.error(error?.message || 'Erro ao cadastrar empresa. Tente novamente.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatedInvite) {
      toast.error('Código de convite não validado');
      return;
    }

    setIsLoading(true);
    setFieldErrors({});

    try {
      // Validação básica
      if (!signupData.adminName || signupData.adminName.length < 2) {
        setFieldErrors(prev => ({ ...prev, adminName: 'Nome deve ter pelo menos 2 caracteres' }));
        throw new Error('Validação falhou');
      }
      if (!signupData.adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.adminEmail)) {
        setFieldErrors(prev => ({ ...prev, adminEmail: 'Email inválido' }));
        throw new Error('Validação falhou');
      }
      if (!signupData.adminPassword || signupData.adminPassword.length < 6) {
        setFieldErrors(prev => ({ ...prev, adminPassword: 'Senha deve ter pelo menos 6 caracteres' }));
        throw new Error('Validação falhou');
      }
      if (signupData.adminPassword !== signupData.confirmPassword) {
        setFieldErrors(prev => ({ ...prev, confirmPassword: 'Senhas não conferem' }));
        throw new Error('Validação falhou');
      }

      console.log('🚀 Iniciando cadastro com convite...');
      
      // Criar conta de autenticação
      console.log('👤 Criando conta de usuário...');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupData.adminEmail,
        password: signupData.adminPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: signupData.adminName
          }
        }
      });
      
      if (authError) throw authError;
      if (!authData.user) throw new Error('Falha ao criar usuário');
      console.log('✅ Usuário criado:', authData.user.id);
      
      // Aguardar profile ser criado pelo trigger
      console.log('⏳ Aguardando criação do profile...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fazer login imediato
      console.log('🔐 Fazendo login automático...');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: signupData.adminEmail,
        password: signupData.adminPassword
      });
      
      if (signInError) throw signInError;
      console.log('✅ Sessão estabelecida');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Usar o convite via RPC
      console.log('🎫 Usando convite...');
      const { data: inviteResult, error: inviteError } = await supabase
        .rpc('use_invitation', {
          _code: validatedInvite.code,
          _user_id: authData.user.id
        });
      
      if (inviteError) throw inviteError;
      
      const result = inviteResult as { success: boolean; error?: string; tenant_id?: string; role?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao usar convite');
      }
      
      console.log('✅ Convite utilizado:', result);
      
      // Aguardar commit do banco
      console.log('⏳ Aguardando commit do banco...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Limpar state e redirecionar
      localStorage.removeItem('signup_draft');
      toast.success('Conta criada com sucesso! Bem-vindo!');
      navigate('/');
      
    } catch (error: any) {
      console.error('Erro no cadastro com convite:', error);
      
      if (error.message !== 'Validação falhou') {
        if (error?.message?.includes('User already registered')) {
          toast.error('Este email já está cadastrado. Tente fazer login.');
        } else {
          toast.error(error?.message || 'Erro ao criar conta. Tente novamente.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Calcular progresso do formulário
  const filledRequiredFields = [
    signupData.companyName, signupData.cnpjCpf, signupData.corporateEmail,
    signupData.phone, signupData.street, signupData.city, signupData.state,
    signupData.zipCode, signupData.sector, signupData.size, 
    signupData.productsServices, signupData.adminEmail, signupData.adminName,
    signupData.adminPassword, signupData.confirmPassword
  ].filter(v => v && v !== '').length;
  const totalRequiredFields = 15;
  const progress = (filledRequiredFields / totalRequiredFields) * 100;

  const resetSignupMode = () => {
    setSignupMode('select');
    setValidatedInvite(null);
    setInviteCode('');
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Bem-vindo</CardTitle>
          <CardDescription className="text-center">
            Faça login ou cadastre-se
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup" onClick={() => setSignupMode('select')}>Cadastro</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
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
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="max-h-[70vh] overflow-y-auto px-1">
              {/* Seletor de modo de cadastro */}
              {signupMode === 'select' && (
                <div className="space-y-6 py-8">
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold">Como você deseja se cadastrar?</h3>
                    <p className="text-sm text-muted-foreground">
                      Escolha uma opção para continuar
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setSignupMode('company')}
                      className="flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Building2 className="h-8 w-8 text-primary" />
                      </div>
                      <div className="text-center">
                        <h4 className="font-semibold mb-1">Nova Empresa</h4>
                        <p className="text-sm text-muted-foreground">
                          Cadastrar minha empresa na plataforma
                        </p>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setSignupMode('invite-validate')}
                      className="flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Ticket className="h-8 w-8 text-primary" />
                      </div>
                      <div className="text-center">
                        <h4 className="font-semibold mb-1">Tenho um Convite</h4>
                        <p className="text-sm text-muted-foreground">
                          Recebi um código de convite de uma empresa
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Validação do código de convite */}
              {signupMode === 'invite-validate' && (
                <div className="space-y-6 py-8">
                  <button
                    type="button"
                    onClick={resetSignupMode}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                  
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Ticket className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">Digite seu código de convite</h3>
                    <p className="text-sm text-muted-foreground">
                      O código foi enviado pela empresa que deseja adicionar você como membro
                    </p>
                  </div>
                  
                  <div className="max-w-sm mx-auto space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-code">Código de Convite</Label>
                      <Input
                        id="invite-code"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="XXXXXXXX"
                        maxLength={8}
                        className="text-center text-xl font-mono tracking-widest uppercase"
                      />
                    </div>
                    
                    <Button 
                      onClick={handleValidateInviteCode}
                      disabled={isValidatingCode || inviteCode.length < 8}
                      className="w-full"
                    >
                      {isValidatingCode ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Validando...
                        </>
                      ) : (
                        'Validar Código'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Formulário de registro com convite validado */}
              {signupMode === 'invite-register' && validatedInvite && (
                <form onSubmit={handleInviteSignup} className="space-y-6">
                  <button
                    type="button"
                    onClick={() => setSignupMode('invite-validate')}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                  
                  {/* Card de confirmação do convite */}
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                      <div>
                        <p className="font-medium">Convite válido!</p>
                        <p className="text-sm text-muted-foreground">
                          Você será adicionado à <strong>{validatedInvite.tenantName}</strong> como <strong>{getRoleLabel(validatedInvite.role)}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Seus Dados de Acesso
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="inviteAdminName">Seu Nome *</Label>
                        <Input
                          id="inviteAdminName"
                          value={signupData.adminName}
                          onChange={(e) => handleSignupChange('adminName', e.target.value)}
                          placeholder="Seu nome completo"
                          className={fieldErrors.adminName ? 'border-destructive' : ''}
                        />
                        {fieldErrors.adminName && (
                          <p className="text-xs text-destructive">{fieldErrors.adminName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteAdminEmail">Seu Email *</Label>
                        <Input
                          id="inviteAdminEmail"
                          type="email"
                          value={signupData.adminEmail}
                          onChange={(e) => handleSignupChange('adminEmail', e.target.value)}
                          placeholder="seu@email.com"
                          className={fieldErrors.adminEmail ? 'border-destructive' : ''}
                        />
                        {fieldErrors.adminEmail && (
                          <p className="text-xs text-destructive">{fieldErrors.adminEmail}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteAdminPassword">Senha *</Label>
                        <Input
                          id="inviteAdminPassword"
                          type="password"
                          value={signupData.adminPassword}
                          onChange={(e) => handleSignupChange('adminPassword', e.target.value)}
                          placeholder="••••••••"
                          className={fieldErrors.adminPassword ? 'border-destructive' : ''}
                        />
                        {fieldErrors.adminPassword && (
                          <p className="text-xs text-destructive">{fieldErrors.adminPassword}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteConfirmPassword">Confirmar Senha *</Label>
                        <Input
                          id="inviteConfirmPassword"
                          type="password"
                          value={signupData.confirmPassword}
                          onChange={(e) => handleSignupChange('confirmPassword', e.target.value)}
                          placeholder="••••••••"
                          className={fieldErrors.confirmPassword ? 'border-destructive' : ''}
                        />
                        {fieldErrors.confirmPassword && (
                          <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Criando conta...
                      </>
                    ) : (
                      'Criar Minha Conta'
                    )}
                  </Button>
                </form>
              )}

              {/* Formulário de cadastro de empresa */}
              {signupMode === 'company' && (
                <form onSubmit={handleSignup} className="space-y-6">
                  <button
                    type="button"
                    onClick={resetSignupMode}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>

                  {/* Progresso */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso do cadastro</span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Seção 1: Identificação Institucional */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
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
                          placeholder="Ex: Empresa Marketing LTDA"
                          className={fieldErrors.companyName ? 'border-destructive' : ''}
                        />
                        {fieldErrors.companyName && (
                          <p className="text-xs text-destructive">{fieldErrors.companyName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fantasyName">Nome Fantasia</Label>
                        <Input
                          id="fantasyName"
                          value={signupData.fantasyName}
                          onChange={(e) => handleSignupChange('fantasyName', e.target.value)}
                          placeholder="Ex: Marketing Pro"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cnpjCpf">CNPJ ou CPF *</Label>
                        <Input
                          id="cnpjCpf"
                          value={signupData.cnpjCpf}
                          onChange={(e) => handleSignupChange('cnpjCpf', e.target.value)}
                          placeholder="00.000.000/0000-00"
                          className={fieldErrors.cnpjCpf ? 'border-destructive' : ''}
                        />
                        {fieldErrors.cnpjCpf && (
                          <p className="text-xs text-destructive">{fieldErrors.cnpjCpf}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="razaoSocial">Razão Social</Label>
                        <Input
                          id="razaoSocial"
                          value={signupData.razaoSocial}
                          onChange={(e) => handleSignupChange('razaoSocial', e.target.value)}
                          placeholder="Razão social da empresa"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seção 2: Contato e Localização */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
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
                          className={fieldErrors.corporateEmail ? 'border-destructive' : ''}
                        />
                        {fieldErrors.corporateEmail && (
                          <p className="text-xs text-destructive">{fieldErrors.corporateEmail}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefone / WhatsApp *</Label>
                        <Input
                          id="phone"
                          value={signupData.phone}
                          onChange={(e) => handleSignupChange('phone', e.target.value)}
                          placeholder="(11) 99999-9999"
                          className={fieldErrors.phone ? 'border-destructive' : ''}
                        />
                        {fieldErrors.phone && (
                          <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                        )}
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="street">Endereço *</Label>
                        <Input
                          id="street"
                          value={signupData.street}
                          onChange={(e) => handleSignupChange('street', e.target.value)}
                          placeholder="Rua, número, complemento"
                          className={fieldErrors.street ? 'border-destructive' : ''}
                        />
                        {fieldErrors.street && (
                          <p className="text-xs text-destructive">{fieldErrors.street}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">Cidade *</Label>
                        <Input
                          id="city"
                          value={signupData.city}
                          onChange={(e) => handleSignupChange('city', e.target.value)}
                          placeholder="São Paulo"
                          className={fieldErrors.city ? 'border-destructive' : ''}
                        />
                        {fieldErrors.city && (
                          <p className="text-xs text-destructive">{fieldErrors.city}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">Estado *</Label>
                        <Input
                          id="state"
                          value={signupData.state}
                          onChange={(e) => handleSignupChange('state', e.target.value.toUpperCase())}
                          placeholder="SP"
                          maxLength={2}
                          className={fieldErrors.state ? 'border-destructive' : ''}
                        />
                        {fieldErrors.state && (
                          <p className="text-xs text-destructive">{fieldErrors.state}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">CEP *</Label>
                        <Input
                          id="zipCode"
                          value={signupData.zipCode}
                          onChange={(e) => handleSignupChange('zipCode', e.target.value)}
                          placeholder="00000-000"
                          className={fieldErrors.zipCode ? 'border-destructive' : ''}
                        />
                        {fieldErrors.zipCode && (
                          <p className="text-xs text-destructive">{fieldErrors.zipCode}</p>
                        )}
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
                    <h3 className="text-lg font-semibold flex items-center gap-2">
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
                          <SelectTrigger className={fieldErrors.sector ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Selecione o setor" />
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
                        {fieldErrors.sector && (
                          <p className="text-xs text-destructive">{fieldErrors.sector}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="size">Tamanho da Empresa *</Label>
                        <Select 
                          value={signupData.size} 
                          onValueChange={(value) => handleSignupChange('size', value)}
                        >
                          <SelectTrigger className={fieldErrors.size ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Selecione o tamanho" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEI">MEI</SelectItem>
                            <SelectItem value="Micro (até 9 funcionários)">Micro (até 9 funcionários)</SelectItem>
                            <SelectItem value="Pequena (10-49 funcionários)">Pequena (10-49 funcionários)</SelectItem>
                            <SelectItem value="Média (50-249 funcionários)">Média (50-249 funcionários)</SelectItem>
                            <SelectItem value="Grande (250+ funcionários)">Grande (250+ funcionários)</SelectItem>
                          </SelectContent>
                        </Select>
                        {fieldErrors.size && (
                          <p className="text-xs text-destructive">{fieldErrors.size}</p>
                        )}
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="productsServices">Produtos ou Serviços Oferecidos *</Label>
                        <Textarea
                          id="productsServices"
                          value={signupData.productsServices}
                          onChange={(e) => handleSignupChange('productsServices', e.target.value)}
                          placeholder="Descreva os principais produtos ou serviços oferecidos pela empresa"
                          rows={3}
                          className={fieldErrors.productsServices ? 'border-destructive' : ''}
                        />
                        {fieldErrors.productsServices && (
                          <p className="text-xs text-destructive">{fieldErrors.productsServices}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Logo da empresa */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Logo da Empresa (opcional)
                    </h3>
                    <div className="flex items-center gap-4">
                      {logoPreview ? (
                        <img 
                          src={logoPreview} 
                          alt="Logo preview" 
                          className="h-20 w-20 object-contain rounded-lg border"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/50">
                          <Upload className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          PNG, JPG ou SVG. Máximo 2MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Seção 4: Dados do Administrador */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Dados do Administrador
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="adminName">Seu Nome *</Label>
                        <Input
                          id="adminName"
                          value={signupData.adminName}
                          onChange={(e) => handleSignupChange('adminName', e.target.value)}
                          placeholder="Seu nome completo"
                          className={fieldErrors.adminName ? 'border-destructive' : ''}
                        />
                        {fieldErrors.adminName && (
                          <p className="text-xs text-destructive">{fieldErrors.adminName}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminEmail">Seu Email *</Label>
                        <Input
                          id="adminEmail"
                          type="email"
                          value={signupData.adminEmail}
                          onChange={(e) => handleSignupChange('adminEmail', e.target.value)}
                          placeholder="seu@email.com"
                          className={fieldErrors.adminEmail ? 'border-destructive' : ''}
                        />
                        {fieldErrors.adminEmail && (
                          <p className="text-xs text-destructive">{fieldErrors.adminEmail}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminPassword">Senha *</Label>
                        <Input
                          id="adminPassword"
                          type="password"
                          value={signupData.adminPassword}
                          onChange={(e) => handleSignupChange('adminPassword', e.target.value)}
                          placeholder="••••••••"
                          className={fieldErrors.adminPassword ? 'border-destructive' : ''}
                        />
                        {fieldErrors.adminPassword && (
                          <p className="text-xs text-destructive">{fieldErrors.adminPassword}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={signupData.confirmPassword}
                          onChange={(e) => handleSignupChange('confirmPassword', e.target.value)}
                          placeholder="••••••••"
                          className={fieldErrors.confirmPassword ? 'border-destructive' : ''}
                        />
                        {fieldErrors.confirmPassword && (
                          <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cadastrando...
                      </>
                    ) : (
                      'Cadastrar Empresa'
                    )}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;