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
    document_type: "cnpj" as "cnpj" | "cpf",
    cnpj: "",
    cpf: "",
    sector: "",
    other_sector: "",
    size: "",
    franchise_units: "",
    franchise_city: "",
    franchise_brand: "",
    products_services: "",
    email: "",
    phone: "",
    cep: "",
    city: "",
    state: "",
    street: "",
    number: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingCep, setLoadingCep] = useState(false);
  
  const sectors = ["Alimentação", "Saúde", "Educação", "Tecnologia", "Serviços", "Comércio", "Indústria", "Construção", "Moda", "Beleza", "Outros"];
  const sizes = ["Micro", "Pequena", "Média", "Grande", "Franquia"];
  const validateField = (field: string, value: string) => {
    const requiredFields = ["name", "sector", "size", "products_services", "email", "phone"];
    
    // Add document validation based on type
    if (formData.document_type === "cnpj" && field === "cnpj") {
      if (!value.trim()) return "CNPJ é obrigatório";
      const cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length !== 14) return "CNPJ inválido";
    }
    
    if (formData.document_type === "cpf" && field === "cpf") {
      if (!value.trim()) return "CPF é obrigatório";
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
    const baseFields = ["name", "sector", "size", "products_services", "email", "phone"];
    
    // Check document
    const documentField = formData.document_type === "cnpj" ? "cnpj" : "cpf";
    const documentValue = formData[documentField];
    if (!documentValue.trim() || validateField(documentField, documentValue)) {
      return false;
    }
    
    // Check base fields
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
      const addressParts = [
        formData.street,
        formData.number && `nº ${formData.number}`,
        formData.city,
        formData.state,
        formData.cep && `CEP: ${formData.cep}`
      ].filter(Boolean);
      const fullAddress = addressParts.join(", ");
      
      // Get document value
      const documentValue = formData.document_type === "cnpj" ? formData.cnpj : formData.cpf;
      
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
        cnpj_cpf: documentValue,
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
                {/* Seção 1: Empresa */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Empresa</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Razão Social *</Label>
                      <Input 
                        id="name" 
                        value={formData.name} 
                        onChange={e => handleChange("name", e.target.value)} 
                        placeholder="Digite a razão social da empresa" 
                        className={errors.name ? "border-destructive" : ""} 
                      />
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fantasy_name">Nome Fantasia</Label>
                      <Input 
                        id="fantasy_name" 
                        value={formData.fantasy_name} 
                        onChange={e => handleChange("fantasy_name", e.target.value)} 
                        placeholder="Como é conhecido no mercado" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de Documento *</Label>
                      <Select 
                        value={formData.document_type} 
                        onValueChange={(value: "cnpj" | "cpf") => handleChange("document_type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cnpj">CNPJ</SelectItem>
                          <SelectItem value="cpf">CPF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.document_type === "cnpj" ? (
                      <div className="space-y-2">
                        <Label htmlFor="cnpj">CNPJ *</Label>
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
                              className={errors.cnpj ? "border-destructive" : ""}
                            />
                          )}
                        </InputMask>
                        {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="cpf">CPF *</Label>
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
                              className={errors.cpf ? "border-destructive" : ""}
                            />
                          )}
                        </InputMask>
                        {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="sector">Setor de Atuação *</Label>
                      <Select value={formData.sector} onValueChange={value => handleChange("sector", value)}>
                        <SelectTrigger className={errors.sector ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione o setor" />
                        </SelectTrigger>
                        <SelectContent>
                          {sectors.map(sector => (
                            <SelectItem key={sector} value={sector}>
                              {sector}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.sector && <p className="text-xs text-destructive">{errors.sector}</p>}
                    </div>

                    {formData.sector === "Outros" && (
                      <div className="space-y-2">
                        <Label htmlFor="other_sector">Qual o setor? *</Label>
                        <Input 
                          id="other_sector" 
                          value={formData.other_sector} 
                          onChange={e => handleChange("other_sector", e.target.value)} 
                          placeholder="Informe o setor de atuação" 
                          className={errors.other_sector ? "border-destructive" : ""} 
                        />
                        {errors.other_sector && <p className="text-xs text-destructive">{errors.other_sector}</p>}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="size">Tamanho da Empresa *</Label>
                      <Select value={formData.size} onValueChange={value => handleChange("size", value)}>
                        <SelectTrigger className={errors.size ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione o tamanho" />
                        </SelectTrigger>
                        <SelectContent>
                          {sizes.map(size => (
                            <SelectItem key={size} value={size}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Micro (1-10 funcionários) · Pequena (10-20) · Média (21-100) · Grande (100+)
                      </p>
                      {errors.size && <p className="text-xs text-destructive">{errors.size}</p>}
                    </div>

                    {formData.size === "Franquia" && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="franchise_brand">Nome da Marca Franqueadora *</Label>
                          <Input 
                            id="franchise_brand" 
                            value={formData.franchise_brand} 
                            onChange={e => handleChange("franchise_brand", e.target.value)} 
                            placeholder="Ex: McDonald's, O Boticário" 
                            className={errors.franchise_brand ? "border-destructive" : ""} 
                          />
                          {errors.franchise_brand && <p className="text-xs text-destructive">{errors.franchise_brand}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="franchise_units">Quantidade de Unidades *</Label>
                          <Input 
                            id="franchise_units" 
                            type="number"
                            min="1"
                            value={formData.franchise_units} 
                            onChange={e => handleChange("franchise_units", e.target.value)} 
                            placeholder="Número de unidades" 
                            className={errors.franchise_units ? "border-destructive" : ""} 
                          />
                          {errors.franchise_units && <p className="text-xs text-destructive">{errors.franchise_units}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="franchise_city">Cidade Principal da Matriz *</Label>
                          <Input 
                            id="franchise_city" 
                            value={formData.franchise_city} 
                            onChange={e => handleChange("franchise_city", e.target.value)} 
                            placeholder="Ex: São Paulo, Rio de Janeiro" 
                            className={errors.franchise_city ? "border-destructive" : ""} 
                          />
                          {errors.franchise_city && <p className="text-xs text-destructive">{errors.franchise_city}</p>}
                        </div>
                      </>
                    )}

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="products_services">Produtos ou Serviços Oferecidos *</Label>
                      <Textarea 
                        id="products_services" 
                        value={formData.products_services} 
                        onChange={e => handleChange("products_services", e.target.value)} 
                        placeholder="Descreva detalhadamente os produtos ou serviços oferecidos pela empresa..." 
                        className={`min-h-[100px] resize-none ${errors.products_services ? "border-destructive" : ""}`} 
                      />
                      {errors.products_services && <p className="text-xs text-destructive">{errors.products_services}</p>}
                    </div>
                  </div>
                </div>

                {/* Seção 2: Contato / Informações adicionais */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Phone className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Contato / Informações adicionais</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail de Contato *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email" 
                          type="email" 
                          value={formData.email} 
                          onChange={e => handleChange("email", e.target.value)} 
                          placeholder="contato@empresa.com.br" 
                          className={`pl-9 ${errors.email ? "border-destructive" : ""}`}
                        />
                      </div>
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

                    <div className="space-y-2 md:col-span-2">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-muted-foreground">Endereço (opcional)</Label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cep">CEP</Label>
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
                            className={errors.cep ? "border-destructive" : ""}
                          />
                        )}
                      </InputMask>
                      {loadingCep && <p className="text-xs text-muted-foreground">Buscando endereço...</p>}
                      {errors.cep && <p className="text-xs text-destructive">{errors.cep}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input 
                        id="city" 
                        value={formData.city} 
                        onChange={e => handleChange("city", e.target.value)} 
                        placeholder="Ex: São Paulo" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state">Estado</Label>
                      <Input 
                        id="state" 
                        value={formData.state} 
                        onChange={e => handleChange("state", e.target.value)} 
                        placeholder="Ex: SP" 
                        maxLength={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="street">Endereço (Rua / Avenida)</Label>
                      <Input 
                        id="street" 
                        value={formData.street} 
                        onChange={e => handleChange("street", e.target.value)} 
                        placeholder="Ex: Rua das Flores" 
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="number">Número</Label>
                      <Input 
                        id="number" 
                        value={formData.number} 
                        onChange={e => handleChange("number", e.target.value)} 
                        placeholder="Ex: 123" 
                      />
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={!isFormValid()} 
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                >
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