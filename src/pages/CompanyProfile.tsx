import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAgency } from '@/contexts/AgencyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Building2, Mail, Phone, MapPin, Save, Loader2, Clock } from 'lucide-react';
import BackButton from '@/components/BackButton';

const companySchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  tradeName: z.string().optional(),
  cnpjCpf: z.string().min(11, 'CNPJ/CPF inválido').max(18, 'CNPJ/CPF inválido'),
  legalName: z.string().optional(),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url('URL inválida').optional().or(z.literal('')),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface TenantSettings {
  tradeName?: string;
  legalName?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  website?: string;
  work_hours?: {
    start?: string;
    end?: string;
    lunch_start?: string;
    lunch_end?: string;
    tz?: string;
  };
}

const DEFAULT_WORK_HOURS = {
  start: "09:00",
  end: "18:00",
  lunch_start: "12:00",
  lunch_end: "13:30",
  tz: "America/Sao_Paulo",
};

export default function CompanyProfile() {
  const navigate = useNavigate();
  const { agencyId, isLoading: agencyLoading } = useAgency();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workHours, setWorkHours] = useState({ ...DEFAULT_WORK_HOURS });
  const [otherSettings, setOtherSettings] = useState<TenantSettings>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
  });

  useEffect(() => {
    const loadCompanyData = async () => {
      if (agencyLoading || !agencyId) return;

      try {
        const { data: tenant, error } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', agencyId)
          .single();

        if (error) throw error;

        if (tenant) {
          const settings = (tenant.settings as TenantSettings | null) ?? {};
          setOtherSettings(settings);
          setWorkHours({
            start: settings.work_hours?.start ?? DEFAULT_WORK_HOURS.start,
            end: settings.work_hours?.end ?? DEFAULT_WORK_HOURS.end,
            lunch_start: settings.work_hours?.lunch_start ?? DEFAULT_WORK_HOURS.lunch_start,
            lunch_end: settings.work_hours?.lunch_end ?? DEFAULT_WORK_HOURS.lunch_end,
            tz: settings.work_hours?.tz ?? DEFAULT_WORK_HOURS.tz,
          });

          reset({
            name: tenant.name || '',
            tradeName: settings?.tradeName || '',
            cnpjCpf: tenant.cnpj_cpf || '',
            legalName: settings?.legalName || '',
            email: tenant.email || '',
            phone: tenant.phone || '',
            street: settings?.address?.street || '',
            city: settings?.address?.city || '',
            state: settings?.address?.state || '',
            zipCode: settings?.address?.zipCode || '',
            country: settings?.address?.country || 'Brasil',
            website: settings?.website || '',
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados da empresa:', error);
        toast.error('Erro ao carregar dados da empresa');
      } finally {
        setIsLoading(false);
      }
    };

    loadCompanyData();
  }, [agencyId, agencyLoading, reset]);

  const onSubmit = async (data: CompanyFormData) => {
    if (!agencyId) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone,
          cnpj_cpf: data.cnpjCpf,
          settings: {
            ...otherSettings,
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
            work_hours: { ...workHours },
          },
        })
        .eq('id', agencyId);

      if (error) throw error;

      toast.success('Dados da empresa atualizados com sucesso!');
      reset(data); // Reset form state to mark as not dirty
    } catch (error: any) {
      console.error('Erro ao atualizar empresa:', error);
      toast.error(error.message || 'Erro ao atualizar dados da empresa');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || agencyLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <BackButton />
      </div>

      <Card className="shadow-lg">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <CardTitle className="text-2xl sm:text-3xl">Cadastro da Empresa</CardTitle>
          </div>
          <CardDescription className="text-base">
            Visualize e edite os dados cadastrais da sua empresa
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
                  <Label htmlFor="name">
                    Nome oficial da empresa <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    {...register('name')}
                    placeholder="Ex: Marketing Solutions Brasil"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
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
                    placeholder="contato@empresa.com.br"
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
                  Endereço completo
                </Label>
                <Input
                  id="street"
                  {...register('street')}
                  placeholder="Rua, número, complemento"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    {...register('city')}
                    placeholder="São Paulo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    {...register('state')}
                    placeholder="SP"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    {...register('zipCode')}
                    placeholder="00000-000"
                  />
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
                    placeholder="https://www.empresa.com.br"
                  />
                  {errors.website && (
                    <p className="text-sm text-destructive">{errors.website.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Seção 3 - Horário de expediente */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold text-primary">
                <Clock className="h-5 w-5" />
                <h3>Horário de expediente</h3>
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">
                Usado pelo Kanban ao reorganizar a sequência de cards de cada colaborador. O sistema respeita a janela
                de trabalho, o intervalo de almoço e pula finais de semana e feriados.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wh_start">Início do expediente</Label>
                  <Input
                    id="wh_start"
                    type="time"
                    value={workHours.start}
                    onChange={(e) => setWorkHours((w) => ({ ...w, start: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh_end">Fim do expediente</Label>
                  <Input
                    id="wh_end"
                    type="time"
                    value={workHours.end}
                    onChange={(e) => setWorkHours((w) => ({ ...w, end: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wh_lstart">Início do almoço</Label>
                  <Input
                    id="wh_lstart"
                    type="time"
                    value={workHours.lunch_start}
                    onChange={(e) => setWorkHours((w) => ({ ...w, lunch_start: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh_lend">Fim do almoço</Label>
                  <Input
                    id="wh_lend"
                    type="time"
                    value={workHours.lunch_end}
                    onChange={(e) => setWorkHours((w) => ({ ...w, lunch_end: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Botões de ação */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/minha-empresa')}
                disabled={isSaving}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={isSaving || !isDirty}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar alterações
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
