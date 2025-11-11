import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InputMask from "react-input-mask";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, ArrowLeft } from "lucide-react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
const CompanyRegistration = () => {
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    fantasy_name: "",
    cnpj_cpf: "",
    sector: "",
    size: "",
    products_services: "",
    email: "",
    phone: "",
    address: "",
    contracted_services: "",
    selected_month: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sectors = ["Serviços", "Comércio", "Indústria", "Saúde", "Educação", "Tecnologia", "Outros"];
  const sizes = ["Micro", "Pequena", "Média", "Grande"];
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const validateField = (field: string, value: string) => {
    const requiredFields = ["name", "cnpj_cpf", "sector", "size", "products_services", "email", "phone", "selected_month"];
    if (requiredFields.includes(field) && !value.trim()) {
      return "Este campo é obrigatório";
    }
    if (field === "email" && value && !/\S+@\S+\.\S+/.test(value)) {
      return "E-mail inválido";
    }
    if (field === "cnpj_cpf" && value) {
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 11 && cleanValue.length !== 14) {
        return "CNPJ/CPF inválido";
      }
    }
    if (field === "phone" && value) {
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length < 10 || cleanValue.length > 11) {
        return "Telefone inválido";
      }
    }
    return "";
  };
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    const error = validateField(field, value);
    setErrors(prev => ({
      ...prev,
      [field]: error
    }));
  };
  const isFormValid = () => {
    const requiredFields = ["name", "cnpj_cpf", "sector", "size", "products_services", "email", "phone", "selected_month"];
    return requiredFields.every(field => {
      const value = formData[field as keyof typeof formData];
      return value.trim() !== "" && !validateField(field, value);
    });
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) {
      toast.error("Por favor, preencha todos os campos obrigatórios corretamente");
      return;
    }
    setShowConfirmModal(true);
  };
  const confirmSubmit = async () => {
    setLoading(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }
      const {
        data: profile
      } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
      if (!profile?.tenant_id) {
        toast.error("Configure sua agência antes de cadastrar clientes");
        navigate('/agency-setup');
        return;
      }
      const {
        data,
        error
      } = await supabase.from("tenant_companies").insert([{
        name: formData.name,
        cnpj_cpf: formData.cnpj_cpf,
        sector: formData.sector,
        size: formData.size,
        products_services: formData.products_services,
        email: formData.email,
        phone: formData.phone,
        selected_month: formData.selected_month,
        tenant_id: profile.tenant_id
      }]).select().single();
      if (error) {
        if (error.code === '42501') {
          toast.error("Erro de permissão. Verifique se sua agência está configurada corretamente");
          navigate('/agency-setup');
          return;
        }
        throw error;
      }
      setShowConfirmModal(false);
      toast.success("✅ Cliente cadastrado com sucesso!");
      setTimeout(() => {
        navigate('/');
      }, 1000);
    } catch (error) {
      console.error("Error saving company:", error);
      toast.error("Erro ao cadastrar cliente. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen bg-background">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Hub
          </Button>
          
          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                  <Building2 className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Cadastro de Cliente</CardTitle>
                  <CardDescription>
                    Preencha as informações do cliente para começar o planejamento
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Cliente *</Label>
                    <Input id="name" value={formData.name} onChange={e => handleChange("name", e.target.value)} placeholder="Nome completo ou razão social" className={errors.name ? "border-destructive" : ""} />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fantasy_name">Nome Fantasia</Label>
                    <Input id="fantasy_name" value={formData.fantasy_name} onChange={e => handleChange("fantasy_name", e.target.value)} placeholder="Como é conhecido no mercado" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnpj_cpf">CNPJ ou CPF *</Label>
                    <InputMask
                      mask={formData.cnpj_cpf.replace(/\D/g, "").length <= 11 ? "999.999.999-99" : "99.999.999/9999-99"}
                      value={formData.cnpj_cpf}
                      onChange={e => handleChange("cnpj_cpf", e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cnpj_cpf"
                          placeholder="000.000.000-00"
                          className={errors.cnpj_cpf ? "border-destructive" : ""}
                        />
                      )}
                    </InputMask>
                    {errors.cnpj_cpf && <p className="text-xs text-destructive">{errors.cnpj_cpf}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail de Contato *</Label>
                    <Input id="email" type="email" value={formData.email} onChange={e => handleChange("email", e.target.value)} placeholder="contato@cliente.com.br" className={errors.email ? "border-destructive" : ""} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <InputMask
                      mask={formData.phone.replace(/\D/g, "").length <= 10 ? "(99) 9999-9999" : "(99) 99999-9999"}
                      value={formData.phone}
                      onChange={e => handleChange("phone", e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="phone"
                          type="tel"
                          placeholder="(00) 00000-0000"
                          className={errors.phone ? "border-destructive" : ""}
                        />
                      )}
                    </InputMask>
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sector">Setor de Atuação *</Label>
                    <Select value={formData.sector} onValueChange={value => handleChange("sector", value)}>
                      <SelectTrigger className={errors.sector ? "border-destructive" : ""}>
                        <SelectValue placeholder="Selecione o setor" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectors.map(sector => <SelectItem key={sector} value={sector}>
                            {sector}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.sector && <p className="text-xs text-destructive">{errors.sector}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="size">Tamanho da Empresa *</Label>
                    <Select value={formData.size} onValueChange={value => handleChange("size", value)}>
                      <SelectTrigger className={errors.size ? "border-destructive" : ""}>
                        <SelectValue placeholder="Selecione o tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        {sizes.map(size => <SelectItem key={size} value={size}>
                            {size}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.size && <p className="text-xs text-destructive">{errors.size}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="selected_month">Mês do Cronograma *</Label>
                    <Select value={formData.selected_month} onValueChange={value => handleChange("selected_month", value)}>
                      <SelectTrigger className={errors.selected_month ? "border-destructive" : ""}>
                        <SelectValue placeholder="Selecione o mês" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map(month => <SelectItem key={month} value={month}>
                            {month}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.selected_month && <p className="text-xs text-destructive">{errors.selected_month}</p>}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="products_services">Produtos ou Serviços Oferecidos *</Label>
                    <Textarea id="products_services" value={formData.products_services} onChange={e => handleChange("products_services", e.target.value)} placeholder="Descreva detalhadamente os produtos ou serviços que o cliente oferece..." className={`min-h-[120px] resize-none ${errors.products_services ? "border-destructive" : ""}`} />
                    {errors.products_services && <p className="text-xs text-destructive">{errors.products_services}</p>}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address" className="text-muted-foreground">
                      Endereço <span className="text-xs">(opcional)</span>
                    </Label>
                    <Input id="address" value={formData.address} onChange={e => handleChange("address", e.target.value)} placeholder="Endereço completo" />
                  </div>

                  
                </div>

                <Button type="submit" disabled={!isFormValid()} className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity">
                  Cadastrar Cliente
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <ConfirmationModal open={showConfirmModal} onOpenChange={setShowConfirmModal} title="Confirmar Cadastro" description="Deseja confirmar o cadastro deste cliente?" onConfirm={confirmSubmit} loading={loading} />
    </div>;
};
export default CompanyRegistration;