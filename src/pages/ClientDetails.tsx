import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, X, Loader2, Trash2, Pencil, Building2, Mail, Phone, Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import InputMask from "react-input-mask";

interface ClientFormData {
  name: string;
  fantasy_name: string;
  cnpj: string;
  cpf: string;
  sector: string;
  other_sector: string;
  size: string;
  hasFranchise: string;
  franchise_units: string;
  franchise_city: string;
  franchise_brand: string;
  products_services: string;
  commercial_phone: string;
  corporate_email: string;
  email: string;
  phone: string;
  cep: string;
  city: string;
  state: string;
  street: string;
  number: string;
  complement: string;
}

const SECTOR_OPTIONS = [
  "Alimentação",
  "Saúde",
  "Educação",
  "Tecnologia",
  "Serviços",
  "Comércio",
  "Indústria",
  "Construção",
  "Moda",
  "Beleza",
  "Outros"
];

const SIZE_OPTIONS = [
  { value: "Micro", label: "Micro", description: "(1-10 funcionários)" },
  { value: "Pequena", label: "Pequena", description: "(10-20 funcionários)" },
  { value: "Média", label: "Média", description: "(21-100 funcionários)" },
  { value: "Grande", label: "Grande", description: "(+100 funcionários)" }
];

const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

// Parse stored data to extract franchise info and address
const parseStoredData = (client: any): ClientFormData => {
  let hasFranchise = "não";
  let franchise_units = "";
  let franchise_city = "";
  let franchise_brand = "";
  let baseSize = client.size || "";

  // Parse franchise info from size field
  const franchiseMatch = client.size?.match(/^(.+?) - Franquia: (.+?) \((\d+) unidades, (.+?)\)$/);
  if (franchiseMatch) {
    baseSize = franchiseMatch[1];
    franchise_brand = franchiseMatch[2];
    franchise_units = franchiseMatch[3];
    franchise_city = franchiseMatch[4];
    hasFranchise = "sim";
  }

  // Check if sector is custom (not in predefined list)
  const isCustomSector = client.sector && !SECTOR_OPTIONS.includes(client.sector);
  
  return {
    name: client.name || "",
    fantasy_name: client.fantasy_name || "",
    cnpj: client.cnpj_cpf || "",
    cpf: "",
    sector: isCustomSector ? "Outros" : (client.sector || ""),
    other_sector: isCustomSector ? client.sector : "",
    size: baseSize,
    hasFranchise,
    franchise_units,
    franchise_city,
    franchise_brand,
    products_services: client.products_services || "",
    commercial_phone: "",
    corporate_email: "",
    email: client.email || "",
    phone: client.phone || "",
    cep: "",
    city: "",
    state: "",
    street: "",
    number: "",
    complement: ""
  };
};

const ClientDetails = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>({
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
    complement: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: client, isLoading } = useQuery({
    queryKey: ['client-details', id, tenantId],
    queryFn: async () => {
      if (!id || !tenantId) return null;
      const { data, error } = await supabase
        .from('tenant_companies')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("Cliente não encontrado");
          navigate('/clientes');
          return null;
        }
        throw error;
      }
      return data;
    },
    enabled: !!id && !!tenantId
  });

  // Sync form data with client data
  useEffect(() => {
    if (client) {
      setFormData(parseStoredData(client));
    }
  }, [client]);

  // CEP auto-fill
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

  const handleInputChange = (field: keyof ClientFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when field is modified
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) newErrors.name = "Razão Social é obrigatória";
    if (!formData.cnpj.trim()) newErrors.cnpj = "CNPJ é obrigatório";
    if (!formData.sector) newErrors.sector = "Setor é obrigatório";
    if (formData.sector === "Outros" && !formData.other_sector.trim()) {
      newErrors.other_sector = "Informe o setor de atuação";
    }
    if (!formData.size) newErrors.size = "Tamanho é obrigatório";
    if (!formData.products_services.trim()) newErrors.products_services = "Produtos/Serviços é obrigatório";
    if (!formData.email.trim()) newErrors.email = "E-mail é obrigatório";
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "E-mail inválido";
    }
    if (!formData.phone.trim()) newErrors.phone = "Telefone é obrigatório";
    
    // Franchise validation
    if (formData.hasFranchise === "sim") {
      if (!formData.franchise_units.trim()) newErrors.franchise_units = "Campo obrigatório";
      if (!formData.franchise_city.trim()) newErrors.franchise_city = "Campo obrigatório";
      if (!formData.franchise_brand.trim()) newErrors.franchise_brand = "Campo obrigatório";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!id || !tenantId) return;

    if (!validateForm()) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    setIsSaving(true);
    try {
      // Build sector value
      const sectorValue = formData.sector === "Outros" ? formData.other_sector : formData.sector;

      // Build size value with franchise info
      let sizeValue = formData.size;
      if (formData.hasFranchise === "sim") {
        sizeValue = `${formData.size} - Franquia: ${formData.franchise_brand} (${formData.franchise_units} unidades, ${formData.franchise_city})`;
      }

      const { error } = await supabase
        .from('tenant_companies')
        .update({
          name: formData.name.trim(),
          fantasy_name: formData.fantasy_name.trim() || null,
          cnpj_cpf: formData.cnpj.trim(),
          sector: sectorValue,
          size: sizeValue,
          products_services: formData.products_services.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      // Invalidate queries to refresh data across the app
      queryClient.invalidateQueries({ queryKey: ['client-details', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-clients'] });
      
      toast.success("Dados atualizados com sucesso");
      setIsEditing(false);
    } catch (error: any) {
      console.error('Error updating client:', error);
      toast.error(error.message || "Erro ao atualizar dados");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (client) {
      setFormData(parseStoredData(client));
    }
    setErrors({});
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!id || !tenantId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['tenant-clients'] });
      toast.success("Cliente excluído com sucesso");
      navigate('/clientes');
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast.error(error.message || "Erro ao excluir cliente");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando informações do cliente...</p>
        </div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate("/clientes")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">
                  {client.fantasy_name || client.name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Dados Cadastrais
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowDeleteModal(true)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Seção 1: Identificação da Empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Identificação da Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Razão Social *</Label>
                  {isEditing ? (
                    <>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Digite a razão social da empresa"
                        className={errors.name ? "border-destructive" : ""}
                      />
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{client.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ *</Label>
                  {isEditing ? (
                    <>
                      <InputMask
                        mask="99.999.999/9999-99"
                        value={formData.cnpj}
                        onChange={(e) => handleInputChange('cnpj', e.target.value)}
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
                    </>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{client.cnpj_cpf}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fantasy_name">Nome Fantasia</Label>
                  {isEditing ? (
                    <Input
                      id="fantasy_name"
                      value={formData.fantasy_name}
                      onChange={(e) => handleInputChange('fantasy_name', e.target.value)}
                      placeholder="Como é conhecido no mercado"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">
                      {client.fantasy_name || <span className="text-muted-foreground">Não informado</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sector">Setor de Atuação *</Label>
                  {isEditing ? (
                    <>
                      <Select
                        value={formData.sector}
                        onValueChange={(value) => handleInputChange('sector', value)}
                      >
                        <SelectTrigger className={errors.sector ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione o setor" />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTOR_OPTIONS.map((sector) => (
                            <SelectItem key={sector} value={sector}>
                              {sector}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.sector && <p className="text-xs text-destructive">{errors.sector}</p>}
                    </>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{client.sector}</p>
                  )}
                </div>

                {isEditing && formData.sector === "Outros" && (
                  <div className="space-y-2">
                    <Label htmlFor="other_sector">Informe o setor de atuação *</Label>
                    <Input
                      id="other_sector"
                      value={formData.other_sector}
                      onChange={(e) => handleInputChange('other_sector', e.target.value)}
                      placeholder="Digite o setor específico da empresa"
                      className={errors.other_sector ? "border-destructive" : ""}
                    />
                    {errors.other_sector && <p className="text-xs text-destructive">{errors.other_sector}</p>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="size">Tamanho da Empresa *</Label>
                  {isEditing ? (
                    <>
                      <Select
                        value={formData.size}
                        onValueChange={(value) => handleInputChange('size', value)}
                      >
                        <SelectTrigger className={errors.size ? "border-destructive" : ""}>
                          <SelectValue placeholder="Selecione o tamanho" />
                        </SelectTrigger>
                        <SelectContent>
                          {SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center justify-between w-full gap-4">
                                <span>{option.label}</span>
                                <span className="text-xs text-muted-foreground">{option.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.size && <p className="text-xs text-destructive">{errors.size}</p>}
                    </>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">
                      {SIZE_OPTIONS.find(o => client.size?.startsWith(o.value))?.label || client.size}
                      {SIZE_OPTIONS.find(o => client.size?.startsWith(o.value))?.description && (
                        <span className="text-muted-foreground ml-1">
                          {SIZE_OPTIONS.find(o => client.size?.startsWith(o.value))?.description}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commercial_phone">Telefone Comercial</Label>
                  {isEditing ? (
                    <InputMask
                      mask={formData.commercial_phone.replace(/\D/g, "").length <= 10 ? "(99) 9999-9999" : "(99) 99999-9999"}
                      value={formData.commercial_phone}
                      onChange={(e) => handleInputChange('commercial_phone', e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="commercial_phone"
                          type="tel"
                          placeholder="(00) 00000-0000"
                        />
                      )}
                    </InputMask>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      Não informado
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Número fixo da empresa para contato geral.</p>
                </div>
              </div>

              {/* Franquia */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Possui Franquia</Label>
                  {isEditing ? (
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hasFranchise"
                          value="não"
                          checked={formData.hasFranchise === "não"}
                          onChange={(e) => handleInputChange('hasFranchise', e.target.value)}
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
                          onChange={(e) => handleInputChange('hasFranchise', e.target.value)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">Sim</span>
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">
                      {formData.hasFranchise === "sim" ? "Sim" : "Não"}
                    </p>
                  )}
                </div>

                {formData.hasFranchise === "sim" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="franchise_brand">Nome da Marca Franqueadora *</Label>
                      {isEditing ? (
                        <>
                          <Input
                            id="franchise_brand"
                            value={formData.franchise_brand}
                            onChange={(e) => handleInputChange('franchise_brand', e.target.value)}
                            placeholder="Ex: McDonald's, O Boticário"
                            className={errors.franchise_brand ? "border-destructive" : ""}
                          />
                          {errors.franchise_brand && <p className="text-xs text-destructive">{errors.franchise_brand}</p>}
                        </>
                      ) : (
                        <p className="text-sm py-2 px-3 bg-background rounded-md">{formData.franchise_brand}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="franchise_units">Quantidade de Unidades *</Label>
                      {isEditing ? (
                        <>
                          <Input
                            id="franchise_units"
                            type="number"
                            min="1"
                            value={formData.franchise_units}
                            onChange={(e) => handleInputChange('franchise_units', e.target.value)}
                            placeholder="Ex: 5"
                            className={errors.franchise_units ? "border-destructive" : ""}
                          />
                          {errors.franchise_units && <p className="text-xs text-destructive">{errors.franchise_units}</p>}
                        </>
                      ) : (
                        <p className="text-sm py-2 px-3 bg-background rounded-md">{formData.franchise_units}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="franchise_city">Cidade Principal da Matriz *</Label>
                      {isEditing ? (
                        <>
                          <Input
                            id="franchise_city"
                            value={formData.franchise_city}
                            onChange={(e) => handleInputChange('franchise_city', e.target.value)}
                            placeholder="Ex: São Paulo"
                            className={errors.franchise_city ? "border-destructive" : ""}
                          />
                          {errors.franchise_city && <p className="text-xs text-destructive">{errors.franchise_city}</p>}
                        </>
                      ) : (
                        <p className="text-sm py-2 px-3 bg-background rounded-md">{formData.franchise_city}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Produtos e Serviços */}
              <div className="space-y-2">
                <Label htmlFor="products_services">Produtos ou Serviços Oferecidos *</Label>
                {isEditing ? (
                  <>
                    <Textarea
                      id="products_services"
                      value={formData.products_services}
                      onChange={(e) => handleInputChange('products_services', e.target.value)}
                      placeholder="Descreva os principais produtos ou serviços oferecidos pela empresa"
                      rows={3}
                      className={errors.products_services ? "border-destructive" : ""}
                    />
                    {errors.products_services && <p className="text-xs text-destructive">{errors.products_services}</p>}
                  </>
                ) : (
                  <p className="text-sm py-3 px-3 bg-muted/50 rounded-md leading-relaxed">
                    {client.products_services || <span className="text-muted-foreground">Não informado</span>}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Seção 2: Localização */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Localização
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  {isEditing ? (
                    <InputMask
                      mask="99999-999"
                      value={formData.cep}
                      onChange={(e) => handleInputChange('cep', e.target.value)}
                      maskChar={null}
                      disabled={loadingCep}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cep"
                          placeholder="00000-000"
                        />
                      )}
                    </InputMask>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      {formData.cep || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="street">Endereço (Rua/Avenida)</Label>
                  {isEditing ? (
                    <Input
                      id="street"
                      value={formData.street}
                      onChange={(e) => handleInputChange('street', e.target.value)}
                      placeholder="Nome da rua ou avenida"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      {formData.street || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  {isEditing ? (
                    <Input
                      id="number"
                      value={formData.number}
                      onChange={(e) => handleInputChange('number', e.target.value)}
                      placeholder="Nº"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      {formData.number || "Não informado"}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  {isEditing ? (
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Cidade"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      {formData.city || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  {isEditing ? (
                    <Select
                      value={formData.state}
                      onValueChange={(value) => handleInputChange('state', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      {formData.state || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complement">Complemento</Label>
                  {isEditing ? (
                    <Input
                      id="complement"
                      value={formData.complement}
                      onChange={(e) => handleInputChange('complement', e.target.value)}
                      placeholder="Sala, andar, bloco..."
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      {formData.complement || "Não informado"}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seção 3: Contato e Comunicação */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Phone className="h-5 w-5 text-primary" />
                Contato e Comunicação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corporate_email">E-mail Corporativo</Label>
                  {isEditing ? (
                    <Input
                      id="corporate_email"
                      type="email"
                      value={formData.corporate_email}
                      onChange={(e) => handleInputChange('corporate_email', e.target.value)}
                      placeholder="empresa@dominio.com"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      Não informado
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">E-mail oficial da empresa.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail de Contato *</Label>
                  {isEditing ? (
                    <>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="contato@empresa.com"
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2 px-3 bg-muted/50 rounded-md">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {client.email}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">E-mail do responsável pelo projeto.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone de Contato / WhatsApp *</Label>
                  {isEditing ? (
                    <>
                      <InputMask
                        mask={formData.phone.replace(/\D/g, "").length <= 10 ? "(99) 9999-9999" : "(99) 99999-9999"}
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
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
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2 px-3 bg-muted/50 rounded-md">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {client.phone}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Número pessoal ou WhatsApp do responsável.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF do Responsável</Label>
                  {isEditing ? (
                    <InputMask
                      mask="999.999.999-99"
                      value={formData.cpf}
                      onChange={(e) => handleInputChange('cpf', e.target.value)}
                      maskChar={null}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cpf"
                          placeholder="000.000.000-00"
                        />
                      )}
                    </InputMask>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md text-muted-foreground">
                      Não informado
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Opcional - CPF para emissão de notas.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações do Sistema */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5 text-primary" />
                Informações do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Data de Cadastro</p>
                  <p className="font-medium">
                    {client.created_at 
                      ? format(new Date(client.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                      : "Não disponível"
                    }
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Última Atualização</p>
                  <p className="font-medium">
                    {client.updated_at 
                      ? format(new Date(client.updated_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                      : "Não disponível"
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        onConfirm={handleDelete}
        title="Excluir Cliente"
        description={`Tem certeza que deseja excluir "${client.fantasy_name || client.name}"? Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.`}
        loading={isDeleting}
      />
    </div>
  );
};

export default ClientDetails;
