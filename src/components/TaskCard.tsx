import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Target, FileText, MessageSquare, Paperclip, Upload, X, File, Loader2, Trash2, Check, Plus, ChevronDown, ChevronRight, GripVertical, Link, Archive, ArchiveRestore, Wand2, Clock, MoreVertical, User, Calendar as CalendarIconOutline, RefreshCw, RotateCcw, AlignLeft, Megaphone, Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Tag } from "lucide-react";
import { proceedDemand, regressDemand, deliverDemand, isAtLastFlowFunction, resolveInitialFunctionKey, OFFICIAL_DEMAND_TYPES, DEMAND_TYPE_LABEL, type DemandTypeKey } from "@/lib/proceedDemand";
import { completeDailyOccurrence, formatBR as formatBRDate } from "@/lib/dailyCards";
import { DailyCardSection } from "@/components/DailyCardSection";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { createOrUpdateScheduleDispatch, hasActiveDispatch } from "@/lib/createScheduleDispatch";
import { CalendarClock } from "lucide-react";

// Split instructions field into "production instructions" and "CTA" parts.
// Recognizes a "CTA:" marker (optionally wrapped in <p>) anywhere in the string.
const splitInstructionsCTA = (raw: string | null | undefined): { instr: string; cta: string } => {
  if (!raw) return { instr: '', cta: '' };
  const ctaIdx = raw.search(/(?:<p>\s*)?CTA:\s*/i);
  if (ctaIdx === -1) return { instr: raw, cta: '' };
  const instr = raw.slice(0, ctaIdx).replace(/<p>\s*<\/p>\s*$/i, '').trim();
  const ctaPart = raw.slice(ctaIdx).replace(/^[\s\S]*?CTA:\s*/i, '').replace(/<\/?p[^>]*>/gi, ' ').replace(/<br\s*\/?>(\s)*/gi, '\n').trim();
  return { instr, cta: ctaPart };
};

// Combine production instructions (HTML) and CTA (plain text) back into the instructions field.
const combineInstructionsCTA = (instr: string, cta: string): string => {
  const parts: string[] = [];
  if (instr && instr.trim()) parts.push(instr);
  const ctaText = (cta || '').replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (ctaText) parts.push(`<p>CTA: ${ctaText}</p>`);
  return parts.join('\n\n');
};
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
  AlertDialogTrigger,
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
  post_caption?: string | null;
  period_plan_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[] | null;
  publish_date: string | null;
  publish_time: string | null;
  delivery_date?: string | null;
  due_time?: string | null;
  delivery_time?: string | null;
  archived_at?: string | null;
  additional_publish_dates?: string[];
  // Fields for demands mapped to cards
  source?: string;
  demand_id?: string;
  demand_type?: string | null;
  demand_type_key?: string | null;
  assigned_to?: string | null;
  current_function_key?: string | null;
  // Card Diário (recorrência)
  is_daily_card?: boolean;
  daily_start_date?: string | null;
  daily_end_date?: string | null;
  daily_time?: string | null;
  daily_exclude_weekends?: boolean;
  daily_exclude_holidays?: boolean;
  daily_next_date?: string | null;
  daily_total_occurrences?: number | null;
  daily_completed_occurrences?: number;
  daily_completed_dates?: string[];
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
  /** Draft mode: card was just created as a draft; hide flow buttons and show Salvar/Descartar */
  isDraft?: boolean;
  onDraftSave?: () => Promise<void> | void;
  onDraftDiscard?: () => Promise<void> | void;
  /** Disables draft save/discard buttons while the parent is persisting. */
  savingDraft?: boolean;
  /** Options list for the inline client selector (draft only). */
  draftClients?: { id: string; name: string }[];
  /** Called when the user picks a client in draft mode. */
  onDraftClientChange?: (clientId: string, clientName: string) => void;

}

const isImageFile = (type: string) => type.startsWith('image/');
const AI_UPLOADER_IDS = new Set(["ai-generator", "auto-generator"]);

const isAiGeneratedAttachment = (attachment: Attachment) => {
  const uploaderId = attachment.uploadedBy?.id?.toLowerCase() || "";
  const uploaderEmail = attachment.uploadedBy?.email?.toLowerCase() || "";
  return AI_UPLOADER_IDS.has(uploaderId) || uploaderEmail === "system@ai";
};

const inferDemandType = (card: KanbanCardData | null) => {
  const explicitType = card?.demand_type?.trim();
  if (explicitType) return explicitType;

  const hasSlidePattern = card?.attachments?.some((attachment) => /slide\s*\d+/i.test(attachment.name || ""));
  if (hasSlidePattern) return "Carrossel";

  const searchableText = `${card?.title || ""} ${card?.description || ""} ${card?.instructions || ""}`.toLowerCase();
  if (searchableText.includes("carrossel") || searchableText.includes("carousel")) return "Carrossel";
  if (searchableText.includes("post estático") || searchableText.includes("post estatico") || searchableText.includes("estático") || searchableText.includes("estatico")) return "Post Estático";

  return null;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Soma 1 hora a um par (data YYYY-MM-DD, horário HH:MM) e devolve o novo par.
// Rola para o dia seguinte quando passar de 23:xx.
const addOneHour = (dateStr: string, timeStr: string): { date: string; time: string } => {
  const [h, m] = (timeStr || "00:00").split(":").map((n) => parseInt(n, 10) || 0);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h + 1, m, 0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
};

// Compara datetime (data + horário) — retorna true se A < B.
const isBefore = (aDate: string, aTime: string, bDate: string, bTime: string) => {
  return `${aDate}T${(aTime || "00:00")}` < `${bDate}T${(bTime || "00:00")}`;
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
  onScheduleRequest,
  isDraft = false,
  onDraftSave,
  onDraftDiscard,
  draftClients = [],
  onDraftClientChange,
  savingDraft = false
}: TaskCardProps) {


  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAdditionalDatePickerOpen, setIsAdditionalDatePickerOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachmentToRemove, setAttachmentToRemove] = useState<Attachment | null>(null);
  const [periodPlans, setPeriodPlans] = useState<{ id: string; period_title: string; period_start: string; period_end: string }[]>([]);
  const [loadingPeriodPlans, setLoadingPeriodPlans] = useState(false);
  const [activeSection, setActiveSection] = useState<'description' | 'observations' | 'caption' | 'anexos'>('description');
  const [datesOpen, setDatesOpen] = useState(false);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [regressing, setRegressing] = useState(false);
  const [isLastFn, setIsLastFn] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [inlineScheduleOpen, setInlineScheduleOpen] = useState(false);
  const [inlineScheduling, setInlineScheduling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!card?.tenant_id) { setIsLastFn(false); return; }
    isAtLastFlowFunction(card.tenant_id, card.demand_type_key, card.current_function_key)
      .then((v) => { if (!cancelled) setIsLastFn(v); })
      .catch(() => { if (!cancelled) setIsLastFn(false); });
    return () => { cancelled = true; };
  }, [card?.tenant_id, card?.demand_type_key, card?.current_function_key]);

  const handleProceed = async () => {
    if (!card || proceeding) return;
    if (!card.demand_type_key) {
      toast.error("Defina o tipo da demanda antes de prosseguir.");
      return;
    }
    setProceeding(true);
    try {
      const result = await proceedDemand({
        demandId: card.id,
        tenantId: card.tenant_id,
        demandTypeKey: card.demand_type_key,
        currentFunctionKey: card.current_function_key,
      });
      if (result.success) {
        toast.success(result.message);
        onCardChange({
          ...card,
          assigned_to: result.assignedTo || null,
          current_function_key: result.functionKey || null,
        });
      } else if (result.end) {
        toast(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setProceeding(false);
    }
  };

  const handleRegress = async () => {
    if (!card || regressing) return;
    if (!card.demand_type_key) {
      toast.error("Defina o tipo da demanda antes de voltar.");
      return;
    }
    setRegressing(true);
    try {
      const result = await regressDemand({
        demandId: card.id,
        tenantId: card.tenant_id,
        demandTypeKey: card.demand_type_key,
        currentFunctionKey: card.current_function_key,
      });
      if (result.success) {
        toast.success(result.message);
        onCardChange({
          ...card,
          assigned_to: result.assignedTo || null,
          current_function_key: result.functionKey || null,
        });
      } else {
        toast.error(result.message);
      }
    } finally {
      setRegressing(false);
    }
  };

  const handleDeliver = async () => {
    if (!card || delivering) return;
    const pipelineId = pipelineStatuses[0]?.pipeline_id;
    if (!pipelineId) {
      toast.error("Pipeline não encontrado para esta demanda.");
      return;
    }
    setDelivering(true);
    try {
      // Card Diário: opção (b) — mantém colaborador/função; só finaliza na última ocorrência
      if (card.is_daily_card && !isDraft) {
        const occ = await completeDailyOccurrence(card.id) as any;
        if (!occ.success) {
          toast.error(occ.message);
          return;
        }
        if (occ.finished === true) {
          // Última ocorrência → segue com deliverDemand normal
          const result = await deliverDemand(card.id, pipelineId);
          if (result.success) {
            toast.success("Card Diário finalizado — última ocorrência entregue.");
            const doneStatus = pipelineStatuses.find(s => s.id === result.statusId);
            onCardChange({
              ...card,
              status_id: result.statusId,
              status: doneStatus?.name || card.status,
              current_function_key: null,
              assigned_to: null,
              archived_at: new Date().toISOString(),
            } as any);
            onOpenChange(false);
          } else {
            toast.error(result.message);
          }
          return;
        }
        // Não é a última → não arquiva; só oculta até a próxima data
        const nextDate = occ.nextDate;
        toast.success(`Ocorrência entregue. Próxima: ${formatBRDate(nextDate)}.`);
        onCardChange({
          ...card,
          daily_next_date: nextDate,
          daily_completed_occurrences: (card.daily_completed_occurrences || 0) + 1,
        } as any);
        onOpenChange(false);
        return;
      }

      const result = await deliverDemand(card.id, pipelineId);
      if (result.success) {
        toast.success(result.message);
        const doneStatus = pipelineStatuses.find(s => s.id === result.statusId);
        onCardChange({
          ...card,
          status_id: result.statusId,
          status: doneStatus?.name || card.status,
          current_function_key: null,
          assigned_to: null,
          archived_at: new Date().toISOString(),
        } as any);
        onOpenChange(false);
      } else {
        toast.error(result.message);
      }
    } finally {
      setDelivering(false);
    }
  };


  const [settingType, setSettingType] = useState(false);
  const handleSetDemandType = async (key: DemandTypeKey) => {
    if (!card || settingType) return;
    setSettingType(true);
    try {
      const label = DEMAND_TYPE_LABEL[key];
      // Descobre a etapa inicial (ou mantém a atual se ainda for válida) segundo o fluxo configurado.
      const resolved = await resolveInitialFunctionKey(
        card.tenant_id,
        key,
        card.current_function_key,
      );
      if (!resolved.success) {
        toast.error(resolved.message || "Não foi possível definir a etapa inicial deste tipo.");
        setSettingType(false);
        return;
      }
      const nextFunctionKey = resolved.shouldUpdate
        ? (resolved.functionKey ?? null)
        : (card.current_function_key ?? null);

      if (!isDraft) {
        const updatePayload: Record<string, any> = { demand_type: label, demand_type_key: key };
        if (resolved.shouldUpdate) updatePayload.current_function_key = nextFunctionKey;
        const { error } = await supabase
          .from("demands")
          .update(updatePayload as any)
          .eq("id", card.id);
        if (error) throw error;
      }
      onCardChange({
        ...card,
        demand_type: label,
        demand_type_key: key,
        current_function_key: nextFunctionKey,
      });
      if (!isDraft) toast.success(`Tipo definido: ${label}`);
    } catch (err: any) {
      console.error("[TaskCard] set demand_type_key error", err);
      toast.error(err?.message || "Erro ao definir o tipo da demanda");
    } finally {
      setSettingType(false);
    }
  };
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [selectedAiModel, setSelectedAiModel] = useState<"gpt2" | "nanobanana3" | "nanobanana25">("gpt2");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regeneratingSlide, setRegeneratingSlide] = useState<number | null>(null);
  const [periodTitle, setPeriodTitle] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<{ id: string; name: string }[]>([]);

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

  // Fetch tenant collaborators (agency roles only) for the Responsible selector
  useEffect(() => {
    if (!open || !card?.tenant_id) return;
    let cancelled = false;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", card.tenant_id)
        .in("role", ["agency_admin", "agency_manager", "agency_user"]);
      if (cancelled || !roles || roles.length === 0) {
        if (!cancelled) setCollaborators([]);
        return;
      }
      const ids = Array.from(new Set(roles.map((r: any) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (cancelled) return;
      const list = ids.map((id) => ({
        id,
        name: profiles?.find((p: any) => p.id === id)?.full_name || "Colaborador",
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setCollaborators(list);
    })();
    return () => { cancelled = true; };
  }, [open, card?.tenant_id]);

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
    if (isDraft) {
      // Draft mode: all edits stay local via onCardChange until user clicks Salvar Demanda.
      setEditingField(null);
      return;
    }
    await onSave(field, value);
    setEditingField(null);
  };


  const handleGenerateCaption = async () => {
    if (!card) return;
    const imgs = (card.attachments || []).filter(a => {
      const t = (a as any).type?.toLowerCase?.() || "";
      const n = (a.name || "").toLowerCase();
      return t.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(n);
    });
    if (imgs.length === 0) {
      toast.error("Adicione imagens aos anexos antes de gerar a descrição.");
      return;
    }
    setGeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-post-caption", {
        body: { demandId: card.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const caption: string = data?.caption || "";
      if (!caption) throw new Error("Resposta vazia da IA");
      onCardChange({ ...card, post_caption: caption });
      toast.success("Descrição gerada com sucesso!");
    } catch (e: any) {
      console.error("[generate-post-caption] error:", e);
      toast.error(e?.message || "Erro ao gerar descrição");
    } finally {
      setGeneratingCaption(false);
    }
  };

  // Fetch period plans (used for both linking selector and future unlink flow)
  useEffect(() => {
    if (open && card && card.clientId) {
      fetchPeriodPlansForCard(card.clientId);
    }
  }, [open, card?.id, card?.clientId]);

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
    // Guard against concurrent generation
    if (generatingImages || regeneratingAll) return;
    setGeneratingImages(true);

    try {
      setGenerationProgress({ current: 1, total: 1 });
      
      const functionName = isCarousel ? "auto-generate-carousel" : "generate-post-image";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { demandId: card.id, aiModel: selectedAiModel },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error, { description: data.details?.join(", ") });
        return;
      }

      if (isCarousel) {
        const archivedMsg = data?.archivedSlides > 0 
          ? ` (${data.archivedSlides} slides anteriores movidos para histórico)` 
          : "";
        toast.success(`Carrossel gerado com sucesso!${archivedMsg}`);
      } else {
        toast.success(`${data?.generated || 0} imagem(ns) gerada(s) com sucesso!`);
      }

      // Refetch demand to get updated attachments
      const { data: updatedDemand } = await supabase
        .from("demands")
        .select("attachments, rejected_attachments")
        .eq("id", card.id)
        .single();
      if (updatedDemand) {
        onCardChange({ 
          ...card, 
          attachments: updatedDemand.attachments as unknown as Attachment[],
        });
      }
    } catch (error: any) {
      console.error("Error generating images:", error);
      const msg = error?.message || "Erro ao gerar imagens";
      toast.error(msg.includes("non-2xx") ? "Erro na geração. Tente novamente em alguns segundos." : msg);
    } finally {
      setGeneratingImages(false);
      setGenerationProgress(null);
    }
  };

  const resolvedDemandType = inferDemandType(card);
  const isCarousel = !!resolvedDemandType?.toLowerCase().includes('carrossel') || !!resolvedDemandType?.toLowerCase().includes('carousel');
  const aiAttachments = card?.attachments?.filter(isAiGeneratedAttachment) || [];
  const hasAiAttachments = aiAttachments.length > 0;

  const handleRegenerateAll = async () => {
    if (!card) return;
    setRegeneratingAll(true);
    try {
      // Regenerate based on type — preserve existing attachments (new ones are appended)
      if (isCarousel) {
        const { data, error } = await supabase.functions.invoke("auto-generate-carousel", {
          body: { demandId: card.id, aiModel: selectedAiModel },
        });
        if (error) throw error;
        if (data?.error) {
          toast.error(data.error);
          return;
        }
        toast.success("Carrossel regenerado com sucesso!");
      } else {
        const { data, error } = await supabase.functions.invoke("generate-post-image", {
          body: { demandId: card.id, aiModel: selectedAiModel },
        });
        if (error) throw error;
        if (data?.error) {
          toast.error(data.error, { description: data.details?.join(", ") });
          return;
        }
        toast.success(`${data?.generated || 0} imagem(ns) regenerada(s)!`);
      }

      // Refetch
      const { data: updatedDemand } = await supabase
        .from("demands")
        .select("attachments")
        .eq("id", card.id)
        .single();
      if (updatedDemand) {
        onCardChange({ ...card, attachments: updatedDemand.attachments as unknown as Attachment[] });
      }
    } catch (error: any) {
      console.error("Error regenerating:", error);
      toast.error(error.message || "Erro ao regenerar");
    } finally {
      setRegeneratingAll(false);
    }
  };

  const handleRegenerateSlide = async (slideNumber: number) => {
    if (!card) return;
    setRegeneratingSlide(slideNumber);
    try {
      const { data, error } = await supabase.functions.invoke("generate-post-image", {
        body: { demandId: card.id, slideNumber, replaceSlide: false, aiModel: "gpt2" },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`Slide ${slideNumber} regenerado com sucesso!`);

      // Refetch
      const { data: updatedDemand } = await supabase
        .from("demands")
        .select("attachments")
        .eq("id", card.id)
        .single();
      if (updatedDemand) {
        onCardChange({ ...card, attachments: updatedDemand.attachments as unknown as Attachment[] });
      }
    } catch (error: any) {
      console.error("Error regenerating slide:", error);
      toast.error(error.message || "Erro ao regenerar slide");
    } finally {
      setRegeneratingSlide(null);
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
                <div className="flex min-w-0 items-center gap-3">
                  {!isDraft && card.clientName && (
                    <Badge variant="secondary" className="max-w-[220px] shrink-0 px-2.5 py-1 text-xs font-semibold">
                      <span className="truncate">{card.clientName}</span>
                    </Badge>
                  )}
                  {!readOnly && (isDraft || editingField === 'title' || !card.title) ? (
                    <Input
                      autoFocus={editingField === 'title' || isDraft}
                      value={card.title || ""}
                      onChange={e => onCardChange({ ...card, title: e.target.value })}
                      onBlur={() => { if (editingField === 'title') handleFieldSave('title', card.title || ''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleFieldSave('title', card.title || ''); }}
                      placeholder="Nome da demanda"
                      className="h-14 min-w-0 text-3xl font-bold border-primary"
                    />
                  ) : (
                    <h1
                      id="task-card-title"
                      onClick={() => !readOnly && setEditingField('title')}
                      className={cn("min-w-0 truncate font-bold text-3xl md:text-4xl", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
                    >
                      {card.title}
                    </h1>
                  )}
                </div>
              </div>
              {!readOnly && (
                isDraft ? (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-11 gap-2 shrink-0"
                      onClick={() => {
                        if (savingDraft) return;
                        onDraftSave?.();
                      }}
                      disabled={savingDraft}
                      aria-label="Salvar demanda"
                      title="Salvar e enviar para o Kanban"
                    >
                      {savingDraft ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>{savingDraft ? "Salvando…" : "Salvar Demanda"}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 gap-2 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => onDraftDiscard?.()}
                      disabled={savingDraft}
                      aria-label="Descartar rascunho"
                      title="Descartar sem salvar"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Descartar</span>
                    </Button>
                  </>
                ) : card.is_daily_card ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-11 gap-2 shrink-0"
                    onClick={handleDeliver}
                    disabled={delivering}
                    aria-label="Entregar ocorrência diária"
                    title="Registrar a ocorrência de hoje e reagendar para o próximo dia válido"
                  >
                    {delivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>Entregar ocorrência</span>
                  </Button>
                ) : (
                  <>
                    {card.current_function_key && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 gap-2 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={handleRegress}
                        disabled={regressing || !card.demand_type_key}
                        aria-label="Voltar demanda"
                        title="Devolver a demanda para a etapa anterior do fluxo"
                      >
                        {regressing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                        <span>Voltar demanda</span>
                      </Button>
                    )}
                    {isLastFn ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-11 gap-2 shrink-0"
                        onClick={handleDeliver}
                        disabled={delivering}
                        aria-label="Entregar"
                        title="Entregar demanda e mover para Demandas Completas"
                      >
                        {delivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        <span>Entregar</span>
                      </Button>
                    ) : card.current_function_key === 'publicar' ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-11 gap-2 shrink-0"
                        onClick={() => setInlineScheduleOpen(true)}
                        aria-label="Agendar Publicação"
                        title="Agendar a publicação nas redes sociais conectadas"
                      >
                        <CalendarClock className="h-4 w-4" />
                        <span>Agendar Publicação</span>
                      </Button>
                    ) : (
                      (() => {
                        const isEnviarCliente = card.current_function_key === 'enviar_cliente';
                        const btnLabel = isEnviarCliente ? 'Marcar como enviado ao cliente' : 'Prosseguir';
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11 gap-2 shrink-0"
                            onClick={handleProceed}
                            disabled={proceeding || !card.demand_type_key}
                            aria-label={btnLabel}
                            title={!card.demand_type_key ? "Defina o tipo da demanda antes de prosseguir" : (isEnviarCliente ? "Marcar como enviado ao cliente e mover para Aguardando cliente" : "Enviar para o próximo colaborador do fluxo")}
                          >
                            {proceeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            <span>{btnLabel}</span>
                          </Button>
                        );
                      })()
                    )}
                  </>
                )
              )}



              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-lg border border-border bg-muted/40 hover:bg-muted shrink-0"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fechar</span>
              </Button>
            </div>

            {/* Linha 2: Cliente + Status */}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {isDraft ? (
                <Select
                  value={card.clientId || ""}
                  onValueChange={(v) => {
                    const c = draftClients.find((d) => d.id === v);
                    onDraftClientChange?.(v, c?.name || "Cliente");
                  }}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[200px] text-xs font-medium">
                    <SelectValue placeholder="Selecione o cliente *" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-[320px]">
                    {draftClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {isDraft && <div className="h-4 w-px bg-border" />}

              {/* Status oculto visualmente (mantido no DOM para preservar comportamento) */}
              <div className="hidden">
                {isDraft ? null : readOnly ? (
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
                    <SelectContent className="min-w-[220px] max-h-[420px]">
                      <ScrollArea className="max-h-[400px]">
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
              </div>

              {/* Etapa — oculta durante a criação (draft). Só aparece após o card existir no kanban. */}
              {!isDraft && (() => {
                const FUNCTION_LABELS: Record<string, string> = {
                  planejar: "Planejar",
                  criar_roteiro: "Criar roteiro",
                  criar_arte: "Criar arte",
                  captar: "Captar",
                  gerar_video: "Gerar vídeo",
                  editar_video: "Editar vídeo",
                  revisar: "Revisar",
                  enviar_cliente: "Enviar cliente",
                  aguardando_cliente: "Aguardando cliente",

                  publicar: "Publicar",
                  revisar_publicacao: "Revisar publicação",
                };
                const label = card.current_function_key
                  ? (FUNCTION_LABELS[card.current_function_key] || card.current_function_key)
                  : "Sem etapa";
                return (
                  <div
                    className="h-8 px-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 text-primary font-medium text-xs"
                    title="Etapa atual do fluxo"
                  >
                    <span className="text-[10px] uppercase tracking-wide opacity-70">Etapa</span>
                    <span>{label}</span>
                  </div>
                );
              })()}

              {/* Período (ao lado da Etapa) */}
              <div className="h-8 px-3 flex items-center gap-2 rounded-md border border-border bg-card text-xs">
                <Link className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wide opacity-70 font-medium">Período</span>
                {card.period_plan_id ? (
                  <>
                    <span className="text-foreground font-medium truncate max-w-[200px]">
                      {periodTitle || "Carregando..."}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={async () => {
                          if (!card) return;
                          try {
                            const { error } = await supabase
                              .from("demands")
                              .update({ period_plan_id: null })
                              .eq("id", card.id);
                            if (error) throw error;
                            onCardChange({ ...card, period_plan_id: null });
                            setPeriodTitle(null);
                            const { toast } = await import("sonner");
                            toast.success("Vínculo com o período removido");
                          } catch (err) {
                            console.error("Error unlinking period:", err);
                            const { toast } = await import("sonner");
                            toast.error("Erro ao remover vínculo");
                          }
                        }}
                        title="Desvincular do período"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </>
                ) : readOnly ? (
                  <span className="text-muted-foreground">—</span>
                ) : periodPlans.length > 0 ? (
                  <Select onValueChange={handleLinkPeriod}>
                    <SelectTrigger className="h-6 border-0 shadow-none px-1 text-xs w-auto min-w-[130px]" aria-label="Vincular a período">
                      <SelectValue placeholder="Vincular" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {periodPlans.map(pp => (
                        <SelectItem key={pp.id} value={pp.id}>
                          <span className="text-xs">
                            {pp.period_title} ({format(new Date(pp.period_start + 'T00:00:00'), "dd/MM", { locale: ptBR })} - {format(new Date(pp.period_end + 'T00:00:00'), "dd/MM", { locale: ptBR })})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground">
                    {loadingPeriodPlans ? "Carregando..." : "Nenhum"}
                  </span>
                )}
              </div>
            </div>

            {/* Amber banner de Definir tipo removido — Tipo passou para a linha de triggers */}
          </div>


          {/* ===== BODY - 2 COLUNAS ===== */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 gap-6 p-6">
              
              {/* === COLUNA ESQUERDA: Conteúdo === */}
              <div className="space-y-6">
                <div className="space-y-5">
                    {(() => {
                      const { instr: instrValue, cta: ctaValue } = splitInstructionsCTA(card.instructions);
                      return (
                        <>
              {/* === CONTROLES INTEGRADOS (barra fina, popovers locais) === */}
              <div className="space-y-4">
                {/* Barra única: Responsável · Tipo   ·   Datas   Objetivo */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 rounded-lg bg-muted/30">
                  {/* Responsável */}
                  <div className="flex items-center gap-1 min-w-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select
                      value={card.assigned_to || "__none__"}
                      onValueChange={async (val) => {
                        const newVal = val === "__none__" ? "" : val;
                        onCardChange({ ...card, assigned_to: newVal || null });
                        await onSave("assigned_to", newVal);
                      }}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-7 text-sm border-0 shadow-none bg-transparent px-1.5 gap-1 hover:bg-background/60 focus:ring-0 w-auto min-w-[110px]" aria-label="Responsável">
                        <SelectValue placeholder="Sem responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {collaborators.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <span className="text-muted-foreground/40 select-none">·</span>

                  {/* Tipo */}
                  <div className="flex items-center gap-1 min-w-0">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select
                      value={card.demand_type_key || ""}
                      onValueChange={(val) => handleSetDemandType(val as DemandTypeKey)}
                      disabled={readOnly || settingType}
                    >
                      <SelectTrigger className="h-7 text-sm border-0 shadow-none bg-transparent px-1.5 gap-1 hover:bg-background/60 focus:ring-0 w-auto min-w-[110px]" aria-label="Tipo">
                        <SelectValue placeholder="Definir tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {OFFICIAL_DEMAND_TYPES.map((opt) => (
                          <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1" />

                  {/* Datas — chip com Popover integrado */}
                  {!card.is_daily_card && (() => {
                    const startStr = card.due_date ? `${formatShortDate(card.due_date)}${card.due_time ? ' ' + card.due_time : ''}` : null;
                    const pubStr = card.publish_date ? `${formatShortDate(card.publish_date)}${card.publish_time ? ' ' + card.publish_time : ''}` : null;
                    const parts = [startStr && `Início ${startStr}`, pubStr && `Pub ${pubStr}`].filter(Boolean) as string[];
                    const summary = parts.length ? parts.join(' · ') : 'Adicionar datas';
                    const handleEnterBlur = (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const el = e.target as HTMLElement;
                        if (el && typeof (el as any).blur === 'function') (el as any).blur();
                        setDatesOpen(false);
                      }
                    };
                    return (
                      <Popover open={datesOpen} onOpenChange={setDatesOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded hover:bg-background/60 transition-colors max-w-[340px] min-w-0",
                              parts.length ? "text-foreground" : "text-muted-foreground"
                            )}
                            aria-label="Datas e horários"
                          >
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate capitalize">{summary}</span>
                            <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", datesOpen && "rotate-180")} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-[400px] p-3 space-y-2.5" onKeyDown={handleEnterBlur}>
                          {/* Linha: Início de Produção */}
                          <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-center gap-1.5 w-[92px] shrink-0 text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              <span>Início</span>
                            </div>
                            {card.due_date ? (
                              <>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 px-2 justify-start gap-1.5 font-normal flex-1 min-w-0" disabled={readOnly}>
                                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="capitalize truncate">{formatShortDate(card.due_date)}</span>
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={new Date(card.due_date + 'T00:00:00')} onSelect={async (date) => {
                                      if (!date) return;
                                      const formatted = date.toISOString().split('T')[0];
                                      const time = card.due_time || '09:00';
                                      const patch: any = { ...card, due_date: formatted };
                                      if (!card.delivery_date || isBefore(card.delivery_date, card.delivery_time || '00:00', formatted, time)) {
                                        const bumped = addOneHour(formatted, time);
                                        patch.delivery_date = bumped.date;
                                        patch.delivery_time = bumped.time;
                                      }
                                      onCardChange(patch);
                                      await onSave('due_date', formatted);
                                      if (patch.delivery_date !== card.delivery_date) await onSave('delivery_date', patch.delivery_date);
                                      if (patch.delivery_time !== card.delivery_time) await onSave('delivery_time', patch.delivery_time);
                                    }} initialFocus className="p-3 pointer-events-auto" />
                                  </PopoverContent>
                                </Popover>
                                <Input type="time" value={card.due_time || '09:00'} disabled={readOnly} onChange={async (e) => {
                                  const time = e.target.value;
                                  const dateStr = card.due_date || '';
                                  const patch: any = { ...card, due_time: time };
                                  if (dateStr && (!card.delivery_date || isBefore(card.delivery_date, card.delivery_time || '00:00', dateStr, time))) {
                                    const bumped = addOneHour(dateStr, time);
                                    patch.delivery_date = bumped.date;
                                    patch.delivery_time = bumped.time;
                                  }
                                  onCardChange(patch);
                                  await onSave('due_time', time);
                                  if (patch.delivery_date && patch.delivery_date !== card.delivery_date) await onSave('delivery_date', patch.delivery_date);
                                  if (patch.delivery_time && patch.delivery_time !== card.delivery_time) await onSave('delivery_time', patch.delivery_time);
                                }} className="h-8 w-[86px] text-sm shrink-0" aria-label="Horário de início" />
                                {!readOnly && (
                                  <button type="button" onClick={async () => { onCardChange({ ...card, due_date: '', due_time: '' }); await onSave('due_date', ''); await onSave('due_time', ''); }} className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0" aria-label="Remover início"><X className="h-3.5 w-3.5" /></button>
                                )}
                              </>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 px-2 justify-start gap-1.5 font-normal flex-1 text-muted-foreground" disabled={readOnly}>
                                    <Plus className="h-3.5 w-3.5" /> Definir
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar mode="single" selected={undefined} onSelect={async (date) => {
                                    if (!date) return;
                                    const formatted = date.toISOString().split('T')[0];
                                    const bumped = addOneHour(formatted, '09:00');
                                    onCardChange({ ...card, due_date: formatted, due_time: '09:00', delivery_date: bumped.date, delivery_time: bumped.time });
                                    await onSave('due_date', formatted);
                                    await onSave('due_time', '09:00');
                                    await onSave('delivery_date', bumped.date);
                                    await onSave('delivery_time', bumped.time);
                                  }} initialFocus className="p-3 pointer-events-auto" />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>

                          {/* Linha: Data de Entrega */}
                          <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-center gap-1.5 w-[92px] shrink-0 text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span>Entrega</span>
                            </div>
                            {card.delivery_date ? (
                              <>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 px-2 justify-start gap-1.5 font-normal flex-1 min-w-0" disabled={readOnly}>
                                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="capitalize truncate">{formatShortDate(card.delivery_date)}</span>
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={new Date(card.delivery_date + 'T00:00:00')} onSelect={async (date) => {
                                      if (!date) return;
                                      const formatted = date.toISOString().split('T')[0];
                                      onCardChange({ ...card, delivery_date: formatted });
                                      handleFieldSave('delivery_date', formatted);
                                    }} initialFocus className="p-3 pointer-events-auto" />
                                  </PopoverContent>
                                </Popover>
                                <Input type="time" value={card.delivery_time || '09:00'} disabled={readOnly} onChange={async (e) => { const time = e.target.value; onCardChange({ ...card, delivery_time: time }); await onSave('delivery_time', time); }} className="h-8 w-[86px] text-sm shrink-0" aria-label="Horário de entrega" />
                                {!readOnly && (
                                  <button type="button" onClick={async () => { onCardChange({ ...card, delivery_date: '', delivery_time: '' }); await onSave('delivery_date', ''); await onSave('delivery_time', ''); }} className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0" aria-label="Remover entrega"><X className="h-3.5 w-3.5" /></button>
                                )}
                              </>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 px-2 justify-start gap-1.5 font-normal flex-1 text-muted-foreground" disabled={readOnly}>
                                    <Plus className="h-3.5 w-3.5" /> Definir
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar mode="single" selected={undefined} onSelect={async (date) => {
                                    if (!date) return;
                                    const formatted = date.toISOString().split('T')[0];
                                    onCardChange({ ...card, delivery_date: formatted, delivery_time: '09:00' });
                                    await onSave('delivery_date', formatted);
                                    await onSave('delivery_time', '09:00');
                                  }} initialFocus className="p-3 pointer-events-auto" />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>

                          {/* Linha: Data de Publicação */}
                          <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-center gap-1.5 w-[92px] shrink-0 text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              <span>Publicação</span>
                            </div>
                            {card.publish_date ? (
                              <>
                                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 px-2 justify-start gap-1.5 font-normal flex-1 min-w-0" disabled={readOnly}>
                                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="capitalize truncate">{formatShortDate(card.publish_date)}</span>
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={new Date(card.publish_date + 'T00:00:00')} onSelect={handlePublishDateChange} initialFocus className="p-3 pointer-events-auto" />
                                  </PopoverContent>
                                </Popover>
                                <Input type="time" value={card.publish_time || '09:00'} disabled={readOnly} onChange={(e) => handlePublishTimeChange(e.target.value)} className="h-8 w-[86px] text-sm shrink-0" aria-label="Horário de publicação" />
                                {!readOnly && (
                                  <button type="button" onClick={async () => {
                                    onCardChange({ ...card, publish_date: '', publish_time: '', additional_publish_dates: [] });
                                    await onSave('publish_date', '');
                                    await onSave('publish_time', '');
                                    try { await supabase.from("demands").update({ additional_publish_dates: [] }).eq("id", card.id); } catch (e) { console.error(e); }
                                  }} className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0" aria-label="Remover publicação"><X className="h-3.5 w-3.5" /></button>
                                )}
                              </>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 px-2 justify-start gap-1.5 font-normal flex-1 text-muted-foreground" disabled={readOnly}>
                                    <Plus className="h-3.5 w-3.5" /> Definir
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar mode="single" selected={undefined} onSelect={async (date) => {
                                    if (!date) return;
                                    const formatted = date.toISOString().split('T')[0];
                                    onCardChange({ ...card, publish_date: formatted, publish_time: '09:00' });
                                    await onSave('publish_date', formatted);
                                    await onSave('publish_time', '09:00');
                                  }} initialFocus className="p-3 pointer-events-auto" />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>

                          {/* Datas adicionais — sub-lista compacta */}
                          {card.publish_date && (
                            <div className="pt-2 mt-1 border-t border-border/50 space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-0.5">
                                Datas adicionais{additionalDates.length > 0 ? ` (${additionalDates.length})` : ''}
                              </div>
                              {additionalDates.map((dateStr) => (
                                <div key={dateStr} className="flex items-center gap-2 text-sm pl-1">
                                  <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="capitalize flex-1 truncate">{formatShortDate(dateStr)}</span>
                                  {!readOnly && (
                                    <button type="button" onClick={() => handleRemoveAdditionalDate(dateStr)} className="text-muted-foreground hover:text-destructive p-0.5 rounded" aria-label="Remover data adicional"><X className="h-3 w-3" /></button>
                                  )}
                                </div>
                              ))}
                              {!readOnly && (
                                <Popover open={isAdditionalDatePickerOpen} onOpenChange={setIsAdditionalDatePickerOpen}>
                                  <PopoverTrigger asChild>
                                    <button type="button" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pl-1 mt-1">
                                      <Plus className="h-3 w-3" /> Adicionar data
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={undefined} onSelect={handleAddAdditionalDate} initialFocus className="p-3 pointer-events-auto" />
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    );
                  })()}

                  {/* Objetivo — chip com Popover */}
                  {(() => {
                    const preview = (card.objective || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                    const truncated = preview.length > 40 ? preview.slice(0, 40) + '…' : preview;
                    return (
                      <Popover open={objectiveOpen} onOpenChange={(open) => { setObjectiveOpen(open); if (!open) handleFieldSave('objective', card.objective || ''); }}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded hover:bg-background/60 transition-colors max-w-[280px] min-w-0",
                              preview ? "text-foreground" : "text-muted-foreground"
                            )}
                            aria-label="Objetivo"
                          >
                            <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{preview ? truncated : 'Adicionar objetivo'}</span>
                            {saving && savingField === 'objective' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                            <ChevronDown className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", objectiveOpen && "rotate-180")} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-[520px] p-3">
                          {readOnly ? (
                            <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.objective || "") }} />
                          ) : (
                            <BlockEditor content={convertToHtml(card.objective || "")} onChange={value => onCardChange({ ...card, objective: value })} onBlur={() => handleFieldSave('objective', card.objective || '')} placeholder="Qual é a finalidade estratégica deste material?" minHeight="120px" />
                          )}
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>

                {/* Card Diário (recorrência) — bloco separado quando ativo */}
                {(isDraft || card.is_daily_card) && (
                  <div className="mb-4">
                    <DailyCardSection
                      editable={isDraft || !!card.is_daily_card}
                      values={{
                        is_daily_card: !!card.is_daily_card,
                        daily_start_date: card.daily_start_date ?? null,
                        daily_end_date: card.daily_end_date ?? null,
                        daily_time: card.daily_time ?? null,
                        daily_exclude_weekends: card.daily_exclude_weekends ?? true,
                        daily_exclude_holidays: card.daily_exclude_holidays ?? true,
                        daily_next_date: card.daily_next_date ?? null,
                        daily_total_occurrences: card.daily_total_occurrences ?? null,
                        daily_completed_occurrences: card.daily_completed_occurrences ?? 0,
                        daily_completed_dates: card.daily_completed_dates ?? [],
                      }}
                      onChange={async (v) => {
                        const patch: any = { ...card, ...v };
                        onCardChange(patch);
                        if (!isDraft && card.id) {
                          await supabase
                            .from("demands")
                            .update({
                              is_daily_card: v.is_daily_card,
                              daily_start_date: v.daily_start_date,
                              daily_end_date: v.daily_end_date,
                              daily_time: v.daily_time,
                              daily_exclude_weekends: v.daily_exclude_weekends,
                              daily_exclude_holidays: v.daily_exclude_holidays,
                              daily_next_date: v.daily_next_date,
                              daily_total_occurrences: v.daily_total_occurrences,
                            } as any)
                            .eq("id", card.id);
                        }
                      }}
                    />
                  </div>
                )}
              </div>




                          <Separator />

                          {/* Botões de navegação (estilo hub) */}
                          {(() => {
                            const sectionButtons = [
                              { id: 'description' as const, label: 'Conteúdo', icon: AlignLeft, savingKey: 'description' },
                              { id: 'observations' as const, label: 'Observações', icon: MessageSquare, savingKey: 'observations' },
                              { id: 'caption' as const, label: 'Descrição', icon: Sparkles, savingKey: 'post_caption' },
                              { id: 'anexos' as const, label: 'Anexos', icon: Paperclip, savingKey: 'attachments' },
                            ];
                            return (
                              <div className="flex flex-wrap gap-2">
                                {sectionButtons.map(({ id, label, icon: Icon, savingKey }) => {
                                  const isActive = activeSection === id;
                                  const isSaving = saving && savingField === savingKey;
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      onClick={() => setActiveSection(id)}
                                      className={cn(
                                        "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                                        isActive
                                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                          : "bg-background text-foreground border-border hover:bg-muted hover:border-primary/40"
                                      )}
                                      aria-pressed={isActive}
                                    >
                                      <Icon className="h-4 w-4" />
                                      <span>{label}</span>
                                      {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Painel do botão ativo */}
                          {activeSection !== 'anexos' && (
                          <section className="rounded-lg border border-border bg-card/40 p-4">
                            {activeSection === 'description' && (
                              readOnly ? (
                                <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.description || "") }} />
                              ) : (
                                <BlockEditor content={convertToHtml(card.description || "")} onChange={value => onCardChange({ ...card, description: value })} onBlur={() => handleFieldSave('description', card.description || '')} placeholder="Texto do post, legenda, copy..." minHeight="160px" />
                              )
                            )}

                            {/* Abas "Instruções de Produção" e "CTA Recomendado" ocultadas da UI.
                                A coluna `instructions` continua sendo preenchida pela IA/planejamento e
                                usada pelas edge functions de geração. splitInstructionsCTA/combineInstructionsCTA
                                permanecem no arquivo para compatibilidade futura. */}


                            {activeSection === 'observations' && (
                              readOnly ? (
                                <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.observations || "") }} />
                              ) : (
                                <BlockEditor content={convertToHtml(card.observations || "")} onChange={value => onCardChange({ ...card, observations: value })} onBlur={() => handleFieldSave('observations', card.observations || '')} placeholder="Feedbacks, ajustes, observações internas..." minHeight="100px" />
                              )
                            )}

                            {activeSection === 'caption' && (
                              <div className="space-y-3">
                                {!readOnly && (
                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleGenerateCaption}
                                      disabled={generatingCaption}
                                      className="gap-1.5 h-8"
                                    >
                                      {generatingCaption ? (
                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</>
                                      ) : (
                                        <><Wand2 className="h-3.5 w-3.5" /> Fazer descrição</>
                                      )}
                                    </Button>
                                  </div>
                                )}
                                {readOnly ? (
                                  <div className="whitespace-pre-wrap text-sm text-muted-foreground">{card.post_caption || ""}</div>
                                ) : (
                                  <Textarea
                                    value={card.post_caption || ""}
                                    onChange={(e) => onCardChange({ ...card, post_caption: e.target.value })}
                                    onBlur={() => handleFieldSave('post_caption', card.post_caption || '')}
                                    placeholder="Legenda para Instagram — clique em 'Fazer descrição' para gerar com IA a partir dos anexos."
                                    className="min-h-[140px] resize-y"
                                  />
                                )}
                              </div>
                            )}
                          </section>
                          )}
                        </>

                      );
                    })()}

                    {/* Ações: Arquivar + Excluir — ícones ao lado */}
                    {!readOnly && (
                      <div className="flex justify-end items-center gap-2 pt-2">
                        {onArchive && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                aria-label={card.archived_at ? "Desarquivar demanda" : "Arquivar demanda"}
                                title={card.archived_at ? "Desarquivar demanda" : "Arquivar demanda"}
                                className="text-muted-foreground hover:text-amber-600 transition-colors p-1"
                              >
                                {card.archived_at ? <ArchiveRestore className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {card.archived_at ? "Desarquivar demanda?" : "Arquivar demanda?"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {card.archived_at
                                    ? "Deseja realmente desarquivar esta demanda?"
                                    : "Deseja realmente arquivar esta demanda?"}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onArchive(!card.archived_at)}>
                                  Confirmar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              aria-label="Excluir demanda"
                              title="Excluir demanda"
                              className="text-destructive hover:text-destructive/80 transition-colors p-1"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir demanda?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. Deseja realmente excluir esta demanda?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={onDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                </div>
              </div>

            </div>

            {/* ===== ANEXOS - Full Width (aparece apenas quando o botão Anexos está ativo) ===== */}
            {activeSection === 'anexos' && (
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

                    <div className="flex items-center gap-2 flex-wrap">
                      {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {!readOnly && (
                        <>
                          {/* Generate button - label and action based on demand type */}
                          {!hasAiAttachments && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generatingImages ? null : setShowGenerateConfirm(true)}
                              disabled={generatingImages || regeneratingAll}
                              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
                            >
                              {generatingImages ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4" />
                              )}
                              {generatingImages
                                ? 'Gerando...'
                                : isCarousel
                                  ? 'Gerar carrossel com IA'
                                  : 'Gerar estático com IA'}
                            </Button>
                          )}

                          {/* Regenerate all - shows when there are AI attachments */}
                          {hasAiAttachments && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRegenerateAll}
                              disabled={regeneratingAll || generatingImages}
                              className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                            >
                              {regeneratingAll ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              {regeneratingAll
                                ? 'Regenerando...'
                                : isCarousel
                                  ? 'Regenerar tudo'
                                  : 'Regenerar estático'}
                            </Button>
                          )}
                        </>
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
                                          className="relative h-[100px] w-[100px] rounded-md bg-muted flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                                          onClick={(e) => { e.stopPropagation(); setPreviewAttachment(attachment); }}
                                        >
                                          {isImageFile(attachment.type) ? (
                                            <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                                          ) : (
                                            <File className="h-8 w-8 text-muted-foreground" />
                                          )}
                                          {(() => {
                                            const slideMatch = attachment.name?.match(/Slide\s*(\d+)/i);
                                            const slideNum = slideMatch ? parseInt(slideMatch[1], 10) : null;
                                            if (slideNum !== null && regeneratingSlide === slideNum) {
                                              return (
                                                <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center overflow-hidden">
                                                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-shimmer" />
                                                  <Sparkles className="h-5 w-5 text-primary animate-pulse relative z-10" />
                                                </div>
                                              );
                                            }
                                            return null;
                                          })()}
                                        </div>

                                        <div className="w-full text-center cursor-pointer" onClick={(e) => { e.stopPropagation(); setPreviewAttachment(attachment); }}>
                                          <p className="text-[10px] font-medium truncate text-foreground">{attachment.name}</p>
                                          <p className="text-[9px] text-muted-foreground">{formatFileSize(attachment.size)}</p>
                                        </div>

                                        {/* Per-slide regenerate button for AI-generated carousel slides */}
                                        {!readOnly && isCarousel && isAiGeneratedAttachment(attachment) && (() => {
                                          const slideMatch = attachment.name?.match(/Slide\s*(\d+)/i);
                                          const slideNum = slideMatch ? parseInt(slideMatch[1], 10) : idx + 1;

                                          return (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-5 w-full text-[9px] px-1 gap-0.5 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
                                              disabled={regeneratingSlide !== null || regeneratingAll}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRegenerateSlide(slideNum);
                                              }}
                                            >
                                              {regeneratingSlide === slideNum ? (
                                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                              ) : (
                                                <RotateCcw className="h-2.5 w-2.5" />
                                              )}
                                              Regenerar Slide {slideNum}
                                            </Button>
                                          );
                                        })()}
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

                      {/* Generation shimmer placeholders */}
                      {(generatingImages || regeneratingAll) && (
                        <div className="flex gap-3 mb-4 overflow-x-auto pb-2 scrollbar-thin">
                          {Array.from({ length: isCarousel ? 3 : 1 }).map((_, i) => (
                            <div
                              key={`shimmer-${i}`}
                              className="relative flex flex-col items-center gap-1 p-1.5 bg-muted/30 rounded-lg border border-primary/30 w-[110px] flex-shrink-0"
                            >
                              <div className="relative h-[100px] w-[100px] rounded-md bg-muted flex items-center justify-center overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-shimmer" />
                                <Sparkles className="h-6 w-6 text-primary animate-pulse relative z-10" />
                              </div>
                              <p className="text-[10px] font-medium text-primary animate-pulse">Gerando…</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upload Button */}
                      {!readOnly && isDraft && (
                        <div className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border/60 rounded-lg bg-muted/30 text-sm text-muted-foreground">
                          <Paperclip className="h-4 w-4" />
                          Salve a demanda para anexar arquivos, gerar por IA ou agendar publicação.
                        </div>
                      )}
                      {!readOnly && !isDraft && (
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
            )}
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
            <AlertDialogTitle>
              {isCarousel ? "Gerar carrossel com IA?" : "Gerar estático com IA?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isCarousel
                ? "A IA irá analisar a atividade e gerar imagens para os slides do carrossel. Isso pode levar alguns minutos."
                : "A IA irá analisar a atividade e gerar a imagem do post estático. Isso pode levar alguns minutos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Modelo de IA
            </label>
            <Select value={selectedAiModel} onValueChange={(v) => setSelectedAiModel(v as any)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt2">GPT Image 2 (recomendado)</SelectItem>
                <SelectItem value="nanobanana3">Nanobanana 3 (Gemini 3 Pro)</SelectItem>
                <SelectItem value="nanobanana25">Nanobanana 2.5 (Gemini Flash)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {selectedAiModel === "gpt2" && "openai · gpt-image-2"}
              {selectedAiModel === "nanobanana3" && "google · gemini-3-pro-image-preview"}
              {selectedAiModel === "nanobanana25" && "google · gemini-2.5-flash-image-preview"}
            </p>
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
              {isCarousel ? "Gerar carrossel" : "Gerar estático"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SchedulePublicationModal
        open={inlineScheduleOpen}
        onOpenChange={setInlineScheduleOpen}
        existingDate={card?.publish_date}
        existingTime={card?.publish_time}
        onCancel={() => setInlineScheduleOpen(false)}
        onConfirm={async (date, time) => {
          if (!card || inlineScheduling) return;
          if (!card.clientId) {
            toast.error("Este card não está vinculado a um cliente.");
            return;
          }
          setInlineScheduling(true);
          try {
            const existed = await hasActiveDispatch(card.id);
            if (existed) {
              const ok = window.confirm("Este card já possui uma publicação agendada. Deseja atualizar o disparo existente?");
              if (!ok) {
                toast.info("Disparo anterior mantido.");
                return;
              }
            }
            const { error: upErr } = await supabase
              .from("demands")
              .update({ publish_date: date, publish_time: time, updated_at: new Date().toISOString() })
              .eq("id", card.id);
            if (upErr) throw upErr;
            const result = await createOrUpdateScheduleDispatch({
              cardId: card.id,
              tenantId: card.tenant_id,
              clientId: card.clientId,
              publishDate: date,
              publishTime: time,
              caption: (card as any).post_caption || card.description,
              attachments: card.attachments as any,
              demandType: card.demand_type,
              title: card.title,
            });
            if (!result.ok) {
              toast.error(result.error || "Não foi possível agendar a publicação");
              return;
            }
            onCardChange({ ...card, publish_date: date, publish_time: time });
            toast.success(`Publicação agendada para ${new Date(date + 'T' + time).toLocaleDateString('pt-BR')} às ${time}.`);
            setInlineScheduleOpen(false);
          } catch (err: any) {
            console.error("[TaskCard] inline schedule error", err);
            toast.error(err?.message || "Erro ao agendar publicação");
          } finally {
            setInlineScheduling(false);
          }
        }}
      />
    </>;

  return createPortal(modalContent, document.body);
}