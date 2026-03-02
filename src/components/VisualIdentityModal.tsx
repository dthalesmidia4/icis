import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Palette, Dog, Save, Upload, Trash2, GripVertical, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VisualIdentityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: {
    id: string;
    name: string;
    fantasy_name?: string | null;
    brand_primary_color?: string | null;
    brand_secondary_color?: string | null;
    brand_font?: string | null;
    has_mascot?: boolean;
    mascot_description?: string | null;
    mascot_url?: string | null;
    tenant_id: string;
  };
}

type Tab = "menu" | "visual" | "mascot";

interface MascotImage {
  id: string;
  image_url: string;
  file_name: string | null;
  position: number;
}

const VisualIdentityModal = ({ open, onOpenChange, company }: VisualIdentityModalProps) => {
  const [tab, setTab] = useState<Tab>("menu");
  
  // Visual Identity fields
  const [primaryColor, setPrimaryColor] = useState(company.brand_primary_color || "#000000");
  const [secondaryColor, setSecondaryColor] = useState(company.brand_secondary_color || "#000000");
  const [highlightColor, setHighlightColor] = useState("#D6D2B5");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [fontName, setFontName] = useState(company.brand_font || "");
  const [savingVisual, setSavingVisual] = useState(false);

  // Mascot fields
  const [mascotDescription, setMascotDescription] = useState(company.mascot_description || "");
  const [mascotImages, setMascotImages] = useState<MascotImage[]>([]);
  const [uploadingMascot, setUploadingMascot] = useState(false);
  const [savingMascot, setSavingMascot] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setTab("menu");
      setPrimaryColor(company.brand_primary_color || "#000000");
      setSecondaryColor(company.brand_secondary_color || "#000000");
      setFontName(company.brand_font || "");
      setMascotDescription(company.mascot_description || "");
      fetchMascotImages();
    }
  }, [open, company]);

  const fetchMascotImages = async () => {
    const { data } = await supabase
      .from('company_mascot_images')
      .select('*')
      .eq('company_id', company.id)
      .order('position', { ascending: true });
    if (data) setMascotImages(data);
  };

  const handleSaveVisual = async () => {
    setSavingVisual(true);
    try {
      const { error } = await supabase
        .from('tenant_companies')
        .update({
          brand_primary_color: primaryColor,
          brand_secondary_color: secondaryColor,
          brand_font: fontName,
        })
        .eq('id', company.id);
      if (error) throw error;
      toast.success("Identidade visual salva!");
    } catch {
      toast.error("Erro ao salvar identidade visual");
    } finally {
      setSavingVisual(false);
    }
  };

  const handleMascotUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingMascot(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const ext = file.name.split('.').pop();
        const path = `${company.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        
        const { error: uploadError } = await supabase.storage
          .from('mascot-images')
          .upload(path, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('mascot-images')
          .getPublicUrl(path);

        await supabase.from('company_mascot_images').insert({
          company_id: company.id,
          tenant_id: company.tenant_id,
          image_url: urlData.publicUrl,
          file_name: file.name,
          position: mascotImages.length,
        });
      }
      toast.success("Imagem(ns) do mascote enviada(s)!");
      fetchMascotImages();
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingMascot(false);
    }
  };

  const handleDeleteImage = async (img: MascotImage) => {
    try {
      // Extract path from URL
      const urlParts = img.image_url.split('/mascot-images/');
      if (urlParts.length > 1) {
        await supabase.storage.from('mascot-images').remove([urlParts[1]]);
      }
      await supabase.from('company_mascot_images').delete().eq('id', img.id);
      setMascotImages(prev => prev.filter(m => m.id !== img.id));
      toast.success("Imagem removida");
    } catch {
      toast.error("Erro ao remover imagem");
    }
  };

  const handleSaveMascot = async () => {
    setSavingMascot(true);
    try {
      await supabase
        .from('tenant_companies')
        .update({
          mascot_description: mascotDescription,
          has_mascot: mascotImages.length > 0 || mascotDescription.length > 0,
          mascot_url: mascotImages.length > 0 ? mascotImages[0].image_url : null,
        })
        .eq('id', company.id);

      // Update positions
      for (let i = 0; i < mascotImages.length; i++) {
        await supabase
          .from('company_mascot_images')
          .update({ position: i })
          .eq('id', mascotImages[i].id);
      }

      toast.success("Mascote salvo!");
    } catch {
      toast.error("Erro ao salvar mascote");
    } finally {
      setSavingMascot(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const dragIndex = dragItemRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    
    const updated = [...mascotImages];
    const [removed] = updated.splice(dragIndex, 1);
    updated.splice(dropIndex, 0, removed);
    setMascotImages(updated);
    dragItemRef.current = null;
  };

  // Drop zone for file upload
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleMascotUpload(e.dataTransfer.files);
  }, [mascotImages.length]);

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const ColorInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value.replace('#', '')}
          onChange={(e) => onChange(`#${e.target.value.replace('#', '')}`)}
          className="flex-1 font-mono"
          placeholder="000000"
          maxLength={7}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-input cursor-pointer p-0.5"
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl !flex !flex-col overflow-hidden max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {tab !== "menu" && (
              <Button variant="ghost" size="icon" onClick={() => setTab("menu")} className="shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <DialogTitle className="text-xl">
              {tab === "menu" && "Identidade Visual"}
              {tab === "visual" && "Editar Identidade Visual"}
              {tab === "mascot" && "Mascote da Marca"}
            </DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {company.fantasy_name || company.name}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Menu */}
          {tab === "menu" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 py-4">
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => setTab("visual")}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Palette className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">ID Visual</h3>
                  <p className="text-xs text-muted-foreground">Cores, tipografia e elementos visuais da marca.</p>
                </div>
              </Card>
              <Card
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => setTab("mascot")}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Dog className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">Mascote</h3>
                  <p className="text-xs text-muted-foreground">Imagens de referência e descrição do mascote da marca.</p>
                </div>
              </Card>
            </div>
          )}

          {/* Visual Identity Tab */}
          {tab === "visual" && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorInput label="Cor Primária" value={primaryColor} onChange={setPrimaryColor} />
                <ColorInput label="Cor Secundária" value={secondaryColor} onChange={setSecondaryColor} />
                <ColorInput label="Cor de Destaque" value={highlightColor} onChange={setHighlightColor} />
                <ColorInput label="Cor do Texto" value={textColor} onChange={setTextColor} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nome da Fonte</Label>
                <Input
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  placeholder="Ex: Poppins, Montserrat, Inter..."
                />
              </div>
              <Button onClick={handleSaveVisual} disabled={savingVisual} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {savingVisual ? "Salvando..." : "Salvar Identidade Visual"}
              </Button>
            </div>
          )}

          {/* Mascot Tab */}
          {tab === "mascot" && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Descrição do Mascote</Label>
                <Textarea
                  value={mascotDescription}
                  onChange={(e) => setMascotDescription(e.target.value)}
                  placeholder="Descreva as características do mascote: personalidade, estilo, cores..."
                  rows={3}
                />
              </div>

              {/* Upload zone */}
              <div
                ref={dropZoneRef}
                onDrop={handleFileDrop}
                onDragOver={handleFileDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste e solte imagens aqui</p>
                <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                {uploadingMascot && <p className="text-xs text-primary mt-2 animate-pulse">Enviando...</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleMascotUpload(e.target.files)}
              />

              {/* Images gallery */}
              {mascotImages.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Imagens do Mascote ({mascotImages.length})</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {mascotImages.map((img, index) => (
                      <div
                        key={img.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={() => setDragOverIndex(null)}
                        className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
                          dragOverIndex === index ? 'border-primary scale-105' : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <img
                          src={img.image_url}
                          alt={img.file_name || "Mascote"}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <GripVertical className="w-5 h-5 text-white" />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="w-8 h-8"
                            onClick={(e) => { e.stopPropagation(); handleDeleteImage(img); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {index === 0 && (
                          <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">
                            Principal
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleSaveMascot} disabled={savingMascot} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {savingMascot ? "Salvando..." : "Salvar Mascote"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisualIdentityModal;
