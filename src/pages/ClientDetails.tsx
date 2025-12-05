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
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, X, Loader2, Trash2, Pencil, Building2, Mail, Phone, FileText, Briefcase, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientFormData {
  name: string;
  fantasy_name: string;
  cnpj_cpf: string;
  sector: string;
  size: string;
  products_services: string;
  email: string;
  phone: string;
}

const SECTOR_OPTIONS = [
  "Tecnologia",
  "Saúde",
  "Educação",
  "Varejo",
  "Serviços",
  "Indústria",
  "Alimentação",
  "Beleza e Estética",
  "Construção",
  "Financeiro",
  "Jurídico",
  "Marketing",
  "Consultoria",
  "Outro"
];

const SIZE_OPTIONS = [
  { value: "micro", label: "Micro (1-10 funcionários)" },
  { value: "pequena", label: "Pequena (10-20 funcionários)" },
  { value: "media", label: "Média (21-100 funcionários)" },
  { value: "grande", label: "Grande (+100 funcionários)" }
];

const ClientDetails = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>({
    name: "",
    fantasy_name: "",
    cnpj_cpf: "",
    sector: "",
    size: "",
    products_services: "",
    email: "",
    phone: ""
  });

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
      setFormData({
        name: client.name || "",
        fantasy_name: client.fantasy_name || "",
        cnpj_cpf: client.cnpj_cpf || "",
        sector: client.sector || "",
        size: client.size || "",
        products_services: client.products_services || "",
        email: client.email || "",
        phone: client.phone || ""
      });
    }
  }, [client]);

  const handleInputChange = (field: keyof ClientFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!id || !tenantId) return;

    // Validation
    if (!formData.name.trim()) {
      toast.error("Razão Social é obrigatória");
      return;
    }
    if (!formData.email.trim()) {
      toast.error("E-mail é obrigatório");
      return;
    }
    if (!formData.phone.trim()) {
      toast.error("Telefone é obrigatório");
      return;
    }
    if (!formData.sector) {
      toast.error("Setor é obrigatório");
      return;
    }
    if (!formData.size) {
      toast.error("Tamanho da empresa é obrigatório");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .update({
          name: formData.name.trim(),
          fantasy_name: formData.fantasy_name.trim() || null,
          cnpj_cpf: formData.cnpj_cpf.trim(),
          sector: formData.sector,
          size: formData.size,
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
    // Reset form to original values
    if (client) {
      setFormData({
        name: client.name || "",
        fantasy_name: client.fantasy_name || "",
        cnpj_cpf: client.cnpj_cpf || "",
        sector: client.sector || "",
        size: client.size || "",
        products_services: client.products_services || "",
        email: client.email || "",
        phone: client.phone || ""
      });
    }
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

          {/* Identificação da Empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Identificação da Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Razão Social *</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Nome oficial da empresa"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{client.name}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="fantasy_name">Nome Fantasia</Label>
                  {isEditing ? (
                    <Input
                      id="fantasy_name"
                      value={formData.fantasy_name}
                      onChange={(e) => handleInputChange('fantasy_name', e.target.value)}
                      placeholder="Nome comercial"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">
                      {client.fantasy_name || <span className="text-muted-foreground">Não informado</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cnpj_cpf">CNPJ/CPF</Label>
                  {isEditing ? (
                    <Input
                      id="cnpj_cpf"
                      value={formData.cnpj_cpf}
                      onChange={(e) => handleInputChange('cnpj_cpf', e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{client.cnpj_cpf}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sector">Setor de Atuação *</Label>
                  {isEditing ? (
                    <Select
                      value={formData.sector}
                      onValueChange={(value) => handleInputChange('sector', value)}
                    >
                      <SelectTrigger>
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
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">{client.sector}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="size">Tamanho da Empresa *</Label>
                  {isEditing ? (
                    <Select
                      value={formData.size}
                      onValueChange={(value) => handleInputChange('size', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIZE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md">
                      {SIZE_OPTIONS.find(o => o.value === client.size)?.label || client.size}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contato */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Informações de Contato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="contato@empresa.com"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2 px-3 bg-muted/50 rounded-md">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {client.email}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone *</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm py-2 px-3 bg-muted/50 rounded-md">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {client.phone}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Produtos e Serviços */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Briefcase className="h-5 w-5 text-primary" />
                Produtos e Serviços
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="products_services">Descrição dos produtos ou serviços oferecidos</Label>
                {isEditing ? (
                  <Textarea
                    id="products_services"
                    value={formData.products_services}
                    onChange={(e) => handleInputChange('products_services', e.target.value)}
                    placeholder="Descreva os principais produtos ou serviços da empresa..."
                    rows={4}
                  />
                ) : (
                  <p className="text-sm py-3 px-3 bg-muted/50 rounded-md leading-relaxed">
                    {client.products_services || <span className="text-muted-foreground">Não informado</span>}
                  </p>
                )}
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
                      : 'N/A'
                    }
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Última Atualização</p>
                  <p className="font-medium">
                    {client.updated_at 
                      ? format(new Date(client.updated_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
                      : 'N/A'
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
        title="Confirmar Exclusão"
        description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita e todos os dados associados (estratégias, planos, demandas) serão perdidos."
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
};

export default ClientDetails;
