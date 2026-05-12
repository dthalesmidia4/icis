import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Dog, Save, Upload, Trash2, GripVertical, ArrowLeft, Plus, Check, Pencil, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VisualIdentityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  tenantId: string;
}

type Tab = "menu" | "visual" | "mascot" | "logo";

interface MascotImage {
  id: string;
  image_url: string;
  file_name: string | null;
  position: number;
}

interface Preset {
  id: string;
  name: string;
  primary_color: string | null;
  secondary_color: string | null;
  highlight_color: string | null;
  text_color: string | null;
  auxiliary_color: string | null;
  font_name: string | null;
  secondary_font: string | null;
  is_active: boolean;
}

const LOGO_POSITIONS = [
  { value: "top-left", label: "Canto Superior Esquerdo" },
  { value: "top-right", label: "Canto Superior Direito" },
  { value: "bottom-left", label: "Canto Inferior Esquerdo" },
  { value: "bottom-right", label: "Canto Inferior Direito" },
  { value: "bottom-center", label: "Centro Inferior" },
];

const LOGO_SIZES = [
  { value: "small", label: "Pequeno" },
  { value: "medium", label: "Médio" },
  { value: "large", label: "Grande" },
];

const VisualIdentityModal = ({ open, onOpenChange, companyId, companyName, tenantId }: VisualIdentityModalProps) => {
  const [tab, setTab] = useState<Tab>("menu");
  const [loadingCompany, setLoadingCompany] = useState(false);
  
  // Visual Identity fields
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [secondaryColor, setSecondaryColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#D6D2B5");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [fontName, setFontName] = useState("");
  const [savingVisual, setSavingVisual] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Presets
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState("");

  // Mascot fields
  const [mascotDescription, setMascotDescription] = useState("");
  const [mascotImages, setMascotImages] = useState<MascotImage[]>([]);
  const [uploadingMascot, setUploadingMascot] = useState(false);
  const [savingMascot, setSavingMascot] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Logo fields
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState("bottom-right");
  const [logoSize, setLogoSize] = useState("medium");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const fetchCompanyData = async () => {
    setLoadingCompany(true);
    const { data } = await supabase
      .from('tenant_companies')
      .select('brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, mascot_url, logo_url, logo_position, logo_size')
      .eq('id', companyId)
      .single();
    if (data) {
      setPrimaryColor(data.brand_primary_color || "#000000");
      setSecondaryColor(data.brand_secondary_color || "#000000");
      setFontName(data.brand_font || "");
      setMascotDescription(data.mascot_description || "");
      setLogoUrl(data.logo_url || null);
      setLogoPosition(data.logo_position || "bottom-right");
      setLogoSize(data.logo_size || "medium");
    }
    setLoadingCompany(false);
  };

  useEffect(() => {
    if (open) {
      setTab("menu");
      setPresetName("");
      fetchCompanyData();
      fetchMascotImages();
      fetchPresets();
    }
  }, [open, companyId]);

  const fetchPresets = async () => {
    const { data } = await supabase
      .from('visual_identity_presets')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (data) setPresets(data as Preset[]);
  };

  const fetchMascotImages = async () => {
    const { data } = await supabase
      .from('company_mascot_images')
      .select('*')
      .eq('company_id', companyId)
      .order('position', { ascending: true });
    if (data) setMascotImages(data);
  };

  const handleSaveVisual = async () => {
    if (!presetName.trim()) {
      toast.error("Dê um nome para a predefinição");
      return;
    }
    setSavingVisual(true);
    try {
      await supabase
        .from('tenant_companies')
        .update({
          brand_primary_color: primaryColor,
          brand_secondary_color: secondaryColor,
          brand_font: fontName,
        })
        .eq('id', companyId);

      await supabase.from('visual_identity_presets').insert({
        company_id: companyId,
        tenant_id: tenantId,
        name: presetName.trim(),
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        highlight_color: highlightColor,
        text_color: textColor,
        font_name: fontName,
        is_active: false,
      });

      setPresetName("");
      toast.success("Predefinição salva!");
      fetchPresets();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSavingVisual(false);
    }
  };

  const handleLoadPreset = (preset: Preset) => {
    setPrimaryColor(preset.primary_color || "#000000");
    setSecondaryColor(preset.secondary_color || "#000000");
    setHighlightColor(preset.highlight_color || "#D6D2B5");
    setTextColor(preset.text_color || "#FFFFFF");
    setFontName(preset.font_name || "");
    toast.success(`Predefinição "${preset.name}" carregada`);
  };

  const handleDeletePreset = async (id: string) => {
    await supabase.from('visual_identity_presets').delete().eq('id', id);
    setPresets(prev => prev.filter(p => p.id !== id));
    toast.success("Predefinição removida");
  };

  const handleRenamePreset = async (id: string) => {
    if (!editingPresetName.trim()) return;
    await supabase.from('visual_identity_presets').update({ name: editingPresetName.trim() }).eq('id', id);
    setPresets(prev => prev.map(p => p.id === id ? { ...p, name: editingPresetName.trim() } : p));
    setEditingPresetId(null);
    setEditingPresetName("");
  };

  // Mascot handlers
  const handleMascotUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingMascot(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const ext = file.name.split('.').pop();
        const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('mascot-images').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('mascot-images').getPublicUrl(path);
        await supabase.from('company_mascot_images').insert({
          company_id: companyId, tenant_id: tenantId,
          image_url: urlData.publicUrl, file_name: file.name, position: mascotImages.length,
        });
      }
      toast.success("Imagem(ns) enviada(s)!");
      fetchMascotImages();
    } catch { toast.error("Erro ao enviar imagem"); }
    finally { setUploadingMascot(false); }
  };

  const handleDeleteImage = async (img: MascotImage) => {
    try {
      const urlParts = img.image_url.split('/mascot-images/');
      if (urlParts.length > 1) await supabase.storage.from('mascot-images').remove([urlParts[1]]);
      await supabase.from('company_mascot_images').delete().eq('id', img.id);
      setMascotImages(prev => prev.filter(m => m.id !== img.id));
      toast.success("Imagem removida");
    } catch { toast.error("Erro ao remover imagem"); }
  };

  const handleSaveMascot = async () => {
    setSavingMascot(true);
    try {
      await supabase.from('tenant_companies').update({
        mascot_description: mascotDescription,
        has_mascot: mascotImages.length > 0 || mascotDescription.length > 0,
        mascot_url: mascotImages.length > 0 ? mascotImages[0].image_url : null,
      }).eq('id', companyId);
      for (let i = 0; i < mascotImages.length; i++) {
        await supabase.from('company_mascot_images').update({ position: i }).eq('id', mascotImages[i].id);
      }
      toast.success("Mascote salvo!");
    } catch { toast.error("Erro ao salvar mascote"); }
    finally { setSavingMascot(false); }
  };

  const handleDragStart = (index: number) => { dragItemRef.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index); };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault(); setDragOverIndex(null);
    const dragIndex = dragItemRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;
    const updated = [...mascotImages];
    const [removed] = updated.splice(dragIndex, 1);
    updated.splice(dropIndex, 0, removed);
    setMascotImages(updated);
    dragItemRef.current = null;
  };
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); handleMascotUpload(e.dataTransfer.files);
  }, [mascotImages.length]);
  const handleFileDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  // Logo handlers
  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) { toast.error("Selecione um arquivo de imagem"); return; }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${companyId}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
      const newUrl = urlData.publicUrl;
      await supabase.from('tenant_companies').update({ logo_url: newUrl }).eq('id', companyId);
      setLogoUrl(newUrl);
      toast.success("Logo enviada com sucesso!");
    } catch { toast.error("Erro ao enviar logo"); }
    finally { setUploadingLogo(false); }
  };

  const handleRemoveLogo = async () => {
    try {
      if (logoUrl) {
        const urlParts = logoUrl.split('/company-logos/');
        if (urlParts.length > 1) await supabase.storage.from('company-logos').remove([urlParts[1]]);
      }
      await supabase.from('tenant_companies').update({ logo_url: null }).eq('id', companyId);
      setLogoUrl(null);
      toast.success("Logo removida");
    } catch { toast.error("Erro ao remover logo"); }
  };

  const handleSaveLogo = async () => {
    setSavingLogo(true);
    try {
      await supabase.from('tenant_companies').update({
        logo_position: logoPosition,
        logo_size: logoSize,
      }).eq('id', companyId);
      toast.success("Configurações da logo salvas!");
    } catch { toast.error("Erro ao salvar configurações"); }
    finally { setSavingLogo(false); }
  };

  const handleLogoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); handleLogoUpload(e.dataTransfer.files);
  }, []);

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
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-input cursor-pointer p-0.5" />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`!flex !flex-col overflow-hidden max-h-[90vh] ${tab === "visual" ? "sm:max-w-4xl" : "sm:max-w-2xl"}`}>
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
              {tab === "logo" && "Logo da Marca"}
            </DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">{companyName}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Menu */}
          {tab === "menu" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 py-4">
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={() => setTab("visual")}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Palette className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">ID Visual</h3>
                  <p className="text-xs text-muted-foreground">Cores, tipografia e elementos visuais da marca.</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={() => setTab("mascot")}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Dog className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">Mascote</h3>
                  <p className="text-xs text-muted-foreground">Imagens de referência e descrição do mascote.</p>
                </div>
              </Card>
              <Card className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]" onClick={() => setTab("logo")}>
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                    <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold transition-colors text-primary mb-2">Logo</h3>
                  <p className="text-xs text-muted-foreground">Upload e configuração da logo nos posts gerados.</p>
                </div>
              </Card>
            </div>
          )}

          {/* Visual Identity Tab - with presets sidebar */}
          {tab === "visual" && (
            <div className="flex flex-col sm:flex-row gap-6 py-4">
              {/* Form */}
              <div className="flex-1 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorInput label="Cor Primária" value={primaryColor} onChange={setPrimaryColor} />
                  <ColorInput label="Cor Secundária" value={secondaryColor} onChange={setSecondaryColor} />
                  <ColorInput label="Cor de Destaque" value={highlightColor} onChange={setHighlightColor} />
                  <ColorInput label="Cor do Texto" value={textColor} onChange={setTextColor} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Nome da Fonte</Label>
                  <Input value={fontName} onChange={(e) => setFontName(e.target.value)} placeholder="Ex: Poppins, Montserrat, Inter..." />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Nome da Predefinição</Label>
                  <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Ex: Paleta Principal, Versão Natal..." />
                </div>
                <Button onClick={handleSaveVisual} disabled={savingVisual} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {savingVisual ? "Salvando..." : "Salvar Predefinição"}
                </Button>
              </div>

              {/* Presets sidebar */}
              <div className="sm:w-56 shrink-0 space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Predefinições
                </Label>
                {presets.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma predefinição salva ainda.</p>
                )}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="rounded-xl border border-border hover:border-primary/50 p-3 cursor-pointer transition-all hover:shadow-md group"
                      onClick={() => handleLoadPreset(preset)}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        {[preset.primary_color, preset.secondary_color, preset.highlight_color, preset.text_color]
                          .filter(Boolean)
                          .map((color, i) => (
                            <div key={i} className="w-5 h-5 rounded-full border border-border shrink-0" style={{ backgroundColor: color || '#000' }} />
                          ))}
                      </div>
                      {editingPresetId === preset.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingPresetName}
                            onChange={(e) => setEditingPresetName(e.target.value)}
                            className="h-7 text-xs"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRenamePreset(preset.id); }}
                          />
                          <Button size="icon" variant="ghost" className="w-6 h-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleRenamePreset(preset.id); }}>
                            <Check className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate">{preset.name}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={(e) => { e.stopPropagation(); setEditingPresetId(preset.id); setEditingPresetName(preset.name); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.id); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {preset.font_name && (
                        <span className="text-[10px] text-muted-foreground mt-1 block">{preset.font_name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mascot Tab */}
          {tab === "mascot" && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Descrição do Mascote</Label>
                <Textarea value={mascotDescription} onChange={(e) => setMascotDescription(e.target.value)}
                  placeholder="Descreva as características do mascote: personalidade, estilo, cores..." rows={3} />
              </div>
              <div ref={dropZoneRef} onDrop={handleFileDrop} onDragOver={handleFileDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-xl p-8 text-center cursor-pointer transition-colors">
                <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste e solte imagens aqui</p>
                <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                {uploadingMascot && <p className="text-xs text-primary mt-2 animate-pulse">Enviando...</p>}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => handleMascotUpload(e.target.files)} />
              {mascotImages.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Imagens do Mascote ({mascotImages.length})</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {mascotImages.map((img, index) => (
                      <div key={img.id} draggable onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)} onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={() => setDragOverIndex(null)}
                        className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
                          dragOverIndex === index ? 'border-primary scale-105' : 'border-border hover:border-primary/50'}`}>
                        <img src={img.image_url} alt={img.file_name || "Mascote"} className="w-full aspect-square object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <GripVertical className="w-5 h-5 text-white" />
                          <Button variant="destructive" size="icon" className="w-8 h-8"
                            onClick={(e) => { e.stopPropagation(); handleDeleteImage(img); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {index === 0 && (
                          <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">Principal</div>
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

          {/* Logo Tab */}
          {tab === "logo" && (
            <div className="space-y-6 py-4">
              {/* Logo Preview */}
              {logoUrl ? (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Logo Atual</Label>
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-32 rounded-xl border-2 border-border overflow-hidden bg-muted flex items-center justify-center">
                      <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingLogo ? "Enviando..." : "Trocar Logo"}
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={handleRemoveLogo}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDrop={handleLogoDrop}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={() => logoInputRef.current?.click()}
                  className="border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-xl p-8 text-center cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Arraste e solte a logo aqui</p>
                  <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                  {uploadingLogo && <p className="text-xs text-primary mt-2 animate-pulse">Enviando...</p>}
                </div>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handleLogoUpload(e.target.files)} />

              {/* Logo Settings */}
              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-4">
                  <h4 className="text-sm font-semibold">Configurações da Logo nos Posts</h4>
                  <p className="text-xs text-muted-foreground">Defina como a logo aparecerá nos posts e carrosséis gerados por IA.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Posição</Label>
                      <Select value={logoPosition} onValueChange={setLogoPosition}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOGO_POSITIONS.map(p => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Tamanho</Label>
                      <Select value={logoSize} onValueChange={setLogoSize}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOGO_SIZES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>📌 <strong>Carrosséis:</strong> A logo aparecerá maior na capa e no último slide.</p>
                    <p>📐 <strong>Tamanhos:</strong> Pequeno (~8%), Médio (~12%), Grande (~18%) da área do post.</p>
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveLogo} disabled={savingLogo} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {savingLogo ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisualIdentityModal;
