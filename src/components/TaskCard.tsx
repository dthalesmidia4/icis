import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { isClientStageKey, userHasFunction } from "@/lib/clientStageAssignments";
import { IMAGE_ASPECT_OPTIONS, DEFAULT_SOCIAL_ASPECT, isImageAspectRatio, type ImageAspectRatio } from "@/lib/imageAspect";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { extractClipboardFiles, normalizePastedFiles } from "@/lib/pastedFiles";
import { resolveUploadCollection } from "@/lib/referenceAttachments";
import { canBulkRemoveAttachments } from "@/lib/bulkAttachments";

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
import { CalendarIcon, Target, FileText, MessageSquare, Paperclip, Upload, X, File, Loader2, Trash2, Check, Plus, ChevronDown, ChevronRight, GripVertical, Link, Archive, ArchiveRestore, Wand2, Clock, MoreVertical, User, Calendar as CalendarIconOutline, RefreshCw, RotateCcw, AlignLeft, Megaphone, Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Tag, Images } from "lucide-react";
import { recordFlowHistory } from "@/lib/flowHistory";
import { proceedDemand, regressDemand, deliverDemand, deliverMyPart, isAtLastFlowFunction, resolveInitialFunctionKey, OFFICIAL_DEMAND_TYPES, DEMAND_TYPE_LABEL, demandTypesForArea, DEMAND_ORIGINS, DEMAND_ORIGIN_LABEL, isClientOrigin, type DemandOrigin, getPipelineSequence, jumpToFunction, getRegressOptions, type RegressOption, type DemandTypeKey, previewNextStageRouting, type NextStageRoutingPreview } from "@/lib/proceedDemand";
import { recordOriginTouchpoint } from "@/lib/recordTouchpoint";

import { useAuth } from "@/hooks/useAuth";
import { useActiveDispatchIds } from "@/hooks/useActiveDispatchIds";
import { useRealtimeFlowConfig } from "@/hooks/realtime";
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";
import { completeDailyOccurrence, formatBR as formatBRDate } from "@/lib/dailyCards";
import { computeDraftMissingFields, draftAreaChangePatch, draftClientChangePatch } from "@/lib/draftDemand";
import { DailyCardSection } from "@/components/DailyCardSection";
import StructuredContentBrief from "@/components/demands/StructuredContentBrief";
import { MainDeliveryEditor, resolveDeliveryField } from "@/components/demands/MainDeliveryEditor";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { createOrUpdateScheduleDispatch, hasActiveDispatch } from "@/lib/createScheduleDispatch";
import { syncActiveDispatchDate } from "@/lib/syncActiveDispatchDate";
import { findAreaConflicts, findScheduleAreaConflict, AREA_LABEL, type WorkArea, type AreaConflictInfo } from "@/lib/areaConflicts";
import { evaluateReassign, applyReassign, reassignFailureMessage } from "@/lib/reassignDemand";
import { isClientFacingFunction, isEvaluationFunction } from "@/lib/flowFunctions";
import ExecutionExitDialog from "@/components/demands/ExecutionExitDialog";
import {
  buildExecutionExitPreflight,
  performExecutionExit,
  type ExecutionExitChoice,
  type ExecutionExitPreflight,
} from "@/lib/executionExit";
import { executionExitDeps } from "@/lib/demandExecution";
import { checkAssignmentConflicts, type AssignmentConflict, type FreeSlotSuggestion } from "@/lib/scheduleOccupancy";
import ScheduleConflictModal from "@/components/kanban/ScheduleConflictModal";
import ChangeRequestPanel from "@/components/demands/ChangeRequestPanel";
import RequestChangesModal from "@/components/demands/RequestChangesModal";
import {
  loadChangeRequests,
  createChangeRequest,
  deleteChangeRequest,
  setItemCompleted,
  completeAllPendingItems,
  resolveChangeRequest,
  countPendingItems,
  shouldAutoResolve,
  shouldOpenAlterationsTab,
  shouldShowAlterationsTab,
  isEmptyChangeRequestDraft,
  type ChangeRequestMode,
  type ChangeRequestWithItems,

} from "@/lib/demandChangeRequests";
import { useRealtimeDemandChangeRequests } from "@/hooks/realtime";
import ExecutionPanel from "@/components/demands/ExecutionPanel";
import { useRealtimeDemandExecution } from "@/hooks/realtime/useRealtimeDemandExecution";
import {
  addExecutionItem,
  completeAllPendingExecutionItems,
  countPendingExecutionItems,
  deleteExecutionItem,
  ensureExecutionRun,
  loadExecutionRuns,
  setExecutionItemCompleted,
  shouldShowExecutionTab,
  hasOperationalExecutionContext,
  resolveInitialSection,
  resolvePostLoadOverride,
  type ExecutionRunWithItems,
} from "@/lib/demandExecution";
import { CalendarClock, ListChecks } from "lucide-react";

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
import SubclientSelect from "@/components/SubclientSelect";
import {
  AdPlanSection,
  ClassificationSelector,
  GRAFICA_WARNING,
} from "@/components/demands/DemandClassifications";
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
  /**
   * Coleção INDEPENDENTE de materiais de apoio (nunca publicada, nunca usada
   * por IA/agendamento). Os arquivos finais continuam em `attachments`.
   */
  reference_attachments?: Attachment[] | null;
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
  additional_assignees?: string[];
  current_function_key?: string | null;
  // Classificações operacionais (anuncio / grafica) e informações do anúncio
  classifications?: string[] | null;
  ad_plan?: Record<string, any> | null;
  /** Proporção da arte (4:5 padrão do sistema) usada na geração/regeneração. */
  image_aspect_ratio?: string | null;

  /** Briefing editorial estruturado (JSONB) — camadas sem campo próprio. */
  content_brief?: Record<string, any> | null;
  // Área, origem e clientes finais solicitantes (fluxo Sistemas)
  work_area?: "midia" | "sistemas" | null;
  origin?: string | null;
  origin_note?: string | null;
  subclient_id?: string | null;
  subclient_ids?: string[];
  // Aguardando cliente
  client_wait_started_at?: string | null;
  client_resend_count?: number | null;
  client_last_resend_at?: string | null;
  client_sent_at_fallback?: string | null;
  /** Fila de liberação: null = ainda não liberada ao colaborador. */
  released_at?: string | null;

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
  /** Exclusão em massa SOMENTE dos anexos finais (`demands.attachments`). */
  onRemoveAllAttachments?: () => Promise<void>;

  /** Upload/remoção/reordenação da coleção de referências (opcional por tela). */
  onReferenceFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemoveReferenceAttachment?: (url: string) => Promise<void>;
  onReorderReferenceAttachments?: (attachments: Attachment[]) => Promise<void>;
  referenceUploading?: boolean;
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
  /**
   * Apresentação do shell externo.
   * 'fullscreen' (padrão) = comportamento histórico usado no Kanban.
   * 'drawer' = painel lateral direito (Hub do Cliente).
   */
  presentation?: 'fullscreen' | 'drawer';

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
  onRemoveAllAttachments,

  onReferenceFileUpload,
  onRemoveReferenceAttachment,
  onReorderReferenceAttachments,
  referenceUploading = false,
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
  savingDraft = false,
  presentation = 'fullscreen'
}: TaskCardProps) {
  const isDrawer = presentation === 'drawer';

  // ESC fecha o painel lateral (o modo fullscreen mantém o comportamento histórico).
  useEffect(() => {
    if (!isDrawer || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Não fecha o painel quando existe popover/dialog interno aberto por cima.
      const hasInnerLayer = document.querySelector(
        '[data-radix-popper-content-wrapper], [data-radix-dialog-content][data-state="open"]'
      );
      if (hasInnerLayer) return;
      onOpenChange(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDrawer, open, onOpenChange]);





  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAdditionalDatePickerOpen, setIsAdditionalDatePickerOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachmentToRemove, setAttachmentToRemove] = useState<Attachment | null>(null);
  const [referenceToRemove, setReferenceToRemove] = useState<Attachment | null>(null);
  const [periodPlans, setPeriodPlans] = useState<{ id: string; period_title: string; period_start: string; period_end: string }[]>([]);
  const [loadingPeriodPlans, setLoadingPeriodPlans] = useState(false);
  /**
   * Aba inicial resolvida SINCRONICAMENTE (nada de abrir em Conteúdo e trocar
   * depois): contexto operacional humano real → Execução; senão Briefing/Conteúdo.
   */
  const [activeSection, setActiveSection] = useState<'briefing' | 'description' | 'observations' | 'caption' | 'anuncio' | 'anexos' | 'referencias' | 'alteracoes' | 'execucao'>(
    () =>
      resolveInitialSection({
        isDraft,
        hasBriefing: presentation === 'drawer' && !!(card as any)?.content_brief,
        operational: hasOperationalExecutionContext(card as any, {
          isClientFacing: isClientFacingFunction,
          isEvaluation: isEvaluationFunction,
        }),
        showExecutionTab: shouldShowExecutionTab({ isDraft }),
        fallback: 'description',
        briefingSection: 'briefing',
        executionSection: 'execucao',
      }),
  );
  /** Lock: depois que o usuário navega, nada troca a aba automaticamente. */
  const userNavigatedRef = useRef(false);
  const selectSection = (id: typeof activeSection) => {
    userNavigatedRef.current = true;
    setActiveSection(id);
  };
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const fileDragDepthRef = useRef(0);
  const [datesOpen, setDatesOpen] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingPreview, setRoutingPreview] = useState<NextStageRoutingPreview | null>(null);
  const [routingRefreshKey, setRoutingRefreshKey] = useState(0);
  const [regressing, setRegressing] = useState(false);
  const [isLastFn, setIsLastFn] = useState(false);
  const [pipelineSequence, setPipelineSequence] = useState<{ function_key: string; name: string }[]>([]);
  const [stepPickerOpen, setStepPickerOpen] = useState(false);
  const [jumpingStep, setJumpingStep] = useState(false);
  const [pendingJump, setPendingJump] = useState<{ key: string; name: string; skippedKeys: string[]; skippedNames: string[] } | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [inlineScheduleOpen, setInlineScheduleOpen] = useState(false);
  const [inlineScheduling, setInlineScheduling] = useState(false);
  const [deliveringPart, setDeliveringPart] = useState(false);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const { activeDispatchIds } = useActiveDispatchIds(card?.tenant_id ?? null);
  const isScheduledPublish = !!card && activeDispatchIds.has(card.id);

  const captarExtras = Array.isArray(card?.additional_assignees) ? (card?.additional_assignees as string[]) : [];
  const captarAllAssignees = Array.from(new Set<string>([
    ...(card?.assigned_to ? [card.assigned_to] : []),
    ...captarExtras,
  ]));
  const canDeliverPart =
    (card?.current_function_key || "") === "captar" &&
    captarAllAssignees.length > 1;
  const [deliverPartOpen, setDeliverPartOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!card?.tenant_id) { setIsLastFn(false); setPipelineSequence([]); return; }
    const seqOpts = {
      workArea: ((card as any)?.work_area === "sistemas" ? "sistemas" : "midia") as "midia" | "sistemas",
      origin: ((card as any)?.origin || "interno") as string,
    };
    isAtLastFlowFunction(card.tenant_id, card.demand_type_key, card.current_function_key, seqOpts)
      .then((v) => { if (!cancelled) setIsLastFn(v); })
      .catch(() => { if (!cancelled) setIsLastFn(false); });
    getPipelineSequence(card.tenant_id, card.demand_type_key, seqOpts)
      .then((seq) => { if (!cancelled) setPipelineSequence(seq); })
      .catch(() => { if (!cancelled) setPipelineSequence([]); });
    return () => { cancelled = true; };
  }, [card?.tenant_id, card?.demand_type_key, card?.current_function_key, (card as any)?.work_area, (card as any)?.origin]);

  /**
   * Prévia do roteamento carregada PROATIVAMENTE: o botão "Prosseguir" precisa
   * saber o destino antes do clique (mostrar o nome / abrir seletor).
   * Rascunho não tem fluxo real, então nunca consulta.
   */
  useEffect(() => {
    if (!open || isDraft) { setRoutingPreview(null); return; }
    if (!card?.tenant_id || !card?.demand_type_key) { setRoutingPreview(null); return; }
    let cancelled = false;
    setRoutingLoading(true);
    previewNextStageRouting({
      demandId: card.id,
      tenantId: card.tenant_id,
      demandTypeKey: card.demand_type_key,
      currentFunctionKey: card.current_function_key,
    })
      .then((p) => { if (!cancelled) setRoutingPreview(p); })
      .catch(() => { if (!cancelled) setRoutingPreview(null); })
      .finally(() => { if (!cancelled) setRoutingLoading(false); });
    return () => { cancelled = true; };
  }, [
    open,
    isDraft,
    card?.id,
    card?.tenant_id,
    card?.assigned_to,
    card?.current_function_key,
    card?.demand_type_key,
    (card as any)?.work_area,
    (card as any)?.origin,
    card?.clientId,
    routingRefreshKey,
  ]);

  /** Mudança de funções/atribuições/preferências revalida a prévia sem F5. */
  useRealtimeFlowConfig({
    tenantId: card?.tenant_id ?? null,
    enabled: !!open && !isDraft && !!card?.tenant_id,
    onChange: () => setRoutingRefreshKey((k) => k + 1),
  });


  /**
   * Reconcilia o card com o estado REAL devolvido pela transição.
   * Quando a transição é rejeitada por concorrência (`stale`), o card também é
   * reconciliado — para a UI nunca ficar mostrando uma etapa que não existe.
   */
  const reconcileFlowResult = (result: { flowState?: any }) => {
    if (!card) return;
    const s = result.flowState;
    if (!s) return;
    onCardChange({
      ...card,
      assigned_to: s.assigned_to ?? null,
      current_function_key: s.current_function_key ?? null,
      additional_assignees: s.additional_assignees ?? [],
      due_date: s.due_date ?? "",
      due_time: s.due_time ?? "",
      delivery_date: s.delivery_date ?? "",
      delivery_time: s.delivery_time ?? "",
      client_wait_started_at: s.client_wait_started_at ?? null,
      client_resend_count: s.client_resend_count ?? 0,
      client_last_resend_at: s.client_last_resend_at ?? null,
      released_at: s.released_at ?? null,
    } as any);
  };

  /* ===================== ALTERAÇÕES SOLICITADAS ===================== */

  const [changeRequests, setChangeRequests] = useState<{
    active: ChangeRequestWithItems | null;
    history: ChangeRequestWithItems[];
  }>({ active: null, history: [] });
  const [changeRequestsLoading, setChangeRequestsLoading] = useState(false);
  const [busyChangeItemId, setBusyChangeItemId] = useState<string | null>(null);
  const [completingAllChanges, setCompletingAllChanges] = useState(false);
  const [changeRequestModal, setChangeRequestModal] = useState<{
    mode: ChangeRequestMode;
    targetFunctionKey: string | null;
    targetStageName: string | null;
    targetUserName: string | null;
    targetUserId: string | null;
  } | null>(null);
  const [creatingChangeRequest, setCreatingChangeRequest] = useState(false);
  const [deletingChangeRequestId, setDeletingChangeRequestId] = useState<string | null>(null);

  const [pendingGuardAction, setPendingGuardAction] = useState<{
    label: string;
    run: () => Promise<void> | void;
  } | null>(null);
  const alterationsAutoOpenedRef = useRef<string | null>(null);

  const activeChangeRequest = changeRequests.active;
  const pendingChangeItems = countPendingItems(activeChangeRequest);
  /** A aba existe em todo card salvo, mesmo sem nenhuma solicitação. */
  const showAlterationsTab = shouldShowAlterationsTab({ isDraft });


  const refreshChangeRequests = useCallback(async () => {
    if (!card?.id || isDraft) {
      setChangeRequests({ active: null, history: [] });
      return;
    }
    const data = await loadChangeRequests(card.id);
    setChangeRequests(data);
  }, [card?.id, isDraft]);

  useEffect(() => {
    if (!open || isDraft || !card?.id) {
      setChangeRequests({ active: null, history: [] });
      return;
    }
    let cancelled = false;
    setChangeRequestsLoading(true);
    loadChangeRequests(card.id)
      .then((data) => {
        if (cancelled) return;
        setChangeRequests(data);
        // Abre direto em "Alterações" quando há checklist pendente.
        if (
          shouldOpenAlterationsTab(data.active, { isDraft }) &&
          alterationsAutoOpenedRef.current !== card.id
        ) {
          alterationsAutoOpenedRef.current = card.id;
          setActiveSection('alteracoes');
        }
      })
      .finally(() => {
        if (!cancelled) setChangeRequestsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, isDraft, card?.id]);

  useEffect(() => {
    if (!open) alterationsAutoOpenedRef.current = null;
  }, [open]);

  /** Dois usuários com o mesmo card aberto veem o checklist em tempo real. */
  useRealtimeDemandChangeRequests({
    tenantId: card?.tenant_id ?? null,
    demandId: card?.id ?? null,
    enabled: !!open && !isDraft,
    onChange: () => { void refreshChangeRequests(); },
  });

  const handleToggleChangeItem = async (itemId: string, completed: boolean) => {
    if (!activeChangeRequest) return;
    setBusyChangeItemId(itemId);
    try {
      await setItemCompleted(itemId, completed, currentUserId);
      const nextActive: ChangeRequestWithItems = {
        ...activeChangeRequest,
        items: activeChangeRequest.items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                is_completed: completed,
                completed_by: completed ? currentUserId : null,
                completed_at: completed ? new Date().toISOString() : null,
              }
            : i,
        ),
      };
      setChangeRequests((prev) => ({ ...prev, active: nextActive }));
      if (shouldAutoResolve(nextActive)) {
        await resolveChangeRequest(nextActive.id);
        toast.success("Todas as alterações foram concluídas.");
        await refreshChangeRequests();
      }
    } catch (err) {
      console.error("[TaskCard] toggle change item", err);
      toast.error("Não foi possível atualizar o item.");
      await refreshChangeRequests();
    } finally {
      setBusyChangeItemId(null);
    }
  };

  const handleCompleteAllChanges = async () => {
    if (!activeChangeRequest) return;
    setCompletingAllChanges(true);
    try {
      await completeAllPendingItems(activeChangeRequest.id, currentUserId);
      await resolveChangeRequest(activeChangeRequest.id);
      await refreshChangeRequests();
      toast.success("Alterações marcadas como concluídas.");
    } catch (err) {
      console.error("[TaskCard] complete all changes", err);
      toast.error("Não foi possível marcar as alterações.");
    } finally {
      setCompletingAllChanges(false);
    }
  };

  /** Exclui uma solicitação (ativa ou histórica) sem tocar em etapa/responsável. */
  const handleDeleteChangeRequest = async (requestId: string) => {
    if (readOnly) return;
    setDeletingChangeRequestId(requestId);
    try {
      await deleteChangeRequest(requestId);
      setChangeRequests((prev) => ({
        active: prev.active?.id === requestId ? null : prev.active,
        history: prev.history.filter((r) => r.id !== requestId),
      }));
      toast.success("Solicitação excluída.");
      await refreshChangeRequests();
    } catch (err) {
      console.error("[TaskCard] delete change request", err);
      toast.error("Não foi possível excluir a solicitação.");
      await refreshChangeRequests();
    } finally {
      setDeletingChangeRequestId(null);
    }
  };

  /* ===================== EXECUÇÃO DA ETAPA (passagem atual) ===================== */

  const [execution, setExecution] = useState<{
    active: ExecutionRunWithItems | null;
    history: ExecutionRunWithItems[];
  }>({ active: null, history: [] });
  const [executionLoading, setExecutionLoading] = useState(false);
  const [busyExecutionItemId, setBusyExecutionItemId] = useState<string | null>(null);
  const [addingExecutionItem, setAddingExecutionItem] = useState(false);
  const [completingAllExecution, setCompletingAllExecution] = useState(false);
  const [executionGuardAction, setExecutionGuardAction] = useState<{
    label: string;
    preflight: ExecutionExitPreflight;
    run: (choice: ExecutionExitChoice) => Promise<void>;
    onAbort: () => void;
  } | null>(null);
  const [executionGuardBusy, setExecutionGuardBusy] = useState(false);

  const pendingExecutionItems = countPendingExecutionItems(execution.active);
  const showExecutionTab = shouldShowExecutionTab({ isDraft });

  /** Identidade da passagem atual: etapa + tipo + responsável. */
  const executionContext = {
    functionKey: card?.current_function_key ?? null,
    demandTypeKey: (card as any)?.demand_type_key ?? null,
    assignedTo: card?.assigned_to ?? null,
  };

  const refreshExecution = useCallback(async () => {
    if (!card?.id || isDraft) {
      setExecution({ active: null, history: [] });
      return;
    }
    setExecution(await loadExecutionRuns(card.id));
  }, [card?.id, isDraft]);

  useEffect(() => {
    if (!open || isDraft || !card?.id) {
      setExecution({ active: null, history: [] });
      return;
    }
    let cancelled = false;
    setExecutionLoading(true);
    loadExecutionRuns(card.id)
      .then((data) => {
        if (cancelled) return;
        setExecution(data);
      })
      .finally(() => {
        if (!cancelled) setExecutionLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, isDraft, card?.id]);

  useEffect(() => {
    if (!open) userNavigatedRef.current = false;
  }, [open]);

  /**
   * Único override permitido após o carregamento: ALTERAÇÕES pendentes
   * (retrabalho tem prioridade sobre execução). Respeita o lock manual.
   */
  useEffect(() => {
    if (!open || !card?.id) return;
    const target = resolvePostLoadOverride({
      isDraft,
      userNavigated: userNavigatedRef.current,
      alterationsPending: pendingChangeItems,
      alterationsSection: 'alteracoes' as const,
    });
    if (target) setActiveSection(target);
  }, [open, isDraft, card?.id, pendingChangeItems]);

  useRealtimeDemandExecution({
    tenantId: card?.tenant_id ?? null,
    demandId: card?.id ?? null,
    enabled: !!open && !isDraft,
    onChange: () => { void refreshExecution(); },
  });

  const handleAddExecutionItem = async (text: string) => {
    if (!card || readOnly || isDraft) return;
    setAddingExecutionItem(true);
    try {
      const run = await ensureExecutionRun({
        tenantId: card.tenant_id,
        demandId: card.id,
        context: executionContext,
        metadata: { created_from: "task_card" },
      });
      if (!run) throw new Error("Sem passagem ativa");
      await addExecutionItem({
        runId: run.id,
        tenantId: card.tenant_id,
        text,
        position: run.items.length,
      });
      await refreshExecution();
    } catch (err) {
      console.error("[TaskCard] add execution item", err);
      toast.error("Não foi possível adicionar a tarefa.");
    } finally {
      setAddingExecutionItem(false);
    }
  };

  const handleToggleExecutionItem = async (itemId: string, completed: boolean) => {
    if (readOnly) return;
    setBusyExecutionItemId(itemId);
    try {
      await setExecutionItemCompleted(itemId, completed, currentUserId);
      await refreshExecution();
    } catch (err) {
      console.error("[TaskCard] toggle execution item", err);
      toast.error("Não foi possível atualizar a tarefa.");
      await refreshExecution();
    } finally {
      setBusyExecutionItemId(null);
    }
  };

  const handleDeleteExecutionItem = async (itemId: string) => {
    if (readOnly) return;
    setBusyExecutionItemId(itemId);
    try {
      await deleteExecutionItem(itemId);
      await refreshExecution();
    } catch (err) {
      console.error("[TaskCard] delete execution item", err);
      toast.error("Não foi possível remover a tarefa.");
    } finally {
      setBusyExecutionItemId(null);
    }
  };

  const handleCompleteAllExecution = async () => {
    if (readOnly || !execution.active) return;
    setCompletingAllExecution(true);
    try {
      await completeAllPendingExecutionItems(execution.active.id, currentUserId);
      await refreshExecution();
      toast.success("Execução marcada como concluída.");
    } catch (err) {
      console.error("[TaskCard] complete all execution", err);
      toast.error("Não foi possível marcar as tarefas.");
    } finally {
      setCompletingAllExecution(false);
    }
  };

  /**
   * Ajuda o executor quando há alterações OU execução pendentes, mas NUNCA
   * bloqueia: o usuário pode continuar mesmo assim.
   *
   * Toda transição encerra a passagem em execução — o checklist de uma etapa
   * nunca vaza para a etapa seguinte, e "passou com pendências" fica no
   * histórico da passagem.
   */
  /**
   * GUARD DE SAÍDA DA PASSAGEM — usado por TODO caminho que abandona a passagem
   * atual (prosseguir, voltar, salto manual, entregar, entregar minha parte,
   * transferir, finalizar). Resolve `true` só quando a mutação teve sucesso.
   *
   * Ordem transacional: executa → confirma sucesso → só então marca itens e
   * fecha o run ANTIGO por id (CAS). `stale`/falha não fecham nada.
   */
  const runExecutionExitGuarded = (
    label: string,
    perform: () => Promise<unknown> | unknown,
  ): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const activeRun = execution.active;
      const preflight = buildExecutionExitPreflight(activeRun);
      const guarded = async (choice: ExecutionExitChoice) => {
        const res = await performExecutionExit({
          preflight,
          runId: activeRun?.status === 'active' ? activeRun.id : null,
          choice,
          reason: `flow_transition:${label}`,
          perform,
          deps: executionExitDeps,
        });
        await refreshExecution();
        resolve(res.outcome === 'success');
      };
      if (preflight) {
        setExecutionGuardAction({
          label,
          preflight,
          run: guarded,
          onAbort: () => resolve(false),
        });
        return;
      }
      void guarded('keep_pending');
    });

  const runWithPendingChangesGuard = (label: string, run: () => Promise<unknown> | unknown) => {
    const executionStep = () => { void runExecutionExitGuarded(label, run); };
    // Guard de ALTERAÇÕES primeiro; o de EXECUÇÃO vem depois (nunca juntos).
    if (pendingChangeItems > 0) {
      setPendingGuardAction({ label, run: executionStep });
      return;
    }
    executionStep();
  };

  const executeProceed = async (forcedAssigneeId?: string | null) => {
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
        forcedAssigneeId: forcedAssigneeId || null,
      });
      if (result.success) {
        toast.success(result.message);
        if (result.flowState) {
          reconcileFlowResult(result);
        } else {
          onCardChange({
            ...card,
            assigned_to: result.assignedTo || null,
            current_function_key: result.functionKey || null,
          });
        }
      } else if (result.stale) {
        toast.warning(result.message);
        reconcileFlowResult(result);
      } else if (result.end) {
        toast(result.message);
      } else {
        toast.error(result.message);
      }
      // Fim de fluxo também ABANDONA a passagem atual.
      return result.end ? { success: true } : result;
    } finally {
      setProceeding(false);
      setRoutingOpen(false);
    }
  };

  // A prévia da próxima etapa é carregada proativamente pelo efeito acima
  // (o botão "Prosseguir" precisa do destino antes do clique).


  const executeDeliverMyPart = async (targetUserId?: string) => {
    if (!card || deliveringPart) return;
    const uid = targetUserId || currentUserId;
    if (!uid) return;
    setDeliveringPart(true);
    try {
      const r = await deliverMyPart(card.id, uid);
      if (r.success) {
        toast.success(r.message);
        // Atualiza local: remove usuário do card
        const nextExtras = (card.additional_assignees || []).filter((u: string) => u !== uid);
        let nextAssigned = card.assigned_to;
        if (card.assigned_to === uid) {
          nextAssigned = r.becamePrimary ?? null;
        }
        onCardChange({
          ...card,
          assigned_to: nextAssigned,
          additional_assignees: nextExtras.filter((u: string) => u !== nextAssigned),
        } as any);
        setDeliverPartOpen(false);
        if (uid === currentUserId) onOpenChange(false);
      } else {
        toast.error(r.message);
      }
      // A passagem pertence ao responsável PRINCIPAL: se ele continua no card,
      // nada foi abandonado e o run segue ativo.
      return { success: r.success && card.assigned_to === uid };
    } finally {
      setDeliveringPart(false);
    }
  };

  const executeRegress = async (
    targetFunctionKey?: string | null,
    targetUserId?: string | null,
  ): Promise<boolean> => {
    if (!card || regressing) return false;
    if (!card.demand_type_key) {
      toast.error("Defina o tipo da demanda antes de voltar.");
      return false;
    }
    setRegressing(true);
    try {
      const result = await regressDemand({
        demandId: card.id,
        tenantId: card.tenant_id,
        demandTypeKey: card.demand_type_key,
        currentFunctionKey: card.current_function_key,
        targetFunctionKey: targetFunctionKey ?? null,
        targetUserId: targetUserId ?? null,
      });
      if (result.success) {
        toast.success(result.message);
        setRegressOpen(false);
        if (result.flowState) {
          reconcileFlowResult(result);
        } else {
          onCardChange({
            ...card,
            assigned_to: result.assignedTo || null,
            current_function_key: result.functionKey || null,
          });
        }
        return true;
      } else if (result.stale) {
        toast.warning(result.message);
        setRegressOpen(false);
        reconcileFlowResult(result);
        return false;
      } else {
        toast.error(result.message);
        return false;
      }
    } finally {
      setRegressing(false);
    }
  };

  /**
   * Voltar demanda abre o modal para registrar alterações, mas o registro é
   * OPCIONAL: vazio, apenas regressa o card.
   */
  const handleRegress = (
    targetFunctionKey?: string | null,
    targetStageName?: string | null,
    targetUserName?: string | null,
    targetUserId?: string | null,
  ) => {
    if (!card || regressing) return;
    if (!card.demand_type_key) {
      toast.error("Defina o tipo da demanda antes de voltar.");
      return;
    }
    setChangeRequestModal({
      mode: "regress",
      targetFunctionKey: targetFunctionKey ?? null,
      targetStageName: targetStageName ?? null,
      targetUserName: targetUserName ?? null,
      targetUserId: targetUserId ?? null,
    });
  };

  /** Solicitação avulsa: registra alterações sem mover o card nem trocar responsável. */
  const handleOpenStandaloneChangeRequest = () => {
    if (!card || isDraft || readOnly) return;
    setChangeRequestModal({
      mode: "standalone",
      targetFunctionKey: null,
      targetStageName: null,
      targetUserName: null,
      targetUserId: null,
    });
  };

  const handleConfirmChangeRequest = async ({ notes, itemTexts }: { notes: string; itemTexts: string[] }) => {
    if (!card || !changeRequestModal || creatingChangeRequest) return;
    const mode = changeRequestModal.mode;
    const empty = isEmptyChangeRequestDraft(notes, itemTexts);

    // Regressão sem conteúdo: só volta o card, sem criar solicitação vazia.
    if (mode === "regress" && empty) {
      const moved = await runExecutionExitGuarded("Voltar", () =>
        executeRegress(changeRequestModal.targetFunctionKey, changeRequestModal.targetUserId),
      );
      if (moved) setChangeRequestModal(null);
      return;
    }

    setCreatingChangeRequest(true);
    let createdId: string | null = null;
    try {
      const created = await createChangeRequest({
        tenantId: card.tenant_id,
        demandId: card.id,
        notes,
        itemTexts,
        sourceFunctionKey: card.current_function_key ?? null,
        targetFunctionKey: mode === "standalone" ? null : changeRequestModal.targetFunctionKey,
      });
      createdId = created.requestId;

      if (mode === "regress") {
        const moved = await runExecutionExitGuarded("Voltar", () =>
          executeRegress(changeRequestModal.targetFunctionKey, changeRequestModal.targetUserId),
        );
        if (!moved) {
          // O card não se moveu: não deixa solicitação órfã.
          await deleteChangeRequest(createdId);
          createdId = null;
          return;
        }
      } else {
        toast.success("Alteração solicitada.");
        setActiveSection('alteracoes');
      }
      setChangeRequestModal(null);
      await refreshChangeRequests();
    } catch (err) {
      console.error("[TaskCard] change request", err);
      toast.error("Não foi possível registrar as alterações.");
      if (createdId) await deleteChangeRequest(createdId).catch(() => {});
    } finally {
      setCreatingChangeRequest(false);
    }
  };


  /* Ações de avanço com auxílio (nunca bloqueio) de alterações pendentes. */
  const handleProceed = (forcedAssigneeId?: string | null) =>
    runWithPendingChangesGuard("Prosseguir", () => executeProceed(forcedAssigneeId));
  const handleDeliverMyPart = (targetUserId?: string) =>
    runWithPendingChangesGuard("Entregar minha parte", () => executeDeliverMyPart(targetUserId));
  const handleDeliver = () => runWithPendingChangesGuard("Entregar", () => executeDeliver());

  const executeDeliver = async () => {
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
        // Card Diário não finalizado: mesma etapa, mesmo responsável — a
        // passagem continua ativa (o checklist não é encerrado).
        return { success: false };
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
      return result;
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
      const area: WorkArea = ((card as any)?.work_area === "sistemas" ? "sistemas" : "midia");
      // Descobre a etapa inicial (ou mantém a atual se ainda for válida) segundo o fluxo
      // configurado PARA A ÁREA e origem do card (Mídia × Sistemas têm fluxos distintos).
      const resolved = await resolveInitialFunctionKey(
        card.tenant_id,
        key,
        card.current_function_key,
        { workArea: area, origin: ((card as any)?.origin || "interno") as string },
      );
      if (!resolved.success) {
        toast.error(
          resolved.message
            ? `${resolved.message} (área ${AREA_LABEL[area]})`
            : `Nenhuma etapa configurada para este tipo na área ${AREA_LABEL[area]}.`,
        );
        setSettingType(false);
        return;
      }
      const nextFunctionKey = resolved.shouldUpdate
        ? (resolved.functionKey ?? null)
        : (card.current_function_key ?? null);

      /*
       * RASCUNHO: a etapa correta não é a primeira do fluxo, é a etapa do
       * RESPONSÁVEL já escolhido. Gravar a etapa inicial global criaria o card
       * numa coluna onde a pessoa não tem função. Zero writes aqui.
       */
      if (isDraft) {
        if (!card.assigned_to) {
          onCardChange({ ...card, demand_type: label, demand_type_key: key, current_function_key: null });
          setSettingType(false);
          return;
        }
        let stageForOwner: string | null = null;
        try {
          stageForOwner = await resolveFunctionForAssignee(
            card.tenant_id as string,
            card.assigned_to,
            key,
            null,
            null,
            { workArea: area, origin: ((card as any)?.origin ?? null) },
          );
        } catch {
          stageForOwner = null;
        }
        if (stageForOwner) {
          onCardChange({ ...card, demand_type: label, demand_type_key: key, current_function_key: stageForOwner });
        } else {
          onCardChange({
            ...card,
            demand_type: label,
            demand_type_key: key,
            assigned_to: null,
            current_function_key: null,
          } as any);
          toast.info("O responsável anterior não possui etapa compatível com este novo tipo. Escolha outro responsável.");
        }
        setSettingType(false);
        return;
      }

      {
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
      toast.success(`Tipo definido: ${label}`);
    } catch (err: any) {
      console.error("[TaskCard] set demand_type_key error", err);
      toast.error(err?.message || "Erro ao definir o tipo da demanda");
    } finally {
      setSettingType(false);
    }
  };
  /* ===================== RASCUNHO — handlers locais (zero write) ===================== */

  /** Resolve a etapa de um responsável na configuração informada (só leitura). */
  const resolveDraftStage = async (
    userId: string,
    typeKey: string | null,
    area: WorkArea,
    origin: string | null,
  ): Promise<string | null> => {
    if (!card?.tenant_id || !typeKey) return null;
    try {
      return await resolveFunctionForAssignee(card.tenant_id, userId, typeKey, null, null, {
        workArea: area,
        origin,
      });
    } catch {
      return null;
    }
  };

  /** Troca de área no rascunho: revalida tipo e responsável, sem tocar no banco. */
  const handleDraftAreaChange = async (newArea: WorkArea) => {
    if (!card) return;
    const { patch, typeCleared, needsAssigneeRecheck } = draftAreaChangePatch(
      { demand_type_key: (card as any).demand_type_key, assigned_to: card.assigned_to },
      newArea,
      demandTypesForArea(newArea).map((t) => t.key),
    );
    if (typeCleared) {
      onCardChange({ ...card, ...patch } as any);
      toast.info("Tipo e responsável foram limpos: selecione um tipo da nova área.");
      return;
    }
    if (!needsAssigneeRecheck || !card.assigned_to) {
      onCardChange({ ...card, ...patch } as any);
      return;
    }
    const nextOrigin = newArea === "midia" ? "interno" : ((card as any).origin ?? "interno");
    const stage = await resolveDraftStage(card.assigned_to, (card as any).demand_type_key, newArea, nextOrigin);
    if (stage) {
      onCardChange({ ...card, ...patch, current_function_key: stage } as any);
      return;
    }
    const nome = collaborators.find((c) => c.id === card.assigned_to)?.name || "O responsável";
    onCardChange({ ...card, ...patch, assigned_to: null, current_function_key: null } as any);
    toast.info(`${nome} não tem etapa compatível na área ${AREA_LABEL[newArea]}. Escolha outro responsável.`);
  };

  /** Troca de origem no rascunho: origem interna pula etapas de cliente e pode invalidar o owner. */
  const handleDraftOriginChange = async (newOrigin: DemandOrigin) => {
    if (!card) return;
    const area: WorkArea = ((card as any).work_area === "sistemas" ? "sistemas" : "midia");
    if (!card.assigned_to || !(card as any).demand_type_key) {
      onCardChange({ ...card, origin: newOrigin } as any);
      return;
    }
    const stage = await resolveDraftStage(card.assigned_to, (card as any).demand_type_key, area, newOrigin);
    if (stage) {
      onCardChange({ ...card, origin: newOrigin, current_function_key: stage } as any);
      return;
    }
    const nome = collaborators.find((c) => c.id === card.assigned_to)?.name || "O responsável";
    onCardChange({ ...card, origin: newOrigin, assigned_to: null, current_function_key: null } as any);
    toast.info(`${nome} não tem etapa compatível com esta origem. Escolha outro responsável.`);
  };

  /** Troca de responsável no rascunho: a etapa passa a ser a etapa DELE. */
  const handleDraftAssigneeChange = async (userId: string) => {
    if (!card) return;
    if (!userId) {
      onCardChange({ ...card, assigned_to: null, current_function_key: null } as any);
      return;
    }
    const area: WorkArea = ((card as any).work_area === "sistemas" ? "sistemas" : "midia");
    const nome = collaborators.find((c) => c.id === userId)?.name || "Este colaborador";
    const stage = await resolveDraftStage(userId, (card as any).demand_type_key, area, (card as any).origin ?? null);
    if (!stage) {
      toast.error(`${nome} não possui nenhuma etapa compatível com este tipo de demanda.`);
      return;
    }
    onCardChange({ ...card, assigned_to: userId, current_function_key: stage } as any);
  };

  /** Troca de cliente no rascunho: período e subclientes do cliente anterior caem. */
  const handleDraftClientSelect = (clientId: string, clientName: string) => {
    setPeriodTitle(null);
    // No rascunho, `onDraftClientChange` já grava cliente + limpeza de período/
    // subclientes. Chamar também `onCardChange` criava uma corrida que
    // sobrescrevia o cliente recém-escolhido com o valor anterior (vazio).
    if (onDraftClientChange) {
      onDraftClientChange(clientId, clientName);
      return;
    }
    if (card) onCardChange({ ...card, ...draftClientChangePatch(), clientId, clientName } as any);
  };


  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [selectedAiModel, setSelectedAiModel] = useState<"gpt2" | "nanobanana3" | "nanobanana25">("gpt2");
  // Proporção da arte para geração manual — 4:5 é o padrão do sistema.
  const [generationAspect, setGenerationAspect] = useState<ImageAspectRatio>(DEFAULT_SOCIAL_ASPECT);
  useEffect(() => {
    if (!card) return;
    setGenerationAspect(
      isImageAspectRatio(card.image_aspect_ratio) ? card.image_aspect_ratio : DEFAULT_SOCIAL_ASPECT,
    );
  }, [card?.id, card?.image_aspect_ratio]);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regeneratingSlide, setRegeneratingSlide] = useState<number | null>(null);
  const [showRemoveAllAttachments, setShowRemoveAllAttachments] = useState(false);
  const [removingAllAttachments, setRemovingAllAttachments] = useState(false);

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

  /**
   * Responsáveis ELEGÍVEIS para o fluxo escolhido.
   *
   * Escolher responsável antes do tipo (ou escolher alguém sem etapa compatível)
   * era a principal fonte de card criado "fora do fluxo". Aqui a lista é
   * pré-filtrada: só entra quem tem alguma etapa habilitada no fluxo do tipo +
   * área + origem do card. `null` = ainda calculando / sem tipo definido.
   */
  const [eligibleAssignees, setEligibleAssignees] = useState<Set<string> | null>(null);
  /**
   * Mapa RICO de elegibilidade: além de sim/não, guarda QUAL etapa a pessoa
   * assumiria. É isso que permite mostrar "começa em Criar arte" no seletor
   * do rascunho em vez de apenas esconder/desabilitar sem explicação.
   */
  const [draftAssigneeResolution, setDraftAssigneeResolution] = useState<
    Record<string, { eligible: boolean; functionKey: string | null; functionName: string | null }>
  >({});
  const [flowFunctionNames, setFlowFunctionNames] = useState<Record<string, string>>({});
  const demandTypeKeyForEligibility = (card as any)?.demand_type_key ?? null;
  const workAreaForEligibility = (card as any)?.work_area ?? null;
  const originForEligibility = (card as any)?.origin ?? null;

  useEffect(() => {
    if (!open || !card?.tenant_id || !demandTypeKeyForEligibility || collaborators.length === 0) {
      setEligibleAssignees(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        collaborators.map(async (c) => {
          try {
            const resolved = await resolveFunctionForAssignee(
              card.tenant_id as string,
              c.id,
              demandTypeKeyForEligibility,
              null,
              null,
              { workArea: workAreaForEligibility, origin: originForEligibility },
            );
            return resolved ? c.id : null;
          } catch {
            return c.id; // em caso de falha de leitura, não esconder o colaborador
          }
        }),
      );
      if (cancelled) return;
      setEligibleAssignees(new Set(entries.filter(Boolean) as string[]));
    })();
    return () => { cancelled = true; };
  }, [
    open,
    card?.tenant_id,
    demandTypeKeyForEligibility,
    workAreaForEligibility,
    originForEligibility,
    collaborators,
  ]);

  /** Nomes das etapas da área atual (chave → rótulo) para textos auxiliares. */
  useEffect(() => {
    if (!open || !card?.tenant_id) { setFlowFunctionNames({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("flow_functions") as any)
        .select("function_key, name, work_area")
        .eq("tenant_id", card.tenant_id)
        .eq("work_area", workAreaForEligibility === "sistemas" ? "sistemas" : "midia");
      if (cancelled) return;
      const map: Record<string, string> = {};
      (data || []).forEach((f: any) => { map[f.function_key] = f.name; });
      setFlowFunctionNames(map);
    })();
    return () => { cancelled = true; };
  }, [open, card?.tenant_id, workAreaForEligibility]);

  /** Resolve etapa inicial de cada colaborador na configuração atual (rascunho). */
  useEffect(() => {
    if (!open || !card?.tenant_id || !demandTypeKeyForEligibility || collaborators.length === 0) {
      setDraftAssigneeResolution({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        collaborators.map(async (c) => {
          try {
            const key = await resolveFunctionForAssignee(
              card.tenant_id as string,
              c.id,
              demandTypeKeyForEligibility,
              null,
              null,
              { workArea: workAreaForEligibility, origin: originForEligibility },
            );
            return [c.id, { eligible: !!key, functionKey: key ?? null, functionName: key ? (flowFunctionNames[key] ?? null) : null }] as const;
          } catch {
            return [c.id, { eligible: true, functionKey: null, functionName: null }] as const;
          }
        }),
      );
      if (cancelled) return;
      setDraftAssigneeResolution(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [
    open,
    card?.tenant_id,
    card?.clientId,
    demandTypeKeyForEligibility,
    workAreaForEligibility,
    originForEligibility,
    collaborators,
    flowFunctionNames,
  ]);

  const assigneeOptions = eligibleAssignees
    ? collaborators.filter((c) => eligibleAssignees.has(c.id) || c.id === card?.assigned_to)
    : collaborators;

  /**
   * RASCUNHO — completude.
   * "Salvar Demanda" só habilita quando o card tem o mínimo para entrar no fluxo.
   * Regras em `src/lib/draftDemand.ts` (Publicação não substitui início de produção).
   */
  const draftMissingFields: string[] = isDraft ? computeDraftMissingFields(card as any) : [];
  const draftReady = isDraft && draftMissingFields.length === 0;

  /**
   * RASCUNHO — revalidação do responsável.
   * Trocar área / tipo / cliente pode invalidar a etapa de quem estava escolhido.
   * Nesse caso limpamos o responsável em vez de salvar um vínculo impossível.
   */
  useEffect(() => {
    if (!isDraft || !card?.assigned_to || !eligibleAssignees) return;
    if (eligibleAssignees.has(card.assigned_to)) return;
    const nome = collaborators.find((c) => c.id === card.assigned_to)?.name || "O responsável";
    onCardChange({ ...card, assigned_to: null, current_function_key: null } as any);
    toast.info(`${nome} não tem etapa compatível com esta configuração — escolha outro responsável.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft, eligibleAssignees, card?.assigned_to, (card as any)?.demand_type_key, (card as any)?.work_area, card?.clientId]);



  // Opções de "Voltar demanda" (etapas anteriores + quem executou cada uma)
  const [regressOpen, setRegressOpen] = useState(false);
  const [regressOptions, setRegressOptions] = useState<RegressOption[]>([]);
  useEffect(() => {
    if (!open || !card?.id || !card?.tenant_id) {
      setRegressOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const opts = await getRegressOptions(
        card.tenant_id,
        card.id,
        card.demand_type_key,
        card.current_function_key,
      );
      if (!cancelled) setRegressOptions(opts);
    })();
    return () => { cancelled = true; };
  }, [open, card?.id, card?.tenant_id, card?.demand_type_key, card?.current_function_key]);

  // Partial delivery history (Captar multi-responsáveis) — quem já entregou sua parte
  const [partialDeliveries, setPartialDeliveries] = useState<
    Array<{ user_id: string; created_at: string; function_key: string }>
  >([]);
  useEffect(() => {
    if (!open || !card?.id) {
      setPartialDeliveries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("demand_flow_history")
        .select("from_user_id, created_at, from_function_key, action")
        .eq("demand_id", card.id)
        .in("action", ["partial_delivered", "proceeded", "delivered"])
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setPartialDeliveries(
        (data || [])
          .filter((r: any) => r?.from_user_id && r?.from_function_key && r.from_function_key !== "aguardando_cliente")
          .map((r: any) => ({
            user_id: r.from_user_id,
            created_at: r.created_at,
            function_key: r.from_function_key as string,
          })),
      );
    })();
    return () => { cancelled = true; };
  }, [open, card?.id, card?.assigned_to, card?.additional_assignees]);


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

  // Reordenação da coleção de referências (independente dos anexos finais)
  const referenceAttachments = (card?.reference_attachments || []) as Attachment[];

  const handleReferenceDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination || !card) return;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    if (sourceIndex === destIndex) return;

    const list = Array.from((card.reference_attachments || []) as Attachment[]);
    const [removed] = list.splice(sourceIndex, 1);
    list.splice(destIndex, 0, removed);

    onCardChange({ ...card, reference_attachments: list });
    if (onReorderReferenceAttachments) {
      await onReorderReferenceAttachments(list);
    }
  }, [card, onCardChange, onReorderReferenceAttachments]);

  // ===== Upload por arrastar/soltar e colar (reutiliza os handlers dos pais) =====
  const uploadBlocked = readOnly || isDraft;
  const finalUploadDisabled = uploadBlocked || uploading;
  const referenceUploadDisabled = uploadBlocked || referenceUploading || !onReferenceFileUpload;
  const activeCollection = resolveUploadCollection(activeSection);
  const isReferenceSection = activeCollection === 'reference';
  const uploadDisabled = isReferenceSection ? referenceUploadDisabled : finalUploadDisabled;
  const dropZoneSection = activeSection === 'anexos' || activeSection === 'referencias';

  const uploadFilesThroughExistingHandler = useCallback(async (files: File[]) => {
    if (!files.length || uploadDisabled) return;
    const syntheticTarget = { files: files as unknown as FileList, value: "" } as HTMLInputElement;
    const syntheticEvent = {
      target: syntheticTarget,
      currentTarget: syntheticTarget,
    } as React.ChangeEvent<HTMLInputElement>;
    if (isReferenceSection) {
      await onReferenceFileUpload?.(syntheticEvent);
      return;
    }
    await onFileUpload(syntheticEvent);
  }, [onFileUpload, onReferenceFileUpload, isReferenceSection, uploadDisabled]);

  const hasDraggedFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleFilesDragEnter = useCallback((e: React.DragEvent) => {
    if (uploadDisabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }, [uploadDisabled]);

  const handleFilesDragOver = useCallback((e: React.DragEvent) => {
    if (uploadDisabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, [uploadDisabled]);

  const handleFilesDragLeave = useCallback((e: React.DragEvent) => {
    if (uploadDisabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
    if (fileDragDepthRef.current === 0) setIsDraggingFiles(false);
  }, [uploadDisabled]);

  const handleFilesDrop = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (uploadDisabled) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void uploadFilesThroughExistingHandler(files);
  }, [uploadDisabled, uploadFilesThroughExistingHandler]);

  // Colar arquivos/mídia enquanto a aba Anexos ou Referências está ativa
  useEffect(() => {
    if (!open || !dropZoneSection || uploadDisabled) return;
    const handler = (event: ClipboardEvent) => {
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName?.toUpperCase();
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
      if (isTyping) return;
      const files = normalizePastedFiles(extractClipboardFiles(event.clipboardData));
      if (!files.length) return;
      event.preventDefault();
      void uploadFilesThroughExistingHandler(files);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [open, dropZoneSection, uploadDisabled, uploadFilesThroughExistingHandler]);

  // Limpeza do highlight quando a aba muda ou o card fecha
  useEffect(() => {
    if (open && dropZoneSection) return;
    fileDragDepthRef.current = 0;
    setIsDraggingFiles(false);
  }, [open, dropZoneSection]);


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

  // Classificações operacionais (Anúncio / Gráfica)
  const classifications: string[] = Array.isArray((card as any)?.classifications)
    ? ((card as any).classifications as string[])
    : [];
  const isAnuncio = classifications.includes("anuncio");
  const isGrafica = classifications.includes("grafica");

  const handleClassificationsChange = async (next: string[]) => {
    onCardChange({ ...card, classifications: next } as any);
    if (isDraft) return;
    try {
      await supabase.from("demands").update({ classifications: next } as any).eq("id", card.id);
    } catch (e) {
      console.error("[TaskCard] update classifications error", e);
      toast.error("Erro ao atualizar classificações");
    }
  };

  const handleAdPlanSave = async () => {
    if (isDraft) return;
    try {
      await supabase
        .from("demands")
        .update({ ad_plan: ((card as any)?.ad_plan ?? {}) as any })
        .eq("id", card.id);
    } catch (e) {
      console.error("[TaskCard] update ad_plan error", e);
      toast.error("Erro ao salvar informações do anúncio");
    }
  };

  // Briefing editorial estruturado (JSONB `content_brief`)
  const contentBrief = ((card as any)?.content_brief ?? null) as Record<string, any> | null;

  const handleContentBriefSave = async (next: Record<string, any>) => {
    onCardChange({ ...card, content_brief: next } as any);
    if (isDraft) return;
    try {
      const { error } = await supabase
        .from("demands")
        .update({ content_brief: next as any })
        .eq("id", card.id);
      if (error) throw error;
      toast.success("Briefing salvo!");
    } catch (e) {
      console.error("[TaskCard] update content_brief error", e);
      toast.error("Erro ao salvar briefing");
    }
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
    // Rascunho: apenas estado local — nada é gravado antes de "Salvar Demanda".
    if (isDraft) {
      onCardChange({ ...card, period_plan_id: periodPlanId });
      return;
    }
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

      // Persiste a proporção escolhida ANTES de gerar — ela é autoritativa
      // para esta geração e para todas as regenerações futuras.
      const { error: aspectError } = await supabase
        .from("demands")
        .update({ image_aspect_ratio: generationAspect })
        .eq("id", card.id);
      if (aspectError) {
        console.error("[TaskCard] save image_aspect_ratio error", aspectError);
        toast.error("Não foi possível salvar a proporção da arte. Geração cancelada.");
        return;
      }
      onCardChange({ ...card, image_aspect_ratio: generationAspect });

      const functionName = isCarousel ? "auto-generate-carousel" : "generate-post-image";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { demandId: card.id, aiModel: selectedAiModel, aspectRatio: generationAspect },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error, { description: data.details?.join(", ") });
        return;
      }

      if (isCarousel) {
        if (data?.partial) {
          toast.warning(data.message || "Carrossel parcialmente gerado. Clique novamente para continuar.");
        } else {
          const archivedMsg = data?.archivedSlides > 0 
            ? ` (${data.archivedSlides} slides anteriores movidos para histórico)` 
            : "";
          toast.success(data?.message || `Carrossel gerado com sucesso!${archivedMsg}`);
        }
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
      if (isCarousel) {
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
      }
      const msg = error?.message || "Erro ao gerar imagens";
      toast.error(msg.includes("non-2xx") ? "A geração demorou demais. Se alguns slides apareceram, clique novamente para continuar." : msg);
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
    const aspectRatio = isImageAspectRatio(card.image_aspect_ratio)
      ? card.image_aspect_ratio
      : DEFAULT_SOCIAL_ASPECT;
    try {
      // Regenerate based on type — preserve existing attachments (new ones are appended)
      if (isCarousel) {
        const { data, error } = await supabase.functions.invoke("auto-generate-carousel", {
          body: { demandId: card.id, aiModel: selectedAiModel, forceRegenerate: true, aspectRatio },
        });
        if (error) throw error;
        if (data?.error) {
          toast.error(data.error);
          return;
        }
        if (data?.partial) {
          toast.warning(data.message || "Carrossel parcialmente regenerado. Clique novamente para continuar.");
        } else {
          toast.success(data?.message || "Carrossel regenerado com sucesso!");
        }
      } else {
        const { data, error } = await supabase.functions.invoke("generate-post-image", {
          body: { demandId: card.id, aiModel: selectedAiModel, aspectRatio },
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
      if (isCarousel) {
        const { data: updatedDemand } = await supabase
          .from("demands")
          .select("attachments")
          .eq("id", card.id)
          .single();
        if (updatedDemand) {
          onCardChange({ ...card, attachments: updatedDemand.attachments as unknown as Attachment[] });
        }
      }
      const msg = error?.message || "Erro ao regenerar";
      toast.error(msg.includes("non-2xx") ? "A regeneração demorou demais. Se alguns slides apareceram, clique novamente para continuar." : msg);
    } finally {
      setRegeneratingAll(false);
    }
  };

  const handleRegenerateSlide = async (slideNumber: number) => {
    if (!card) return;
    setRegeneratingSlide(slideNumber);
    try {
      const { data, error } = await supabase.functions.invoke("generate-post-image", {
        body: {
          demandId: card.id,
          slideNumber,
          replaceSlide: false,
          aiModel: "gpt2",
          aspectRatio: isImageAspectRatio(card.image_aspect_ratio)
            ? card.image_aspect_ratio
            : DEFAULT_SOCIAL_ASPECT,
        },
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
  const [hardConflict, setHardConflict] = useState<
    | { items: AreaConflictInfo[]; targetArea: WorkArea; scheduleMessage?: string | null }
    | null
  >(null);
  const [assignConflict, setAssignConflict] = useState<{
    newAssignedTo: string | null;
    targetName: string;
    conflicts: AssignmentConflict[];
    suggestion: FreeSlotSuggestion | null;
    nextFunctionKey: string | null;
  } | null>(null);
  const [reschedulingAssign, setReschedulingAssign] = useState(false);

  const applyAssignReschedule = async (slot: FreeSlotSuggestion) => {
    if (!assignConflict || !card?.tenant_id) return;
    setReschedulingAssign(true);
    try {
      // Transferir com reagendamento também abandona a passagem atual.
      let res: Awaited<ReturnType<typeof applyReassign>> | null = null;
      const moved = await runExecutionExitGuarded("Transferir", async () => {
        res = await applyReassign({
          tenantId: card.tenant_id,
          card: card as any,
          newAssignedTo: assignConflict.newAssignedTo,
          nextFunctionKey: assignConflict.nextFunctionKey,
          reschedule: {
            due_date: slot.date,
            due_time: slot.startTime,
            delivery_date: slot.date,
            delivery_time: slot.endTime,
          },
          historySource: "task_card_rescheduled",
        });
        return reassignFailureMessage(res) ? "failure" : "success";
      });
      if (!res) return;
      const failure = reassignFailureMessage(res);
      if (failure || !moved) throw new Error(failure || "Transferência não aplicada");
      onCardChange({
        ...card,
        assigned_to: assignConflict.newAssignedTo,
        current_function_key: assignConflict.nextFunctionKey,
        due_date: slot.date,
        due_time: slot.startTime,
        delivery_date: slot.date,
        delivery_time: slot.endTime,
      } as any);
      toast.success(`Transferida e reagendada para ${slot.startTime}–${slot.endTime}`);
      setAssignConflict(null);
    } catch (e) {
      console.error("[taskcard reschedule]", e);
      toast.error("Não foi possível reagendar");
    } finally {
      setReschedulingAssign(false);
    }
  };

  const warnAreaConflict = async (
    dateStr: string | null | undefined,
    timeStr: string | null | undefined,
    endTimeStr?: string | null | undefined,
  ) => {
    if (!card || !dateStr || !card.assigned_to || !card.tenant_id) return;
    const area = (((card as any).work_area as WorkArea) || "midia") as WorkArea;
    try {
      // Motor único: pega conflito de ocupação na MESMA área e entre áreas.
      const res = await checkAssignmentConflicts({
        tenantId: card.tenant_id,
        userId: card.assigned_to,
        card: {
          ...(card as any),
          due_date: dateStr,
          due_time: timeStr || null,
          delivery_date: dateStr,
          delivery_time: endTimeStr ?? null,
        },
        area,
      });
      if (res.hard.length > 0) {
        setHardConflict({
          items: res.hard.map((c) => ({
            id: c.id,
            title: c.title,
            work_area: c.area,
            delivery_time: c.endTime,
            time: c.startTime,
            hard: true,
          })),
          targetArea: area,
          scheduleMessage: res.scheduleHard ? res.scheduleMessage : null,
        });
        return;
      }
      
      if (res.scheduleMessage && !res.scheduleHard) {
        toast.warning(res.scheduleMessage);
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
    setIsDatePickerOpen(false);
    if (isDraft) return;
    await onSave('publish_date', dateStr);
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
    if (isDraft) return;
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
    if (isDraft) { setIsAdditionalDatePickerOpen(false); return; }
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
    if (isDraft) return;
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
  /**
   * RASCUNHO — bloco "Configuração da demanda".
   *
   * Ordem obrigatória (é a ordem das dependências reais do fluxo):
   * Cliente → Área → Tipo → Origem(Sistemas) → Responsável → Datas de produção
   * → Publicação → Período. Nenhum controle daqui escreve no banco: a criação
   * acontece só em `onDraftSave` via `create_manual_demand_atomic`.
   */
  const renderDraftConfig = () => {
    if (!card) return null;
    const area: WorkArea = ((card as any).work_area === "sistemas" ? "sistemas" : "midia");
    const typeKey = (card as any).demand_type_key as string | null;
    const hasClient = !!card.clientId;
    const hasType = !!typeKey;
    const hasOwner = !!card.assigned_to;
    const subclientValue = card.subclient_ids?.length
      ? card.subclient_ids
      : card.subclient_id
        ? [card.subclient_id]
        : [];

    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">Configuração da demanda</p>
          <p className="text-xs text-muted-foreground">
            Preencha na ordem abaixo. Os próximos campos são liberados conforme as dependências são definidas.
          </p>
        </div>

        {/* LINHA 1 — DEFINIÇÃO */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cliente *</label>
            <Select
              value={card.clientId || ""}
              onValueChange={(v) => {
                const c = draftClients.find((d) => d.id === v);
                handleDraftClientSelect(v, c?.name || "Cliente");
              }}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-[320px]">
                {draftClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Área *</label>
            <Select value={area} onValueChange={(v) => handleDraftAreaChange(v as WorkArea)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="midia">{AREA_LABEL.midia}</SelectItem>
                <SelectItem value="sistemas">{AREA_LABEL.sistemas}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo de demanda *</label>
            <Select
              value={typeKey || ""}
              onValueChange={(v) => handleSetDemandType(v as DemandTypeKey)}
              disabled={!hasClient || settingType}
            >
              <SelectTrigger
                className={cn("h-9 text-sm", !hasClient && "opacity-50 cursor-not-allowed")}
                title={!hasClient ? "Selecione o cliente primeiro" : undefined}
              >
                <SelectValue placeholder="Definir tipo" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {demandTypesForArea(area).map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {area === "sistemas" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Origem *</label>
              <Select
                value={((card as any).origin as DemandOrigin) || "interno"}
                onValueChange={(v) => handleDraftOriginChange(v as DemandOrigin)}
              >
                <SelectTrigger className="h-9 text-sm" title="Origem interna pula as etapas de cliente">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {DEMAND_ORIGINS.map((oo) => (
                    <SelectItem key={oo.key} value={oo.key}>{oo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* LINHA 2 — EXECUÇÃO */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Responsável *</label>
            <Select
              value={card.assigned_to || "__none__"}
              onValueChange={(v) => handleDraftAssigneeChange(v === "__none__" ? "" : v)}
              disabled={!hasClient || !hasType}
            >
              <SelectTrigger
                className={cn("h-9 text-sm", (!hasClient || !hasType) && "opacity-50 cursor-not-allowed")}
                title={!hasType ? "Defina o tipo da demanda primeiro" : undefined}
              >
                <SelectValue placeholder="Selecione o responsável" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-[320px]">
                <SelectItem value="__none__">Sem responsável</SelectItem>
                {collaborators.map((c) => {
                  const res = draftAssigneeResolution[c.id];
                  const incompatible = res ? !res.eligible : false;
                  return (
                    <SelectItem key={c.id} value={c.id} disabled={incompatible}>
                      <span className="flex flex-col">
                        <span>{c.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {incompatible
                            ? "Sem etapa compatível neste fluxo"
                            : res?.functionName
                              ? `começa em ${res.functionName}`
                              : ""}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {!card.is_daily_card && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Datas de produção *</label>
              <div
                className={cn("flex", !hasOwner && "opacity-50 cursor-not-allowed")}
                title={!hasOwner ? "Escolha o responsável primeiro" : undefined}
              >
                <StartEndDatePopover
                  dueDate={card.due_date}
                  dueTime={card.due_time}
                  deliveryDate={card.delivery_date}
                  deliveryTime={card.delivery_time}
                  disabled={!hasOwner}
                  onSave={(v) => {
                    onCardChange({
                      ...card,
                      due_date: v.due_date || '',
                      due_time: v.due_time || '',
                      delivery_date: v.delivery_date || '',
                      delivery_time: v.delivery_time || '',
                    } as any);
                  }}
                  trigger={
                    <button
                      type="button"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-left text-sm truncate"
                    >
                      {card.due_date
                        ? `${formatShortDate(card.due_date)}${card.due_time ? ' ' + card.due_time : ''}${card.delivery_date ? ` → ${formatShortDate(card.delivery_date)}` : ''}`
                        : "Definir início da produção"}
                    </button>
                  }
                />
              </div>
            </div>
          )}

          {!card.is_daily_card && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Publicação</label>
              <SingleDateTimePopover
                date={card.publish_date}
                time={card.publish_time}
                label="Publicação"
                onSave={(v) => {
                  const dateStr = v.date || '';
                  onCardChange({
                    ...card,
                    publish_date: dateStr,
                    publish_time: v.time || (dateStr ? '09:00' : ''),
                  } as any);
                }}
                trigger={
                  <button
                    type="button"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-left text-sm truncate"
                  >
                    {card.publish_date
                      ? `${formatShortDate(card.publish_date)}${card.publish_time ? ' ' + card.publish_time : ''}`
                      : "Opcional"}
                  </button>
                }
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Período</label>
            {card.period_plan_id ? (
              <div className="h-9 flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                <span className="truncate">{periodTitle || "Carregando..."}</span>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    onCardChange({ ...card, period_plan_id: null } as any);
                    setPeriodTitle(null);
                  }}
                  title="Desvincular do período"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Select onValueChange={handleLinkPeriod} disabled={!hasClient || periodPlans.length === 0}>
                <SelectTrigger
                  className={cn("h-9 text-sm", (!hasClient || periodPlans.length === 0) && "opacity-50")}
                  title={!hasClient ? "Selecione o cliente primeiro" : undefined}
                >
                  <SelectValue placeholder={loadingPeriodPlans ? "Carregando..." : "Opcional"} />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {periodPlans.map((pp) => (
                    <SelectItem key={pp.id} value={pp.id}>
                      <span className="text-xs">
                        {pp.period_title} ({format(new Date(pp.period_start + 'T00:00:00'), "dd/MM", { locale: ptBR })} - {format(new Date(pp.period_end + 'T00:00:00'), "dd/MM", { locale: ptBR })})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* LINHA AUXILIAR — classificações e clientes finais */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/60">
          <ClassificationSelector
            value={classifications}
            onChange={handleClassificationsChange}
            disabled={false}
          />
          {area === "sistemas" && (
            <SubclientSelect
              tenantId={card.tenant_id}
              parentCompanyId={card.clientId}
              value={subclientValue}
              onChange={(ids) => {
                onCardChange({
                  ...card,
                  subclient_ids: ids,
                  subclient_id: ids[0] ?? null,
                } as any);
              }}
            />
          )}
        </div>
      </div>
    );
  };

  const modalContent = <>
      {/* Shell externo: fullscreen (Kanban) ou painel lateral direito (Hub do Cliente) */}
      <div
        className={cn(
          "fixed z-50 flex flex-col",
          isDrawer ? "inset-0" : "inset-0 md:left-16"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-card-title"
      >
        {/* Overlay */}
        <div
          className={cn(
            "absolute inset-0",
            isDrawer ? "bg-foreground/25" : "bg-background/80 backdrop-blur-sm"
          )}
          aria-hidden="true"
          onClick={isDrawer ? () => onOpenChange(false) : undefined}
        />

        {/* Modal Content */}
        <div
          className={cn(
            "relative z-10 flex flex-col bg-card border-border shadow-2xl animate-in fade-in-0 slide-in-from-right-2 duration-200",
            isDrawer
              ? "ml-auto h-dvh w-full border-l md:w-[82vw] lg:w-[52vw] lg:max-w-[860px] lg:min-w-[720px]"
              : "h-full w-full border-l"
          )}
        >

          
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
                        if (savingDraft || !draftReady) return;
                        onDraftSave?.();
                      }}
                      disabled={savingDraft || !draftReady}
                      aria-label="Salvar demanda"
                      title={
                        draftReady
                          ? "Salvar e enviar para o Kanban"
                          : `Falta definir: ${draftMissingFields.join(", ")}`
                      }
                    >
                      {savingDraft ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>{savingDraft ? "Salvando…" : "Salvar Demanda"}</span>
                    </Button>
                    {!draftReady && (
                      <span className="text-[11px] text-muted-foreground shrink-0 max-w-[220px] leading-tight">
                        Falta definir: {draftMissingFields.join(", ")}
                      </span>
                    )}
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
                    const baseCurName = curIdx >= 0 ? seq[curIdx].name : (curKey || "Sem etapa");
                    const isPublicarScheduled = curKey === "publicar" && isScheduledPublish;
                    const curName = isPublicarScheduled ? "Publicar agendado" : baseCurName;

                    const nextIsPublicar = curKey === "publicar";
                    const isEnviarCliente = curKey === "enviar_cliente";
                    const nextLabel = nextIsPublicar
                      ? (isPublicarScheduled ? "Reagendar" : "Agendar Publicação")
                      : isLastFn
                        ? "Entregar"
                        : isEnviarCliente
                          ? "Enviado ao cliente"
                          : (next?.name || "Prosseguir");

                    /**
                     * PROSSEGUIR INTELIGENTE
                     * O rótulo da ação principal deixa de ser o nome da etapa e passa a
                     * dizer PARA QUEM o card vai. Quando há mais de um elegível e nenhum
                     * preferencial, o clique NÃO move o card: abre o seletor.
                     */
                    const rp = routingPreview;
                    const previewPending = routingLoading && !rp;
                    const routeCandidates = rp?.available && !rp.inherited ? rp.candidates : [];
                    const preferredCandidate = routeCandidates.find((c) => c.preferred) || null;
                    const directCandidate =
                      routeCandidates.length === 1 ? routeCandidates[0] : preferredCandidate;
                    const needsManualChoice =
                      !!rp?.available && !rp.inherited && routeCandidates.length > 1 && !preferredCandidate;
                    const showRoutingArrow = routeCandidates.length > 1;
                    const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";
                    const proceedActionLabel = isEnviarCliente
                      ? nextLabel
                      : rp?.inherited
                        ? nextLabel
                        : directCandidate
                          ? `Prosseguir → ${firstName(directCandidate.fullName)}`
                          : "Prosseguir";
                    const proceedTitle = !card.demand_type_key
                      ? "Defina o tipo da demanda antes de prosseguir"
                      : isEnviarCliente
                        ? "Marcar como enviado ao cliente"
                        : rp?.inherited
                          ? `A etapa ${rp.functionName} será atribuída a ${rp.inheritedName || "quem já responde pelo card"}`
                          : needsManualChoice
                            ? `Escolha quem recebe a etapa ${rp?.functionName || ""}`
                            : directCandidate
                              ? `Enviar ${rp?.functionName || nextLabel} para ${directCandidate.fullName}${directCandidate.preferred ? " (preferencial para este cliente)" : ""}`
                              : `Enviar para ${nextLabel}`;

                    const doJump = async (key: string, skippedKeys: string[] = []) => {
                      if (!card.tenant_id || !card.demand_type_key || jumpingStep) return;
                      setJumpingStep(true);
                      try {
                        const r = await jumpToFunction({
                          demandId: card.id,
                          tenantId: card.tenant_id,
                          demandTypeKey: card.demand_type_key,
                          targetFunctionKey: key,
                          currentFunctionKey: curKey,
                          skippedStages: skippedKeys,
                        });
                        if (r.success) {
                          toast.success(r.message);
                          if (r.flowState) {
                            reconcileFlowResult(r);
                          } else {
                            onCardChange({ ...card, assigned_to: r.assignedTo || null, current_function_key: r.functionKey || null });
                          }
                          setStepPickerOpen(false);
                        } else if (r.stale) {
                          toast.warning(r.message);
                          reconcileFlowResult(r);
                          setStepPickerOpen(false);
                        } else {
                          toast.error(r.message);
                        }
                        return r;
                      } finally {
                        setJumpingStep(false);
                      }
                    };

                    /** Salto que ignora 2+ etapas obrigatórias pede confirmação. */
                    const requestJump = (target: { function_key: string; name: string }, targetIdx: number) => {
                      const between = curIdx >= 0 && targetIdx > curIdx + 1 ? seq.slice(curIdx + 1, targetIdx) : [];
                      // Mudança manual de etapa também passa pelo auxílio de pendências.
                      runWithPendingChangesGuard("Mudar etapa", () => {
                        if (between.length >= 2) {
                          setPendingJump({
                            key: target.function_key,
                            name: target.name,
                            skippedKeys: between.map((s) => s.function_key),
                            skippedNames: between.map((s) => s.name),
                          });
                          return;
                        }
                        return doJump(target.function_key, between.map((s) => s.function_key));
                      });
                    };


                    return (
                      <div className="flex items-center gap-0 shrink-0 rounded-md bg-muted/30 px-0.5 py-0.5">
                        {prev && (() => {
                          const suggested = regressOptions.find((o) => o.suggested) || null;
                          const label = suggested?.functionName || prev.name;
                          return (
                            <Popover open={regressOpen} onOpenChange={setRegressOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70"
                                  disabled={regressing || !card.demand_type_key}
                                  title="Voltar demanda para uma etapa anterior"
                                >
                                  {regressing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
                                  <span className="max-w-[110px] truncate">{label}</span>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-72 p-2">
                                <div className="text-xs font-medium text-muted-foreground px-1 pb-1.5">
                                  Voltar demanda para
                                </div>
                                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                                  {(regressOptions.length > 0
                                    ? regressOptions
                                    : [{ functionKey: prev.function_key, functionName: prev.name, lastUserId: null, lastUserName: null, lastAt: null, completed: false, suggested: true } as RegressOption]
                                  ).map((opt) => (
                                    <button
                                      key={opt.functionKey}
                                      type="button"
                                      disabled={regressing}
                                      onClick={() => handleRegress(opt.functionKey, opt.functionName, opt.lastUserName, opt.lastUserId)}
                                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-start gap-2"
                                    >
                                      <ArrowLeft className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                      <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-sm truncate">{opt.functionName}</span>
                                          {opt.suggested && (
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">sugerido</Badge>
                                          )}
                                          {opt.completed && (
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                                              já entregue
                                            </Badge>
                                          )}
                                        </span>
                                        {opt.lastUserName && (
                                          <span className="block text-[11px] text-muted-foreground truncate">
                                            {opt.lastUserName}
                                            {opt.lastAt && ` · ${new Date(opt.lastAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${new Date(opt.lastAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
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
                                      onClick={() => requestJump(s, i)}
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
                        <AlertDialog open={!!pendingJump} onOpenChange={(open) => { if (!open) setPendingJump(null); }}>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Pular etapas do fluxo?</AlertDialogTitle>
                              <AlertDialogDescription asChild>
                                <div className="space-y-2 text-sm">
                                  <p>
                                    Ir direto para <strong>{pendingJump?.name}</strong> ignora {pendingJump?.skippedNames.length} etapas obrigatórias:
                                  </p>
                                  <ul className="list-disc pl-5 text-muted-foreground">
                                    {(pendingJump?.skippedNames || []).map((n) => (
                                      <li key={n}>{n}</li>
                                    ))}
                                  </ul>
                                  <p className="text-muted-foreground">
                                    O salto fica registrado no histórico do card com as etapas ignoradas.
                                  </p>
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  const p = pendingJump;
                                  setPendingJump(null);
                                  if (p) doJump(p.key, p.skippedKeys);
                                }}
                              >
                                Pular etapas
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
                          <>
                            {canDeliverPart && (
                              <Popover open={deliverPartOpen} onOpenChange={setDeliverPartOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                    disabled={deliveringPart}
                                    title="Registrar entrega de um dos responsáveis — os demais continuam no card"
                                  >
                                    {deliveringPart ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                    <span className="max-w-[160px] truncate">Entregar parte</span>
                                    <ChevronDown className="h-3 w-3 opacity-70" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-64 p-1">
                                  <div className="text-[11px] font-medium text-muted-foreground px-2 pt-1.5 pb-1">
                                    Registrar entrega de:
                                  </div>
                                  <div className="max-h-64 overflow-y-auto">
                                    {captarAllAssignees.map((uid) => {
                                      const name = collaborators.find((c) => c.id === uid)?.name || (uid === currentUserId ? "Você" : "Colaborador");
                                      const isMe = uid === currentUserId;
                                      return (
                                        <button
                                          key={uid}
                                          type="button"
                                          disabled={deliveringPart}
                                          onClick={() => handleDeliverMyPart(uid)}
                                          className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors hover:bg-muted",
                                            deliveringPart && "opacity-60 cursor-wait",
                                          )}
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                          <span className="truncate flex-1">{name}</span>
                                          {isMe && <span className="text-[10px] text-emerald-600 font-semibold shrink-0">(você)</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                            <Popover open={routingOpen} onOpenChange={setRoutingOpen}>
                              <div className="flex items-center">
                                {needsManualChoice ? (
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                      disabled={proceeding || !card.demand_type_key}
                                      title={proceedTitle}
                                    >
                                      <span className="max-w-[160px] truncate">Prosseguir</span>
                                      {proceeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </Button>
                                  </PopoverTrigger>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "h-8 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10",
                                      showRoutingArrow && "rounded-r-none",
                                    )}
                                    onClick={() => handleProceed(directCandidate?.userId)}
                                    disabled={proceeding || previewPending || !card.demand_type_key}
                                    title={proceedTitle}
                                  >
                                    <span className="max-w-[180px] truncate">
                                      {previewPending ? "Prosseguir" : proceedActionLabel}
                                    </span>
                                    {proceeding || previewPending ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                {showRoutingArrow && !needsManualChoice && (
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-6 px-0 text-primary hover:text-primary hover:bg-primary/10 rounded-l-none border-l border-primary/20"
                                      disabled={proceeding || !card.demand_type_key}
                                      title="Escolher outro responsável para a próxima etapa"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </Button>
                                  </PopoverTrigger>
                                )}
                              </div>
                              <PopoverContent align="end" className="w-72 p-2">
                                {routingLoading && !rp ? (
                                  <div className="p-3 flex justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  </div>
                                ) : !rp?.available ? (
                                  <p className="p-2 text-xs text-muted-foreground">
                                    {rp?.reason || "Não há próxima etapa disponível."}
                                  </p>
                                ) : rp.inherited ? (
                                  <p className="p-2 text-xs text-muted-foreground">
                                    A etapa "{rp.functionName}" será atribuída a{" "}
                                    <strong>{rp.inheritedName || "quem já responde pelo card"}</strong>.
                                  </p>
                                ) : rp.candidates.length === 0 ? (
                                  <p className="p-2 text-xs text-muted-foreground">
                                    Nenhum colaborador tem a função "{rp.functionName}" habilitada nesta área.
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    <p className="px-2 pb-1 text-[10px] uppercase font-semibold text-muted-foreground">
                                      Próxima etapa: {rp.functionName}
                                    </p>
                                    {rp.candidates.map((c) => (
                                      <button
                                        key={c.userId}
                                        onClick={() => handleProceed(c.userId)}
                                        disabled={proceeding}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted text-left disabled:opacity-50"
                                      >
                                        <span className="truncate flex-1">{c.fullName}</span>
                                        {c.preferred ? (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/40 text-primary shrink-0">
                                            Preferencial
                                          </Badge>
                                        ) : c.userId === rp.suggestedUserId ? (
                                          <span className="text-[9px] text-muted-foreground shrink-0">sugerido</span>
                                        ) : null}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          </>
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
              {/* Cliente do rascunho vive no bloco "Configuração da demanda" (ordem de dependência). */}

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
                {/* Barra única operacional (card já salvo): Responsável · Tipo · Datas.
                    No RASCUNHO ela é substituída pelo bloco "Configuração da demanda"
                    abaixo, para não duplicar os mesmos campos fora da ordem correta. */}
                {!isDraft && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 rounded-lg bg-muted/30">
                  {/* Responsável */}
                  <div className="flex items-center gap-1 min-w-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select
                      value={card.assigned_to || "__none__"}
                      onValueChange={async (val) => {
                        const newVal = val === "__none__" ? "" : val;
                        const nome = collaborators.find((c) => c.id === newVal)?.name || "Este colaborador";
                        // RASCUNHO: nada é gravado e o card ainda não existe no banco —
                        // resolve a etapa localmente e mantém tudo em memória.
                        if (isDraft || !card.tenant_id) {
                          if (!newVal) {
                            onCardChange({ ...card, assigned_to: null });
                            return;
                          }
                          if (!(card as any).demand_type_key) {
                            toast.error("Defina o tipo da demanda antes de escolher o responsável.");
                            return;
                          }
                          let draftStage: string | null = null;
                          try {
                            draftStage = await resolveFunctionForAssignee(
                              card.tenant_id as string,
                              newVal,
                              (card as any).demand_type_key ?? null,
                              null,
                              null,
                              {
                                workArea: (card as any).work_area ?? null,
                                origin: (card as any).origin ?? null,
                              },
                            );
                          } catch {
                            draftStage = null;
                          }
                          if (!draftStage) {
                            toast.error(`${nome} não possui nenhuma etapa compatível com este tipo de demanda.`);
                            return;
                          }
                          onCardChange({ ...card, assigned_to: newVal, current_function_key: draftStage });
                          return;
                        }
                        // Ponto único: função da etapa + ocupação de agenda (mesma área e entre áreas).
                        const evaluation = await evaluateReassign({
                          tenantId: card.tenant_id || "",
                          card: card as any,
                          newAssignedTo: newVal || null,
                          collaboratorName: nome,
                        });
                        if (!evaluation.allowed) {
                          if (evaluation.blockedBy === "schedule") {
                            setAssignConflict({
                              newAssignedTo: newVal || null,
                              targetName: nome,
                              conflicts: evaluation.hard,
                              suggestion: evaluation.suggestion,
                              nextFunctionKey: evaluation.nextFunctionKey,
                            });
                          } else {
                            toast.error(evaluation.message || "Transferência bloqueada");
                          }
                          return;
                        }
                        const nextFn = evaluation.nextFunctionKey;
                        evaluation.softMessages.forEach((m) => toast.warning(m));
                        if (evaluation.remapMessage) toast.info(evaluation.remapMessage);
                        // Ponto único de gravação: desarquiva e tira do status final
                        // quando o card volta ao fluxo, além de registrar o histórico.
                        let reassignRes: Awaited<ReturnType<typeof applyReassign>> | null = null;
                        await runExecutionExitGuarded("Transferir", async () => {
                          reassignRes = await applyReassign({
                            tenantId: card.tenant_id,
                            card: card as any,
                            newAssignedTo: newVal || null,
                            nextFunctionKey: nextFn,
                            direction: evaluation.direction,
                            historySource: "task_card",
                          });
                          return reassignFailureMessage(reassignRes) ? "failure" : "success";
                        });
                        if (!reassignRes) return;
                        const reassignFailure = reassignFailureMessage(reassignRes);
                        if (reassignFailure) {
                          console.error("[TaskCard] applyReassign", reassignRes);
                          toast.error(reassignFailure);
                          return;
                        }
                        onCardChange({ ...card, assigned_to: newVal || null, current_function_key: nextFn });


                      }}
                      disabled={readOnly || (isDraft && !(card as any).demand_type_key)}
                    >
                      <SelectTrigger className="h-7 text-sm border-0 shadow-none bg-transparent px-1.5 gap-1 hover:bg-background/60 focus:ring-0 w-auto min-w-[110px]" aria-label="Responsável">
                        <SelectValue
                          placeholder={
                            isDraft && !(card as any).demand_type_key
                              ? "Defina o tipo primeiro"
                              : "Sem responsável"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {/*
                          Colaboradores incompatíveis continuam visíveis, mas desabilitados
                          com o motivo — esconder gerava a dúvida "onde foi meu colega?".
                        */}
                        {collaborators.map((c) => {
                          const eligible = !eligibleAssignees || eligibleAssignees.has(c.id) || c.id === card?.assigned_to;
                          return (
                            <SelectItem key={c.id} value={c.id} disabled={!eligible}>
                              <span className="flex items-center gap-2">
                                <span className={cn(!eligible && "text-muted-foreground")}>{c.name}</span>
                                {!eligible && (
                                  <span className="text-[10px] text-muted-foreground">Sem etapa compatível</span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                        {collaborators.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Nenhum colaborador cadastrado
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {card.current_function_key === "captar" && (() => {
                    const extras = Array.isArray(card.additional_assignees) ? card.additional_assignees : [];
                    const available = collaborators.filter((c) => c.id !== card.assigned_to);
                    const toggleExtra = async (uid: string) => {
                      const set = new Set(extras);
                      if (set.has(uid)) set.delete(uid);
                      else set.add(uid);
                      const next = Array.from(set);
                      onCardChange({ ...card, additional_assignees: next } as any);
                      try {
                        await supabase
                          .from("demands")
                          .update({ additional_assignees: next } as any)
                          .eq("id", card.id);
                      } catch (e) {
                        console.error("[TaskCard] update additional_assignees", e);
                        toast.error("Erro ao atualizar responsáveis adicionais");
                      }
                    };
                    return (
                      <>
                        <span className="text-muted-foreground/40 select-none">·</span>
                        <div className="flex items-center gap-1 min-w-0">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={readOnly}
                                className="h-7 px-1.5 text-sm gap-1 hover:bg-background/60"
                                aria-label="Responsáveis adicionais"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {extras.length > 0 ? (
                                  <span className="text-xs">+{extras.length}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Adicionar</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 p-2">
                              <div className="text-xs font-medium text-muted-foreground px-1 pb-1.5">
                                Responsáveis adicionais (Captar)
                              </div>
                              <div className="max-h-64 overflow-y-auto space-y-0.5">
                                {available.length === 0 ? (
                                  <div className="text-xs text-muted-foreground px-2 py-2">
                                    Nenhum outro colaborador disponível.
                                  </div>
                                ) : (
                                  available.map((c) => {
                                    const checked = extras.includes(c.id);
                                    return (
                                      <label
                                        key={c.id}
                                        className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleExtra(c.id)}
                                          disabled={readOnly}
                                          className="h-3.5 w-3.5"
                                        />
                                        <span className="truncate">{c.name}</span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </>
                    );
                  })()}

                  {partialDeliveries.length > 0 && (() => {
                    const nameOf = (uid: string) =>
                      collaborators.find((c) => c.id === uid)?.name || "Colaborador";
                    const stageNameOf = (key: string) =>
                      pipelineSequence.find((f: any) => f.function_key === key)?.name || key;
                    // Agrupar por etapa, deduplicando por usuário (entrega mais recente)
                    const byStage = new Map<string, Map<string, string>>();
                    for (const d of partialDeliveries) {
                      const inner = byStage.get(d.function_key) || new Map<string, string>();
                      inner.set(d.user_id, d.created_at);
                      byStage.set(d.function_key, inner);
                    }
                    const stages = Array.from(byStage.entries()).map(([key, inner]) => ({
                      key,
                      name: stageNameOf(key),
                      people: Array.from(inner.entries()),
                    }));
                    const total = stages.reduce((acc, st) => acc + st.people.length, 0);
                    const tooltip = stages
                      .map((st) =>
                        st.people
                          .map(([uid, when]) => `${st.name}: ${nameOf(uid)} · ${new Date(when).toLocaleString("pt-BR")}`)
                          .join("\n"),
                      )
                      .join("\n");
                    return (
                      <>
                        <span className="text-muted-foreground/40 select-none">·</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title={tooltip}
                              className="inline-flex items-center gap-1 h-7 px-1.5 rounded text-xs hover:bg-background/60 text-emerald-700 dark:text-emerald-400"
                              aria-label="Já entregaram sua parte"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>{total} entrega{total > 1 ? "s" : ""}</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-2">
                            <div className="text-xs font-medium text-muted-foreground px-1 pb-1.5">
                              Entregas por etapa
                            </div>
                            <div className="space-y-2">
                              {stages.map((st) => (
                                <div key={st.key}>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2">
                                    {st.name}
                                  </div>
                                  <div className="space-y-0.5">
                                    {st.people.map(([uid, when]) => (
                                      <div key={uid} className="flex items-center gap-2 px-2 py-1 text-sm">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        <span className="truncate flex-1">{nameOf(uid)}</span>
                                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                          {new Date(when).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{" "}
                                          {new Date(when).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </>
                    );
                  })()}



                  <span className="text-muted-foreground/40 select-none">·</span>

                  {/* Área */}
                  <div className="flex items-center gap-1 min-w-0">
                    <Select
                      value={((card as any).work_area as WorkArea) || "midia"}
                      onValueChange={async (val) => {
                        const newArea = val as WorkArea;
                        // Tipos são específicos por área: o tipo atual só permanece
                        // se existir na nova área (senão o fluxo apontaria etapas erradas).
                        const stillValid = demandTypesForArea(newArea).some((t) => t.key === card.demand_type_key);
                        const patch: any = { ...card, work_area: newArea };
                        const update: Record<string, any> = { work_area: newArea };
                        if (!stillValid && card.demand_type_key) {
                          patch.demand_type_key = null;
                          patch.demand_type = null;
                          patch.current_function_key = null;
                          update.demand_type_key = null;
                          update.demand_type = null;
                          update.current_function_key = null;
                        }
                        onCardChange(patch);
                        if (isDraft) return;
                        try {
                          await supabase.from("demands").update(update as any).eq("id", card.id);
                          if (!stillValid && card.demand_type_key) {
                            toast.info("Tipo removido: selecione um tipo da nova área.");
                          }
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
                        {demandTypesForArea((card as any).work_area).map((opt) => (
                          <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <span className="text-muted-foreground/40 select-none">·</span>

                  {/* Classificações operacionais (Anúncio / Gráfica) */}
                  <ClassificationSelector
                    value={classifications}
                    onChange={handleClassificationsChange}
                    disabled={readOnly}
                  />


                  {/* Origem — só faz sentido em Sistemas (define se passa pelas etapas de cliente) */}
                  {card.work_area === "sistemas" && (
                  <>
                  <span className="text-muted-foreground/40 select-none">·</span>

                  <div className="flex items-center gap-1 min-w-0">
                    <Select
                      value={((card as any).origin as DemandOrigin) || "interno"}
                      onValueChange={async (val) => {
                        const newOrigin = val as DemandOrigin;
                        onCardChange({ ...card, origin: newOrigin } as any);
                        if (isDraft) return;
                        try {
                          await supabase.from("demands").update({ origin: newOrigin } as any).eq("id", card.id);
                          await recordOriginTouchpoint(card.tenant_id, card.id);

                          if (!isClientOrigin(newOrigin)) {
                            toast.info("Origem interna: etapas de cliente serão puladas no fluxo.");
                          }
                        } catch (e) {
                          console.error("[TaskCard] update origin error", e);
                          toast.error("Erro ao atualizar origem");
                        }
                      }}
                      disabled={readOnly}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-7 text-sm shadow-none px-1.5 gap-1 hover:bg-background/60 focus:ring-0 w-auto min-w-[120px]",
                          isClientOrigin(((card as any).origin as DemandOrigin) || "interno")
                            ? "border border-primary/40 bg-primary/5 rounded-full"
                            : "border-0 bg-transparent",
                        )}
                        aria-label="Origem"
                        title="Origem da demanda — origem interna pula as etapas de cliente"
                      >

                        <SelectValue placeholder="Origem" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEMAND_ORIGINS.map((o) => (
                          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </>
                  )}

                  {/* Clientes finais solicitantes (só Sistemas, opcional, múltiplos) */}
                  {card.work_area === "sistemas" && (
                    <>
                      <span className="text-muted-foreground/40 select-none">·</span>
                      <SubclientSelect
                        tenantId={card.tenant_id}
                        parentCompanyId={card.clientId}
                        value={
                          card.subclient_ids?.length
                            ? card.subclient_ids
                            : card.subclient_id
                              ? [card.subclient_id]
                              : []
                        }
                        disabled={readOnly}
                        onChange={async (subclientIds) => {
                          const previousIds = card.subclient_ids?.length
                            ? card.subclient_ids
                            : card.subclient_id
                              ? [card.subclient_id]
                              : [];
                          const previousPrimary = card.subclient_id ?? previousIds[0] ?? null;
                          const primary = subclientIds[0] ?? null;
                          onCardChange({
                            ...card,
                            subclient_ids: subclientIds,
                            subclient_id: primary,
                          } as any);
                          if (isDraft) return;
                          try {
                            const { data, error } = await supabase
                              .from("demands")
                              .update({ subclient_ids: subclientIds, subclient_id: primary } as any)
                              .eq("id", card.id)
                              .select("subclient_id, subclient_ids")
                              .single();
                            if (error) throw error;
                            const persistedIds = Array.isArray(data?.subclient_ids) ? data.subclient_ids : [];
                            onCardChange({
                              ...card,
                              subclient_ids: persistedIds,
                              subclient_id: data?.subclient_id ?? persistedIds[0] ?? null,
                            });
                            await recordOriginTouchpoint(card.tenant_id, card.id);

                          } catch (e) {
                            console.error("[TaskCard] update subclient_ids error", e);
                            onCardChange({
                              ...card,
                              subclient_ids: previousIds,
                              subclient_id: previousPrimary,
                            });
                            toast.error("Erro ao atualizar clientes solicitantes");
                          }
                        }}
                      />
                    </>
                  )}




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
                        disabled={readOnly || (isDraft && !card.assigned_to)}
                        onSave={async (v) => {
                          const patch: any = {
                            ...card,
                            due_date: v.due_date || '',
                            due_time: v.due_time || '',
                            delivery_date: v.delivery_date || '',
                            delivery_time: v.delivery_time || '',
                          };
                          onCardChange(patch);
                          // RASCUNHO: só memória — nada é gravado antes de "Salvar Demanda".
                          if (isDraft) return;
                          await onSave('due_date', patch.due_date);
                          await onSave('due_time', patch.due_time);
                          await onSave('delivery_date', patch.delivery_date);
                          await onSave('delivery_time', patch.delivery_time);
                          // Checagem de conflito de área (schedule + card-vs-card)
                          const checkDate = patch.delivery_date || patch.due_date;
                          const checkStart = patch.due_time || patch.delivery_time;
                          const checkEnd = patch.delivery_time || patch.due_time;
                          if (checkDate) await warnAreaConflict(checkDate, checkStart, checkEnd);
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
                          if (isDraft) return;
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
                              // RASCUNHO: o card não existe no banco — só memória.
                              if (isDraft) {
                                onCardChange({ ...card, period_plan_id: null } as any);
                                setPeriodTitle(null);
                                return;
                              }
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
                )}

                {/* ===== RASCUNHO: bloco de configuração na ordem de dependência ===== */}
                {isDraft && (
                  renderDraftConfig()
                )}


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

                          {isGrafica && (
                            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                              {GRAFICA_WARNING}
                            </p>
                          )}

                          {/* Botões de navegação (estilo hub) */}
                          {(() => {
                            const sectionButtons = [
                              ...(contentBrief
                                ? [{ id: 'briefing' as const, label: 'Briefing', icon: FileText, savingKey: 'content_brief' }]
                                : []),
                              ...(showExecutionTab
                                ? [{ id: 'execucao' as const, label: 'Execução', icon: ListChecks, savingKey: 'execution' }]
                                : []),
                              { id: 'description' as const, label: 'Conteúdo', icon: AlignLeft, savingKey: 'description' },
                              ...(showAlterationsTab
                                ? [{ id: 'alteracoes' as const, label: 'Alterações', icon: RotateCcw, savingKey: 'change_requests' }]
                                : []),
                              { id: 'observations' as const, label: 'Observações', icon: MessageSquare, savingKey: 'observations' },
                              { id: 'caption' as const, label: 'Descrição', icon: Sparkles, savingKey: 'post_caption' },
                              ...(isAnuncio
                                ? [{ id: 'anuncio' as const, label: 'Anúncio', icon: Megaphone, savingKey: 'ad_plan' }]
                                : []),
                              { id: 'anexos' as const, label: 'Anexos', icon: Paperclip, savingKey: 'attachments' },
                              { id: 'referencias' as const, label: 'Referências', icon: Images, savingKey: 'reference_attachments' },
                            ];


                            return (
                              <div className="flex flex-wrap gap-2">
                                {sectionButtons.map(({ id, label, icon: Icon, savingKey }) => {
                                  const isActive = activeSection === id;
                                  const isSaving = saving && savingField === savingKey;
                                  const badgeCount =
                                    id === 'alteracoes'
                                      ? pendingChangeItems
                                      : id === 'execucao'
                                        ? pendingExecutionItems
                                        : 0;
                                  const showPendingBadge = badgeCount > 0;
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      onClick={() => selectSection(id)}
                                      className={cn(
                                        "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                                        isActive
                                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                          : "bg-background text-foreground border-border hover:bg-muted hover:border-primary/40",
                                        !isActive && showPendingBadge && "border-amber-500/60 text-amber-700 dark:text-amber-400"
                                      )}
                                      aria-pressed={isActive}
                                    >
                                      <Icon className="h-4 w-4" />
                                      <span>{label}</span>
                                      {showPendingBadge && (
                                        <span className={cn(
                                          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                                          isActive ? "bg-primary-foreground/20" : "bg-amber-500 text-white"
                                        )}>
                                          {badgeCount}
                                        </span>
                                      )}
                                      {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Painel do botão ativo */}
                          {activeSection !== 'anexos' && activeSection !== 'referencias' && (
                          <section className="rounded-lg border border-border bg-card/40 p-4">
                            {activeSection === 'briefing' && contentBrief && (
                              <StructuredContentBrief
                                brief={contentBrief}
                                title={card.title}
                                demandTypeLabel={card.demand_type || inferDemandType(card)}
                                publishDate={card.publish_date}
                                publishTime={card.publish_time}
                                objective={card.objective}
                                description={card.description}
                                instructions={card.instructions}
                                postCaption={card.post_caption}
                                adPlan={((card as any).ad_plan || null) as any}
                                isAnuncio={isAnuncio}
                                isGrafica={isGrafica}
                                graficaWarning={GRAFICA_WARNING}
                                readOnly={readOnly}
                                onOpenAnuncio={() => setActiveSection('anuncio')}
                                onSaveBrief={handleContentBriefSave}
                                onChangeInstructions={(value) => onCardChange({ ...card, instructions: value })}
                                onBlurInstructions={() => handleFieldSave('instructions', card.instructions || '')}
                                onChangePostCaption={(value) => onCardChange({ ...card, post_caption: value })}
                                onBlurPostCaption={() => handleFieldSave('post_caption', card.post_caption || '')}
                              />
                            )}

                            {activeSection === 'description' && (() => {
                              const deliveryField = resolveDeliveryField(contentBrief);
                              // Com deliveryField, a aba Conteúdo mostra SOMENTE a entrega
                              // principal (content_brief é a fonte canônica). O `description`
                              // permanece como CONTEXTO e aparece apenas na aba Briefing.
                              if (deliveryField && contentBrief) {
                                return (
                                  <MainDeliveryEditor
                                    brief={contentBrief}
                                    field={deliveryField}
                                    readOnly={readOnly}
                                    onSaveBrief={handleContentBriefSave}
                                  />
                                );
                              }
                              return (
                                <div className="space-y-2">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                    Conteúdo
                                  </p>
                                  {readOnly ? (
                                    <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: convertToHtml(card.description || "") }} />
                                  ) : (
                                    <BlockEditor content={convertToHtml(card.description || "")} onChange={value => onCardChange({ ...card, description: value })} onBlur={() => handleFieldSave('description', card.description || '')} placeholder="Texto do post, legenda, copy..." minHeight="160px" />
                                  )}
                                </div>
                              );
                            })()}


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

                            {activeSection === 'anuncio' && (
                              <AdPlanSection
                                value={((card as any).ad_plan || {}) as any}
                                onChange={(next) => onCardChange({ ...card, ad_plan: next } as any)}
                                onBlur={handleAdPlanSave}
                                readOnly={readOnly}
                              />
                            )}

                            {activeSection === 'alteracoes' && (
                              <ChangeRequestPanel
                                active={changeRequests.active}
                                history={changeRequests.history}
                                loading={changeRequestsLoading}
                                readOnly={readOnly}
                                userNames={Object.fromEntries(collaborators.map((c) => [c.id, c.name]))}
                                onToggleItem={handleToggleChangeItem}
                                onCompleteAll={handleCompleteAllChanges}
                                onRequestChange={handleOpenStandaloneChangeRequest}
                                onDeleteRequest={handleDeleteChangeRequest}
                                deletingRequestId={deletingChangeRequestId}


                                busyItemId={busyChangeItemId}
                                completingAll={completingAllChanges}
                              />
                            )}

                            {activeSection === 'execucao' && (
                              <ExecutionPanel
                                active={execution.active}
                                history={execution.history}
                                loading={executionLoading}
                                readOnly={readOnly}
                                stageLabel={
                                  (pipelineSequence as any[]).find(
                                    (f: any) => f.function_key === card.current_function_key,
                                  )?.name || undefined
                                }
                                typeLabel={card.demand_type || undefined}
                                stageLabels={Object.fromEntries(
                                  (pipelineSequence as any[]).map((f: any) => [f.function_key, f.name]),
                                )}
                                userNames={Object.fromEntries(collaborators.map((c) => [c.id, c.name]))}
                                onAddItem={handleAddExecutionItem}
                                onToggleItem={handleToggleExecutionItem}
                                onDeleteItem={handleDeleteExecutionItem}
                                onCompleteAll={handleCompleteAllExecution}
                                busyItemId={busyExecutionItemId}
                                adding={addingExecutionItem}
                                completingAll={completingAllExecution}
                              />
                            )}



                          </section>
                          )}
                        </>

                      );
                    })()}

                    {/* Registro de alterações ao voltar demanda */}
                    <RequestChangesModal
                      open={!!changeRequestModal}
                      onOpenChange={(v) => { if (!v) setChangeRequestModal(null); }}
                      mode={changeRequestModal?.mode ?? "regress"}
                      targetStageName={changeRequestModal?.targetStageName ?? null}
                      targetUserName={changeRequestModal?.targetUserName ?? null}
                      loading={creatingChangeRequest || regressing}
                      onConfirm={handleConfirmChangeRequest}
                    />

                    {/* Auxílio (não bloqueio) quando há alterações pendentes */}
                    <AlertDialog
                      open={!!pendingGuardAction}
                      onOpenChange={(v) => { if (!v) setPendingGuardAction(null); }}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Existem alterações pendentes</AlertDialogTitle>
                          <AlertDialogDescription>
                            Há itens solicitados nesta alteração que ainda não foram marcados como
                            concluídos. Deseja marcar todos como concluídos antes de continuar ou
                            deixar como estão?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setPendingGuardAction(null);
                              setActiveSection('alteracoes');
                            }}
                          >
                            Ver alterações
                          </Button>
                          <Button
                            variant="outline"
                            disabled={completingAllChanges}
                            onClick={async () => {
                              const action = pendingGuardAction;
                              setPendingGuardAction(null);
                              await handleCompleteAllChanges();
                              await action?.run();
                            }}
                          >
                            Marcar tudo e continuar
                          </Button>
                          <AlertDialogAction
                            onClick={async () => {
                              const action = pendingGuardAction;
                              setPendingGuardAction(null);
                              await action?.run();
                            }}
                          >
                            Continuar sem marcar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Aviso (nunca bloqueio) de saída da passagem com pendências */}
                    <ExecutionExitDialog
                      open={!!executionGuardAction}
                      busy={executionGuardBusy}
                      actionLabel={executionGuardAction?.label}
                      entries={
                        executionGuardAction
                          ? [
                              {
                                cardId: executionGuardAction.preflight.demandId,
                                pending: executionGuardAction.preflight.pending,
                                total: executionGuardAction.preflight.total,
                                pendingTexts: executionGuardAction.preflight.pendingTexts,
                              },
                            ]
                          : []
                      }
                      onCancel={() => {
                        executionGuardAction?.onAbort();
                        setExecutionGuardAction(null);
                      }}
                      onViewExecution={() => {
                        executionGuardAction?.onAbort();
                        setExecutionGuardAction(null);
                        selectSection('execucao');
                      }}
                      onCompleteAll={async () => {
                        const action = executionGuardAction;
                        if (!action) return;
                        setExecutionGuardBusy(true);
                        try {
                          await action.run('complete_all');
                        } finally {
                          setExecutionGuardBusy(false);
                          setExecutionGuardAction(null);
                        }
                      }}
                      onKeepPending={async () => {
                        const action = executionGuardAction;
                        if (!action) return;
                        setExecutionGuardBusy(true);
                        try {
                          await action.run('keep_pending');
                        } finally {
                          setExecutionGuardBusy(false);
                          setExecutionGuardAction(null);
                        }
                      }}
                    />







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
                <CardContent
                  className="p-5 relative"
                  onDragEnter={handleFilesDragEnter}
                  onDragOver={handleFilesDragOver}
                  onDragLeave={handleFilesDragLeave}
                  onDrop={handleFilesDrop}
                >
                  {isDraggingFiles && (
                    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
                      <Upload className="h-8 w-8 text-primary" />
                      <p className="text-sm font-semibold text-primary">Solte os arquivos para anexar</p>
                      <p className="text-xs text-primary/80">Você pode enviar vários arquivos de uma vez</p>
                    </div>
                  )}
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
                      <h3 className="font-semibold text-foreground uppercase tracking-wide text-sm">Arquivos finais</h3>
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

                          {/* Exclusão em massa — SOMENTE anexos finais */}
                          {!isDraft && onRemoveAllAttachments && canBulkRemoveAttachments(card.attachments) && (
                            <AlertDialog open={showRemoveAllAttachments} onOpenChange={(o) => { if (!removingAllAttachments) setShowRemoveAllAttachments(o); }}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={removingAllAttachments || uploading || generatingImages || regeneratingAll || regeneratingSlide !== null}
                                  className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                                >
                                  {removingAllAttachments ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                  {removingAllAttachments ? 'Removendo...' : 'Excluir todos'}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover todos os arquivos finais?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Os {card.attachments?.length ?? 0} arquivos finais serão removidos permanentemente desta demanda. Essa ação não pode ser desfeita. As referências não serão afetadas.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={removingAllAttachments}>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    disabled={removingAllAttachments}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      setRemovingAllAttachments(true);
                                      try {
                                        await onRemoveAllAttachments();
                                        setShowRemoveAllAttachments(false);
                                      } catch (err) {
                                        console.error('[TaskCard] remove all attachments error', err);
                                      } finally {
                                        setRemovingAllAttachments(false);
                                      }
                                    }}
                                  >
                                    {removingAllAttachments ? 'Removendo...' : 'Remover todos'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </>
                      )}

                    </div>
                  </div>

                  <p className="-mt-3 mb-4 text-xs text-muted-foreground">
                    Arquivos usados na entrega, geração de descrição, agendamento e publicação.
                  </p>



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
                          <div className="min-w-0">
                            <p className="text-sm text-muted-foreground">
                              {uploading ? 'Fazendo upload...' : 'Clique, arraste ou cole arquivos aqui'}
                            </p>
                            {!uploading && (
                              <p className="text-[11px] text-muted-foreground/70">
                                Ctrl+V / Cmd+V • vários arquivos • máx. 50MB por arquivo
                              </p>
                            )}
                          </div>
                        </label>
                      )}


                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            )}

            {/* ===== REFERÊNCIAS - coleção independente de materiais de apoio ===== */}
            {activeSection === 'referencias' && (
            <div className="px-6 pb-6">
              <Card>
                <CardContent
                  className="p-5 relative"
                  onDragEnter={handleFilesDragEnter}
                  onDragOver={handleFilesDragOver}
                  onDragLeave={handleFilesDragLeave}
                  onDrop={handleFilesDrop}
                >
                  {isDraggingFiles && (
                    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
                      <Upload className="h-8 w-8 text-primary" />
                      <p className="text-sm font-semibold text-primary">Solte os arquivos de referência</p>
                      <p className="text-xs text-primary/80">Materiais de apoio — não entram na publicação</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 rounded-md">
                        <Images className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground uppercase tracking-wide text-sm">Referências</h3>
                      {referenceAttachments.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">{referenceAttachments.length}</Badge>
                      )}
                    </div>
                    {referenceUploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Materiais de apoio para orientar a execução. Não são publicados, não entram no agendamento e não são usados pela IA.
                  </p>

                  {referenceAttachments.length > 0 && (
                    <DragDropContext onDragEnd={handleReferenceDragEnd}>
                      <Droppable droppableId="reference-attachments-list" direction="horizontal">
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="flex gap-3 mb-4 overflow-x-auto pb-2 scrollbar-thin"
                          >
                            {referenceAttachments.map((attachment, idx) => (
                              <Draggable
                                key={`reference-${idx}-${attachment.url}`}
                                draggableId={`reference-${idx}-${attachment.url}`}
                                index={idx}
                              >
                                {(dragProvided, snapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className={cn(
                                      "group relative flex flex-col items-center gap-1 p-1.5 bg-muted/30 rounded-lg border border-border/50 hover:border-primary/50 transition-colors w-[110px] flex-shrink-0 cursor-grab active:cursor-grabbing select-none",
                                      snapshot.isDragging && "shadow-xl ring-2 ring-primary/50 z-50 bg-background scale-105 rotate-1"
                                    )}
                                  >
                                    {!readOnly && onRemoveReferenceAttachment && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/90 text-destructive-foreground hover:bg-destructive rounded-full z-10"
                                        onClick={(e) => { e.stopPropagation(); setReferenceToRemove(attachment); }}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}

                                    <div
                                      className="relative h-[100px] w-[100px] rounded-md bg-muted flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
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

                  {!readOnly && isDraft && (
                    <div className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border/60 rounded-lg bg-muted/30 text-sm text-muted-foreground">
                      <Images className="h-4 w-4" />
                      Salve a demanda para anexar referências.
                    </div>
                  )}
                  {!readOnly && !isDraft && !onReferenceFileUpload && (
                    <div className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border/60 rounded-lg bg-muted/30 text-sm text-muted-foreground">
                      <Images className="h-4 w-4" />
                      Referências indisponíveis nesta tela.
                    </div>
                  )}
                  {!readOnly && !isDraft && onReferenceFileUpload && (
                    <label className={cn(
                      "flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border/60 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all",
                      referenceUploading && "opacity-50 cursor-not-allowed"
                    )}>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={onReferenceFileUpload}
                        disabled={referenceUploading}
                      />
                      {referenceUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">
                          {referenceUploading ? 'Enviando referências...' : 'Clique, arraste ou cole referências aqui'}
                        </p>
                        {!referenceUploading && (
                          <p className="text-[11px] text-muted-foreground/70">
                            Ctrl+V / Cmd+V • vários arquivos • máx. 50MB por arquivo
                          </p>
                        )}
                      </div>
                    </label>
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

      {/* Confirmation Dialog for Reference Removal */}
      <AlertDialog open={!!referenceToRemove} onOpenChange={(open) => !open && setReferenceToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover referência?</AlertDialogTitle>
            <AlertDialogDescription>
              O material de apoio "{referenceToRemove?.name}" será removido permanentemente. Os anexos finais não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (referenceToRemove) {
                  void onRemoveReferenceAttachment?.(referenceToRemove.url);
                  setReferenceToRemove(null);
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
            <div className="space-y-2 pt-1">
              <label className="text-xs font-medium text-muted-foreground">Proporção da arte</label>
              <Select
                value={generationAspect}
                onValueChange={(v) => setGenerationAspect(v as ImageAspectRatio)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_ASPECT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                A proporção escolhida será salva nesta demanda e usada também nas regenerações.
              </p>
            </div>
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
      <ScheduleConflictModal
        open={!!assignConflict}
        onOpenChange={(o) => { if (!o) setAssignConflict(null); }}
        targetName={assignConflict?.targetName}
        conflicts={assignConflict?.conflicts || []}
        suggestion={assignConflict?.suggestion || null}
        onReschedule={applyAssignReschedule}
        rescheduling={reschedulingAssign}
      />
      <AlertDialog open={!!hardConflict} onOpenChange={(o) => { if (!o) setHardConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflito de área detectado</AlertDialogTitle>
            <AlertDialogDescription>
              {hardConflict?.scheduleMessage
                ? hardConflict.scheduleMessage
                : "O responsável já tem demanda(s) em outra área nesta janela. Você pode manter mesmo assim, mas isso pode gerar sobreposição de trabalho."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {hardConflict && hardConflict.items.length > 0 && (
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