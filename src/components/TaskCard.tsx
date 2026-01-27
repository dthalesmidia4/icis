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
import { CalendarIcon, Clock, Target, FileText, MessageSquare, Paperclip, Upload, X, File, Loader2, Trash2, Check, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import { BlockEditor } from "@/components/BlockEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Publication date interface
export interface PublicationDate {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  platform?: string; // Optional platform (e.g., Instagram, LinkedIn)
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
  plan_id?: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[] | null;
  publication_dates?: PublicationDate[] | null;
  // Fields for demands mapped to cards
  source?: 'card' | 'demand';
  demand_id?: string;
  demand_type?: string | null;
  channel?: string | null;
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

// Converte texto plano/Markdown para HTML para o BlockEditor
const convertToHtml = (text: string): string => {
  if (!text) return '';
  
  // Se já é HTML válido, retornar como está
  if (text.trim().startsWith('<') && text.includes('</')) {
    return text;
  }
  
  // Converter Markdown básico para HTML
  let html = text
    // Escapar caracteres HTML perigosos
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Converter títulos Markdown
    .replace(/^### (.+)$/gm, '</p><h3>$1</h3><p>')
    .replace(/^## (.+)$/gm, '</p><h2>$1</h2><p>')
    .replace(/^# (.+)$/gm, '</p><h1>$1</h1><p>')
    // Converter negrito e itálico
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Converter padrões SLIDE/FRAME/CENA em títulos
    .replace(/^(SLIDE|FRAME|CENA|IMAGEM|LEGENDA|ROTEIRO|NARRAÇÃO|VISUAL)\s*(\d*)[\s—:-]*/gim, '</p><h3>$1 $2</h3><p>');
  
  // Dividir por quebras de linha duplas para criar parágrafos
  const paragraphs = html.split(/\n\n+/).filter(p => p.trim());
  
  html = paragraphs.map(paragraph => {
    // Se já tem tags de título, não envolver em <p>
    if (paragraph.includes('<h1>') || paragraph.includes('<h2>') || paragraph.includes('<h3>')) {
      return paragraph.replace(/\n/g, '<br>');
    }
    // Converter quebras de linha simples em <br>
    const content = paragraph.replace(/\n/g, '<br>').trim();
    return content ? `<p>${content}</p>` : '';
  }).join('');
  
  // Limpar tags vazias
  html = html
    .replace(/<p><\/p>/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/^<\/p>/, '')
    .replace(/<p>$/, '');
  
  return html || `<p>${text.replace(/\n/g, '<br>')}</p>`;
};

// Status configuration mapped directly to Kanban columns
export const STATUS_GROUPS = [{
  label: "Planejamento",
  column: "Planejamento",
  statuses: [{
    value: "planejamento",
    label: "PLANEJAMENTO",
    color: "hsl(270 60% 55%)",
    bgColor: "bg-[hsl(270,60%,55%)]/10",
    textColor: "text-[hsl(270,60%,55%)]",
    borderColor: "border-[hsl(270,60%,55%)]/30",
    column: "Planejamento"
  }]
}, {
  label: "Produção",
  column: "Produção",
  statuses: [{
    value: "em_producao",
    label: "PRODUÇÃO",
    color: "hsl(25 95% 55%)",
    bgColor: "bg-[hsl(25,95%,55%)]/10",
    textColor: "text-[hsl(25,95%,55%)]",
    borderColor: "border-[hsl(25,95%,55%)]/30",
    column: "Produção"
  }]
}, {
  label: "Revisão",
  column: "Revisão",
  statuses: [{
    value: "revisao",
    label: "REVISÃO",
    color: "hsl(142 70% 45%)",
    bgColor: "bg-[hsl(142,70%,45%)]/10",
    textColor: "text-[hsl(142,70%,45%)]",
    borderColor: "border-[hsl(142,70%,45%)]/30",
    column: "Revisão"
  }]
}, {
  label: "Aguardando Cliente",
  column: "Aguardando Cliente",
  statuses: [{
    value: "aguardando_cliente",
    label: "AGUARDANDO CLIENTE",
    color: "hsl(45 90% 50%)",
    bgColor: "bg-[hsl(45,90%,50%)]/10",
    textColor: "text-[hsl(45,90%,50%)]",
    borderColor: "border-[hsl(45,90%,50%)]/30",
    column: "Aguardando Cliente"
  }]
}, {
  label: "Agendar Publicação",
  column: "Agendar Publicação",
  statuses: [{
    value: "agendar_publicacao",
    label: "AGENDAR PUBLICAÇÃO",
    color: "hsl(190 80% 50%)",
    bgColor: "bg-[hsl(190,80%,50%)]/10",
    textColor: "text-[hsl(190,80%,50%)]",
    borderColor: "border-[hsl(190,80%,50%)]/30",
    column: "Agendar Publicação"
  }]
}];

// Flatten for easy lookup
export const ALL_STATUSES = STATUS_GROUPS.flatMap(g => g.statuses);

export const getStatusConfig = (statusValue: string) => {
  return ALL_STATUSES.find(s => s.value === statusValue) || ALL_STATUSES[0];
};

// Get column name from status value
export const getColumnFromStatus = (statusValue: string): string => {
  const status = ALL_STATUSES.find(s => s.value === statusValue);
  return status?.column || "Planejamento";
};

// Get status value from column name
export const getStatusFromColumn = (columnName: string): string => {
  const group = STATUS_GROUPS.find(g => g.column === columnName);
  return group?.statuses[0]?.value || "planejamento";
};

// Legacy status mapping for backwards compatibility
export const LEGACY_STATUS_MAP: Record<string, string> = {
  unassigned: "planejamento",
  nao_iniciado: "planejamento",
  mapeamento: "planejamento",
  in_progress: "em_producao",
  desenvolvimento: "em_producao",
  implantacao: "em_producao",
  otimizacao: "em_producao",
  em_andamento: "em_producao",
  desenvolvimento_pausado: "agendar_publicacao",
  implantacao_pausada: "agendar_publicacao",
  a_fazer: "agendar_publicacao",
  pendente: "agendar_publicacao", // Migração: pendente -> agendar_publicacao
  completed: "revisao",
  concluido: "revisao",
  conteudo_programado: "agendar_publicacao"
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
  const [attachmentToRemove, setAttachmentToRemove] = useState<Attachment | null>(null);
  
  // Section collapse states - persisted in localStorage
  const STORAGE_KEY = 'taskcard-collapsed-sections';
  
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load collapsed sections from localStorage:', e);
    }
    return {
      objetivo: false,
      atividade: false,
      observacoes: false,
      anexos: false
    };
  });
  
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const newState = {
        ...prev,
        [section]: !prev[section]
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      } catch (e) {
        console.warn('Failed to save collapsed sections to localStorage:', e);
      }
      return newState;
    });
  };

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

            {/* Control Fields - Centered, Single Row */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {/* Status - ClickUp inspired */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
                <Select value={normalizedStatus} onValueChange={async (value) => {
                  // Validação: exigir data de publicação para mover para "Agendar Publicação"
                  const targetColumn = getColumnFromStatus(value);
                  if (targetColumn === "Agendar Publicação") {
                    const hasValidPublicationDate = publicationDates.some(pd => pd.date && pd.time);
                    const hasDeliveryDate = !!card.delivery_date;
                    
                    if (!hasValidPublicationDate && !hasDeliveryDate) {
                      const { toast } = await import("sonner");
                      toast.error("Defina uma data de publicação", {
                        description: "Para mover para 'Agendar Publicação', defina data e horário primeiro."
                      });
                      return;
                    }
                  }
                  
                  onCardChange({
                    ...card,
                    status: value
                  });
                  handleFieldSave('status', value);
                }}>
                  <SelectTrigger className={cn("h-9 w-auto min-w-[180px] gap-2 border font-medium text-xs", statusConfig.bgColor, statusConfig.textColor, statusConfig.borderColor)} aria-label="Selecionar status da tarefa">
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

              <div className="h-4 w-px bg-border" />

              {/* Datas de Publicação */}
              <div className="flex items-center gap-2">
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
                          aria-label={`Horário de publicação ${index + 1}`}
                        />

                        {/* Remove button (only if more than 1 date) */}
                        {publicationDates.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removePublicationDate(index)}
                            aria-label="Remover data de publicação"
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
                            aria-label="Adicionar data de publicação"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </TooltipProvider>
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Delete button */}
              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onDelete} aria-label="Excluir tarefa">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ===== BODY (Conteúdo de execução, scrollable) ===== */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-10 py-6 space-y-6">
              
              {/* Objetivo */}
              <section>
                <button 
                  type="button"
                  onClick={() => toggleSection('objetivo')}
                  className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                >
                  {collapsedSections.objetivo ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-xl">Objetivo</h3>
                  {saving && savingField === 'objetivo' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </button>
                {!collapsedSections.objetivo && (
                  <BlockEditor content={convertToHtml(card.objetivo || "")} onChange={value => {
                    onCardChange({
                      ...card,
                      objetivo: value
                    });
                  }} onBlur={() => handleFieldSave('objetivo', card.objetivo || '')} placeholder="Qual é a finalidade estratégica deste material?" minHeight="80px" />
                )}
              </section>

              {/* Atividade */}
              <section>
                <button 
                  type="button"
                  onClick={() => toggleSection('atividade')}
                  className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                >
                  {collapsedSections.atividade ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-lg">Atividade</h3>
                  {saving && savingField === 'description' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </button>
                {!collapsedSections.atividade && (
                  <BlockEditor content={convertToHtml(card.description || "")} onChange={value => {
                    onCardChange({
                      ...card,
                      description: value
                    });
                  }} onBlur={() => handleFieldSave('description', card.description || '')} placeholder="Copy, roteiros, frames, instruções de produção..." minHeight="200px" />
                )}
              </section>

              {/* Observações */}
              <section>
                <button 
                  type="button"
                  onClick={() => toggleSection('observacoes')}
                  className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                >
                  {collapsedSections.observacoes ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-lg">Observações</h3>
                  {saving && savingField === 'observations' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </button>
                {!collapsedSections.observacoes && (
                  <BlockEditor content={convertToHtml(card.observations || "")} onChange={value => {
                    onCardChange({
                      ...card,
                      observations: value
                    });
                  }} onBlur={() => handleFieldSave('observations', card.observations || '')} placeholder="Feedbacks, ajustes, observações internas..." minHeight="100px" />
                )}
              </section>

              {/* Anexos */}
              <section>
                <button 
                  type="button"
                  onClick={() => toggleSection('anexos')}
                  className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                >
                  {collapsedSections.anexos ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <Paperclip className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground uppercase tracking-wide text-lg">Anexos</h3>
                  {card.attachments && card.attachments.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">{card.attachments.length}</Badge>
                  )}
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </button>

                {!collapsedSections.anexos && (
                  <>
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
                            <button 
                              onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAttachmentToRemove(attachment);
                              }} 
                              className="absolute top-2 right-2 p-1.5 bg-destructive/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive shadow-lg"
                              aria-label={`Remover anexo ${attachment.name}`}
                            >
                              <X className="h-3 w-3 text-destructive-foreground" />
                            </button>
                          </div>)}
                      </div>}

                    {/* Upload Area */}
                    <label className="flex flex-col items-center justify-center gap-2 w-full py-6 px-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors" aria-label="Área de upload de arquivos">
                      <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.avi" onChange={onFileUpload} className="sr-only" disabled={uploading} aria-label="Selecionar arquivos para anexar" />
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
                  </>
                )}
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
          </div>
        </div>
      </div>

      {/* Attachment Preview Modal - isolated to prevent transform leaking */}
      <div style={{ isolation: 'isolate', contain: 'layout' }}>
        <AttachmentPreviewModal 
          isOpen={!!previewAttachment} 
          onClose={() => setPreviewAttachment(null)} 
          fileUrl={previewAttachment?.url || ""} 
          fileName={previewAttachment?.name || ""} 
          onDelete={previewAttachment ? () => {
            setAttachmentToRemove(previewAttachment);
            setPreviewAttachment(null);
          } : undefined} 
        />
      </div>

      {/* Attachment Removal Confirmation Modal */}
      <AlertDialog open={!!attachmentToRemove} onOpenChange={(open) => !open && setAttachmentToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover o anexo "<strong>{attachmentToRemove?.name}</strong>".
              <br /><br />
              Esta ação não pode ser desfeita. O arquivo será permanentemente removido do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (attachmentToRemove) {
                  console.log('[Attachment] Usuário confirmou remoção:', {
                    cardId: card.id,
                    attachmentName: attachmentToRemove.name,
                    attachmentUrl: attachmentToRemove.url
                  });
                  onRemoveAttachment(attachmentToRemove.url);
                  setAttachmentToRemove(null);
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>;

  // Render using portal to document.body
  return createPortal(modalContent, document.body);
}
