import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createPortal } from "react-dom";
import { toast } from "sonner";
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
import { CalendarIcon, Target, FileText, MessageSquare, Paperclip, Upload, X, File, Loader2, Trash2, Check, Plus, ChevronDown, ChevronRight, GripVertical, Link, Archive, ArchiveRestore, Wand2, Clock, MoreVertical, User, Calendar as CalendarIconOutline } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  archived_at?: string | null;
  additional_publish_dates?: string[];
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
  onArchive?: (archived: boolean) => Promise<void>;
  saving?: boolean;
  savingField?: string | null;
  uploading?: boolean;
  pipelineStatuses?: PipelineStatus[]; // Dynamic statuses from database
  readOnly?: boolean;
  onScheduleRequest?: (card: KanbanCardData) => void;
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
  onArchive,
  saving = false,
  savingField = null,
  uploading = false,
  pipelineStatuses = [],
  readOnly = false,
  onScheduleRequest
}: TaskCardProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAdditionalDatePickerOpen, setIsAdditionalDatePickerOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachmentToRemove, setAttachmentToRemove] = useState<Attachment | null>(null);
  const [periodPlans, setPeriodPlans] = useState<{ id: string; period_title: string; period_start: string; period_end: string }[]>([]);
  const [loadingPeriodPlans, setLoadingPeriodPlans] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [periodTitle, setPeriodTitle] = useState<string | null>(null);

  // Fetch period title when card has a period_plan_id
  useEffect(() => {
    if (open && card?.period_plan_id) {
      supabase
        .from("period_plans")
        .select("period_title")
        .eq("id", card.period_plan_id)
        .single()
        .then(({ data }) => {
          setPeriodTitle(data?.period_title || null);
        });
    } else {
      setPeriodTitle(null);
    }
  }, [open, card?.period_plan_id]);

  // Derive priority from publish date proximity
  const getDerivedPriority = () => {
    if (!card?.publish_date) return null;
    const now = new Date();
    const publishDate = new Date(card.publish_date + 'T00:00:00');
    const diffDays = Math.ceil((publishDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Atrasada", className: "bg-destructive/15 text-destructive border-destructive/30" };
    if (diffDays <= 2) return { label: "Alta", className: "bg-destructive/15 text-destructive border-destructive/30" };
    if (diffDays <= 5) return { label: "Média", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    return { label: "Normal", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  };
  
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

  // Fetch period plans for unlinked demands
  useEffect(() => {
    if (open && card && !card.period_plan_id && card.clientId) {
      fetchPeriodPlansForCard(card.clientId);
    }
  }, [open, card?.id, card?.period_plan_id, card?.clientId]);

  const fetchPeriodPlansForCard = async (clientId: string) => {
    setLoadingPeriodPlans(true);
    try {
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end")
        .eq("company_id", clientId)
        .eq("operational_status", "em_andamento")
        .order("period_start", { ascending: false });
      if (error) throw error;
      setPeriodPlans(data || []);
    } catch (error) {
      console.error("Error fetching period plans:", error);
    } finally {
      setLoadingPeriodPlans(false);
    }
  };

  const handleLinkPeriod = async (periodPlanId: string) => {
    if (!card) return;
    try {
      const { error } = await supabase
        .from("demands")
        .update({ period_plan_id: periodPlanId })
        .eq("id", card.id);
      if (error) throw error;
      onCardChange({ ...card, period_plan_id: periodPlanId });
      const { toast } = await import("sonner");
      toast.success("Demanda vinculada ao período!");
    } catch (error) {
      console.error("Error linking period:", error);
      const { toast } = await import("sonner");
      toast.error("Erro ao vincular período");
    }
  };

  // Parse slides from description (mirrors edge function logic)
  const parseClientSlides = (description: string): number => {
    if (!description) return 1;
    const text = description.replace(/<[^>]*>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    const slideRegex = /(?:SLIDE|FRAME|CENA|IMAGEM)\s*(\d+)\s*[—\-:]/gi;
    const matches = [...text.matchAll(slideRegex)];
    return matches.length > 0 ? matches.length : 1;
  };

  const handleGenerateImages = async () => {
    if (!card) return;
    setGeneratingImages(true);

    try {
      setGenerationProgress({ current: 1, total: 1 });
      const { data, error } = await supabase.functions.invoke("generate-post-image", {
        body: { demandId: card.id },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error, { description: data.details?.join(", ") });
        return;
      }
      const successCount = data?.generated || 0;

      if (successCount > 0) {
        toast.success(`${successCount} imagem(ns) gerada(s) com sucesso!`);
      } else {
        toast.error("Nenhuma imagem foi gerada");
      }

      // Refetch demand to get updated attachments
      const { data: updatedDemand } = await supabase
        .from("demands")
        .select("attachments")
        .eq("id", card.id)
        .single();
      if (updatedDemand) {
        onCardChange({ ...card, attachments: updatedDemand.attachments as unknown as Attachment[] });
      }
    } catch (error: any) {
      console.error("Error generating images:", error);
      toast.error(error.message || "Erro ao gerar imagens");
    } finally {
      setGeneratingImages(false);
      setGenerationProgress(null);
    }
  };
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

  // Additional publish dates management
  const additionalDates: string[] = Array.isArray(card?.additional_publish_dates) 
    ? card.additional_publish_dates 
    : [];

  const handleAddAdditionalDate = async (newDate: Date | undefined) => {
    if (!newDate || !card) return;
    const dateStr = format(newDate, "yyyy-MM-dd");
    if (additionalDates.includes(dateStr)) {
      toast.info("Data já adicionada");
      return;
    }
    const updated = [...additionalDates, dateStr].sort();
    onCardChange({ ...card, additional_publish_dates: updated });
    try {
      await supabase.from("demands").update({ additional_publish_dates: updated }).eq("id", card.id);
    } catch (e) {
      console.error("Error saving additional dates:", e);
      toast.error("Erro ao salvar data adicional");
    }
    setIsAdditionalDatePickerOpen(false);
  };

  const handleRemoveAdditionalDate = async (dateStr: string) => {
    if (!card) return;
    const updated = additionalDates.filter(d => d !== dateStr);
    onCardChange({ ...card, additional_publish_dates: updated });
    try {
      await supabase.from("demands").update({ additional_publish_dates: updated }).eq("id", card.id);
    } catch (e) {
      console.error("Error removing additional date:", e);
      toast.error("Erro ao remover data");
    }
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
  const priority = getDerivedPriority();
  const modalContent = <>
      {/* Full-screen modal container - respects sidebar */}
      <div className="fixed inset-0 z-50 md:left-16 flex flex-col" role="dialog" aria-modal="true" aria-labelledby="task-card-title">
        {/* Overlay */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" aria-hidden="true" />
        
        {/* Modal Content */}
        <div className="relative z-10 flex flex-col h-full w-full bg-card border-l border-border shadow-2xl animate-in fade-in-0 slide-in-from-right-2 duration-200">
          
          {/* ===== HEADER REDESENHADO ===== */}
          <div className="border-b border-border bg-card px-6 py-4 shrink-0">
            {/* Linha 1: Título + Close */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                {!readOnly && editingField === 'title' ? (
                  <Input 
                    autoFocus 
                    value={card.title || ""} 
                    onChange={e => onCardChange({ ...card, title: e.target.value })} 
                    onBlur={() => handleFieldSave('title', card.title || '')} 
                    onKeyDown={e => { if (e.key === 'Enter') handleFieldSave('title', card.title || ''); }}
                    className="text-xl font-semibold border-primary" 
                  />
                ) : (
                  <h1 
                    id="task-card-title" 
                    onClick={() => !readOnly && setEditingField('title')} 
                    className={cn("font-semibold text-xl truncate", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
                  >
                    {card.title}
                  </h1>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted shrink-0" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar</span>
              </Button>
            </div>

            {/* Linha 2: Metadados contextuais */}
            <div className="flex items-center gap-6 mt-2 text-sm text-muted-foreground">
              {card.clientName && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span>Cliente</span>
                  <strong className="text-foreground">{card.clientName}</strong>
                </div>
              )}
              {periodTitle && (
                <div className="flex items-center gap-1.5">
                  <CalendarIconOutline className="h-3.5 w-3.5" />
                  <span>Cronograma</span>
                  <strong className="text-foreground">{periodTitle}</strong>
                </div>
              )}
            </div>

            {/* Linha 3: Status + Prioridade */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
              {readOnly ? (
                <div 
                  className="h-8 px-3 flex items-center gap-2 rounded-md border font-medium text-xs"
                  style={{
                    backgroundColor: `${statusConfig.color}15`,
                    color: statusConfig.color,
                    borderColor: `${statusConfig.color}40`
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.color }} />
                  <span>{statusConfig.label}</span>
                </div>
              ) : (
                <Select value={card.status || normalizedStatus} onValueChange={async (value) => {
                  if (value === "Agendar Publicação") {
                    if (onScheduleRequest) {
                      onScheduleRequest(card);
                      return;
                    }
                    if (!card.publish_date) {
                      toast.error("Defina uma data de publicação", {
                        description: "Para mover para 'Agendar Publicação', defina data e horário primeiro."
                      });
                      return;
                    }
                  }
                  onCardChange({ ...card, status: value });
                  handleFieldSave('status', value);
                }}>
                  <SelectTrigger 
                    className="h-8 w-auto min-w-[170px] gap-2 border font-medium text-xs"
                    style={{
                      backgroundColor: `${statusConfig.color}15`,
                      color: statusConfig.color,
                      borderColor: `${statusConfig.color}40`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.color }} />
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
                                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
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
                                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
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

              {priority && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Prioridade</span>
                  <Badge variant="outline" className={cn("text-xs font-medium border", priority.className)}>
                    {priority.label}
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* ===== BODY - 2 COLUNAS ===== */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6 p-6">
              
              {/* === COLUNA ESQUERDA: Conteúdo === */}
              <div className="space-y-6">
                <div className="space-y-5">
                    {/* Objetivo */}
                    <section>
                      <button 
                        type="button"
                        onClick={() => toggleSection('objetivo')}
                        className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                      >
                        {collapsedSections.objetivo ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <div className="p-1.5 bg-primary/10 rounded-md">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground uppercase tracking-wide text-sm">Objetivo</h3>
                        {saving && savingField === 'objective' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                      </button>
                      {!collapsedSections.objetivo && (
                        readOnly ? (
                          <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.objective || "") }} />
                        ) : (
                          <BlockEditor content={convertToHtml(card.objective || "")} onChange={value => onCardChange({ ...card, objective: value })} onBlur={() => handleFieldSave('objective', card.objective || '')} placeholder="Qual é a finalidade estratégica deste material?" minHeight="80px" />
                        )
                      )}
                    </section>

                    <Separator />

                    {/* Atividade */}
                    <section>
                      <button 
                        type="button"
                        onClick={() => toggleSection('atividade')}
                        className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                      >
                        {collapsedSections.atividade ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <div className="p-1.5 bg-primary/10 rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground uppercase tracking-wide text-sm">Atividade</h3>
                        {saving && savingField === 'description' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                      </button>
                      {!collapsedSections.atividade && (
                        readOnly ? (
                          <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.description || "") }} />
                        ) : (
                          <BlockEditor content={convertToHtml(card.description || "")} onChange={value => onCardChange({ ...card, description: value })} onBlur={() => handleFieldSave('description', card.description || '')} placeholder="Copy, roteiros, frames, instruções de produção..." minHeight="200px" />
                        )
                      )}
                    </section>

                    <Separator />

                    {/* Observações */}
                    <section>
                      <button 
                        type="button"
                        onClick={() => toggleSection('observacoes')}
                        className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity"
                      >
                        {collapsedSections.observacoes ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <div className="p-1.5 bg-primary/10 rounded-md">
                          <MessageSquare className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-foreground uppercase tracking-wide text-sm">Observações</h3>
                        {saving && savingField === 'observations' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                      </button>
                      {!collapsedSections.observacoes && (
                        readOnly ? (
                          <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.observations || "") }} />
                        ) : (
                          <BlockEditor content={convertToHtml(card.observations || "")} onChange={value => onCardChange({ ...card, observations: value })} onBlur={() => handleFieldSave('observations', card.observations || '')} placeholder="Feedbacks, ajustes, observações internas..." minHeight="100px" />
                        )
                      )}
                    </section>
                </div>
              </div>

              {/* === COLUNA DIREITA: Publicação + Controles === */}
              <div className="space-y-4 sticky top-0 self-start">
                {/* Início de Produção */}
                {card.due_date && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-amber-500" />
                        Início de Produção
                      </h3>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="capitalize">{formatFullDate(card.due_date)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Data de Publicação */}
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      Data de Publicação
                    </h3>
                    
                    {readOnly ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {card.publish_date ? (
                            <span className="capitalize">{formatFullDate(card.publish_date)}</span>
                          ) : (
                            <span className="text-muted-foreground">Sem data definida</span>
                          )}
                        </div>
                        {card.publish_time && (
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{card.publish_time}</span>
                          </div>
                        )}
                        {additionalDates.length > 0 && (
                          <>
                            <Separator className="my-2" />
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datas adicionais</p>
                            {additionalDates.map((dateStr) => (
                              <div key={dateStr} className="flex items-center gap-2 text-sm">
                                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="capitalize">{formatFullDate(dateStr)}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Date Picker */}
                        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start gap-2 font-normal text-sm h-9">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {card.publish_date ? (
                                <span className="capitalize">{formatShortDate(card.publish_date)}</span>
                              ) : (
                                <span className="text-muted-foreground">Definir data</span>
                              )}
                            </Button>
                          </PopoverTrigger>
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
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            type="time"
                            value={card.publish_time || '09:00'}
                            onChange={(e) => handlePublishTimeChange(e.target.value)}
                            className="h-9 flex-1 text-sm"
                            aria-label="Horário de publicação"
                          />
                        </div>

                        {/* Additional Publish Dates */}
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datas adicionais</h4>
                          {additionalDates.map((dateStr) => (
                            <div key={dateStr} className="flex items-center gap-2 text-sm">
                              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="capitalize flex-1">{formatShortDate(dateStr)}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveAdditionalDate(dateStr)}
                                className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <Popover open={isAdditionalDatePickerOpen} onOpenChange={setIsAdditionalDatePickerOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-8 text-muted-foreground">
                                <Plus className="h-3.5 w-3.5" />
                                Adicionar data
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={undefined}
                                onSelect={handleAddAdditionalDate}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Period linking for unlinked demands */}
                {!readOnly && !card.period_plan_id && periodPlans.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                        <Link className="h-4 w-4 text-primary" />
                        Vincular a período
                      </h3>
                      <Select onValueChange={handleLinkPeriod}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecionar período" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {periodPlans.map(pp => (
                            <SelectItem key={pp.id} value={pp.id}>
                              <span className="text-xs">{pp.period_title} ({format(new Date(pp.period_start + 'T00:00:00'), "dd/MM", { locale: ptBR })} - {format(new Date(pp.period_end + 'T00:00:00'), "dd/MM", { locale: ptBR })})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}

                {/* Ações secundárias */}
                {!readOnly && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground mb-2">Ações</h3>
                      {onArchive && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className={cn(
                            "w-full justify-start gap-2 text-sm",
                            card.archived_at 
                              ? "hover:text-primary hover:border-primary/30" 
                              : "hover:text-amber-600 hover:border-amber-500/30"
                          )}
                          onClick={() => onArchive(!card.archived_at)}
                        >
                          {card.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                          {card.archived_at ? "Desarquivar demanda" : "Arquivar demanda"}
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                        onClick={onDelete}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir demanda
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* ===== ANEXOS - Full Width ===== */}
            <div className="px-6 pb-6">
              <Card>
                <CardContent className="p-5">
                  {/* Header dos Anexos */}
                  <div className="flex items-center justify-between mb-4">
                    <button 
                      type="button"
                      onClick={() => toggleSection('anexos')}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      {collapsedSections.anexos ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      <div className="p-1.5 bg-primary/10 rounded-md">
                        <Paperclip className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground uppercase tracking-wide text-sm">Anexos</h3>
                      {card.attachments && card.attachments.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">{card.attachments.length}</Badge>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {!readOnly && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generatingImages ? null : setShowGenerateConfirm(true)}
                          disabled={generatingImages}
                          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                        >
                          {generatingImages ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4" />
                          )}
                          {generatingImages && generationProgress
                            ? `Gerando ${generationProgress.current}/${generationProgress.total}...`
                            : generatingImages
                              ? 'Gerando...'
                              : 'Gerar estáticos com IA'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {!collapsedSections.anexos && (
                    <>
                      {/* Attachments List with Drag and Drop */}
                      {card.attachments && card.attachments.length > 0 && (
                        <DragDropContext onDragEnd={handleAttachmentDragEnd}>
                          <Droppable droppableId="attachments-list" direction="horizontal">
                            {(provided) => (
                                <div 
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className="flex gap-3 mb-4 overflow-x-auto pb-2 scrollbar-thin"
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
                                        {...provided.dragHandleProps}
                                        className={cn(
                                          "group relative flex flex-col items-center gap-1 p-1.5 bg-muted/30 rounded-lg border border-border/50 hover:border-primary/50 transition-colors w-[110px] flex-shrink-0 cursor-grab active:cursor-grabbing select-none",
                                          snapshot.isDragging && "shadow-xl ring-2 ring-primary/50 z-50 bg-background scale-105 rotate-1"
                                        )}
                                      >
                                        {!readOnly && (
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/90 text-destructive-foreground hover:bg-destructive rounded-full z-10" 
                                            onClick={(e) => { e.stopPropagation(); setAttachmentToRemove(attachment); }}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        )}

                                        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-0.5 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
                                          <GripVertical className="h-3 w-3 text-muted-foreground rotate-90" />
                                        </div>
                                        
                                        <div 
                                          className="h-[100px] w-[100px] rounded-md bg-muted flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                                          onClick={(e) => { e.stopPropagation(); setPreviewAttachment(attachment); }}
                                        >
                                          {isImageFile(attachment.type) ? (
                                            <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                                          ) : (
                                            <File className="h-8 w-8 text-muted-foreground" />
                                          )}
                                        </div>

                                        <div className="w-full text-center cursor-pointer" onClick={(e) => { e.stopPropagation(); setPreviewAttachment(attachment); }}>
                                          <p className="text-[10px] font-medium truncate text-foreground">{attachment.name}</p>
                                          <p className="text-[9px] text-muted-foreground">{formatFileSize(attachment.size)}</p>
                                        </div>
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
                </CardContent>
              </Card>
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

      {/* Confirmation Dialog for AI Image Generation */}
      <AlertDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar estáticos com IA?</AlertDialogTitle>
            <AlertDialogDescription>
              A IA irá analisar o conteúdo da atividade e gerar imagens para cada slide identificado. Isso pode levar alguns minutos dependendo da quantidade de slides.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 shrink-0" />
            <span>Tecnologia atual: <strong className="text-foreground">Google Gemini (gemini-2.0-flash-exp-image-generation) via Google AI Studio</strong></span>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowGenerateConfirm(false);
                handleGenerateImages();
              }}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Gerar estáticos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>;

  return createPortal(modalContent, document.body);
}