import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Building2, Mail, Phone, MapPin } from 'lucide-react';

const agencySchema = z.object({
  // Seção 1 - Identificação Institucional
  officialName: z.string().min(3, 'Nome oficial deve ter no mínimo 3 caracteres'),
  tradeName: z.string().optional(),
  cnpjCpf: z.string().min(11, 'CNPJ/CPF inválido').max(18, 'CNPJ/CPF inválido'),
  legalName: z.string().optional(),
  
  // Seção 2 - Contato e Localização
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  street: z.string().min(3, 'Endereço obrigatório'),
  city: z.string().min(2, 'Cidade obrigatória'),
  state: z.string().min(2, 'Estado obrigatório'),
  zipCode: z.string().min(8, 'CEP inválido'),
  country: z.string().default('Brasil'),
  website: z.string().url('URL inválida').optional().or(z.literal('')),
});

type AgencyFormData = z.infer<typeof agencySchema>;

export default function AgencySetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgencyFormData>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      country: 'Brasil',
    },
  });

  // Verificar se usuário já possui tenant ao carregar a página
  useEffect(() => {
    const checkExistingTenant = async () => {
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (profile?.tenant_id) {
        toast.info('Você já possui um tenant associado.');
        navigate('/');
      }
    };

    checkExistingTenant();
  }, [user, navigate]);

  const onSubmit = async (data: AgencyFormData) => {
    if (!user) {
      toast.error('Você precisa estar autenticado');
      navigate('/auth');
      return;
    }

    setIsLoading(true);

    try {
      // DEBUG: Verificar estado atual
      console.log('🔍 Debug - User ID:', user.id);
      
      const { data: debugData } = await supabase
        .rpc('debug_tenant_creation', { _user_id: user.id });
      
      console.log('🔍 Debug - Can create tenant?', debugData);

      // Verificar se já tem roles
      const { data: existingRoles, error: rolesCheckError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (rolesCheckError) {
        console.error('❌ Erro ao verificar roles:', rolesCheckError);
      }

      console.log('🔍 Existing roles:', existingRoles);

      if (existingRoles && existingRoles.length > 0) {
        toast.error('Você já possui um tenant associado. Não é possível criar outro.');
        navigate('/');
        return;
      }

      // 1. Criar o tenant principal (agência raiz)
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: data.officialName,
          tenant_type: 'agency',
          email: data.email,
          phone: data.phone,
          cnpj_cpf: data.cnpjCpf,
          slug: data.officialName.toLowerCase().replace(/\s+/g, '-'),
          status: 'active',
          parent_id: null,
          metadata: {
            tradeName: data.tradeName,
            legalName: data.legalName,
            address: {
              street: data.street,
              city: data.city,
              state: data.state,
              zipCode: data.zipCode,
              country: data.country,
            },
            website: data.website,
          },
        })
        .select()
        .single();

      if (tenantError) {
        console.error('❌ Erro ao criar tenant:', tenantError);
        throw tenantError;
      }

      console.log('✅ Tenant criado:', tenant);

      // 2. Atualizar o perfil do usuário com o tenant_id
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ tenant_id: tenant.id })
        .eq('id', user.id);

      if (profileError) {
        console.error('❌ Erro ao atualizar profile:', profileError);
        throw profileError;
      }

      console.log('✅ Profile atualizado');

      // 3. Criar o role de super_admin para o usuário
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          tenant_id: tenant.id,
          role: 'super_admin',
        });

      if (roleError) {
        console.error('❌ Erro ao criar role:', roleError);
        throw roleError;
      }

      console.log('✅ Role criado');

      toast.success('Agência principal cadastrada com sucesso!');
      navigate('/');
    } catch (error: any) {
      console.error('❌ Erro geral:', error);
      
      // Mensagem de erro mais detalhada
      if (error.code === '42501') {
        toast.error(`Erro de permissão: ${error.message}. Entre em contato com o suporte.`);
      } else {
        toast.error(error.message || 'Erro ao cadastrar agência');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl">Cadastro da Agência Principal</CardTitle>
          </div>
          <CardDescription className="text-base">
            Configure a agência administradora global da plataforma. Este será o tenant raiz com acesso total ao sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Seção 1 - Identificação Institucional */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold text-primary">
                <Building2 className="h-5 w-5" />
                <h3>Identificação Institucional</h3>
              </div>
              <Separator />
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="officialName">
                    Nome oficial da agência <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="officialName"
                    {...register('officialName')}
                    placeholder="Ex: Marketing Solutions Brasil"
                  />
                  {errors.officialName && (
                    <p className="text-sm text-destructive">{errors.officialName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tradeName">
                    Nome fantasia <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="tradeName"
                    {...register('tradeName')}
                    placeholder="Ex: MS Brasil"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cnpjCpf">
                    CNPJ ou CPF <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="cnpjCpf"
                    {...register('cnpjCpf')}
                    placeholder="00.000.000/0000-00"
                  />
                  {errors.cnpjCpf && (
                    <p className="text-sm text-destructive">{errors.cnpjCpf.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="legalName">
                    Razão social <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="legalName"
                    {...register('legalName')}
                    placeholder="Ex: Marketing Solutions Brasil LTDA"
                  />
                </div>
              </div>
            </div>

            {/* Seção 2 - Contato e Localização */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold text-primary">
                <Mail className="h-5 w-5" />
                <h3>Contato e Localização</h3>
              </div>
              <Separator />
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    <Mail className="h-4 w-4 inline mr-1" />
                    E-mail principal <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="contato@agencia.com.br"
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">
                    <Phone className="h-4 w-4 inline mr-1" />
                    Telefone comercial <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    placeholder="(11) 99999-9999"
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="street">
                  <MapPin className="h-4 w-4 inline mr-1" />
                  Endereço completo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="street"
                  {...register('street')}
                  placeholder="Rua, número, complemento"
                />
                {errors.street && (
                  <p className="text-sm text-destructive">{errors.street.message}</p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="city">
                    Cidade <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="city"
                    {...register('city')}
                    placeholder="São Paulo"
                  />
                  {errors.city && (
                    <p className="text-sm text-destructive">{errors.city.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">
                    Estado <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="state"
                    {...register('state')}
                    placeholder="SP"
                  />
                  {errors.state && (
                    <p className="text-sm text-destructive">{errors.state.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zipCode">
                    CEP <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="zipCode"
                    {...register('zipCode')}
                    placeholder="00000-000"
                  />
                  {errors.zipCode && (
                    <p className="text-sm text-destructive">{errors.zipCode.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="country">País</Label>
                  <Input
                    id="country"
                    {...register('country')}
                    placeholder="Brasil"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">
                    Site oficial <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="website"
                    {...register('website')}
                    placeholder="https://www.agencia.com.br"
                  />
                  {errors.website && (
                    <p className="text-sm text-destructive">{errors.website.message}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Botões de ação */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/auth')}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar e continuar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
