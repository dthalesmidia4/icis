import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, X, Loader2, Trash2, Pencil, Building2, Mail, Phone, Calendar, MapPin, Upload, Image, Dog } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { ImageCropper } from "@/components/ImageCropper";
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
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_font: string;
  has_mascot: boolean;
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
    complement: "",
    brand_primary_color: client.brand_primary_color || "",
    brand_secondary_color: client.brand_secondary_color || "",
    brand_font: client.brand_font || "",
    has_mascot: client.has_mascot || false
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

  // Logo upload states
  const [isUploading, setIsUploading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Mascot upload states
  const [isUploadingMascot, setIsUploadingMascot] = useState(false);
  const [previewMascot, setPreviewMascot] = useState<string | null>(null);
  const [rawMascotSrc, setRawMascotSrc] = useState<string | null>(null);
  const [mascotCropperOpen, setMascotCropperOpen] = useState(false);
  const [croppedMascotBlob, setCroppedMascotBlob] = useState<Blob | null>(null);
  const mascotInputRef = useRef<HTMLInputElement>(null);
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
    complement: "",
    brand_primary_color: "",
    brand_secondary_color: "",
    brand_font: "",
    has_mascot: false
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
      setPreviewLogo(client.logo_url || null);
      setPreviewMascot((client as any).mascot_url || null);
    }
  }, [client]);

  // Logo upload handlers
  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG ou JPEG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setRawImageSrc(reader.result as string);
      setCropperOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = (blob: Blob) => {
    setCroppedBlob(blob);
    setPreviewLogo(URL.createObjectURL(blob));
    setCropperOpen(false);
  };

  const handleUploadLogo = async () => {
    if (!id || !croppedBlob) return;
    setIsUploading(true);
    try {
      if (client?.logo_url) {
        const pathParts = client.logo_url.split('/company-logos/');
        if (pathParts[1]) {
          await supabase.storage.from('company-logos').remove([pathParts[1]]);
        }
      }
      const fileName = `${Date.now()}.png`;
      const filePath = `${id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, croppedBlob, { upsert: true, contentType: 'image/png' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      const { error: updateError } = await supabase
        .from('tenant_companies')
        .update({ logo_url: urlData.publicUrl })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success("Logo atualizada com sucesso!");
      setCroppedBlob(null);
      queryClient.invalidateQueries({ queryKey: ['client-details', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-clients'] });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Erro ao fazer upload da logo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!id) return;
    setIsUploading(true);
    try {
      if (client?.logo_url) {
        const pathParts = client.logo_url.split('/company-logos/');
        if (pathParts[1]) {
          await supabase.storage.from('company-logos').remove([pathParts[1]]);
        }
      }
      const { error } = await supabase
        .from('tenant_companies')
        .update({ logo_url: null })
        .eq('id', id);
      if (error) throw error;
      setPreviewLogo(null);
      setCroppedBlob(null);
      toast.success("Logo removida com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['client-details', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-clients'] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover logo");
    } finally {
      setIsUploading(false);
    }
  };

  // Mascot upload handlers
  const handleMascotFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG ou JPEG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setRawMascotSrc(reader.result as string);
      setMascotCropperOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleMascotCropComplete = (blob: Blob) => {
    setCroppedMascotBlob(blob);
    setPreviewMascot(URL.createObjectURL(blob));
    setMascotCropperOpen(false);
  };

  const handleUploadMascot = async () => {
    if (!id || !croppedMascotBlob) return;
    setIsUploadingMascot(true);
    try {
      if ((client as any)?.mascot_url) {
        const pathParts = (client as any).mascot_url.split('/company-logos/');
        if (pathParts[1]) {
          await supabase.storage.from('company-logos').remove([pathParts[1]]);
        }
      }
      const fileName = `mascot-${Date.now()}.png`;
      const filePath = `${id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, croppedMascotBlob, { upsert: true, contentType: 'image/png' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      const { error: updateError } = await supabase
        .from('tenant_companies')
        .update({ mascot_url: urlData.publicUrl } as any)
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success("Mascote atualizado com sucesso!");
      setCroppedMascotBlob(null);
      queryClient.invalidateQueries({ queryKey: ['client-details', id] });
    } catch (error: any) {
      console.error('Mascot upload error:', error);
      toast.error(error.message || "Erro ao fazer upload do mascote");
    } finally {
      setIsUploadingMascot(false);
    }
  };

  const handleRemoveMascot = async () => {
    if (!id) return;
    setIsUploadingMascot(true);
    try {
      if ((client as any)?.mascot_url) {
        const pathParts = (client as any).mascot_url.split('/company-logos/');
        if (pathParts[1]) {
          await supabase.storage.from('company-logos').remove([pathParts[1]]);
        }
      }
      const { error } = await supabase
        .from('tenant_companies')
        .update({ mascot_url: null } as any)
        .eq('id', id);
      if (error) throw error;
      setPreviewMascot(null);
      setCroppedMascotBlob(null);
      toast.success("Mascote removido com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['client-details', id] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover mascote");
    } finally {
      setIsUploadingMascot(false);
    }
  };

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
          brand_primary_color: formData.brand_primary_color.trim() || null,
          brand_secondary_color: formData.brand_secondary_color.trim() || null,
          brand_font: formData.brand_font.trim() || null,
          has_mascot: formData.has_mascot,
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
                onClick={() => navigate("/cadastros-clientes")}
                aria-label="Voltar para lista de clientes"
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
                    aria-label="Excluir cliente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>


          {/* Seção 1: Identificação da Empresa */}
          <FormSection title="Identificação da Empresa" icon={Building2} contentClassName="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Razão Social *</Label>
                  {isEditing ? (
                    <>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Digite a razão social da empresa"
                        className={`h-10 ${errors.name ? "border-destructive" : "border-border/60"}`}
                      />
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </>
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">{client.name}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cnpj" className="text-xs font-medium text-muted-foreground">CNPJ *</Label>
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
                            className={`h-10 ${errors.cnpj ? "border-destructive" : "border-border/60"}`}
                          />
                        )}
                      </InputMask>
                      {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
                    </>
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">{client.cnpj_cpf}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fantasy_name" className="text-xs font-medium text-muted-foreground">Nome Fantasia</Label>
                  {isEditing ? (
                    <Input
                      id="fantasy_name"
                      value={formData.fantasy_name}
                      onChange={(e) => handleInputChange('fantasy_name', e.target.value)}
                      placeholder="Como é conhecido no mercado"
                      className="h-10 border-border/60"
                    />
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                      {client.fantasy_name || <span className="text-muted-foreground">Não informado</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sector" className="text-xs font-medium text-muted-foreground">Setor de Atuação *</Label>
                  {isEditing ? (
                    <>
                      <Select
                        value={formData.sector}
                        onValueChange={(value) => handleInputChange('sector', value)}
                      >
                        <SelectTrigger className={`h-10 ${errors.sector ? "border-destructive" : "border-border/60"}`}>
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
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">{client.sector}</p>
                  )}
                </div>

                {isEditing && formData.sector === "Outros" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="other_sector" className="text-xs font-medium text-muted-foreground">Informe o setor de atuação *</Label>
                    <Input
                      id="other_sector"
                      value={formData.other_sector}
                      onChange={(e) => handleInputChange('other_sector', e.target.value)}
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
                  {isEditing ? (
                    <>
                      <Select
                        value={formData.size}
                        onValueChange={(value) => handleInputChange('size', value)}
                      >
                        <SelectTrigger className={`h-10 ${errors.size ? "border-destructive" : "border-border/60"}`}>
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
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                      {SIZE_OPTIONS.find(o => client.size?.startsWith(o.value))?.label || client.size}
                      {SIZE_OPTIONS.find(o => client.size?.startsWith(o.value))?.description && (
                        <span className="text-muted-foreground ml-1">
                          {SIZE_OPTIONS.find(o => client.size?.startsWith(o.value))?.description}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="commercial_phone" className="text-xs font-medium text-muted-foreground">Telefone Comercial</Label>
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
                          className="h-10 border-border/60"
                        />
                      )}
                    </InputMask>
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      Não informado
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">Número fixo da empresa para contato geral.</p>
                </div>
              </div>

              {/* Franquia */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Possui Franquia</Label>
                  {isEditing ? (
                    <div className="flex gap-6 pt-1">
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
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                      {formData.hasFranchise === "sim" ? "Sim" : "Não"}
                    </p>
                  )}
                </div>

                {formData.hasFranchise === "sim" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/20 border border-border/30">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="franchise_brand" className="text-xs font-medium text-muted-foreground">Nome da Marca Franqueadora *</Label>
                      {isEditing ? (
                        <>
                          <Input
                            id="franchise_brand"
                            value={formData.franchise_brand}
                            onChange={(e) => handleInputChange('franchise_brand', e.target.value)}
                            placeholder="Ex: McDonald's, O Boticário"
                            className={`h-10 ${errors.franchise_brand ? "border-destructive" : "border-border/60"}`}
                          />
                          {errors.franchise_brand && <p className="text-xs text-destructive">{errors.franchise_brand}</p>}
                        </>
                      ) : (
                        <p className="text-sm py-2.5 px-3 bg-background rounded-lg border border-border/40">{formData.franchise_brand}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="franchise_units" className="text-xs font-medium text-muted-foreground">Quantidade de Unidades *</Label>
                      {isEditing ? (
                        <>
                          <Input
                            id="franchise_units"
                            type="number"
                            min="1"
                            value={formData.franchise_units}
                            onChange={(e) => handleInputChange('franchise_units', e.target.value)}
                            placeholder="Ex: 5"
                            className={`h-10 ${errors.franchise_units ? "border-destructive" : "border-border/60"}`}
                          />
                          {errors.franchise_units && <p className="text-xs text-destructive">{errors.franchise_units}</p>}
                        </>
                      ) : (
                        <p className="text-sm py-2.5 px-3 bg-background rounded-lg border border-border/40">{formData.franchise_units}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="franchise_city" className="text-xs font-medium text-muted-foreground">Cidade Principal da Matriz *</Label>
                      {isEditing ? (
                        <>
                          <Input
                            id="franchise_city"
                            value={formData.franchise_city}
                            onChange={(e) => handleInputChange('franchise_city', e.target.value)}
                            placeholder="Ex: São Paulo"
                            className={`h-10 ${errors.franchise_city ? "border-destructive" : "border-border/60"}`}
                          />
                          {errors.franchise_city && <p className="text-xs text-destructive">{errors.franchise_city}</p>}
                        </>
                      ) : (
                        <p className="text-sm py-2.5 px-3 bg-background rounded-lg border border-border/40">{formData.franchise_city}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Produtos e Serviços */}
              <div className="space-y-1.5">
                <Label htmlFor="products_services" className="text-xs font-medium text-muted-foreground">Produtos ou Serviços Oferecidos *</Label>
                {isEditing ? (
                  <>
                    <Textarea
                      id="products_services"
                      value={formData.products_services}
                      onChange={(e) => handleInputChange('products_services', e.target.value)}
                      placeholder="Descreva os principais produtos ou serviços oferecidos pela empresa"
                      rows={3}
                      className={`resize-none ${errors.products_services ? "border-destructive" : "border-border/60"}`}
                    />
                    {errors.products_services && <p className="text-xs text-destructive">{errors.products_services}</p>}
                  </>
                ) : (
                  <p className="text-sm py-3 px-3 bg-muted/30 rounded-lg border border-border/40 leading-relaxed">
                    {client.products_services || <span className="text-muted-foreground">Não informado</span>}
                  </p>
                )}
              </div>
            </FormSection>

          {/* Seção 2: Localização */}
          <FormSection title="Localização" icon={MapPin}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cep" className="text-xs font-medium text-muted-foreground">CEP</Label>
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
                          className="h-10 border-border/60"
                        />
                      )}
                    </InputMask>
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      {formData.cep || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="street" className="text-xs font-medium text-muted-foreground">Endereço (Rua/Avenida)</Label>
                  {isEditing ? (
                    <Input
                      id="street"
                      value={formData.street}
                      onChange={(e) => handleInputChange('street', e.target.value)}
                      placeholder="Nome da rua ou avenida"
                      className="h-10 border-border/60"
                    />
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      {formData.street || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="number" className="text-xs font-medium text-muted-foreground">Número</Label>
                  {isEditing ? (
                    <Input
                      id="number"
                      value={formData.number}
                      onChange={(e) => handleInputChange('number', e.target.value)}
                      placeholder="Nº"
                      className="h-10 border-border/60"
                    />
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      {formData.number || "Não informado"}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">Cidade</Label>
                  {isEditing ? (
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Cidade"
                      className="h-10 border-border/60"
                    />
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      {formData.city || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">Estado</Label>
                  {isEditing ? (
                    <Select
                      value={formData.state}
                      onValueChange={(value) => handleInputChange('state', value)}
                    >
                      <SelectTrigger className="h-10 border-border/60">
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
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      {formData.state || "Não informado"}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="complement" className="text-xs font-medium text-muted-foreground">Complemento</Label>
                  {isEditing ? (
                    <Input
                      id="complement"
                      value={formData.complement}
                      onChange={(e) => handleInputChange('complement', e.target.value)}
                      placeholder="Sala, andar, bloco..."
                      className="h-10 border-border/60"
                    />
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      {formData.complement || "Não informado"}
                    </p>
                  )}
                </div>
              </div>
          </FormSection>

          {/* Seção 3: Contato e Comunicação */}
          <FormSection title="Contato e Comunicação" icon={Phone}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="corporate_email" className="text-xs font-medium text-muted-foreground">E-mail Corporativo</Label>
                  {isEditing ? (
                    <Input
                      id="corporate_email"
                      type="email"
                      value={formData.corporate_email}
                      onChange={(e) => handleInputChange('corporate_email', e.target.value)}
                      placeholder="empresa@dominio.com"
                      className="h-10 border-border/60"
                    />
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      Não informado
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">E-mail oficial da empresa.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-mail de Contato *</Label>
                  {isEditing ? (
                    <>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="contato@empresa.com"
                        className={`h-10 ${errors.email ? "border-destructive" : "border-border/60"}`}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {client.email}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">E-mail do responsável pelo projeto.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">Telefone de Contato / WhatsApp *</Label>
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
                            className={`h-10 ${errors.phone ? "border-destructive" : "border-border/60"}`}
                          />
                        )}
                      </InputMask>
                      {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {client.phone}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">Número pessoal ou WhatsApp do responsável.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cpf" className="text-xs font-medium text-muted-foreground">CPF do Responsável</Label>
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
                          className="h-10 border-border/60"
                        />
                      )}
                    </InputMask>
                  ) : (
                    <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 text-muted-foreground">
                      Não informado
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">Opcional - CPF para emissão de notas.</p>
                </div>
              </div>
          </FormSection>

          {/* Seção: Logotipo do Cliente */}
          <FormSection title="Logotipo" icon={Image} contentClassName="space-y-3">
            <div className="flex items-start gap-6">
              <div className="shrink-0">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                  {previewLogo ? (
                    <img src={previewLogo} alt="Logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleLogoFileSelect} className="hidden" />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={isUploading}>
                    {isUploading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" />Escolher Imagem</>
                    )}
                  </Button>
                  {croppedBlob && (
                    <Button size="sm" onClick={handleUploadLogo} disabled={isUploading}>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Logo
                    </Button>
                  )}
                  {previewLogo && !croppedBlob && (
                    <Button variant="outline" size="sm" onClick={handleRemoveLogo} disabled={isUploading} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Formatos: PNG, JPG · Máx: 5MB · Recomendado: 256×256px
                </p>
              </div>
            </div>
          </FormSection>

          {/* Seção: Identidade Visual / Branding */}
          <FormSection title="Identidade Visual" icon={Building2} contentClassName="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="brand_primary_color" className="text-xs font-medium text-muted-foreground">Cor Primária</Label>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.brand_primary_color || "#000000"}
                      onChange={(e) => handleInputChange('brand_primary_color', e.target.value)}
                      className="h-10 w-10 rounded border border-border/60 cursor-pointer"
                    />
                    <Input
                      id="brand_primary_color"
                      value={formData.brand_primary_color}
                      onChange={(e) => handleInputChange('brand_primary_color', e.target.value)}
                      placeholder="#000000"
                      className="h-10 border-border/60 flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                    {formData.brand_primary_color ? (
                      <>
                        <span className="h-5 w-5 rounded-full border border-border/60 flex-shrink-0" style={{ backgroundColor: formData.brand_primary_color }} />
                        {formData.brand_primary_color}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Não informado</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brand_secondary_color" className="text-xs font-medium text-muted-foreground">Cor Secundária</Label>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.brand_secondary_color || "#000000"}
                      onChange={(e) => handleInputChange('brand_secondary_color', e.target.value)}
                      className="h-10 w-10 rounded border border-border/60 cursor-pointer"
                    />
                    <Input
                      id="brand_secondary_color"
                      value={formData.brand_secondary_color}
                      onChange={(e) => handleInputChange('brand_secondary_color', e.target.value)}
                      placeholder="#000000"
                      className="h-10 border-border/60 flex-1"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                    {formData.brand_secondary_color ? (
                      <>
                        <span className="h-5 w-5 rounded-full border border-border/60 flex-shrink-0" style={{ backgroundColor: formData.brand_secondary_color }} />
                        {formData.brand_secondary_color}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Não informado</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brand_font" className="text-xs font-medium text-muted-foreground">Tipografia</Label>
                {isEditing ? (
                  <Input
                    id="brand_font"
                    value={formData.brand_font}
                    onChange={(e) => handleInputChange('brand_font', e.target.value)}
                    placeholder="Ex: Montserrat, Roboto"
                    className="h-10 border-border/60"
                  />
                ) : (
                  <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40">
                    {formData.brand_font || <span className="text-muted-foreground">Não informado</span>}
                  </p>
                )}
              </div>
            </div>
           
            {/* Mascote */}
            <div className="space-y-3 pt-2 border-t border-border/30">
              <div className="flex items-center space-x-3">
                {isEditing ? (
                  <Checkbox
                    id="has_mascot"
                    checked={formData.has_mascot}
                    onCheckedChange={(checked) => {
                      setFormData(prev => ({ ...prev, has_mascot: !!checked }));
                      if (!checked) {
                        // Clear mascot when unchecking
                        if (previewMascot && !croppedMascotBlob) {
                          handleRemoveMascot();
                        }
                        setPreviewMascot(null);
                        setCroppedMascotBlob(null);
                      }
                    }}
                  />
                ) : (
                  <Checkbox id="has_mascot" checked={formData.has_mascot} disabled />
                )}
                <Label htmlFor="has_mascot" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Dog className="h-4 w-4 text-muted-foreground" />
                  Possui Mascote
                </Label>
              </div>

              {formData.has_mascot && (
                <div className="flex items-start gap-6 p-4 rounded-xl bg-muted/20 border border-border/30">
                  <div className="shrink-0">
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                      {previewMascot ? (
                        <img src={previewMascot} alt="Mascote preview" className="w-full h-full object-contain" />
                      ) : (
                        <Dog className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <input ref={mascotInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleMascotFileSelect} className="hidden" />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => mascotInputRef.current?.click()} disabled={isUploadingMascot}>
                        {isUploadingMascot ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                        ) : (
                          <><Upload className="h-4 w-4 mr-2" />Escolher Imagem</>
                        )}
                      </Button>
                      {croppedMascotBlob && (
                        <Button size="sm" onClick={handleUploadMascot} disabled={isUploadingMascot}>
                          <Save className="h-4 w-4 mr-2" />
                          Salvar Mascote
                        </Button>
                      )}
                      {previewMascot && !croppedMascotBlob && (
                        <Button variant="outline" size="sm" onClick={handleRemoveMascot} disabled={isUploadingMascot} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Formatos: PNG, JPG · Máx: 5MB · A imagem do mascote será usada na geração de posts por IA
                    </p>
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* Image Cropper - Logo */}
          {rawImageSrc && (
            <ImageCropper
              open={cropperOpen}
              onClose={() => { setCropperOpen(false); setRawImageSrc(null); }}
              imageSrc={rawImageSrc}
              onCropComplete={handleCropComplete}
              aspectRatio={1}
            />
          )}

          {/* Image Cropper - Mascot */}
          {rawMascotSrc && (
            <ImageCropper
              open={mascotCropperOpen}
              onClose={() => { setMascotCropperOpen(false); setRawMascotSrc(null); }}
              imageSrc={rawMascotSrc}
              onCropComplete={handleMascotCropComplete}
              aspectRatio={1}
            />
          )}

          {/* Informações do Sistema */}
          <FormSection title="Informações do Sistema" icon={Calendar}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Data de Cadastro</p>
                  <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 font-medium">
                    {client.created_at 
                      ? format(new Date(client.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                      : "Não disponível"
                    }
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Última Atualização</p>
                  <p className="text-sm py-2.5 px-3 bg-muted/30 rounded-lg border border-border/40 font-medium">
                    {client.updated_at 
                      ? format(new Date(client.updated_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                      : "Não disponível"
                    }
                  </p>
                </div>
              </div>
          </FormSection>
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
