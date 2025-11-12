import { useState, useEffect } from "react";
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
import { Building2, ArrowLeft, MapPin, Phone, Mail } from "lucide-react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
const CompanyRegistration = () => {
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    fantasy_name: "",
    cnpj: "",
    cpf: "",
    sector: "",
    other_sector: "",
    size: "",
    franchise_units: "",
    franchise_city: "",
    franchise_brand: "",
    products_services: "",
    commercial_phone: "",
    email: "",
    phone: "",
    cep: "",
    city: "",
    state: "",
    street: "",
    number: "",
    complement: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCep, setLoadingCep] = useState(false);
  const sectors = ["Alimentação", "Saúde", "Educação", "Tecnologia", "Serviços", "Comércio", "Indústria", "Construção", "Moda", "Beleza", "Outros"];
  const sizes = ["Micro", "Pequena", "Média", "Grande", "Franquia"];
  const validateField = (field: string, value: string) => {
    const requiredFields = ["name", "cnpj", "sector", "size", "products_services", "email", "phone"];

    // CNPJ validation
    if (field === "cnpj") {
      if (!value.trim()) return "CNPJ é obrigatório";
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 14) return "CNPJ inválido";
    }

    // CPF validation (optional)
    if (field === "cpf" && value.trim()) {
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 11) return "CPF inválido";
    }

    // Other sector validation
    if (formData.sector === "Outros" && field === "other_sector" && !value.trim()) {
      return "Informe o setor de atuação";
    }

    // Franchise fields validation
    if (formData.size === "Franquia") {
      if (field === "franchise_units" && !value.trim()) return "Campo obrigatório";
      if (field === "franchise_city" && !value.trim()) return "Campo obrigatório";
      if (field === "franchise_brand" && !value.trim()) return "Campo obrigatório";
    }
    if (requiredFields.includes(field) && !value.trim()) {
      return "Este campo é obrigatório";
    }
    if (field === "email" && value && !/\S+@\S+\.\S+/.test(value)) {
      return "E-mail inválido";
    }
    if (field === "phone" && value) {
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length < 10 || cleanValue.length > 11) {
        return "Telefone inválido";
      }
    }
    if (field === "cep" && value) {
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 8) {
        return "CEP inválido";
      }
    }
    return "";
  };
  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setFormData(prev => ({
        ...prev,
        street: data.logradouro || "",
        city: data.localidade || "",
        state: data.uf || ""
      }));
      toast.success("Endereço preenchido automaticamente");
    } catch (error) {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  };
  useEffect(() => {
    if (formData.cep.replace(/\D/g, "").length === 8) {
      fetchAddressByCep(formData.cep);
    }
  }, [formData.cep]);
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
    const baseFields = ["name", "cnpj", "sector", "size", "products_services", "email", "phone"];

    // Check base fields including CNPJ
    for (const field of baseFields) {
      const value = formData[field as keyof typeof formData];
      if (!value.trim() || validateField(field, value)) {
        return false;
      }
    }

    // Check other sector
    if (formData.sector === "Outros" && (!formData.other_sector.trim() || validateField("other_sector", formData.other_sector))) {
      return false;
    }

    // Check franchise fields
    if (formData.size === "Franquia") {
      const franchiseFields = ["franchise_units", "franchise_city", "franchise_brand"];
      for (const field of franchiseFields) {
        const value = formData[field as keyof typeof formData];
        if (!value.trim() || validateField(field, value)) {
          return false;
        }
      }
    }
    return true;
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
      // Build address string
      const addressParts = [formData.street, formData.number && `nº ${formData.number}`, formData.city, formData.state, formData.cep && `CEP: ${formData.cep}`].filter(Boolean);
      const fullAddress = addressParts.join(", ");

      // Build sector value
      const sectorValue = formData.sector === "Outros" ? formData.other_sector : formData.sector;

      // Build size value with franchise info
      let sizeValue = formData.size;
      if (formData.size === "Franquia") {
        sizeValue = `Franquia - ${formData.franchise_brand} (${formData.franchise_units} unidades, ${formData.franchise_city})`;
      }
      const {
        data,
        error
      } = await supabase.from("tenant_companies").insert([{
        name: formData.name,
        cnpj_cpf: formData.cnpj,
        sector: sectorValue,
        size: sizeValue,
        products_services: formData.products_services,
        email: formData.email,
        phone: formData.phone,
        selected_month: "",
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
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Seção 1: Identificação da Empresa */}
                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Identificação da Empresa</h3>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name">Razão Social *</Label>
                        <Input id="name" value={formData.name} onChange={e => handleChange("name", e.target.value)} placeholder="Digite a razão social da empresa" className={errors.name ? "border-destructive" : ""} />
                        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cnpj">CNPJ *</Label>
                        <InputMask mask="99.999.999/9999-99" value={formData.cnpj} onChange={e => handleChange("cnpj", e.target.value)} maskChar={null}>
                          {(inputProps: any) => <Input {...inputProps} id="cnpj" placeholder="00.000.000/0000-00" className={errors.cnpj ? "border-destructive" : ""} />}
                        </InputMask>
                        {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fantasy_name">Nome Fantasia</Label>
                        <Input id="fantasy_name" value={formData.fantasy_name} onChange={e => handleChange("fantasy_name", e.target.value)} placeholder="Como é conhecido no mercado" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                      {formData.sector === "Outros" && <div className="space-y-2">
                          <Label htmlFor="other_sector">Informe o setor de atuação *</Label>
                          <Input id="other_sector" value={formData.other_sector} onChange={e => handleChange("other_sector", e.target.value)} placeholder="Digite o setor específico da empresa" className={errors.other_sector ? "border-destructive" : ""} />
                          {errors.other_sector && <p className="text-xs text-destructive">{errors.other_sector}</p>}
                        </div>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="size">Tamanho da Empresa *</Label>
                      <Select value={formData.size} onValueChange={value => handleChange("size", value)}>
                        <SelectTrigger className={errors.size ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione o tamanho" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Micro">
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>Micro</span>
                              <span className="text-xs text-muted-foreground">(1-10 funcionários)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Pequena">
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>Pequena</span>
                              <span className="text-xs text-muted-foreground">(10-20 funcionários)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Média">
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>Média</span>
                              <span className="text-xs text-muted-foreground">(21-100 funcionários)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Grande">
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>Grande</span>
                              <span className="text-xs text-muted-foreground">(+100 funcionários)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Franquia">Franquia</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.size && <p className="text-xs text-destructive">{errors.size}</p>}
                    </div>

                    {formData.size === "Franquia" && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg bg-muted/50">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="franchise_brand">Nome da Marca Franqueadora *</Label>
                          <Input id="franchise_brand" value={formData.franchise_brand} onChange={e => handleChange("franchise_brand", e.target.value)} placeholder="Ex: McDonald's, O Boticário" className={errors.franchise_brand ? "border-destructive" : ""} />
                          {errors.franchise_brand && <p className="text-xs text-destructive">{errors.franchise_brand}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="franchise_units">Quantidade de Unidades *</Label>
                          <Input id="franchise_units" type="number" min="1" value={formData.franchise_units} onChange={e => handleChange("franchise_units", e.target.value)} placeholder="Número de unidades" className={errors.franchise_units ? "border-destructive" : ""} />
                          {errors.franchise_units && <p className="text-xs text-destructive">{errors.franchise_units}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="franchise_city">Cidade Principal da Matriz *</Label>
                          <Input id="franchise_city" value={formData.franchise_city} onChange={e => handleChange("franchise_city", e.target.value)} placeholder="Ex: São Paulo, Rio de Janeiro" className={errors.franchise_city ? "border-destructive" : ""} />
                          {errors.franchise_city && <p className="text-xs text-destructive">{errors.franchise_city}</p>}
                        </div>
                      </div>}

                    <div className="space-y-2">
                      <Label htmlFor="products_services">Produtos ou Serviços Oferecidos *</Label>
                      <Textarea id="products_services" value={formData.products_services} onChange={e => handleChange("products_services", e.target.value)} placeholder="Descreva detalhadamente os produtos ou serviços oferecidos pela empresa." className={`min-h-[100px] resize-none ${errors.products_services ? "border-destructive" : ""}`} />
                      {errors.products_services && <p className="text-xs text-destructive">{errors.products_services}</p>}
                    </div>
                  </div>
                </div>

                {/* Seção 2: Contato e Comunicação */}
                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Phone className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Contato</h3>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="commercial_phone">Telefone Comercial</Label>
                        <InputMask mask={formData.commercial_phone.replace(/\D/g, "").length <= 10 ? "(99) 9999-9999" : "(99) 99999-9999"} value={formData.commercial_phone} onChange={e => handleChange("commercial_phone", e.target.value)} maskChar={null}>
                          {(inputProps: any) => <Input {...inputProps} id="commercial_phone" type="tel" placeholder="(00) 00000-0000" />}
                        </InputMask>
                        <p className="text-xs text-muted-foreground">Número fixo da empresa para contato geral.</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefone de Contato / WhatsApp *</Label>
                        <InputMask mask={formData.phone.replace(/\D/g, "").length <= 10 ? "(99) 9999-9999" : "(99) 99999-9999"} value={formData.phone} onChange={e => handleChange("phone", e.target.value)} maskChar={null}>
                          {(inputProps: any) => <Input {...inputProps} id="phone" type="tel" placeholder="(00) 00000-0000" className={errors.phone ? "border-destructive" : ""} />}
                        </InputMask>
                        <p className="text-xs text-muted-foreground">Número pessoal ou WhatsApp do responsável.</p>
                        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="email">E-mail de Contato *</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input id="email" type="email" value={formData.email} onChange={e => handleChange("email", e.target.value)} placeholder="contato@empresa.com.br" className={`pl-9 ${errors.email ? "border-destructive" : ""}`} />
                        </div>
                        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cpf">CPF</Label>
                        <InputMask mask="999.999.999-99" value={formData.cpf} onChange={e => handleChange("cpf", e.target.value)} maskChar={null}>
                          {(inputProps: any) => <Input {...inputProps} id="cpf" placeholder="000.000.000-00" className={errors.cpf ? "border-destructive" : ""} />}
                        </InputMask>
                        <p className="text-xs text-muted-foreground">CPF do responsável (opcional).</p>
                        {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 3: Localização */}
                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <MapPin className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Localização</h3>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="cep">CEP</Label>
                        <InputMask mask="99999-999" value={formData.cep} onChange={e => handleChange("cep", e.target.value)} maskChar={null} disabled={loadingCep}>
                          {(inputProps: any) => <Input {...inputProps} id="cep" placeholder="00000-000" className={errors.cep ? "border-destructive" : ""} />}
                        </InputMask>
                        {loadingCep && <p className="text-xs text-muted-foreground">Buscando endereço...</p>}
                        {!loadingCep}
                        {errors.cep && <p className="text-xs text-destructive">{errors.cep}</p>}
                      </div>

                      <div className="space-y-2 md:col-span-3">
                        <Label htmlFor="street">Endereço (Rua/Avenida)</Label>
                        <Input id="street" value={formData.street} onChange={e => handleChange("street", e.target.value)} placeholder="Rua, Avenida, etc." />
                      </div>

                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="number">Número</Label>
                        <Input id="number" value={formData.number} onChange={e => handleChange("number", e.target.value)} placeholder="123" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="city">Cidade</Label>
                        <Input id="city" value={formData.city} onChange={e => handleChange("city", e.target.value)} placeholder="São Paulo" />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state">Estado</Label>
                        <Select value={formData.state} onValueChange={value => handleChange("state", value)}>
                          <SelectTrigger id="state">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent className="bg-background">
                            <SelectItem value="AC">AC</SelectItem>
                            <SelectItem value="AL">AL</SelectItem>
                            <SelectItem value="AP">AP</SelectItem>
                            <SelectItem value="AM">AM</SelectItem>
                            <SelectItem value="BA">BA</SelectItem>
                            <SelectItem value="CE">CE</SelectItem>
                            <SelectItem value="DF">DF</SelectItem>
                            <SelectItem value="ES">ES</SelectItem>
                            <SelectItem value="GO">GO</SelectItem>
                            <SelectItem value="MA">MA</SelectItem>
                            <SelectItem value="MT">MT</SelectItem>
                            <SelectItem value="MS">MS</SelectItem>
                            <SelectItem value="MG">MG</SelectItem>
                            <SelectItem value="PA">PA</SelectItem>
                            <SelectItem value="PB">PB</SelectItem>
                            <SelectItem value="PR">PR</SelectItem>
                            <SelectItem value="PE">PE</SelectItem>
                            <SelectItem value="PI">PI</SelectItem>
                            <SelectItem value="RJ">RJ</SelectItem>
                            <SelectItem value="RN">RN</SelectItem>
                            <SelectItem value="RS">RS</SelectItem>
                            <SelectItem value="RO">RO</SelectItem>
                            <SelectItem value="RR">RR</SelectItem>
                            <SelectItem value="SC">SC</SelectItem>
                            <SelectItem value="SP">SP</SelectItem>
                            <SelectItem value="SE">SE</SelectItem>
                            <SelectItem value="TO">TO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
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