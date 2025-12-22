import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Plus, Edit, Trash2, Building2, Upload, X, Image, Crop } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import BackButton from "@/components/BackButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ImageCropper } from "@/components/ImageCropper";
const ClientList = () => {
  const navigate = useNavigate();
  const {
    tenantId
  } = useTenant();
  const {
    setSelectedClient
  } = useSelectedClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Logo upload states
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [selectedClientForLogo, setSelectedClientForLogo] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    data: clients,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['tenant-clients', tenantId, searchTerm],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase.from('tenant_companies').select('*').eq('tenant_id', tenantId).order('created_at', {
        ascending: false
      });
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,sector.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId
  });
  const handleClientSelect = (client: any) => {
    setSelectedClient({
      id: client.id,
      name: client.name,
      fantasy_name: client.fantasy_name,
      cnpj_cpf: client.cnpj_cpf,
      email: client.email
    });
    toast.success(`Cliente ${client.fantasy_name || client.name} selecionado`);
    navigate('/client-hub');
  };
  const handleDelete = async () => {
    if (!deleteId || !tenantId) return;
    setIsDeleting(true);
    try {
      const {
        error
      } = await supabase.from('tenant_companies').delete().eq('id', deleteId).eq('tenant_id', tenantId);
      if (error) throw error;
      toast.success("Cliente removido com sucesso");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover cliente");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };
  const openLogoModal = (client: any) => {
    setSelectedClientForLogo(client);
    setPreviewUrl(client.logo_url || null);
    setLogoModalOpen(true);
  };
  const closeLogoModal = () => {
    setLogoModalOpen(false);
    setSelectedClientForLogo(null);
    setPreviewUrl(null);
    setRawImageSrc(null);
    setCroppedBlob(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG ou JPEG.");
      return;
    }

    // Validate file size (max 5MB for raw image before crop)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB.");
      return;
    }

    // Create preview and open cropper
    const reader = new FileReader();
    reader.onloadend = () => {
      const imageSrc = reader.result as string;
      setRawImageSrc(imageSrc);
      setCropperOpen(true);
    };
    reader.readAsDataURL(file);
  };
  const handleCropComplete = (blob: Blob) => {
    setCroppedBlob(blob);
    const previewUrl = URL.createObjectURL(blob);
    setPreviewUrl(previewUrl);
    setCropperOpen(false);
  };
  const handleUploadLogo = async () => {
    if (!selectedClientForLogo || !croppedBlob) {
      toast.error("Recorte uma imagem primeiro");
      return;
    }
    setUploading(true);
    try {
      // Delete old logo if exists
      if (selectedClientForLogo.logo_url) {
        const oldPath = selectedClientForLogo.logo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('company-logos').remove([`${selectedClientForLogo.id}/${oldPath}`]);
        }
      }

      // Upload cropped image
      const fileName = `${Date.now()}.png`;
      const filePath = `${selectedClientForLogo.id}/${fileName}`;
      const {
        error: uploadError
      } = await supabase.storage.from('company-logos').upload(filePath, croppedBlob, {
        upsert: true,
        contentType: 'image/png'
      });
      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: urlData
      } = supabase.storage.from('company-logos').getPublicUrl(filePath);

      // Update client record
      const {
        error: updateError
      } = await supabase.from('tenant_companies').update({
        logo_url: urlData.publicUrl
      }).eq('id', selectedClientForLogo.id);
      if (updateError) throw updateError;
      toast.success("Logo atualizada com sucesso!");
      refetch();
      closeLogoModal();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Erro ao fazer upload da logo");
    } finally {
      setUploading(false);
    }
  };
  const handleRemoveLogo = async () => {
    if (!selectedClientForLogo) return;
    setUploading(true);
    try {
      // Delete from storage if exists
      if (selectedClientForLogo.logo_url) {
        const pathParts = selectedClientForLogo.logo_url.split('/company-logos/');
        if (pathParts[1]) {
          await supabase.storage.from('company-logos').remove([pathParts[1]]);
        }
      }

      // Update client record
      const {
        error
      } = await supabase.from('tenant_companies').update({
        logo_url: null
      }).eq('id', selectedClientForLogo.id);
      if (error) throw error;
      toast.success("Logo removida com sucesso!");
      refetch();
      closeLogoModal();
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover logo");
    } finally {
      setUploading(false);
    }
  };
  const handleOpenCropper = () => {
    if (rawImageSrc) {
      setCropperOpen(true);
    }
  };
  return <>
      <div className="pb-8">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header */}
          <div className="mb-8 sm:mb-12 text-center relative">
            <div className="absolute left-0 top-0">
              <BackButton to="/home" />
            </div>
            
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 break-words px-2">
              Gerenciar Clientes
            </h1>
            
          </div>

          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, setor ou e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Button variant={editMode ? "default" : "outline"} onClick={() => setEditMode(!editMode)} className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Modo Edição
            </Button>
          </div>

          {/* Client Grid */}
          {isLoading ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({
            length: 4
          }).map((_, i) => <Card key={i} className="overflow-hidden">
                  <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-muted animate-pulse mb-3 sm:mb-4" />
                    <div className="h-5 w-24 bg-muted rounded animate-pulse" />
                  </div>
                </Card>)}
            </div> : !clients || clients.length === 0 ? <div className="text-center py-12 sm:py-20 px-4">
              <Building2 className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <p className="text-base sm:text-lg font-medium mb-2">Nenhum cliente cadastrado ainda</p>
              <p className="text-sm text-muted-foreground mb-4">
                Comece adicionando seu primeiro cliente
              </p>
              <Button onClick={() => navigate("/registration")} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Primeiro Cliente
              </Button>
            </div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {clients.map(client => <div key={client.id} className="relative">
                  {editMode && <div className="absolute top-2 right-2 z-10 flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="secondary" size="icon" onClick={() => openLogoModal(client)} title="Editar logo" className="h-8 w-8">
                        <Image className="h-4 w-4" />
                      </Button>
                      <Button variant="secondary" size="icon" onClick={() => navigate(`/clientes/${client.id}`)} title="Editar cliente" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="secondary" size="icon" onClick={() => setDeleteId(client.id)} title="Excluir cliente" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>}
                  <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={() => !editMode && handleClientSelect(client)}>
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-5 group-hover:opacity-10 transition-opacity" />
                    
                    <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                      {client.logo_url ? <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 bg-muted flex items-center justify-center">
                          <img src={client.logo_url} alt={`Logo de ${client.fantasy_name || client.name}`} className="w-full h-full object-contain" onError={e => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><svg class="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg></div>';
                  }} />
                        </div> : <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                          <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                        </div>}
                      
                      <h3 className="text-base sm:text-xl font-bold transition-colors text-indigo-600 dark:text-indigo-400 line-clamp-2">
                        {client.fantasy_name || client.name}
                      </h3>
                    </div>
                  </Card>
                </div>)}
            </div>}
        </div>
      </div>

      {/* Logo Upload Modal */}
      <Dialog open={logoModalOpen} onOpenChange={open => !open && closeLogoModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Logo do Cliente</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Preview */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-32 h-32 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted">
                {previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" /> : <Building2 className="w-12 h-12 text-muted-foreground" />}
              </div>
              
              {/* Re-crop button */}
              {rawImageSrc && previewUrl && <Button variant="outline" size="sm" onClick={handleOpenCropper}>
                  <Crop className="h-4 w-4 mr-2" />
                  Ajustar Recorte
                </Button>}
            </div>

            {/* File Input */}
            <div className="space-y-2">
              <Label htmlFor="logo-upload">Selecionar imagem</Label>
              <Input id="logo-upload" type="file" accept=".png,.jpg,.jpeg" ref={fileInputRef} onChange={handleFileSelect} className="cursor-pointer" />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: PNG, JPG, JPEG. Tamanho máximo: 5MB
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedClientForLogo?.logo_url && <Button variant="destructive" onClick={handleRemoveLogo} disabled={uploading} className="w-full sm:w-auto">
                <X className="h-4 w-4 mr-2" />
                Remover Logo
              </Button>}
            <Button onClick={handleUploadLogo} disabled={uploading || !croppedBlob} className="w-full sm:w-auto">
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Enviando..." : "Salvar Logo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Cropper */}
      {rawImageSrc && <ImageCropper open={cropperOpen} onClose={() => setCropperOpen(false)} imageSrc={rawImageSrc} onCropComplete={handleCropComplete} aspectRatio={1} />}

      <ConfirmationModal open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)} title="Confirmar Exclusão" description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita." onConfirm={handleDelete} loading={isDeleting} />
    </>;
};
export default ClientList;