import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import InputMask from "react-input-mask";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    hasFranchise: "não",
    franchise_units: "",
    franchise_city: "",
    franchise_brand: "",
    products_services: "",
    commercial_phone: "",
    corporate_email: "",
    email: "",
    phone: "",
    cep: "",
    city: "",
    state: "",
    street: "",
    number: "",
    neighborhood: "",
    complement: "",
    has_mascot: false,
    mascot_description: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCep, setLoadingCep] = useState(false);

  const sectors = ["Alimentação", "Saúde", "Educação", "Tecnologia", "Serviços", "Comércio", "Indústria", "Construção", "Moda", "Beleza", "Outros"];

  const validateField = (field: string, value: string) => {
    const requiredFields = ["name", "cnpj", "sector", "size", "products_services", "commercial_phone", "corporate_email", "email", "phone"];

    if (field === "cnpj") {
      if (!value.trim()) return "CNPJ é obrigatório";
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 14) return "CNPJ inválido";
    }

    if (field === "cpf" && value.trim()) {
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 11) return "CPF inválido";
    }

    if (formData.sector === "Outros" && field === "other_sector" && !value.trim()) {
      return "Informe o setor de atuação";
    }

    if (formData.hasFranchise === "sim") {
      if (field === "franchise_units" && !value.trim()) return "Campo obrigatório";
      if (field === "franchise_city" && !value.trim()) return "Campo obrigatório";
      if (field === "franchise_brand" && !value.trim()) return "Campo obrigatório";
    }

    if (requiredFields.includes(field) && !value.trim()) {
      return "Este campo é obrigatório";
    }

    if ((field === "email" || field === "corporate_email") && value && !/\S+@\S+\.\S+/.test(value)) {
      return "E-mail inválido";
    }

    if ((field === "phone" || field === "commercial_phone") && value) {
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
        neighborhood: data.bairro || "",
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

    for (const field of baseFields) {
      const value = formData[field as keyof typeof formData];
      if (typeof value !== 'string' || !value.trim() || validateField(field, value)) {
        return false;
      }
    }


    if (formData.sector === "Outros" && (!formData.other_sector.trim() || validateField("other_sector", formData.other_sector))) {
      return false;
    }

    if (formData.hasFranchise === "sim") {
      const franchiseFields = ["franchise_units", "franchise_city", "franchise_brand"];
      for (const field of franchiseFields) {
        const value = formData[field as keyof typeof formData];
        if (typeof value !== 'string' || !value.trim() || validateField(field, value)) {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
      if (!profile?.tenant_id) {
        toast.error("Configure sua agência antes de cadastrar clientes");
        navigate('/agency-setup');
        return;
      }

      const sectorValue = formData.sector === "Outros" ? formData.other_sector : formData.sector;

      let sizeValue = formData.size;
      if (formData.hasFranchise === "sim") {
        sizeValue = `${formData.size} - Franquia: ${formData.franchise_brand} (${formData.franchise_units} unidades, ${formData.franchise_city})`;
      }

      const { data, error } = await supabase.from("tenant_companies").insert([{
        name: formData.name,
        fantasy_name: formData.fantasy_name,
        cnpj_cpf: formData.cnpj,
        sector: sectorValue,
        size: sizeValue,
        products_services: formData.products_services,
        email: formData.email,
        phone: formData.phone,
        tenant_id: profile.tenant_id,
        has_mascot: formData.has_mascot || false,
        mascot_description: formData.has_mascot ? (formData.mascot_description || null) : null,
        cep: formData.cep?.trim() || null,
        street: formData.street?.trim() || null,
        number: formData.number?.trim() || null,
        city: formData.city?.trim() || null,
        neighborhood: formData.neighborhood?.trim() || null,
        state: formData.state?.trim() || null,
        complement: formData.complement?.trim() || null,
        corporate_email: formData.corporate_email?.trim() || null,
        commercial_phone: formData.commercial_phone?.trim() || null,
        responsible_cpf: (formData as any).cpf?.trim() || null,
      } as any]).select().single();

      if (error) {
        if (error.code === '23505') {
          toast.error("Já existe um cliente cadastrado com esse CNPJ/CPF nesta agência.");
          return;
        }
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

  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/")}
              aria-label="Voltar para página inicial"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Cadastro de Cliente</h1>
              <p className="text-sm text-muted-foreground">
                Preencha as informações do cliente para começar o planejamento
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seção 1: Identificação da Empresa */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-base font-semibold">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  Identificação da Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Razão Social *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={e => handleChange("name", e.target.value)}
                      placeholder="Digite a razão social da empresa"
                      className={`h-10 ${errors.name ? "border-destructive" : "border-border/60"}`}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cnpj" className="text-xs font-medium text-muted-foreground">CNPJ *</Label>
                    <InputMask
                      mask="99.999.999/9999-99"
                      value={formData.cnpj}
                      onChange={e => handleChange("cnpj", e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cnpj"
                          placeholder="00.000.000/0000-00"
                          className={`h-10 ${errors.cnpj ? "border-destructive" : "border-border/60"}`}
                        />
                      )}
                    </InputMask>
                    {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fantasy_name" className="text-xs font-medium text-muted-foreground">Nome Fantasia</Label>
                    <Input
                      id="fantasy_name"
                      value={formData.fantasy_name}
                      onChange={e => handleChange("fantasy_name", e.target.value)}
                      placeholder="Como é conhecido no mercado"
                      className="h-10 border-border/60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="sector" className="text-xs font-medium text-muted-foreground">Setor de Atuação *</Label>
                    <Select value={formData.sector} onValueChange={value => handleChange("sector", value)}>
                      <SelectTrigger className={`h-10 ${errors.sector ? "border-destructive" : "border-border/60"}`}>
                        <SelectValue placeholder="Selecione o setor" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectors.map(sector => (
                          <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.sector && <p className="text-xs text-destructive">{errors.sector}</p>}
                  </div>

                  {formData.sector === "Outros" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="other_sector" className="text-xs font-medium text-muted-foreground">Informe o setor de atuação *</Label>
                      <Input
                        id="other_sector"
                        value={formData.other_sector}
                        onChange={e => handleChange("other_sector", e.target.value)}
                        placeholder="Digite o setor específico da empresa"
                        className={`h-10 ${errors.other_sector ? "border-destructive" : "border-border/60"}`}
                      />
                      {errors.other_sector && <p className="text-xs text-destructive">{errors.other_sector}</p>}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="size" className="text-xs font-medium text-muted-foreground">Tamanho da Empresa *</Label>
                    <Select value={formData.size} onValueChange={value => handleChange("size", value)}>
                      <SelectTrigger className={`h-10 ${errors.size ? "border-destructive" : "border-border/60"}`}>
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
                      </SelectContent>
                    </Select>
                    {errors.size && <p className="text-xs text-destructive">{errors.size}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="commercial_phone" className="text-xs font-medium text-muted-foreground">Telefone Comercial *</Label>
                    <InputMask
                      mask={formData.commercial_phone.replace(/\D/g, "").length < 10 ? "(99) 9999-9999" : "(99) 99999-9999"}
                      value={formData.commercial_phone}
                      onChange={e => handleChange("commercial_phone", e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="commercial_phone"
                          type="tel"
                          placeholder="(00) 00000-0000"
                          className={`h-10 ${errors.commercial_phone ? "border-destructive" : "border-border/60"}`}
                        />
                      )}
                    </InputMask>
                    <p className="text-[11px] text-muted-foreground">Número fixo da empresa para contato geral.</p>
                    {errors.commercial_phone && <p className="text-xs text-destructive">{errors.commercial_phone}</p>}
                  </div>
                </div>

                {/* Franquia */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Possui Franquia *</Label>
                    <div className="flex gap-6 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hasFranchise"
                          value="não"
                          checked={formData.hasFranchise === "não"}
                          onChange={(e) => handleChange("hasFranchise", e.target.value)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">Não</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hasFranchise"
                          value="sim"
                          checked={formData.hasFranchise === "sim"}
                          onChange={(e) => handleChange("hasFranchise", e.target.value)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">Sim</span>
                      </label>
                    </div>
                  </div>

                  {formData.hasFranchise === "sim" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/20 border border-border/30">
                      <div className="space-y-1.5 md:col-span-2">
                        <Label htmlFor="franchise_brand" className="text-xs font-medium text-muted-foreground">Nome da Marca Franqueadora *</Label>
                        <Input
                          id="franchise_brand"
                          value={formData.franchise_brand}
                          onChange={e => handleChange("franchise_brand", e.target.value)}
                          placeholder="Ex: McDonald's, O Boticário"
                          className={`h-10 ${errors.franchise_brand ? "border-destructive" : "border-border/60"}`}
                        />
                        {errors.franchise_brand && <p className="text-xs text-destructive">{errors.franchise_brand}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="franchise_units" className="text-xs font-medium text-muted-foreground">Quantidade de Unidades *</Label>
                        <Input
                          id="franchise_units"
                          type="number"
                          min="1"
                          value={formData.franchise_units}
                          onChange={e => handleChange("franchise_units", e.target.value)}
                          placeholder="Número de unidades"
                          className={`h-10 ${errors.franchise_units ? "border-destructive" : "border-border/60"}`}
                        />
                        {errors.franchise_units && <p className="text-xs text-destructive">{errors.franchise_units}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="franchise_city" className="text-xs font-medium text-muted-foreground">Cidade Principal da Matriz *</Label>
                        <Input
                          id="franchise_city"
                          value={formData.franchise_city}
                          onChange={e => handleChange("franchise_city", e.target.value)}
                          placeholder="Ex: São Paulo, Rio de Janeiro"
                          className={`h-10 ${errors.franchise_city ? "border-destructive" : "border-border/60"}`}
                        />
                        {errors.franchise_city && <p className="text-xs text-destructive">{errors.franchise_city}</p>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Produtos e Serviços */}
                <div className="space-y-1.5">
                  <Label htmlFor="products_services" className="text-xs font-medium text-muted-foreground">Produtos ou Serviços Oferecidos *</Label>
                  <Textarea
                    id="products_services"
                    value={formData.products_services}
                    onChange={e => handleChange("products_services", e.target.value)}
                    placeholder="Descreva detalhadamente os produtos ou serviços oferecidos pela empresa."
                    className={`min-h-[100px] resize-none ${errors.products_services ? "border-destructive" : "border-border/60"}`}
                  />
                  {errors.products_services && <p className="text-xs text-destructive">{errors.products_services}</p>}
                </div>

              </CardContent>
            </Card>

            {/* Seção 2: Contato e Comunicação */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-base font-semibold">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  Contato e Comunicação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="corporate_email" className="text-xs font-medium text-muted-foreground">E-mail Corporativo *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="corporate_email"
                        type="email"
                        value={formData.corporate_email}
                        onChange={e => handleChange("corporate_email", e.target.value)}
                        placeholder="contato@empresa.com.br"
                        className={`h-10 pl-9 ${errors.corporate_email ? "border-destructive" : "border-border/60"}`}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">E-mail principal da empresa.</p>
                    {errors.corporate_email && <p className="text-xs text-destructive">{errors.corporate_email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">Telefone de Contato / WhatsApp *</Label>
                    <InputMask
                      mask={formData.phone.replace(/\D/g, "").length < 10 ? "(99) 9999-9999" : "(99) 99999-9999"}
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
                          className={`h-10 ${errors.phone ? "border-destructive" : "border-border/60"}`}
                        />
                      )}
                    </InputMask>
                    <p className="text-[11px] text-muted-foreground">Número pessoal ou WhatsApp do responsável.</p>
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-mail de Contato *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={e => handleChange("email", e.target.value)}
                        placeholder="contato@empresa.com.br"
                        className={`h-10 pl-9 ${errors.email ? "border-destructive" : "border-border/60"}`}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cpf" className="text-xs font-medium text-muted-foreground">CPF do Responsável</Label>
                    <InputMask
                      mask="999.999.999-99"
                      value={formData.cpf}
                      onChange={e => handleChange("cpf", e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cpf"
                          placeholder="000.000.000-00"
                          className={`h-10 ${errors.cpf ? "border-destructive" : "border-border/60"}`}
                        />
                      )}
                    </InputMask>
                    <p className="text-[11px] text-muted-foreground">CPF do responsável (opcional).</p>
                    {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Seção 3: Localização */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-base font-semibold">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  Localização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cep" className="text-xs font-medium text-muted-foreground">CEP</Label>
                    <InputMask
                      mask="99999-999"
                      value={formData.cep}
                      onChange={e => handleChange("cep", e.target.value)}
                      maskChar={null}
                      disabled={loadingCep}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cep"
                          placeholder="00000-000"
                          className={`h-10 ${errors.cep ? "border-destructive" : "border-border/60"}`}
                        />
                      )}
                    </InputMask>
                    {loadingCep && <p className="text-[11px] text-muted-foreground">Buscando endereço...</p>}
                    {errors.cep && <p className="text-xs text-destructive">{errors.cep}</p>}
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="street" className="text-xs font-medium text-muted-foreground">Endereço (Rua/Avenida)</Label>
                    <Input
                      id="street"
                      value={formData.street}
                      onChange={e => handleChange("street", e.target.value)}
                      placeholder="Rua, Avenida, etc."
                      className="h-10 border-border/60"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="number" className="text-xs font-medium text-muted-foreground">Número</Label>
                    <Input
                      id="number"
                      value={formData.number}
                      onChange={e => handleChange("number", e.target.value)}
                      placeholder="123"
                      className="h-10 border-border/60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="neighborhood" className="text-xs font-medium text-muted-foreground">Bairro</Label>
                    <Input
                      id="neighborhood"
                      value={formData.neighborhood}
                      onChange={e => handleChange("neighborhood", e.target.value)}
                      placeholder="Bairro"
                      className="h-10 border-border/60"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">Cidade</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={e => handleChange("city", e.target.value)}
                      placeholder="São Paulo"
                      className="h-10 border-border/60"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">Estado</Label>
                    <Select value={formData.state} onValueChange={value => handleChange("state", value)}>
                      <SelectTrigger className="h-10 border-border/60">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="complement" className="text-xs font-medium text-muted-foreground">Complemento</Label>
                    <Input
                      id="complement"
                      value={formData.complement}
                      onChange={e => handleChange("complement", e.target.value)}
                      placeholder="Sala, andar, bloco..."
                      className="h-10 border-border/60"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              disabled={!isFormValid()}
              className="w-full h-11"
            >
              Cadastrar Cliente
            </Button>
          </form>
        </div>
      </div>
      
      <ConfirmationModal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        title="Confirmar Cadastro"
        description="Deseja confirmar o cadastro deste cliente?"
        onConfirm={confirmSubmit}
        loading={loading}
      />
    </div>
  );
};

export default CompanyRegistration;
