import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
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
import { CalendarIcon, Target, FileText, MessageSquare, Paperclip, Upload, X, File, Loader2, Trash2, Check, Plus, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
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
  due_date: string;
  channel: string | null;
  objective: string | null;
  description: string | null;
  instructions: string | null;
  observations: string | null;
  period_plan_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[] | null;
  publish_date: string | null;
  publish_time: string | null;
  // Fields for demands mapped to cards
  source?: string;
  demand_id?: string;
  demand_type?: string | null;
  // Computed/display fields (not in DB)
  clientId?: string;
  clientName?: string;
}

// Dynamic pipeline status from database
export interface PipelineStatus {
  id: string;
  name: string;
  color: string;
  position: number;
  pipeline_id: string;
  is_fixed?: boolean;
  parent_status_id?: string | null;
}

interface TaskCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: KanbanCardData | null;
  onCardChange: (card: KanbanCardData) => void;
  onSave: (field: string, value: string) => Promise<void>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemoveAttachment: (url: string) => Promise<void>;
  onReorderAttachments?: (attachments: Attachment[]) => Promise<void>;
  onDelete: () => void;
  saving?: boolean;
  savingField?: string | null;
  uploading?: boolean;
  pipelineStatuses?: PipelineStatus[]; // Dynamic statuses from database
  readOnly?: boolean;
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '</p><h3>$1</h3><p>')
    .replace(/^## (.+)$/gm, '</p><h2>$1</h2><p>')
    .replace(/^# (.+)$/gm, '</p><h1>$1</h1><p>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(SLIDE|FRAME|CENA|IMAGEM|LEGENDA|ROTEIRO|NARRAÇÃO|VISUAL)\s*(\d*)[\s—:-]*/gim, '</p><h3>$1 $2</h3><p>');
  
  const paragraphs = html.split(/\n\n+/).filter(p => p.trim());
  
  html = paragraphs.map(paragraph => {
    if (paragraph.includes('<h1>') || paragraph.includes('<h2>') || paragraph.includes('<h3>')) {
      return paragraph.replace(/\n/g, '<br>');
    }
    const content = paragraph.replace(/\n/g, '<br>').trim();
    return content ? `<p>${content}</p>` : '';
  }).join('');
  
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
  pendente: "agendar_publicacao",
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
  onReorderAttachments,
  onDelete,
  saving = false,
  savingField = null,
  uploading = false,
  pipelineStatuses = [],
  readOnly = false
}: TaskCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
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

  // Handle attachment reorder via drag and drop
  const handleAttachmentDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || !card?.attachments) return;
    
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    
    if (sourceIndex === destIndex) return;
    
    const newAttachments = Array.from(card.attachments);
    const [removed] = newAttachments.splice(sourceIndex, 1);
    newAttachments.splice(destIndex, 0, removed);
    
    onCardChange({
      ...card,
      attachments: newAttachments
    });
    
    if (onReorderAttachments) {
      await onReorderAttachments(newAttachments);
    }
  }, [card, onCardChange, onReorderAttachments]);

  // Handle ESC key to close modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      onOpenChange(false);
    }
  }, [open, onOpenChange]);
  
  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
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

  // Publication date handler (single date + time)
  const handlePublishDateChange = async (newDate: Date | undefined) => {
    if (!newDate || !card) return;
    
    const dateStr = format(newDate, "yyyy-MM-dd");
    
    onCardChange({
      ...card,
      publish_date: dateStr
    });
    await onSave('publish_date', dateStr);
    setIsDatePickerOpen(false);
  };

  const handlePublishTimeChange = async (time: string) => {
    if (!card) return;
    
    onCardChange({
      ...card,
      publish_time: time
    });
    await onSave('publish_time', time);
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

  // Dynamic status config based on pipelineStatuses
  const getDynamicStatusConfig = (statusValue: string) => {
    if (pipelineStatuses.length > 0) {
      const dynamicStatus = pipelineStatuses.find(ps => 
        ps.name.toLowerCase() === statusValue.toLowerCase() ||
        ps.name.toLowerCase().replace(/\s+/g, '_') === statusValue.toLowerCase() ||
        statusValue.toLowerCase() === ps.name.toLowerCase().replace(/\s+/g, '_')
      );
      if (dynamicStatus) {
        return {
          value: dynamicStatus.name,
          label: dynamicStatus.name.toUpperCase(),
          color: dynamicStatus.color,
          bgColor: `bg-[${dynamicStatus.color}]/10`,
          textColor: `text-[${dynamicStatus.color}]`,
          borderColor: `border-[${dynamicStatus.color}]/30`,
          column: dynamicStatus.name
        };
      }
    }
    return getStatusConfig(statusValue);
  };

  // Get current status display value
  const getCurrentStatusDisplay = () => {
    const config = getDynamicStatusConfig(normalizedStatus);
    return config.column || config.label;
  };

  if (!card || !open) return null;
  const statusConfig = getDynamicStatusConfig(card.status || normalizedStatus);
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
              {!readOnly && editingField === 'title' ? <Input autoFocus value={card.title || ""} onChange={e => onCardChange({
              ...card,
              title: e.target.value
            })} onBlur={() => handleFieldSave('title', card.title || '')} onKeyDown={e => {
              if (e.key === 'Enter') handleFieldSave('title', card.title || '');
            }} className="text-2xl font-semibold border-primary text-center" /> : <h1 id="task-card-title" onClick={() => !readOnly && setEditingField('title')} className={cn("font-semibold text-4xl", !readOnly && "cursor-pointer hover:text-primary transition-colors")}>
                  {card.title}
                </h1>}
            </div>

            {/* Control Fields - Centered, Single Row */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {/* Status - ClickUp inspired */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
                {readOnly ? (
                  <div 
                    className="h-9 px-3 flex items-center gap-2 rounded-md border font-medium text-xs"
                    style={{
                      backgroundColor: `${statusConfig.color}15`,
                      color: statusConfig.color,
                      borderColor: `${statusConfig.color}40`
                    }}
                  >
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.color }} />
                    <span>{statusConfig.label}</span>
                  </div>
                ) : (
                <Select value={card.status || normalizedStatus} onValueChange={async (value) => {
                  // Validação: exigir data de publicação para mover para "Agendar Publicação"
                  if (value === "Agendar Publicação") {
                    const hasPublishDate = !!card.publish_date;
                    
                    if (!hasPublishDate) {
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
                  <SelectTrigger 
                    className="h-9 w-auto min-w-[180px] gap-2 border font-medium text-xs"
                    style={{
                      backgroundColor: `${statusConfig.color}15`,
                      color: statusConfig.color,
                      borderColor: `${statusConfig.color}40`
                    }}
                    aria-label="Selecionar status da tarefa"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full flex-shrink-0" style={{
                        backgroundColor: statusConfig.color
                      }} />
                      <span className="truncate">{statusConfig.label}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="min-w-[220px] max-h-[320px]">
                    <ScrollArea className="max-h-[300px]">
                      {pipelineStatuses.length > 0 ? (
                        pipelineStatuses.map((status, idx) => (
                          <div key={status.id}>
                            {idx > 0 && <Separator className="my-1" />}
                            <SelectItem value={status.name} className="cursor-pointer">
                              <div className="flex items-center gap-2">
                                <span 
                                  className="h-3 w-3 rounded-full flex-shrink-0" 
                                  style={{ backgroundColor: status.color }}
                                />
                                <span className="text-xs font-medium">{status.name.toUpperCase()}</span>
                              </div>
                            </SelectItem>
                          </div>
                        ))
                      ) : (
                        STATUS_GROUPS.map((group, groupIdx) => (
                          <div key={group.label}>
                            {groupIdx > 0 && <Separator className="my-1" />}
                            {group.statuses.map(status => (
                              <SelectItem key={status.value} value={status.column} className="cursor-pointer">
                                <div className="flex items-center gap-2">
                                  <span 
                                    className={cn(
                                      "h-3 w-3 rounded-full flex-shrink-0 flex items-center justify-center", 
                                      status.value === 'concluido' && "ring-1 ring-inset ring-white/30"
                                    )} 
                                    style={{ backgroundColor: status.color }}
                                  >
                                    {status.value === 'concluido' && <Check className="h-2 w-2 text-white" />}
                                  </span>
                                  <span className="text-xs font-medium">{status.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </div>
                        ))
                      )}
                    </ScrollArea>
                  </SelectContent>
                </Select>
                )}
              </div>


              <div className="h-4 w-px bg-border" />

              {/* Data de Publicação (single date + time) */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Publicação</span>
                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1.5">
                    {/* Date Picker */}
                    <Popover 
                      open={isDatePickerOpen} 
                      onOpenChange={setIsDatePickerOpen}
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
                              {card.publish_date ? formatShortDate(card.publish_date) : <span className="text-muted-foreground">Definir data</span>}
                            </Button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        {card.publish_date && (
                          <TooltipContent side="top">
                            <span className="capitalize">{formatFullDate(card.publish_date)}</span>
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar 
                          mode="single" 
                          selected={card.publish_date ? new Date(card.publish_date + 'T00:00:00') : undefined} 
                          onSelect={handlePublishDateChange} 
                          initialFocus 
                          className="p-3 pointer-events-auto" 
                        />
                      </PopoverContent>
                    </Popover>

                    {/* Time Input */}
                    <Input
                      type="time"
                      value={card.publish_time || '09:00'}
                      onChange={(e) => handlePublishTimeChange(e.target.value)}
                      className="h-7 w-[80px] text-xs px-2"
                      aria-label="Horário de publicação"
                    />
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
                  {saving && savingField === 'objective' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                </button>
                {!collapsedSections.objetivo && (
                  readOnly ? (
                    <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.objective || "") }} />
                  ) : (
                  <BlockEditor content={convertToHtml(card.objective || "")} onChange={value => {
                    onCardChange({
                      ...card,
                      objective: value
                    });
                  }} onBlur={() => handleFieldSave('objective', card.objective || '')} placeholder="Qual é a finalidade estratégica deste material?" minHeight="80px" />
                  )
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
                  readOnly ? (
                    <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.observations || "") }} />
                  ) : (
                  <BlockEditor content={convertToHtml(card.observations || "")} onChange={value => {
                    onCardChange({
                      ...card,
                      observations: value
                    });
                  }} onBlur={() => handleFieldSave('observations', card.observations || '')} placeholder="Feedbacks, ajustes, observações internas..." minHeight="100px" />
                  )
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
                    {/* Attachments Grid with Drag and Drop */}
                    {card.attachments && card.attachments.length > 0 && (
                      <DragDropContext onDragEnd={handleAttachmentDragEnd}>
                        <Droppable droppableId="attachments-list">
                          {(provided) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className="flex flex-col gap-2 mb-4"
                            >
                              {card.attachments!.map((attachment, idx) => (
                                <Draggable 
                                  key={`attachment-${idx}-${attachment.url}`} 
                                  draggableId={`attachment-${idx}-${attachment.url}`} 
                                  index={idx}
                                >
                                  {(provided, snapshot) => (
                                    <div 
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={cn(
                                        "group flex items-center gap-3 p-2 bg-muted/30 rounded-lg border border-border/50 hover:border-primary/50 transition-colors",
                                        snapshot.isDragging && "shadow-lg ring-2 ring-primary/50 z-50 bg-background"
                                      )}
                                    >
                                      {/* Drag Handle */}
                                      <div 
                                        {...provided.dragHandleProps}
                                        className="p-1.5 rounded hover:bg-muted cursor-grab active:cursor-grabbing flex-shrink-0"
                                      >
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      
                                      {/* Thumbnail */}
                                      <div 
                                        className="h-12 w-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                                        onClick={() => setPreviewAttachment(attachment)}
                                      >
                                        {isImageFile(attachment.type) ? (
                                          <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                                        ) : (
                                          <File className="h-5 w-5 text-muted-foreground" />
                                        )}
                                      </div>

                                      {/* File Info */}
                                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setPreviewAttachment(attachment)}>
                                        <p className="text-sm font-medium truncate text-foreground">{attachment.name}</p>
                                        <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                                      </div>

                                      {/* Remove button */}
                                      {!readOnly && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" 
                                        onClick={() => setAttachmentToRemove(attachment)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    )}

                    {/* Upload Button */}
                    {!readOnly && (
                    <label className={cn(
                      "flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border/60 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all",
                      uploading && "opacity-50 cursor-not-allowed"
                    )}>
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={onFileUpload}
                        disabled={uploading}
                      />
                      {uploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {uploading ? 'Fazendo upload...' : 'Clique para anexar arquivos (máx. 50MB)'}
                      </span>
                    </label>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        isOpen={!!previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        fileUrl={previewAttachment?.url || ''}
        fileName={previewAttachment?.name || ''}
      />

      {/* Confirmation Dialog for Attachment Removal */}
      <AlertDialog open={!!attachmentToRemove} onOpenChange={(open) => !open && setAttachmentToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo "{attachmentToRemove?.name}" será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (attachmentToRemove) {
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

  return createPortal(modalContent, document.body);
}