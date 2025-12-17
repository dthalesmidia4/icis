import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock, Target, FileText, MessageSquare, Paperclip, Upload, X, File, Loader2, Trash2, Check, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import { BlockEditor } from "@/components/BlockEditor";

// Publication date interface
export interface PublicationDate {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

// Enhanced Attachment interface with full traceability
export interface Attachment {
  // Identificação do arquivo
  url: string;
  name: string;
  type: string;
  size: number;
  storagePath: string; // Caminho completo no storage para rastreabilidade
  
  // Metadados de auditoria
  uploadedAt: string;
  uploadedBy: {
    id: string;
    email: string;
    name?: string;
  };
  
  // Vínculos obrigatórios (rastreabilidade)
  cardId: string;        // Vínculo direto com TaskCard
  tenantId: string;      // Vínculo com tenant
  clientId?: string;     // Vínculo com cliente
  periodPlanId?: string; // Vínculo com período
}

export interface KanbanCardData {
  id: string;
  title: string;
  status: string;
  column_name: string | null;
  delivery_date: string;
  file_location: string | null;
  objetivo: string | null;
  description: string | null;
  instrucoes: string | null;
  observations: string | null;
  period_plan_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[] | null;
  publication_dates?: PublicationDate[] | null;
}
interface TaskCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: KanbanCardData | null;
  onCardChange: (card: KanbanCardData) => void;
  onSave: (field: string, value: string) => Promise<void>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemoveAttachment: (url: string) => Promise<void>;
  onDelete: () => void;
  saving?: boolean;
  savingField?: string | null;
  uploading?: boolean;
}
const isImageFile = (type: string) => type.startsWith('image/');
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ClickUp-inspired Status configuration with groups
const STATUS_GROUPS = [{
  label: "Não iniciado",
  statuses: [{
    value: "nao_iniciado",
    label: "NÃO INICIADO",
    color: "hsl(0 0% 45%)",
    bgColor: "bg-[hsl(0,0%,45%)]/10",
    textColor: "text-[hsl(0,0%,45%)]",
    borderColor: "border-[hsl(0,0%,45%)]/30"
  }]
}, {
  label: "Ativo",
  statuses: [{
    value: "mapeamento",
    label: "MAPEAMENTO DE PROCESSOS",
    color: "hsl(270 60% 55%)",
    bgColor: "bg-[hsl(270,60%,55%)]/10",
    textColor: "text-[hsl(270,60%,55%)]",
    borderColor: "border-[hsl(270,60%,55%)]/30"
  }, {
    value: "desenvolvimento",
    label: "DESENVOLVIMENTO",
    color: "hsl(25 95% 55%)",
    bgColor: "bg-[hsl(25,95%,55%)]/10",
    textColor: "text-[hsl(25,95%,55%)]",
    borderColor: "border-[hsl(25,95%,55%)]/30"
  }, {
    value: "implantacao",
    label: "IMPLANTAÇÃO",
    color: "hsl(210 80% 55%)",
    bgColor: "bg-[hsl(210,80%,55%)]/10",
    textColor: "text-[hsl(210,80%,55%)]",
    borderColor: "border-[hsl(210,80%,55%)]/30"
  }, {
    value: "otimizacao",
    label: "OTIMIZAÇÃO",
    color: "hsl(175 70% 40%)",
    bgColor: "bg-[hsl(175,70%,40%)]/10",
    textColor: "text-[hsl(175,70%,40%)]",
    borderColor: "border-[hsl(175,70%,40%)]/30"
  }]
}, {
  label: "Pausado",
  statuses: [{
    value: "desenvolvimento_pausado",
    label: "DESENVOLVIMENTO PAUSADO",
    color: "hsl(280 40% 70%)",
    bgColor: "bg-[hsl(280,40%,70%)]/10",
    textColor: "text-[hsl(280,40%,70%)]",
    borderColor: "border-[hsl(280,40%,70%)]/30"
  }, {
    value: "implantacao_pausada",
    label: "IMPLANTAÇÃO PAUSADA",
    color: "hsl(210 50% 70%)",
    bgColor: "bg-[hsl(210,50%,70%)]/10",
    textColor: "text-[hsl(210,50%,70%)]",
    borderColor: "border-[hsl(210,50%,70%)]/30"
  }]
}, {
  label: "Concluído",
  statuses: [{
    value: "concluido",
    label: "CONCLUÍDO",
    color: "hsl(142 70% 45%)",
    bgColor: "bg-[hsl(142,70%,45%)]/10",
    textColor: "text-[hsl(142,70%,45%)]",
    borderColor: "border-[hsl(142,70%,45%)]/30"
  }]
}];

// Flatten for easy lookup
const ALL_STATUSES = STATUS_GROUPS.flatMap(g => g.statuses);
const getStatusConfig = (statusValue: string) => {
  return ALL_STATUSES.find(s => s.value === statusValue) || ALL_STATUSES[0];
};

// Legacy status mapping for backwards compatibility
const LEGACY_STATUS_MAP: Record<string, string> = {
  unassigned: "nao_iniciado",
  in_progress: "desenvolvimento",
  completed: "concluido"
};
export default function TaskCard({
  open,
  onOpenChange,
  card,
  onCardChange,
  onSave,
  onFileUpload,
  onRemoveAttachment,
  onDelete,
  saving = false,
  savingField = null,
  uploading = false
}: TaskCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [openDatePickerIndex, setOpenDatePickerIndex] = useState<number | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Get publication dates from card or use default with one empty date
  const publicationDates: PublicationDate[] = card?.publication_dates?.length 
    ? card.publication_dates 
    : [{ date: card?.delivery_date || '', time: '09:00' }];

  const MAX_PUBLICATION_DATES = 5;

  // Handle ESC key to close modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      onOpenChange(false);
    }
  }, [open, onOpenChange]);
  
  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);
  
  const handleFieldSave = async (field: string, value: string) => {
    await onSave(field, value);
    setEditingField(null);
  };

  // Publication dates handlers
  const handlePublicationDateChange = async (index: number, newDate: Date | undefined) => {
    if (!newDate || !card) return;
    
    const dateStr = format(newDate, "yyyy-MM-dd");
    const newDates = [...publicationDates];
    newDates[index] = { ...newDates[index], date: dateStr };
    
    onCardChange({
      ...card,
      publication_dates: newDates,
      delivery_date: newDates[0]?.date || card.delivery_date // Keep delivery_date synced with first date
    });
    await onSave('publication_dates', JSON.stringify(newDates));
    setOpenDatePickerIndex(null);
  };

  const handlePublicationTimeChange = async (index: number, time: string) => {
    if (!card) return;
    
    const newDates = [...publicationDates];
    newDates[index] = { ...newDates[index], time };
    
    onCardChange({
      ...card,
      publication_dates: newDates
    });
    await onSave('publication_dates', JSON.stringify(newDates));
  };

  const addPublicationDate = async () => {
    if (!card || publicationDates.length >= MAX_PUBLICATION_DATES) return;
    
    const newDates = [...publicationDates, { date: '', time: '09:00' }];
    
    onCardChange({
      ...card,
      publication_dates: newDates
    });
    await onSave('publication_dates', JSON.stringify(newDates));
  };

  const removePublicationDate = async (index: number) => {
    if (!card || publicationDates.length <= 1) return;
    
    const newDates = publicationDates.filter((_, i) => i !== index);
    
    onCardChange({
      ...card,
      publication_dates: newDates,
      delivery_date: newDates[0]?.date || card.delivery_date
    });
    await onSave('publication_dates', JSON.stringify(newDates));
  };

  // Format date for display
  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, "EEE, dd/MM/yyyy", { locale: ptBR });
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, "EEEE, dd/MM/yyyy", { locale: ptBR });
  };

  // Normalize legacy status values
  const normalizedStatus = LEGACY_STATUS_MAP[card?.status || ''] || card?.status || 'nao_iniciado';

  if (!card || !open) return null;
  const statusConfig = getStatusConfig(normalizedStatus);
  const modalContent = <>
      {/* Full-screen modal container - respects sidebar */}
      <div className="fixed inset-0 z-50 md:left-16 flex flex-col" role="dialog" aria-modal="true" aria-labelledby="task-card-title">
        {/* Overlay - only covers content area */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" aria-hidden="true" />
        
        {/* Modal Content - Full screen within content area */}
        <div className="relative z-10 flex flex-col h-full w-full bg-card border-l border-border shadow-2xl animate-in fade-in-0 slide-in-from-right-2 duration-200">
          {/* ===== HEADER OPERACIONAL (Fixo, compacto) ===== */}
          <div className="border-b border-border bg-card px-6 py-4 shrink-0">
            {/* Close Button */}
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8 rounded-full hover:bg-muted z-20" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>

            {/* Title - Centered */}
            <div className="mb-4 px-12 text-center">
              {editingField === 'title' ? <Input autoFocus value={card.title || ""} onChange={e => onCardChange({
              ...card,
              title: e.target.value
            })} onBlur={() => handleFieldSave('title', card.title || '')} onKeyDown={e => {
              if (e.key === 'Enter') handleFieldSave('title', card.title || '');
            }} className="text-2xl font-semibold border-primary text-center" /> : <h1 id="task-card-title" onClick={() => setEditingField('title')} className="font-semibold cursor-pointer hover:text-primary transition-colors text-4xl">
                  {card.title}
                </h1>}
            </div>

            {/* Control Fields - Centered, Two Rows */}
            <div className="flex flex-col items-center gap-3">
              {/* Row 1: Status + Tempo */}
              <div className="flex items-center gap-3">
                {/* Status - ClickUp inspired */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
                  <Select value={normalizedStatus} onValueChange={value => {
                  onCardChange({
                    ...card,
                    status: value
                  });
                  handleFieldSave('status', value);
                }}>
                    <SelectTrigger className={cn("h-9 w-auto min-w-[180px] gap-2 border font-medium text-xs", statusConfig.bgColor, statusConfig.textColor, statusConfig.borderColor)}>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{
                        backgroundColor: statusConfig.color
                      }} />
                        <span className="truncate">{statusConfig.label}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="min-w-[220px] max-h-[320px]">
                      <ScrollArea className="max-h-[300px]">
                        {STATUS_GROUPS.map((group, groupIdx) => <div key={group.label}>
                            {groupIdx > 0 && <Separator className="my-1" />}
                            <div className="px-2 py-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.label}
                              </span>
                            </div>
                            {group.statuses.map(status => <SelectItem key={status.value} value={status.value} className="cursor-pointer">
                                <div className="flex items-center gap-2">
                                  <span className={cn("h-3 w-3 rounded-full flex-shrink-0 flex items-center justify-center", status.value === 'concluido' && "ring-1 ring-inset ring-white/30")} style={{
                              backgroundColor: status.color
                            }}>
                                    {status.value === 'concluido' && <Check className="h-2 w-2 text-white" />}
                                  </span>
                                  <span className="text-xs font-medium">{status.label}</span>
                                </div>
                              </SelectItem>)}
                          </div>)}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                </div>

                <div className="h-4 w-px bg-border" />

                {/* Tempo de Atividade (placeholder) */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tempo</span>
                  <Badge variant="outline" className="h-8 gap-1.5 font-normal text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    --:--
                  </Badge>
                </div>

                {/* Delete button */}
                <div className="h-4 w-px bg-border" />
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Row 2: Datas de Publicação */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Publicação</span>
                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    {publicationDates.map((pubDate, index) => (
                      <div key={index} className="flex items-center gap-1">
                        {/* Date Picker */}
                        <Popover 
                          open={openDatePickerIndex === index} 
                          onOpenChange={(open) => setOpenDatePickerIndex(open ? index : null)}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <PopoverTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 px-2 gap-1.5 font-normal text-xs"
                                >
                                  <CalendarIcon className="h-3 w-3" />
                                  {pubDate.date ? formatShortDate(pubDate.date) : <span className="text-muted-foreground">Data {index + 1}</span>}
                                </Button>
                              </PopoverTrigger>
                            </TooltipTrigger>
                            {pubDate.date && (
                              <TooltipContent side="top">
                                <span className="capitalize">{formatFullDate(pubDate.date)}</span>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar 
                              mode="single" 
                              selected={pubDate.date ? new Date(pubDate.date + 'T00:00:00') : undefined} 
                              onSelect={(date) => handlePublicationDateChange(index, date)} 
                              initialFocus 
                              className="p-3 pointer-events-auto" 
                            />
                          </PopoverContent>
                        </Popover>

                        {/* Time Input */}
                        <Input
                          type="time"
                          value={pubDate.time || '09:00'}
                          onChange={(e) => handlePublicationTimeChange(index, e.target.value)}
                          className="h-7 w-[80px] text-xs px-2"
                        />

                        {/* Remove button (only if more than 1 date) */}
                        {publicationDates.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removePublicationDate(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}

                        {/* Add button (only on last item and if under max) */}
                        {index === publicationDates.length - 1 && publicationDates.length < MAX_PUBLICATION_DATES && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                            onClick={addPublicationDate}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* ===== BODY (Conteúdo de execução, scrollable) ===== */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-10 py-6 space-y-6">
              
              {/* Objetivo */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-xl">Objetivo</h3>
                  {saving && savingField === 'objetivo' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </div>
                <BlockEditor content={card.objetivo || ""} onChange={value => {
                onCardChange({
                  ...card,
                  objetivo: value
                });
              }} onBlur={() => handleFieldSave('objetivo', card.objetivo || '')} placeholder="Qual é a finalidade estratégica deste material?" minHeight="80px" />
              </section>

              {/* Atividade */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-secondary/50 rounded-md">
                    <FileText className="h-4 w-4 text-secondary-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-lg">Atividade</h3>
                  {saving && savingField === 'description' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </div>
                <BlockEditor content={card.description || ""} onChange={value => {
                onCardChange({
                  ...card,
                  description: value
                });
              }} onBlur={() => handleFieldSave('description', card.description || '')} placeholder="Copy, roteiros, frames, instruções de produção..." minHeight="200px" />
              </section>

              {/* Observações */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-accent/50 rounded-md">
                    <MessageSquare className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-lg">Observações</h3>
                  {saving && savingField === 'observations' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </div>
                <BlockEditor content={card.observations || ""} onChange={value => {
                onCardChange({
                  ...card,
                  observations: value
                });
              }} onBlur={() => handleFieldSave('observations', card.observations || '')} placeholder="Feedbacks, ajustes, observações internas..." minHeight="100px" />
              </section>

              {/* Anexos */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-muted rounded-md">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-lg">Anexos</h3>
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </div>

                {/* Attachments Grid */}
                {card.attachments && card.attachments.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                    {card.attachments.map((attachment, idx) => <div key={idx} className="group relative bg-muted/30 rounded-lg border border-border/50 overflow-hidden hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setPreviewAttachment(attachment)}>
                        {isImageFile(attachment.type) ? <div className="block">
                            <div className="aspect-square">
                              <img src={attachment.url} alt={attachment.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            </div>
                            <div className="p-2 bg-background/80 backdrop-blur-sm">
                              <p className="text-xs font-medium truncate">{attachment.name}</p>
                              <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                            </div>
                          </div> : <div className="flex flex-col items-center justify-center p-4 aspect-square hover:bg-muted/50 transition-colors">
                            <File className="h-10 w-10 text-muted-foreground mb-2" />
                            <p className="text-xs font-medium text-center truncate w-full">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                          </div>}
                        <button onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveAttachment(attachment.url);
                  }} className="absolute top-2 right-2 p-1.5 bg-destructive/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive shadow-lg">
                          <X className="h-3 w-3 text-destructive-foreground" />
                        </button>
                      </div>)}
                  </div>}

                {/* Upload Area */}
                <label className="flex flex-col items-center justify-center gap-2 w-full py-6 px-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.avi" onChange={onFileUpload} className="sr-only" disabled={uploading} />
                  {uploading ? <>
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Enviando arquivos...</span>
                    </> : <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Clique ou arraste arquivos para anexar
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        Imagens, PDFs, documentos, vídeos • Máximo 50MB
                      </span>
                    </>}
                </label>
              </section>

              {/* Timestamps */}
              <div className="flex items-center gap-4 pt-4 border-t border-border text-xs text-muted-foreground">
                <span>Criado: {card.created_at ? format(new Date(card.created_at), "dd/MM/yyyy HH:mm", {
                  locale: ptBR
                }) : "-"}</span>
                <span>Atualizado: {card.updated_at ? format(new Date(card.updated_at), "dd/MM/yyyy HH:mm", {
                  locale: ptBR
                }) : "-"}</span>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal isOpen={!!previewAttachment} onClose={() => setPreviewAttachment(null)} fileUrl={previewAttachment?.url || ""} fileName={previewAttachment?.name || ""} onDelete={previewAttachment ? () => {
      onRemoveAttachment(previewAttachment.url);
      setPreviewAttachment(null);
    } : undefined} />
    </>;

  // Render using portal to document.body
  return createPortal(modalContent, document.body);
}
