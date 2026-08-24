import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, ArrowUp, ArrowDown, Pencil, Check, X, ChevronDown, ChevronRight, Clock, Eye, ClipboardCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PipelineStatus } from "@/components/TaskCard";
import { buildAttachmentStoragePath } from "@/lib/referenceAttachments";
import { collectAttachmentStoragePaths } from "@/lib/bulkAttachments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollaborators } from "@/hooks/useCollaborators";
import { toast as sonnerToast } from "sonner";
import { useBreadcrumbOverride } from "@/contexts/BreadcrumbOverrideContext";
import { useRealtimeDemands, useDebouncedCallback } from "@/hooks/realtime";
import { isDailyCardVisibleNow } from "@/lib/dailyCards";
import { isReviewFunction } from "@/lib/flowFunctions";
import { splitCollaboratorCardGroups } from "@/lib/collaboratorCardGroups";
import { useActiveDispatchIds } from "@/hooks/useActiveDispatchIds";
import { usePendingEvaluationCards, type PendingEvaluationCard } from "@/hooks/usePendingEvaluationCards";
import { EvaluatePlanCardModal } from "@/components/EvaluatePlanCardModal";
import { ClientSendHistoryPopover } from "@/components/kanban/ClientSendHistoryPopover";
import { evaluateReassign, applyReassign, reassignFailureMessage } from "@/lib/reassignDemand";
import { useExecutionExitGuard } from "@/hooks/useExecutionExitGuard";
import {
  DEFAULT_RELEASE_QUEUE,
  isOperationallyReleased,
  loadReleaseQueueConfig,
  type ReleaseQueueConfig,
} from "@/lib/releaseQueue";


import { getRoleLabel } from "@/lib/constants/roles";

const FINAL_STATUSES = ["feito", "feitos", "publicado"];
const formatClientSentText = (card: KanbanCardData) => {
  const sentAt = card.client_wait_started_at || card.client_sent_at_fallback;
  const sendNumber = Math.max(1, (Number(card.client_resend_count) || 0) + 1);
  if (!sentAt) return `Enviado pela ${sendNumber}ª vez ao cliente`;

  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return `Enviado pela ${sendNumber}ª vez ao cliente`;

  return `Enviado pela ${sendNumber}ª vez ao cliente em ${date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
};

const isOverdue = (deliveryDate?: string | null, deliveryTime?: string | null, status?: string) => {
  if (!deliveryDate) return false;
  if (FINAL_STATUSES.includes((status || "").toLowerCase())) return false;
  const time = (deliveryTime || "23:59");
  const t = time.length === 5 ? `${time}:00` : time;
  const deadline = new Date(`${deliveryDate}T${t}`);
  if (isNaN(deadline.getTime())) return false;
  return new Date() >= deadline;
};

const CollaboratorDemands = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [collaboratorName, setCollaboratorName] = useState<string>("");
  const [collaboratorRole, setCollaboratorRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [releaseConfig, setReleaseConfig] = useState<ReleaseQueueConfig>(DEFAULT_RELEASE_QUEUE);

  // Mesma regra da Visão Geral: com a fila desativada, `released_at` é histórico
  // e não pode esconder demanda alguma.
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    loadReleaseQueueConfig(tenantId).then((cfg) => {
      if (alive) setReleaseConfig(cfg);
    });
    return () => {
      alive = false;
    };
  }, [tenantId]);


  useBreadcrumbOverride("collaboratorName", collaboratorName);


  const fetchData = useCallback(async () => {
    if (!tenantId || !userId) return;
    setLoading(true);
    try {
      const [{ data: profile }, { data: role }, { data: pipelines }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("pipelines").select("id").eq("tenant_id", tenantId).limit(1),
      ]);
      setCollaboratorName(profile?.full_name || "Colaborador");
      setCollaboratorRole(role?.role ? getRoleLabel(role.role) : "");

      if (pipelines?.length) {
        const { data: statuses } = await supabase
          .from("pipeline_statuses")
          .select("*")
          .eq("pipeline_id", pipelines[0].id)
          .order("position");
        if (statuses) {
          setPipelineStatuses(statuses.map((s: any) => ({
            id: s.id, name: s.name, color: s.color, position: s.position,
            pipeline_id: s.pipeline_id, is_fixed: s.is_fixed, parent_status_id: s.parent_status_id,
          })));
        }
      }

      const { data: demands } = await supabase
        .from("demands")
        .select("*, pipeline_statuses!inner(name, color), tenant_companies!inner(name, fantasy_name)")
        .eq("tenant_id", tenantId)
        .eq("assigned_to", userId)
        .is("archived_at", null)
        .eq("is_draft", false)
        .order("updated_at", { ascending: false });


      if (demands) {
        const historyFallback = new Map<string, string>();
        const awaitingWithoutStarted = demands
          .filter((d: any) => d.current_function_key === "aguardando_cliente" && !d.client_wait_started_at)
          .map((d: any) => d.id);

        if (awaitingWithoutStarted.length > 0) {
          const { data: historyRows } = await supabase
            .from("demand_flow_history")
            .select("demand_id, created_at")
            .in("demand_id", awaitingWithoutStarted)
            .eq("from_function_key", "enviar_cliente")
            .eq("to_function_key", "aguardando_cliente")
            .order("created_at", { ascending: false });

          (historyRows || []).forEach((row: any) => {
            if (row.demand_id && row.created_at && !historyFallback.has(row.demand_id)) {
              historyFallback.set(row.demand_id, row.created_at);
            }
          });
        }

        const mapped: KanbanCardData[] = demands.map((d: any) => ({
          id: d.id,
          title: d.title,
          description: d.description || "",
          status: d.pipeline_statuses.name,
          due_date: d.due_date || "",
          publish_date: d.publish_date || "",
          publish_time: d.publish_time || "",
          channel: d.channel || "",
          demand_type: d.demand_type || "",
          demand_type_key: d.demand_type_key ?? null,
          objective: d.objective || "",
          instructions: d.instructions || "",
          observations: d.observations || "",
          post_caption: d.post_caption || "",
          attachments: Array.isArray(d.attachments) ? d.attachments as Attachment[] : [],
          reference_attachments: Array.isArray((d as any).reference_attachments) ? (d as any).reference_attachments as Attachment[] : [],
          additional_publish_dates: Array.isArray(d.additional_publish_dates) ? d.additional_publish_dates as string[] : [],
          source: d.source || "manual",
          delivery_date: d.delivery_date || "",
          due_time: d.due_time || "",
          delivery_time: d.delivery_time || "",
          period_plan_id: d.period_plan_id || "",
          tenant_id: d.tenant_id,
          created_at: d.created_at,
          updated_at: d.updated_at,
          assigned_to: d.assigned_to || null,
          current_function_key: d.current_function_key ?? null,
          client_wait_started_at: d.client_wait_started_at ?? null,
          client_resend_count: d.client_resend_count ?? 0,
          client_last_resend_at: d.client_last_resend_at ?? null,
          client_sent_at_fallback: historyFallback.get(d.id) ?? null,
          released_at: d.released_at ?? null,
          clientName: d.tenant_companies.fantasy_name || d.tenant_companies.name,
          clientId: d.client_id,
          is_daily_card: !!d.is_daily_card,
          daily_start_date: d.daily_start_date ?? null,
          daily_end_date: d.daily_end_date ?? null,
          daily_time: d.daily_time ?? null,
          daily_exclude_weekends: d.daily_exclude_weekends ?? true,
          daily_exclude_holidays: d.daily_exclude_holidays ?? true,
          daily_next_date: d.daily_next_date ?? null,
          daily_total_occurrences: d.daily_total_occurrences ?? null,
          daily_completed_occurrences: d.daily_completed_occurrences ?? 0,
          daily_completed_dates: Array.isArray(d.daily_completed_dates) ? d.daily_completed_dates : [],
          work_area: d.work_area ?? null,
          origin: d.origin ?? "interno",
          origin_note: d.origin_note ?? null,
          subclient_id: d.subclient_id ?? null,
          subclient_ids: Array.isArray(d.subclient_ids) ? d.subclient_ids : [],
        })).filter((c: any) => isDailyCardVisibleNow(c));

        setCards(mapped);
      }
    } catch (err) {
      console.error("[CollaboratorDemands] fetch error", err);
      sonnerToast.error("Erro ao carregar demandas do colaborador");
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    if (!tenantLoading && tenantId && userId) fetchData();
  }, [tenantId, tenantLoading, userId, fetchData]);

  const debouncedRefetch = useDebouncedCallback(() => {
    if (tenantId && userId) fetchData();
  }, 200);

  useRealtimeDemands({
    tenantId,
    assignedTo: userId,
    enabled: !!tenantId && !!userId,
    onChange: () => debouncedRefetch(),
  });

  type SortKey = "title" | "due_date" | "due_time" | "delivery_date" | "delivery_time" | "assigned";
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { activeDispatchIds } = useActiveDispatchIds(tenantId);
  const { byAssignee: evalByAssignee, refetch: refetchEval } = usePendingEvaluationCards(tenantId);
  const evaluateCards = useMemo(
    () => (userId ? (evalByAssignee.get(userId) || []) : []),
    [evalByAssignee, userId],
  );
  const [evaluateOpen, setEvaluateOpen] = useState(false);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [evaluateModalCard, setEvaluateModalCard] = useState<PendingEvaluationCard | null>(null);

  const sortedCards = useMemo(() => {
    const arr = [...cards].filter(
      (c) => !activeDispatchIds.has(c.id) && isOperationallyReleased(c, releaseConfig),
    );
    const getVal = (c: KanbanCardData): string => {
      switch (sortKey) {
        case "title": return (c.title || "").toLowerCase();
        case "due_date": return `${c.due_date || "9999-99-99"} ${c.due_time || "99:99"}`;
        case "due_time": return c.due_time || "99:99";
        case "delivery_date": return `${c.delivery_date || "9999-99-99"} ${c.delivery_time || "99:99"}`;
        case "delivery_time": return c.delivery_time || "99:99";
        case "assigned": return (collaboratorName || "").toLowerCase();
      }
    };
    arr.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [cards, sortKey, sortDir, collaboratorName, activeDispatchIds, releaseConfig]);

  const totalCards = sortedCards.length;

  const [awaitingOpen, setAwaitingOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);

  const { awaitingCards, planningCards, reviewCards, mainCards, shouldGroupReview } = useMemo(
    () => splitCollaboratorCardGroups(sortedCards),
    [sortedCards],
  );



  const formatDate = (d?: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const formatTime = (t?: string | null) => (t ? t.slice(0, 5) : "—");

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === "asc"
      ? <ArrowUp className="h-3.5 w-3.5" />
      : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const { collaborators } = useCollaborators(tenantId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const { requestExit, dialog: executionExitDialog } = useExecutionExitGuard();
  const [editDraft, setEditDraft] = useState<{ title: string; due_date: string; due_time: string; delivery_date: string; delivery_time: string; assigned_to: string }>({
    title: "", due_date: "", due_time: "", delivery_date: "", delivery_time: "", assigned_to: "",
  });

  const startEdit = (card: KanbanCardData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(card.id);
    setEditDraft({
      title: card.title || "",
      due_date: card.due_date || "",
      due_time: card.due_time || "",
      delivery_date: card.delivery_date || "",
      delivery_time: card.delivery_time || "",
      assigned_to: card.assigned_to || "",
    });
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  /**
   * Transferência manual: NUNCA gravar `assigned_to` direto.
   * Passa por evaluateReassign/applyReassign para respeitar função da etapa,
   * conflito de agenda e histórico de fluxo.
   */
  const transferAssignee = async (
    card: KanbanCardData,
    newAssignedTo: string | null,
    extraPayload?: Record<string, any>,
  ): Promise<boolean> => {
    if (!tenantId) return false;
    const target = collaborators.find((c: any) => c.user_id === newAssignedTo);
    const evaluation = await evaluateReassign({
      tenantId,
      card: card as any,
      newAssignedTo,
      collaboratorName: (target as any)?.full_name,
    });
    if (!evaluation.allowed) {
      sonnerToast.error(evaluation.message || "Transferência bloqueada.");
      return false;
    }
    // Transferir abandona a passagem atual: guard de execução antes de gravar.
    let res: Awaited<ReturnType<typeof applyReassign>> | null = null;
    await requestExit({
      demandId: card.id,
      reason: "reassign_collaborator_demands",
      actionLabel: "Transferir",
      cardLabel: (card as any).title || undefined,
      perform: async () => {
        res = await applyReassign({
          tenantId,
          card: card as any,
          newAssignedTo,
          nextFunctionKey: evaluation.nextFunctionKey,
          direction: evaluation.direction,
          historySource: "collaborator_demands",
        });
        return reassignFailureMessage(res) ? "failure" : "success";
      },
    });
    if (!res) return false;
    const failure = reassignFailureMessage(res);
    if (failure) {
      sonnerToast.error(failure);
      return false;
    }
    if (evaluation.nextFunctionKey && evaluation.nextFunctionKey !== (card.current_function_key || null)) {
      sonnerToast.info(
        `Destino: ${(target as any)?.full_name || "colaborador"} — etapa ${evaluation.nextFunctionKey}`,
      );
    }
    if (extraPayload && Object.keys(extraPayload).length > 0) {
      await supabase.from("demands").update(extraPayload as any).eq("id", card.id);
    }
    evaluation.softMessages.forEach((m) => sonnerToast.warning(m));
    if (evaluation.remapMessage) sonnerToast.info(evaluation.remapMessage);
    return true;
  };

  const saveEdit = async (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    try {
      const payload = {
        title: editDraft.title,
        due_date: editDraft.due_date || null,
        due_time: editDraft.due_time || null,
        delivery_date: editDraft.delivery_date || null,
        delivery_time: editDraft.delivery_time || null,
      };
      const nextAssignee = editDraft.assigned_to || null;
      const assigneeChanged = nextAssignee !== (card.assigned_to || null);

      if (assigneeChanged) {
        const ok = await transferAssignee(card, nextAssignee, payload);
        if (!ok) return;
      } else {
        const { error } = await supabase.from("demands").update(payload as any).eq("id", cardId);
        if (error) throw error;
      }

      // Se o responsável mudou e não é mais este colaborador, remove da lista
      if (nextAssignee !== userId) {
        setCards((prev) => prev.filter((c) => c.id !== cardId));
      } else {
        setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, ...payload } as KanbanCardData : c));
      }
      setEditingId(null);
      sonnerToast.success("Salvo!");
    } catch (err) {
      console.error("[CollaboratorDemands] inline save error", err);
      sonnerToast.error("Erro ao salvar");
    }
  };




  const handleSave = async (field: string, value: string) => {
    if (!selectedCard) return;
    try {
      // Responsável passa pelo ponto único de transferência.
      if (field === "assigned_to") {
        const ok = await transferAssignee(selectedCard, value || null);
        if (!ok) return;
        if (value !== userId) {
          setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
          setSelectedCard(null);
          sonnerToast.success("Responsável atualizado");
          return;
        }
        setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, assigned_to: value } : c));
        setSelectedCard((prev) => prev ? { ...prev, assigned_to: value } : prev);
        sonnerToast.success("Responsável atualizado");
        return;
      }

      const updateData: Record<string, any> = {};
      if (field === "status") {
        const st = pipelineStatuses.find((s) => s.name === value);
        if (st) updateData.status_id = st.id;
      } else {
        updateData[field] = value || null;
      }
      const { error } = await supabase.from("demands").update(updateData as any).eq("id", selectedCard.id);
      if (error) throw error;

      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, [field]: value } : c));
      setSelectedCard((prev) => prev ? { ...prev, [field]: value } : prev);
      sonnerToast.success("Salvo!");
    } catch (err) {
      console.error("[CollaboratorDemands] save error", err);
      sonnerToast.error("Erro ao salvar");
    }
  };


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files?.length) return;
    const file = event.target.files[0];
    const filePath = `${tenantId}/${selectedCard.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("card-attachments").upload(filePath, file);
    if (upErr) { sonnerToast.error("Erro no upload"); return; }
    const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(filePath);
    const newAtt = {
      name: file.name, url: urlData.publicUrl, type: file.type, size: file.size,
      storagePath: filePath, uploadedAt: new Date().toISOString(),
      uploadedBy: { id: "", email: "" }, cardId: selectedCard.id, tenantId: tenantId || "",
    } as Attachment;
    const updated = [...(selectedCard.attachments || []), newAtt];
    await supabase.from("demands").update({ attachments: updated as any }).eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments: updated } : c));
    setSelectedCard((prev) => prev ? { ...prev, attachments: updated } : prev);
  };

  const handleRemoveAttachment = async (url: string) => {
    if (!selectedCard) return;
    const updated = (selectedCard.attachments || []).filter((a) => a.url !== url);
    await supabase.from("demands").update({ attachments: updated as any }).eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments: updated } : c));
    setSelectedCard((prev) => prev ? { ...prev, attachments: updated } : prev);
  };

  /** Exclusão em massa SOMENTE dos anexos finais. Referências permanecem intactas. */
  const handleRemoveAllAttachments = async () => {
    if (!selectedCard) return;
    const finalAttachments = selectedCard.attachments || [];
    if (finalAttachments.length === 0) return;
    try {
      const storagePaths = collectAttachmentStoragePaths(finalAttachments);
      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("card-attachments")
          .remove(storagePaths);
        if (storageError) throw storageError;
      }
      const { error } = await supabase
        .from("demands")
        .update({ attachments: [] as any, updated_at: new Date().toISOString() })
        .eq("id", selectedCard.id);
      if (error) throw error;
      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments: [] } : c));
      setSelectedCard((prev) => prev ? { ...prev, attachments: [] } : prev);
      sonnerToast.success("Todos os anexos finais foram removidos.");
    } catch (err) {
      console.error("[CollaboratorDemands] remove all attachments error", err);
      sonnerToast.error("Não foi possível remover todos os anexos.");
      throw err;
    }
  };



  const handleReorderAttachments = async (attachments: Attachment[]) => {
    if (!selectedCard) return;
    await supabase.from("demands").update({ attachments: attachments as any }).eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments } : c));
    setSelectedCard((prev) => prev ? { ...prev, attachments } : prev);
  };

  // ===== Referências (materiais de apoio, nunca publicados) =====
  const persistReferences = async (list: Attachment[]) => {
    if (!selectedCard) return;
    await supabase
      .from("demands")
      .update({ reference_attachments: list as any, updated_at: new Date().toISOString() })
      .eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, reference_attachments: list } : c));
    setSelectedCard((prev) => prev ? { ...prev, reference_attachments: list } : prev);
  };

  const handleReferenceFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files?.length) return;
    const files = Array.from(event.target.files);
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (files.some((f) => f.size > MAX_FILE_SIZE)) {
      sonnerToast.error("Arquivo muito grande. Limite de 50MB.");
      event.target.value = "";
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      sonnerToast.error("Usuário não autenticado.");
      event.target.value = "";
      return;
    }
    setReferenceUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of files) {
        const storagePath = buildAttachmentStoragePath({
          tenantId: tenantId || "",
          clientId: selectedCard.clientId,
          periodPlanId: selectedCard.period_plan_id,
          cardId: selectedCard.id,
          fileName: file.name,
          collection: "reference",
        });
        const { error: upErr } = await supabase.storage.from("card-attachments").upload(storagePath, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(storagePath);
        uploaded.push({
          name: file.name, url: urlData.publicUrl, type: file.type || "application/octet-stream", size: file.size,
          storagePath, uploadedAt: new Date().toISOString(),
          uploadedBy: { id: user.id, email: user.email || "" },
          cardId: selectedCard.id, tenantId: tenantId || "",
          clientId: selectedCard.clientId,
          periodPlanId: selectedCard.period_plan_id || undefined,
        } as Attachment);
      }
      await persistReferences([...(selectedCard.reference_attachments || []), ...uploaded]);
      sonnerToast.success(`${uploaded.length} referência(s) adicionada(s)`);
    } catch (err) {
      console.error("[CollaboratorDemands] reference upload error", err);
      sonnerToast.error("Erro ao enviar referências");
    } finally {
      setReferenceUploading(false);
      event.target.value = "";
    }
  };

  const handleRemoveReferenceAttachment = async (url: string) => {
    if (!selectedCard) return;
    const attachment = (selectedCard.reference_attachments || []).find((a) => a.url === url);
    if (attachment?.storagePath) {
      await supabase.storage.from("card-attachments").remove([attachment.storagePath]);
    }
    await persistReferences((selectedCard.reference_attachments || []).filter((a) => a.url !== url));
    sonnerToast.success("Referência removida");
  };

  const handleDelete = async () => {
    if (!selectedCard) return;
    await supabase.from("demands").delete().eq("id", selectedCard.id);
    setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
    setSelectedCard(null);
    sonnerToast.success("Demanda excluída");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-4 px-3 sm:px-4">
      {executionExitDialog}
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Demandas de {collaboratorName}
          </h2>
          <Badge variant="secondary">
            {totalCards} {totalCards === 1 ? 'demanda' : 'demandas'}
          </Badge>
          {collaboratorRole && (
            <Badge variant="outline" className="text-xs">{collaboratorRole}</Badge>
          )}
          {evaluateCards.length > 0 && (
            <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40">
              {evaluateCards.length} a avaliar
            </Badge>
          )}
        </div>
      </div>


      {totalCards === 0 && evaluateCards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma demanda atribuída a este colaborador no momento.</p>
        </div>
      ) : (() => {
        const renderTableHeader = () => (
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {([
                { k: "title", label: "Nome da demanda" },
                { k: "due_date", label: "Início" },
                { k: "delivery_date", label: "Entrega" },
                { k: "assigned", label: "Responsável" },
              ] as { k: SortKey; label: string }[]).map(({ k, label }) => (
                <TableHead key={k} className="whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort(k)}
                    className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {label}
                    <SortIcon k={k} />
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
        );

        const renderRow = (card: KanbanCardData) => {
          const overdue = isOverdue(card.delivery_date, card.delivery_time, card.status);
          const isEditing = editingId === card.id;
          return (
            <TableRow
              key={card.id}
              onClick={() => { if (!isEditing) setSelectedCard(card); }}
              className={`${isEditing ? "" : "cursor-pointer"} ${overdue ? "bg-destructive/10 hover:bg-destructive/15" : ""}`}
            >
              <TableCell className="font-medium text-foreground">
                {isEditing ? (
                  <Input
                    value={editDraft.title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                    className="h-8"
                  />
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {card.clientName && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                        {card.clientName}
                      </span>
                    )}
                    <span className="uppercase tracking-wide text-sm">{card.title}</span>
                  </div>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Input type="date" value={editDraft.due_date} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditDraft((d) => ({ ...d, due_date: e.target.value }))} className="h-8 w-36" />
                    <Input type="time" value={editDraft.due_time?.slice(0,5) || ""} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditDraft((d) => ({ ...d, due_time: e.target.value }))} className="h-8 w-28" />
                  </div>
                ) : card.current_function_key === "aguardando_cliente" ? (
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                    {formatClientSentText(card)}
                    <ClientSendHistoryPopover
                      demandId={card.id}
                      fallbackSince={card.client_wait_started_at || card.client_sent_at_fallback}
                      fallbackResendCount={card.client_resend_count}
                    />
                  </span>

                ) : (
                  <span>{formatDate(card.due_date)}{card.due_time ? ` · ${formatTime(card.due_time)}` : ""}</span>
                )}
              </TableCell>
              <TableCell className={`whitespace-nowrap ${overdue && !isEditing ? "text-destructive font-semibold" : ""}`}>
                {isEditing ? (
                  <div className="flex gap-2">
                    <Input type="date" value={editDraft.delivery_date} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditDraft((d) => ({ ...d, delivery_date: e.target.value }))} className="h-8 w-36" />
                    <Input type="time" value={editDraft.delivery_time?.slice(0,5) || ""} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditDraft((d) => ({ ...d, delivery_time: e.target.value }))} className="h-8 w-28" />
                  </div>
                ) : card.current_function_key === "aguardando_cliente" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span>{formatDate(card.delivery_date)}{card.delivery_time ? ` · ${formatTime(card.delivery_time)}` : ""}</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {isEditing ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select value={editDraft.assigned_to} onValueChange={(v) => setEditDraft((d) => ({ ...d, assigned_to: v }))}>
                      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {collaborators.map((c) => (
                          <SelectItem key={c.userId} value={c.userId}>{c.fullName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : collaboratorName}
              </TableCell>
              <TableCell className="text-right">
                {isEditing ? (
                  <div className="inline-flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" onClick={(e) => saveEdit(card.id, e)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => startEdit(card, e)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        };

        const renderGroup = (rows: KanbanCardData[]) => (
          <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
            <Table>
              {renderTableHeader()}
              <TableBody>{rows.map(renderRow)}</TableBody>
            </Table>
          </div>
        );

        return (
          <div className="space-y-4">
            {evaluateCards.length > 0 && (
              <div className="rounded-lg border border-purple-500/40 bg-purple-500/5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEvaluateOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-purple-500/10 transition-colors border-b border-purple-500/30"
                  aria-expanded={evaluateOpen}
                >
                  {evaluateOpen ? <ChevronDown className="h-4 w-4 text-purple-600 dark:text-purple-400" /> : <ChevronRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
                  <ClipboardCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="font-medium text-sm text-purple-700 dark:text-purple-300 uppercase tracking-wide">Avaliar</span>
                  <Badge className="ml-1 bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40">{evaluateCards.length}</Badge>
                </button>
                {evaluateOpen && (
                  <div className="divide-y divide-purple-500/20">
                    {evaluateCards.map((ec) => (
                      <button
                        key={ec.key}
                        type="button"
                        onClick={() => setEvaluateModalCard(ec)}
                        className="w-full text-left px-4 py-3 hover:bg-purple-500/10 transition-colors"
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-600/90 dark:text-purple-300/90 mb-0.5 truncate">
                          {ec.clientName}
                        </div>
                        <div className="text-sm font-medium text-foreground break-words line-clamp-2">{ec.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ec.demandType && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ec.demandType}</span>
                          )}
                          {ec.suggestedDate && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ec.suggestedDate}</span>
                          )}
                          {ec.source === "ultra" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">Ultra</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mainCards.length > 0 && renderGroup(mainCards)}

            {/* Planejar SEMPRE em agrupamento próprio (mesmo com 1 card). */}
            {planningCards.length > 0 && (
              <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPlanningOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors border-b border-border"
                  aria-expanded={planningOpen}
                >
                  {planningOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Planejar</span>
                  <Badge variant="secondary" className="ml-1">{planningCards.length}</Badge>
                </button>
                {planningOpen && (
                  <Table>
                    {renderTableHeader()}
                    <TableBody>{planningCards.map(renderRow)}</TableBody>
                  </Table>
                )}
              </div>
            )}



            {awaitingCards.length > 0 && (
              <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAwaitingOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors border-b border-border"
                  aria-expanded={awaitingOpen}
                >
                  {awaitingOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Aguardando clientes</span>
                  <Badge variant="secondary" className="ml-1">{awaitingCards.length}</Badge>
                </button>
                {awaitingOpen && (
                  <Table>
                    {renderTableHeader()}
                    <TableBody>{awaitingCards.map(renderRow)}</TableBody>
                  </Table>
                )}
              </div>
            )}

            {shouldGroupReview && reviewCards.length > 0 && (
              <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setReviewOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors border-b border-border"
                  aria-expanded={reviewOpen}
                >
                  {reviewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Eye className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Em revisão</span>
                  <Badge variant="secondary" className="ml-1">{reviewCards.length}</Badge>
                </button>
                {reviewOpen && (
                  <Table>
                    {renderTableHeader()}
                    <TableBody>{reviewCards.map(renderRow)}</TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        );
      })()}




      <TaskCard
        open={!!selectedCard}
        onOpenChange={(open) => { if (!open) setSelectedCard(null); }}
        card={selectedCard}
        onCardChange={(updated) => {
          const merged = selectedCard ? { ...selectedCard, ...updated } : updated;
          const archived = !!merged.archived_at;
          const movedToOtherUser = !!merged.assigned_to && merged.assigned_to !== userId;

          if (archived || movedToOtherUser) {
            setCards((prev) => prev.filter((c) => c.id !== merged.id));
            setSelectedCard(null);
            return;
          }

          setCards((prev) => prev.map((c) => c.id === merged.id ? { ...c, ...merged } : c));
          setSelectedCard(merged);
        }}
        onSave={handleSave}
        onFileUpload={handleFileUpload}
        onRemoveAttachment={handleRemoveAttachment}
        onRemoveAllAttachments={handleRemoveAllAttachments}
        onReorderAttachments={handleReorderAttachments}
        onReferenceFileUpload={handleReferenceFileUpload}
        onRemoveReferenceAttachment={handleRemoveReferenceAttachment}
        onReorderReferenceAttachments={persistReferences}
        referenceUploading={referenceUploading}
        onDelete={handleDelete}
        pipelineStatuses={pipelineStatuses}
      />

      <EvaluatePlanCardModal
        open={!!evaluateModalCard}
        onOpenChange={(v) => { if (!v) setEvaluateModalCard(null); }}
        card={evaluateModalCard}
        tenantId={tenantId}
        onDone={() => refetchEval()}
      />
    </div>
  );
};

export default CollaboratorDemands;
