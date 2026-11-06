import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Play, Image as ImageIcon, Clapperboard, Film, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import BulkAllocationModal from "@/components/kanban/BulkAllocationModal";
import { canBulkAllocate } from "@/lib/bulkAllocation";
import { cn } from "@/lib/utils";
import { AttachmentPreviewModal, type AttachmentPreviewItem } from "@/components/AttachmentPreviewModal";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { buildInstagramFeed, feedHasMedia, isFeedEntrySelectable, type FeedEntry, type FeedMediaItem } from "@/lib/instagramFeed";
import { Input } from "@/components/ui/input";
import {
  CLASSIFICATION_OPTIONS,
  EMPTY_CONTENT_FILTERS,
  buildClassificationCounts,
  buildTypeCounts,
  countActiveContentFilters,
  matchesContentFilters,
  type ContentClassification,
  type ContentFilterState,
} from "@/lib/contentFilters";
import { useEdgeScroll } from "@/hooks/useEdgeScroll";
import { SingleDateTimePopover } from "@/components/kanban/StartEndDatePopover";
import { publicationNotice, saveDemandPublication } from "@/lib/demandPublication";
import { toast } from "sonner";
import ScrollEdgeButton from "@/components/client-hub/ScrollEdgeButton";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Check, X, CalendarRange } from "lucide-react";

interface FeedPeriod {
  id: string;
  period_title: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  final_plan: any;
  default_plan: any;
  ultra_plan: any;
}

const DEMAND_SELECT =
  "id, title, demand_type, demand_type_key, publish_date, publish_time, due_date, delivery_date, current_function_key, status_id, assigned_to, archived_at, released_at, classifications, ad_plan, channel, post_caption, attachments, reference_attachments, period_plan_id";

// Espelho local de normalizePlanItem (useClientPeriodWorkspace) — mesmos campos.
const normalizeFeedPlanItem = (raw: any, source: "normal" | "ultra"): WorkspacePlanItem => ({
  demand_id: typeof raw?.demand_id === "string" && raw.demand_id ? raw.demand_id : null,
  titulo: String(raw?.titulo ?? raw?.title ?? "").trim(),
  tipo: raw?.tipo ?? raw?.type ?? null,
  canal: raw?.canal ?? null,
  objetivo: raw?.objetivo ?? null,
  conteudo: raw?.conteudo ?? null,
  instrucoes: raw?.instrucoes_de_producao ?? null,
  cta: raw?.cta_recomendado ?? null,
  data: raw?.data_sugerida ?? raw?.data ?? null,
  typeKey: raw?.type_key ?? null,
  source,
});

const periodSnapshot = (p: FeedPeriod): WorkspacePlanItem[] => {
  const items = Array.isArray(p.final_plan)
    ? p.final_plan.map((i: any) => normalizeFeedPlanItem(i, "normal"))
    : [
        ...(Array.isArray(p.default_plan) ? p.default_plan : []).map((i: any) => normalizeFeedPlanItem(i, "normal")),
        ...(Array.isArray(p.ultra_plan) ? p.ultra_plan : []).map((i: any) => normalizeFeedPlanItem(i, "ultra")),
      ];
  return items.filter((i) => i.titulo);
};

const fmtShort = (iso: string | null) => {
  if (!iso) return "?";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
};
const periodRange = (p: FeedPeriod) => `${fmtShort(p.period_start)} – ${fmtShort(p.period_end)}`;
const periodName = (p: FeedPeriod) => (p.period_title || "").trim() || "Período sem título";

const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const LONG_PRESS_MS = 400;

const dateLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS_SHORT[Number(m) - 1]}`;
};

const KIND_LABEL: Record<FeedEntry["kind"], string> = {
  static: "Estático",
  carousel: "Carrossel",
  video: "Vídeo",
};

/**
 * Ícone de marca d’água para células sem mídia nem referência visual.
 * Reels (detecção textual em `typeLabel`) usa Clapperboard; demais vídeos, Film.
 */
const REELS_RE = /\breels?\b/i;
const feedPlaceholderIcon = (entry: FeedEntry) => {
  if (entry.kind === "static") return ImageIcon;
  if (entry.kind === "carousel") return Layers;
  return REELS_RE.test(entry.typeLabel) ? Clapperboard : Film;
};

/** Nome do arquivo: usa o do anexo; senão deriva da URL (para detectar o tipo no modal). */
const mediaFileName = (item: FeedMediaItem): string => {
  if (item.name) return item.name;
  const path = item.url.split("?")[0];
  const last = path.split("/").pop() || "";
  if (last.includes(".")) return decodeURIComponent(last);
  return item.kind === "video-file" ? "arquivo.mp4" : "arquivo.png";
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
};

interface PreviewState {
  items: AttachmentPreviewItem[];
  initialIndex: number;
  entryKey: string;
  isReference: boolean;
}

interface InstagramFeedTabProps {
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  statusNames: Record<string, { name: string; isFinal: boolean }>;
  stageNames: Record<string, string>;
  onOpenDemand?: (demandId: string) => void;
  /** Recarrega o workspace após uma alocação em massa. */
  onReload?: () => void;
  clientId?: string | null;
  currentPeriodId?: string | null;
}

export default function InstagramFeedTab({
  planItems,
  demands,
  statusNames,
  stageNames,
  onOpenDemand,
  onReload,
  clientId = null,
  currentPeriodId = null,
}: InstagramFeedTabProps) {
  const [filter, setFilter] = useState<"all" | "media" | "producao">("all");
  // Filtros compartilhados com a aba Calendário (busca, tipo, classificação).
  const [shared, setShared] = useState<ContentFilterState>(EMPTY_CONTENT_FILTERS);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [slideByEntry, setSlideByEntry] = useState<Record<string, number>>({});
  const [activeCarouselKey, setActiveCarouselKey] = useState<string | null>(null);

  // Mesmo gate da Visão Geral: gestor operacional / super admin.
  const { tenantId } = useTenant();
  const { isSuperAdmin, isAgencyAdmin, isAgencyManager } = useAgencyRole();
  const canAllocate = canBulkAllocate({ isSuperAdmin, isAgencyAdmin, isAgencyManager });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggleSelect = useCallback((demandId: string) => {
    setSelectedIds((prev) => (prev.includes(demandId) ? prev.filter((x) => x !== demandId) : [...prev, demandId]));
  }, []);
  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  // ---------- Períodos exibidos (estado local do feed) ----------
  const [periods, setPeriods] = useState<FeedPeriod[] | null>(null);
  const [periodsError, setPeriodsError] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<string[]>([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [periodDemands, setPeriodDemands] = useState<(WorkspaceDemand & { period_plan_id: string | null })[] | null>(null);
  const [demandsLoading, setDemandsLoading] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [localReload, setLocalReload] = useState(0);

  const storageKey =
    tenantId && clientId && authUserId ? `icis:feed-periods:${tenantId}:${clientId}:${authUserId}` : null;

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setAuthUserId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Lista de períodos do cliente (todas as épocas).
  useEffect(() => {
    setPeriods(null);
    setPeriodsError(false);
    setSelectionReady(false);
    setSelectedPeriodIds([]);
    setPeriodDemands(null);
    if (!tenantId || !clientId) return;
    let alive = true;
    supabase
      .from("period_plans")
      .select("id,period_title,period_start,period_end,status,final_plan,default_plan,ultra_plan,created_at")
      .eq("tenant_id", tenantId)
      .eq("company_id", clientId)
      .order("period_start", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setPeriodsError(true);
          setPeriods([]);
          return;
        }
        setPeriods((data as any[]) as FeedPeriod[]);
      });
    return () => {
      alive = false;
    };
  }, [tenantId, clientId]);

  // Seleção inicial: persistida (apenas IDs existentes) → período atual → mais recente gerado.
  useEffect(() => {
    if (selectionReady || !periods || !periods.length || !authUserId) return;
    const valid = new Set(periods.map((p) => p.id));
    let ids: string[] = [];
    if (storageKey) {
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(raw)) ids = raw.filter((x) => typeof x === "string" && valid.has(x));
      } catch {
        ids = [];
      }
    }
    if (!ids.length && currentPeriodId && valid.has(currentPeriodId)) ids = [currentPeriodId];
    if (!ids.length) {
      const generated = periods.find((p) => p.status && p.status !== "draft");
      ids = [(generated ?? periods[0]).id];
    }
    setSelectedPeriodIds(ids);
    setSelectionReady(true);
  }, [periods, authUserId, storageKey, currentPeriodId, selectionReady]);

  useEffect(() => {
    if (!selectionReady || !storageKey || !selectedPeriodIds.length) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(selectedPeriodIds));
    } catch {
      /* armazenamento indisponível: seleção vale só nesta sessão */
    }
  }, [selectedPeriodIds, storageKey, selectionReady]);

  // Demandas dos períodos selecionados — uma única consulta; resultados antigos descartados.
  // `demands` (prop) entra na chave para refletir reload/realtime do workspace.
  const selectedKey = selectedPeriodIds.join(",");
  useEffect(() => {
    if (!selectionReady || !tenantId || !clientId || !selectedPeriodIds.length) return;
    let alive = true;
    setDemandsLoading(true);
    supabase
      .from("demands")
      .select(DEMAND_SELECT)
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .eq("is_draft", false)
      .in("period_plan_id", selectedPeriodIds)
      .then(({ data, error }) => {
        if (!alive) return;
        setDemandsLoading(false);
        if (error) {
          toast.error("Erro ao carregar demandas dos períodos");
          return;
        }
        setPeriodDemands((data as any[]) ?? []);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, selectionReady, tenantId, clientId, demands, localReload]);

  const togglePeriod = useCallback((id: string) => {
    setSelectedPeriodIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      return [...prev, id];
    });
  }, []);

  const savePeriodTitle = useCallback(
    async (id: string) => {
      const trimmed = titleDraft.trim();
      if (!trimmed) {
        toast.error("O nome do período não pode ficar vazio");
        return;
      }
      if (!tenantId || !clientId) return;
      setSavingTitle(true);
      const { data, error } = await supabase
        .from("period_plans")
        .update({ period_title: trimmed })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("company_id", clientId)
        .select("id,period_title")
        .single();
      setSavingTitle(false);
      if (error || !data) {
        toast.error("Não foi possível renomear o período");
        return;
      }
      setPeriods((prev) => prev?.map((p) => (p.id === id ? { ...p, period_title: (data as any).period_title } : p)) ?? prev);
      setEditingPeriodId(null);
      toast.success("Período renomeado");
    },
    [titleDraft, tenantId, clientId]
  );

  const handleReload = useCallback(() => {
    setLocalReload((k) => k + 1);
    onReload?.();
  }, [onReload]);

  const ownDataReady = selectionReady && !!periods && periodDemands !== null;

  const entries = useMemo(() => {
    if (!ownDataReady) return buildInstagramFeed({ demands, planItems, stageNames, statusNames });
    const byId = new Map(periods!.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const all: FeedEntry[] = [];
    for (const pid of selectedPeriodIds) {
      const period = byId.get(pid);
      if (!period) continue;
      const pd = periodDemands!.filter((d) => d.period_plan_id === pid);
      const built = buildInstagramFeed({ demands: pd, planItems: periodSnapshot(period), stageNames, statusNames });
      for (const e of built) {
        if (e.demandId) {
          if (seen.has(e.demandId)) continue;
          seen.add(e.demandId);
        }
        all.push({ ...e, key: `${pid}:${e.key}` });
      }
    }
    const tv = (t: string | null) => (t ? t.slice(0, 5) : "");
    return all.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const ta = tv(a.time);
      const tb = tv(b.time);
      if (ta !== tb) return ta < tb ? 1 : -1;
      return a.key < b.key ? -1 : 1;
    });
  }, [ownDataReady, periods, periodDemands, selectedPeriodIds, demands, planItems, stageNames, statusNames]);

  const toFilterable = (e: FeedEntry) => ({
    title: e.title,
    typeLabel: e.typeLabel,
    classifications: e.classifications,
    isDemand: e.isDemand,
  });

  // Filtros compartilhados primeiro: contadores de mídia refletem o recorte atual.
  const sharedFiltered = useMemo(
    () => entries.filter((e) => matchesContentFilters(toFilterable(e), shared)),
    [entries, shared]
  );

  const withMedia = sharedFiltered.filter(feedHasMedia).length;
  const inProduction = sharedFiltered.length - withMedia;

  const visible = useMemo(
    () =>
      sharedFiltered.filter((e) =>
        filter === "all" ? true : filter === "media" ? feedHasMedia(e) : !feedHasMedia(e)
      ),
    [sharedFiltered, filter]
  );

  const filterableAll = useMemo(() => entries.map(toFilterable), [entries]);
  const typeCounts = useMemo(() => buildTypeCounts(filterableAll), [filterableAll]);
  const opCounts = useMemo(() => buildClassificationCounts(filterableAll), [filterableAll]);
  const activeFilterCount =
    countActiveContentFilters(shared) + (filter === "all" ? 0 : 1);

  const clearFilters = useCallback(() => {
    setShared(EMPTY_CONTENT_FILTERS);
    setFilter("all");
  }, []);

  const filters: { value: typeof filter; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: sharedFiltered.length },
    { value: "media", label: "Com mídia", count: withMedia },
    { value: "producao", label: "Em produção", count: inProduction },
  ];

  const setSlide = useCallback((key: string, next: number) => {
    setSlideByEntry((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
  }, []);

  // Teclado: navega o último carrossel cuja seta foi clicada — nunca todos.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const previewOpen = !!preview;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (previewOpen) return; // modal expandido tem prioridade absoluta
      if (isTypingTarget(e.target)) return;
      if (!activeCarouselKey) return;
      const entry = visibleRef.current.find((x) => x.key === activeCarouselKey);
      if (!entry || entry.kind !== "carousel" || entry.media.length <= 1) return;

      const total = entry.media.length;
      const current = Math.min(slideByEntry[entry.key] ?? 0, total - 1);
      const next = e.key === "ArrowLeft" ? current - 1 : current + 1;
      if (next < 0 || next > total - 1) return;
      e.preventDefault();
      setSlide(entry.key, next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeCarouselKey, slideByEntry, previewOpen, setSlide]);

  // Scroll canônico: resolve o <main> do Layout como container real e habilita
  // PageUp/PageDown/Home/End sem exigir clique prévio em um card.
  const { anchorRef, canScroll, action, scrollToEdge } = useEdgeScroll<HTMLDivElement>({
    modalOpen: previewOpen || bulkOpen,
    revalidateKey: `${visible.length}:${filter}:${shared.search}:${shared.type}:${shared.classification}`,
  });

  return (
    <div ref={anchorRef} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">Prévia do Feed Simulado</h2>
          <p className="text-[12px] text-muted-foreground">
            Mais recentes acima · segure o clique para abrir a mídia · setas ← → navegam o carrossel ativo
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {entries.length} publicações · {withMedia} com mídia · {inProduction} em produção
          </p>
          {clientId && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              <span className="font-bold uppercase tracking-[0.12em] text-muted-foreground">Períodos exibidos</span>
              <Popover onOpenChange={(o) => !o && setEditingPeriodId(null)}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {periods === null
                      ? "Carregando…"
                      : periodsError
                        ? "Erro ao carregar"
                        : selectedPeriodIds.length === 1
                          ? periodName(periods.find((p) => p.id === selectedPeriodIds[0]) ?? ({} as FeedPeriod))
                          : `${selectedPeriodIds.length} períodos`}
                    {demandsLoading && <span className="opacity-60">…</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-2">
                  {periods === null ? (
                    <p className="p-2 text-xs text-muted-foreground">Carregando períodos…</p>
                  ) : periodsError ? (
                    <p className="p-2 text-xs text-destructive">Não foi possível carregar os períodos.</p>
                  ) : periods.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">Nenhum período para este cliente.</p>
                  ) : (
                    <>
                      <div className="max-h-72 space-y-0.5 overflow-y-auto">
                        {periods.map((p) => {
                          const checked = selectedPeriodIds.includes(p.id);
                          const editing = editingPeriodId === p.id;
                          return (
                            <div key={p.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
                              <Checkbox
                                checked={checked}
                                disabled={checked && selectedPeriodIds.length === 1}
                                onCheckedChange={() => togglePeriod(p.id)}
                              />
                              {editing ? (
                                <div className="flex flex-1 items-center gap-1">
                                  <Input
                                    autoFocus
                                    value={titleDraft}
                                    onChange={(e) => setTitleDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") savePeriodTitle(p.id);
                                      if (e.key === "Escape") setEditingPeriodId(null);
                                    }}
                                    className="h-7 text-xs"
                                  />
                                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={savingTitle} onClick={() => savePeriodTitle(p.id)} aria-label="Salvar nome">
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPeriodId(null)} aria-label="Cancelar">
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => togglePeriod(p.id)}>
                                    <p className="truncate text-xs font-semibold text-foreground">{periodName(p)}</p>
                                    <p className="text-[10px] text-muted-foreground">{periodRange(p)}</p>
                                  </button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 shrink-0"
                                    aria-label="Renomear período"
                                    onClick={() => {
                                      setEditingPeriodId(p.id);
                                      setTitleDraft(p.period_title || "");
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-7 w-full text-[11px]"
                        onClick={() => setSelectedPeriodIds(periods.map((p) => p.id))}
                      >
                        Todos os períodos
                      </Button>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {canAllocate && (
            <Button
              size="sm"
              variant={selectionMode ? "default" : "outline"}
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              className="mr-1 gap-1.5"
            >
              <CheckSquare className="h-4 w-4" />
              {selectionMode ? "Cancelar seleção" : "Selecionar"}
            </Button>
          )}
          {/* Filtros exclusivos do Feed (mídia / produção) — preservados. */}
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label} · {f.count}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros compartilhados com o Calendário: busca, tipo e classificação. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full lg:max-w-xs">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Buscar
          </p>
          <Input
            value={shared.search}
            onChange={(e) => setShared((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Tema, tipo ou demanda"
            className="h-10 rounded-lg"
          />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => setShared((prev) => ({ ...prev, type: "all" }))}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
              shared.type === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            )}
          >
            Todos os tipos <span className="tabular-nums opacity-70">{entries.length}</span>
          </button>
          {typeCounts.map(([type, count]) => (
            <button
              key={type}
              type="button"
              onClick={() => setShared((prev) => ({ ...prev, type }))}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                shared.type === type
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              {type} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          ))}
          <span className="mx-1 h-6 w-px self-center bg-border" aria-hidden />
          {CLASSIFICATION_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setShared((prev) => ({
                  ...prev,
                  classification: prev.classification === key ? null : (key as ContentClassification),
                }))
              }
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                shared.classification === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              {label} <span className="tabular-nums opacity-70">{opCounts[key]}</span>
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-dashed px-3 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Limpar filtros · {activeFilterCount}
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma publicação de feed neste período.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
          {visible.map((entry) => (
            <FeedCell
              key={entry.key}
              entry={entry}
              slideIndex={slideByEntry[entry.key] ?? 0}
              onSlideChange={(next) => setSlide(entry.key, next)}
              onActivateCarousel={() => setActiveCarouselKey(entry.key)}
              onOpenDemand={onOpenDemand}
              onPublicationSaved={handleReload}
              canEditPublication={!selectionMode}
              selectable={selectionMode && isFeedEntrySelectable(entry)}
              selected={!!entry.demandId && selectedIds.includes(entry.demandId)}
              onToggleSelect={() => entry.demandId && toggleSelect(entry.demandId)}
              onOpenMedia={(items, initialIndex) =>
                setPreview({
                  items: items.map((it) => ({ url: it.url, name: mediaFileName(it) })),
                  initialIndex,
                  entryKey: entry.key,
                  isReference: entry.mediaSource === "reference",
                })
              }
            />
          ))}
        </div>
      )}

      {canAllocate && selectionMode && selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-background/95 px-4 py-2 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold text-foreground">{selectedIds.length} selecionados</span>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              Alocar para colaborador
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Limpar
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelection}>
              Sair da seleção
            </Button>
          </div>
        </div>
      )}

      {canAllocate && (
        <BulkAllocationModal
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          tenantId={tenantId}
          cardIds={selectedIds}
          sourceScreen="feed"
          onApplied={() => {
            exitSelection();
            handleReload();
          }}
        />
      )}

      <ScrollEdgeButton action={action} visible={canScroll} onClick={scrollToEdge} />

      {preview && (
        <AttachmentPreviewModal
          isOpen
          onClose={() => setPreview(null)}
          fileUrl={preview.items[preview.initialIndex]?.url ?? preview.items[0]?.url ?? ""}
          fileName={preview.items[preview.initialIndex]?.name ?? preview.items[0]?.name ?? ""}
          items={preview.items}
          initialIndex={preview.initialIndex}
          onIndexChange={(idx) => setSlide(preview.entryKey, idx)}
          badgeLabel={preview.isReference ? "Referência" : undefined}
        />
      )}
    </div>
  );
}

function FeedCell({
  entry,
  slideIndex,
  onSlideChange,
  onActivateCarousel,
  onOpenDemand,
  onOpenMedia,
  onPublicationSaved,
  canEditPublication = false,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  entry: FeedEntry;
  slideIndex: number;
  onSlideChange: (next: number) => void;
  onActivateCarousel: () => void;
  onOpenDemand?: (id: string) => void;
  onOpenMedia: (items: FeedMediaItem[], initialIndex: number) => void;
  onPublicationSaved?: () => void;
  canEditPublication?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const clickable = (entry.isDemand && !!entry.demandId && !!onOpenDemand) || selectable;
  const media = entry.media;
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  const index = Math.min(Math.max(slideIndex, 0), Math.max(media.length - 1, 0));
  const current = media[index];
  const hasMedia = !!current;
  const showArrows = entry.kind === "carousel" && media.length > 1;
  // Edição de publicação direto no feed: só demandas reais, fora do modo seleção.
  const editablePublication = canEditPublication && entry.isDemand && !!entry.demandId;
  const [savingPublication, setSavingPublication] = useState(false);

  const savePublication = async (v: { date: string | null; time: string | null }) => {
    if (!entry.demandId) return;
    setSavingPublication(true);
    try {
      const res = await saveDemandPublication({
        demandId: entry.demandId,
        date: v.date,
        time: v.time,
      });
      if (!res.ok) {
        toast.error("Não foi possível salvar a publicação.");
        return;
      }
      const notice = publicationNotice(res);
      if (res.dispatchCancelled && notice) toast.warning(notice);
      else if (notice) toast.info(notice);
      else toast.success("Publicação atualizada.");
      onPublicationSaved?.();
    } finally {
      setSavingPublication(false);
    }
  };

  const publicationText = `${dateLabel(entry.date)}${entry.time ? ` · ${entry.time}` : ""}`;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressing(false);
  };

  useEffect(() => clearTimer, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!hasMedia || e.button === 2) return;
    longFiredRef.current = false;
    setPressing(true);
    timerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      clearTimer();
      onOpenMedia(media, index);
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    if (entry.isDemand && entry.demandId && onOpenDemand) onOpenDemand(entry.demandId);
  };

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/85 text-foreground shadow backdrop-blur transition disabled:opacity-30 group-hover:flex [@media(hover:none)]:flex";

  const content = (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      {current?.kind === "image" && (
        <img
          src={current.url}
          alt={entry.title}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
      )}
      {current?.kind === "video-file" && (
        <video
          src={current.url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      )}

      {entry.previewKind === "none" && (
        <div className="relative flex h-full w-full flex-col justify-between border border-primary/20 bg-primary/[0.05] p-2 text-left">
          {/* Marca d’água discreta do tipo de mídia esperado — pointer-events-none. */}
          {(() => {
            const PlaceholderIcon = feedPlaceholderIcon(entry);
            return (
              <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center" aria-hidden>
                <PlaceholderIcon className="h-11 w-11 text-muted-foreground/25 sm:h-12 sm:w-12" strokeWidth={1.5} />
              </div>
            );
          })()}
          <div className="relative z-10 space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-primary">
              {KIND_LABEL[entry.kind]}
            </span>
            <span className="line-clamp-3 text-[11px] font-bold leading-tight text-foreground">{entry.title}</span>
          </div>
          <div className="relative z-10 space-y-1">
            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-primary">
              {entry.stageLabel}
            </span>
            {editablePublication ? (
              <SingleDateTimePopover
                date={entry.date}
                time={entry.time || null}
                label="Publicação"
                align="start"
                onSave={savePublication}
                trigger={
                  <button
                    type="button"
                    title="Editar data e hora da publicação"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="block rounded text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
                  >
                    {savingPublication ? "Salvando…" : publicationText}
                  </button>
                }
              />
            ) : (
              <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {publicationText}
              </span>
            )}
          </div>
        </div>
      )}

      {selectable && (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-2 right-2 z-20 flex h-5 w-5 items-center justify-center rounded border text-[11px] font-black",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-white/70 bg-background/85",
          )}
        >
          {selected ? "✓" : ""}
        </span>
      )}

      {entry.mediaSource === "reference" && (
        <span className="absolute left-2 top-2 z-10 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-600 backdrop-blur dark:text-amber-300">
          Referência
        </span>
      )}

      {/* Marcações de formato */}
      {entry.previewKind !== "none" && (
        <>
          {entry.kind === "carousel" && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-[10px] font-bold text-foreground backdrop-blur">
              <Layers className="h-4 w-4" />
              {showArrows ? `${index + 1}/${media.length}` : entry.mediaCount}
            </span>
          )}
          {entry.kind === "video" && (
            <span className="absolute right-2 top-2 rounded bg-background/80 p-1.5 text-foreground backdrop-blur">
              <Play className="h-4 w-4" />
            </span>
          )}
          {entry.kind === "static" && (
            <span className="absolute right-2 top-2 rounded bg-background/70 p-1.5 text-foreground backdrop-blur">
              <ImageIcon className="h-4 w-4" />
            </span>
          )}

          {showArrows && (
            <>
              <button
                type="button"
                aria-label="Slide anterior"
                disabled={index === 0}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivateCarousel();
                  if (index > 0) onSlideChange(index - 1);
                }}
                className={cn(arrowClass, "left-2")}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Próximo slide"
                disabled={index === media.length - 1}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivateCarousel();
                  if (index < media.length - 1) onSlideChange(index + 1);
                }}
                className={cn(arrowClass, "right-2")}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 to-transparent p-1.5">
            {editablePublication ? (
              <SingleDateTimePopover
                date={entry.date}
                time={entry.time || null}
                label="Publicação"
                align="start"
                onSave={savePublication}
                trigger={
                  <button
                    type="button"
                    title="Editar data e hora da publicação"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white underline decoration-white/40 decoration-dotted underline-offset-2 transition-colors hover:bg-white/20"
                  >
                    {savingPublication ? "Salvando…" : publicationText}
                  </button>
                }
              />
            ) : (
              <span className="pointer-events-none text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                {publicationText}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );

  const pressClasses = pressing ? "scale-[0.97] brightness-75" : "";

  if (clickable || hasMedia) {
    return (
      <div
        role="button"
        tabIndex={0}
        title={entry.title}
        aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => hasMedia && e.preventDefault()}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          handleClick();
        }}
        className={cn(
          "group relative aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-sm transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          selectable && selected && "ring-2 ring-primary ring-offset-2",
          pressClasses
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      title={entry.title}
      aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
      className="group aspect-[4/5] w-full overflow-hidden rounded-sm"
    >
      {content}
    </div>
  );
}
