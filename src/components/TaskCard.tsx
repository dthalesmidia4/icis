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
import { proceedDemand, regressDemand, deliverDemand, isAtLastFlowFunction, resolveInitialFunctionKey, OFFICIAL_DEMAND_TYPES, DEMAND_TYPE_LABEL, getPipelineSequence, jumpToFunction, type DemandTypeKey } from "@/lib/proceedDemand";
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";
import { completeDailyOccurrence, formatBR as formatBRDate } from "@/lib/dailyCards";
import { DailyCardSection } from "@/components/DailyCardSection";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { createOrUpdateScheduleDispatch, hasActiveDispatch } from "@/lib/createScheduleDispatch";
import { syncActiveDispatchDate } from "@/lib/syncActiveDispatchDate";
import { findAreaConflicts, AREA_LABEL, type WorkArea, type AreaConflictInfo } from "@/lib/areaConflicts";
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
import { StartEndDatePopover, SingleDateTimePopover } from "@/components/kanban/StartEndDatePopover";
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
  // Fonte primária: demand_type_key (chave técnica normalizada).
  const key = (card?.demand_type_key || "").toString().trim();
  if (key === "carrossel") return "Carrossel";
  if (key === "criativo_estatico") return "Post Estático";
  if (key === "video_captado") return "Vídeo captado";
  if (key === "video_gerado") return "Vídeo gerado";

  // Fallback: texto livre de demand_type + heurísticas.
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
  const [publishOpen, setPublishOpen] = useState(false);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [regressing, setRegressing] = useState(false);
  const [isLastFn, setIsLastFn] = useState(false);
  const [pipelineSequence, setPipelineSequence] = useState<{ function_key: string; name: string }[]>([]);
  const [stepPickerOpen, setStepPickerOpen] = useState(false);
  const [jumpingStep, setJumpingStep] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [inlineScheduleOpen, setInlineScheduleOpen] = useState(false);
  const [inlineScheduling, setInlineScheduling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!card?.tenant_id) { setIsLastFn(false); setPipelineSequence([]); return; }
    isAtLastFlowFunction(card.tenant_id, card.demand_type_key, card.current_function_key)
      .then((v) => { if (!cancelled) setIsLastFn(v); })
      .catch(() => { if (!cancelled) setIsLastFn(false); });
    getPipelineSequence(card.tenant_id, card.demand_type_key)
      .then((seq) => { if (!cancelled) setPipelineSequence(seq); })
      .catch(() => { if (!cancelled) setPipelineSequence([]); });
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
  const cardKey = (card?.demand_type_key || "").toString().trim();
  const isCarousel = cardKey === "carrossel"
    || (!cardKey && (!!resolvedDemandType?.toLowerCase().includes('carrossel') || !!resolvedDemandType?.toLowerCase().includes('carousel')));
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
  const [hardConflict, setHardConflict] = useState<{ items: AreaConflictInfo[]; targetArea: WorkArea } | null>(null);
  const warnAreaConflict = async (dateStr: string | null | undefined, timeStr: string | null | undefined) => {
    if (!card || !dateStr || !card.assigned_to || !card.tenant_id) return;
    const area = (((card as any).work_area as WorkArea) || "midia") as WorkArea;
    try {
      const conflicts = await findAreaConflicts({
        tenantId: card.tenant_id,
        userId: card.assigned_to,
        area,
        date: dateStr,
        time: timeStr || null,
        excludeDemandId: card.id,
      });
      const hard = conflicts.filter((c) => c.hard);
      if (hard.length > 0) {
        setHardConflict({ items: hard, targetArea: area });
        return;
      }
      const soft = conflicts[0];
      if (soft) {
        toast.warning(
          `Conflito de área: o responsável já tem "${soft.title}" (${AREA_LABEL[soft.work_area]}) neste dia.`,
        );
      }
    } catch { /* silencioso */ }
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
    // Sync existing active dispatch (does NOT create a new one)
    const res = await syncActiveDispatchDate({ cardId: card.id, publishDate: dateStr, publishTime: card.publish_time });
    if (res.pastDate && res.cancelled) {
      toast.warning("A data escolhida já passou. O agendamento automático foi desativado para evitar publicação imediata.");
    } else if (res.skipped && res.publishedExists) {
      toast.info("Existe uma publicação já publicada para este card; o agendamento não foi alterado.");
    }
    await warnAreaConflict(dateStr, card.publish_time);
  };

  const handlePublishTimeChange = async (time: string) => {
    if (!card) return;
    
    onCardChange({
      ...card,
      publish_time: time
    });
    await onSave('publish_time', time);
    const res = await syncActiveDispatchDate({ cardId: card.id, publishDate: card.publish_date, publishTime: time });
    if (res.pastDate && res.cancelled) {
      toast.warning("A data/horário escolhidos já passaram. O agendamento automático foi desativado para evitar publicação imediata.");
    } else if (res.skipped && res.publishedExists) {
      toast.info("Existe uma publicação já publicada para este card; o agendamento não foi alterado.");
    }
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
                  {/* Estratégia do cliente — primeiro item da linha */}
                  {!isDraft && (() => {
                    const preview = (card.objective || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                    const hasContent = preview.length > 0;
                    return (
                      <Popover open={objectiveOpen} onOpenChange={(open) => { setObjectiveOpen(open); if (!open) handleFieldSave('objective', card.objective || ''); }}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "relative inline-flex items-center justify-center h-8 w-8 rounded-md shrink-0 hover:bg-muted transition-colors",
                              hasContent ? "text-primary" : "text-muted-foreground"
                            )}
                            aria-label="Estratégia do cliente"
                            title={hasContent ? preview.slice(0, 200) + (preview.length > 200 ? '…' : '') : "Estratégia do cliente"}
                          >
                            <Target className="h-4 w-4" />
                            <span className="sr-only">Estratégia do cliente</span>
                            {hasContent && (
                              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[520px] p-3">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
                            Estratégia do cliente
                          </div>
                          {readOnly ? (
                            <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.objective || "") }} />
                          ) : (
                            <BlockEditor content={convertToHtml(card.objective || "")} onChange={value => onCardChange({ ...card, objective: value })} onBlur={() => handleFieldSave('objective', card.objective || '')} placeholder="Qual é a finalidade estratégica deste material?" minHeight="120px" />
                          )}
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                  {!isDraft && card.clientName && (
                    <span className="max-w-[220px] shrink-0 truncate text-xl md:text-2xl font-bold text-primary dark:text-foreground" title={card.clientName}>
                      {card.clientName}
                    </span>
                  )}
                  {!readOnly && (isDraft || editingField === 'title' || !card.title) ? (
                    <Input
                      autoFocus={editingField === 'title' || isDraft}
                      value={card.title || ""}
                      onChange={e => onCardChange({ ...card, title: e.target.value })}
                      onBlur={() => { if (editingField === 'title') handleFieldSave('title', card.title || ''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleFieldSave('title', card.title || ''); }}
                      placeholder="Nome da demanda"
                      className="h-12 min-w-0 text-2xl font-bold border-primary"
                    />
                  ) : (
                    <h1
                      id="task-card-title"
                      onClick={() => !readOnly && setEditingField('title')}
                      className={cn("min-w-0 truncate font-bold text-2xl md:text-3xl", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
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
                  (() => {
                    const seq = pipelineSequence;
                    const curKey = card.current_function_key;
                    const curIdx = curKey ? seq.findIndex((s) => s.function_key === curKey) : -1;
                    const prev = curIdx > 0 ? seq[curIdx - 1] : null;
                    const next = curIdx >= 0 && curIdx < seq.length - 1 ? seq[curIdx + 1] : null;
                    const curName = curIdx >= 0 ? seq[curIdx].name : (curKey || "Sem etapa");

                    const nextIsPublicar = curKey === "publicar";
                    const isEnviarCliente = curKey === "enviar_cliente";
                    const nextLabel = nextIsPublicar
                      ? "Agendar Publicação"
                      : isLastFn
                        ? "Entregar"
                        : isEnviarCliente
                          ? "Enviado ao cliente"
                          : (next?.name || "Prosseguir");

                    const doJump = async (key: string) => {
                      if (!card.tenant_id || !card.demand_type_key || jumpingStep) return;
                      setJumpingStep(true);
                      try {
                        const r = await jumpToFunction({
                          demandId: card.id,
                          tenantId: card.tenant_id,
                          demandTypeKey: card.demand_type_key,
                          targetFunctionKey: key,
                          currentFunctionKey: curKey,
                        });
                        if (r.success) {
                          toast.success(r.message);
                          onCardChange({ ...card, assigned_to: r.assignedTo || null, current_function_key: r.functionKey || null });
                          setStepPickerOpen(false);
                        } else {
                          toast.error(r.message);
                        }
                      } finally {
                        setJumpingStep(false);
                      }
                    };

                    return (
                      <div className="flex items-center gap-0 shrink-0 rounded-md bg-muted/30 px-0.5 py-0.5">
                        {prev && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70"
                            onClick={handleRegress}
                            disabled={regressing || !card.demand_type_key}
                            title={`Voltar para ${prev.name}`}
                          >
                            {regressing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
                            <span className="max-w-[110px] truncate">{prev.name}</span>
                          </Button>
                        )}
                        {curKey && (
                          <Popover open={stepPickerOpen} onOpenChange={setStepPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 text-xs font-medium text-foreground/80 hover:text-foreground hover:bg-muted/70 border-x border-border/40 rounded-none px-2"
                                disabled={seq.length === 0}
                                title="Selecionar etapa manualmente"
                              >
                                <span className="max-w-[160px] truncate">{curName}</span>
                                <ChevronDown className="h-3 w-3 opacity-70" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="center" className="w-56 p-1">
                              <div className="max-h-72 overflow-y-auto">
                                {seq.map((s, i) => {
                                  const active = s.function_key === curKey;
                                  return (
                                    <button
                                      key={s.function_key}
                                      type="button"
                                      disabled={active || jumpingStep}
                                      onClick={() => doJump(s.function_key)}
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                                        active ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted",
                                        jumpingStep && "opacity-60 cursor-wait",
                                      )}
                                    >
                                      <span className="w-4 shrink-0 text-muted-foreground">{i + 1}.</span>
                                      <span className="truncate flex-1">{s.name}</span>
                                      {active && <Check className="h-3.5 w-3.5" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        {isLastFn ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            onClick={handleDeliver}
                            disabled={delivering}
                            title="Entregar demanda e mover para Demandas Completas"
                          >
                            {delivering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            <span>{nextLabel}</span>
                          </Button>
                        ) : nextIsPublicar ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => setInlineScheduleOpen(true)}
                            title="Agendar a publicação nas redes sociais conectadas"
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            <span>{nextLabel}</span>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            onClick={handleProceed}
                            disabled={proceeding || !card.demand_type_key}
                            title={!card.demand_type_key ? "Defina o tipo da demanda antes de prosseguir" : (isEnviarCliente ? "Marcar como enviado ao cliente" : `Enviar para ${nextLabel}`)}
                          >
                            <span className="max-w-[140px] truncate">{nextLabel}</span>
                            {proceeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>

                    );
                  })()
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

              {/* Etapa foi integrada na navegação superior (prev / current / next). */}


              {/* Período foi movido para a barra inline abaixo. */}

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
                        // Ajusta a etapa para uma função permitida do novo responsável.
                        let nextFn: string | null = card.current_function_key ?? null;
                        if (newVal && card.tenant_id) {
                          try {
                            const resolved = await resolveFunctionForAssignee(
                              card.tenant_id,
                              newVal,
                              card.demand_type_key ?? null,
                              card.current_function_key ?? null,
                            );
                            if (resolved) nextFn = resolved;
                          } catch (e) { /* mantém etapa atual */ }
                        } else if (!newVal) {
                          nextFn = null;
                        }
                        onCardChange({ ...card, assigned_to: newVal || null, current_function_key: nextFn });
                        await onSave("assigned_to", newVal);
                        if (nextFn !== (card.current_function_key ?? null) && !isDraft) {
                          try {
                            await supabase
                              .from("demands")
                              .update({ current_function_key: nextFn } as any)
                              .eq("id", card.id);
                          } catch (e) { /* noop */ }
                        }
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

                  {/* Área */}
                  <div className="flex items-center gap-1 min-w-0">
                    <Select
                      value={((card as any).work_area as WorkArea) || "midia"}
                      onValueChange={async (val) => {
                        const newArea = val as WorkArea;
                        onCardChange({ ...card, work_area: newArea } as any);
                        try {
                          await supabase.from("demands").update({ work_area: newArea } as any).eq("id", card.id);
                        } catch (e) {
                          console.error("[TaskCard] update work_area error", e);
                          toast.error("Erro ao atualizar área");
                        }
                      }}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-7 text-sm border-0 shadow-none bg-transparent px-1.5 gap-1 hover:bg-background/60 focus:ring-0 w-auto min-w-[90px]" aria-label="Área">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="midia">{AREA_LABEL.midia}</SelectItem>
                        <SelectItem value="sistemas">{AREA_LABEL.sistemas}</SelectItem>
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

                  {/* Datas — Produção (Início + Entrega) — mesmo visual da Visão Geral */}
                  {!card.is_daily_card && (() => {
                    const startStr = card.due_date ? `${formatShortDate(card.due_date)}${card.due_time ? ' ' + card.due_time : ''}` : null;
                    const endStr = card.delivery_date ? `${formatShortDate(card.delivery_date)}${card.delivery_time ? ' ' + card.delivery_time : ''}` : null;
                    return (
                      <StartEndDatePopover
                        dueDate={card.due_date}
                        dueTime={card.due_time}
                        deliveryDate={card.delivery_date}
                        deliveryTime={card.delivery_time}
                        disabled={readOnly}
                        onSave={async (v) => {
                          const patch: any = {
                            ...card,
                            due_date: v.due_date || '',
                            due_time: v.due_time || '',
                            delivery_date: v.delivery_date || '',
                            delivery_time: v.delivery_time || '',
                          };
                          onCardChange(patch);
                          await onSave('due_date', patch.due_date);
                          await onSave('due_time', patch.due_time);
                          await onSave('delivery_date', patch.delivery_date);
                          await onSave('delivery_time', patch.delivery_time);
                        }}
                        trigger={
                          <button
                            type="button"
                            className="inline-flex items-center gap-3 rounded-md bg-muted/60 hover:bg-muted transition-colors px-2 py-1 text-[11px] font-medium leading-tight"
                            aria-label="Datas de produção"
                          >
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3 shrink-0 text-amber-500" />
                              <span className="text-muted-foreground">Ini:</span>
                              {startStr ? (
                                <span className="font-semibold capitalize">{startStr}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3 shrink-0 text-emerald-500" />
                              <span className="text-muted-foreground">Fim:</span>
                              {endStr ? (
                                <span className="font-semibold capitalize">{endStr}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                          </button>
                        }
                      />
                    );
                  })()}


                  {/* Datas — Publicação — mesmo padrão + sub-lista de datas adicionais */}
                  {!card.is_daily_card && (() => {
                    const pubStr = card.publish_date ? `${formatShortDate(card.publish_date)}${card.publish_time ? ' ' + card.publish_time : ''}` : null;
                    const extras = additionalDates.length;
                    const summary = pubStr ? `Pub ${pubStr}${extras ? ` +${extras}` : ''}` : 'Publicação';
                    return (
                      <SingleDateTimePopover
                        date={card.publish_date}
                        time={card.publish_time}
                        disabled={readOnly}
                        label="Publicação"
                        onSave={async (v) => {
                          const dateStr = v.date || '';
                          const timeStr = v.time || (dateStr ? '09:00' : '');
                          onCardChange({ ...card, publish_date: dateStr, publish_time: timeStr });
                          await onSave('publish_date', dateStr);
                          await onSave('publish_time', timeStr);
                          if (!dateStr) {
                            try { await supabase.from("demands").update({ additional_publish_dates: [] }).eq("id", card.id); } catch (e) { console.error(e); }
                          } else {
                            const res = await syncActiveDispatchDate({ cardId: card.id, publishDate: dateStr, publishTime: timeStr });
                            if (res.pastDate && res.cancelled) {
                              toast.warning("A data escolhida já passou. O agendamento automático foi desativado para evitar publicação imediata.");
                            } else if (res.skipped && res.publishedExists) {
                              toast.info("Existe uma publicação já publicada para este card; o agendamento não foi alterado.");
                            }
                          }
                        }}
                        extraContent={card.publish_date ? (
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
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
                        ) : null}
                        trigger={
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded hover:bg-background/60 transition-colors max-w-[240px] min-w-0",
                              pubStr ? "text-foreground" : "text-muted-foreground"
                            )}
                            aria-label="Data de publicação"
                          >
                            <Megaphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate capitalize">{summary}</span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          </button>
                        }
                      />
                    );
                  })()}

                  {/* Período — inline no fim da barra */}
                  <div className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded hover:bg-background/60 transition-colors max-w-[260px] min-w-0">
                    <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {card.period_plan_id ? (
                      <>
                        <span className="text-foreground truncate max-w-[180px]" title={periodTitle || undefined}>
                          {periodTitle || "Carregando..."}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
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
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    ) : readOnly ? (
                      <span className="text-muted-foreground">Sem período</span>
                    ) : periodPlans.length > 0 ? (
                      <Select onValueChange={handleLinkPeriod}>
                        <SelectTrigger className="h-6 border-0 shadow-none px-1 text-sm w-auto min-w-[110px] bg-transparent hover:bg-background/60 focus:ring-0" aria-label="Vincular a período">
                          <SelectValue placeholder="Vincular período" />
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
                        {loadingPeriodPlans ? "Carregando..." : "Sem período"}
                      </span>
                    )}
                  </div>
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
      <AlertDialog open={!!hardConflict} onOpenChange={(o) => { if (!o) setHardConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflito de área detectado</AlertDialogTitle>
            <AlertDialogDescription>
              O responsável já tem demanda(s) em outra área nesta janela. Você pode manter mesmo assim, mas isso pode gerar sobreposição de trabalho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {hardConflict && (
            <div className="max-h-56 overflow-auto space-y-2 py-2">
              {hardConflict.items.map((c) => (
                <div key={c.id} className="rounded-md border border-border/60 px-3 py-2 text-sm">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Área: <span className="font-medium">{AREA_LABEL[c.work_area]}</span>
                    {c.time ? ` · ${c.time}` : " · dia inteiro"}
                  </div>
                </div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setHardConflict(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>;

  return createPortal(modalContent, document.body);
}