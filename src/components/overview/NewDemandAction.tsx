import { Suspense, lazy, useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { Button } from "@/components/ui/button";

// Caminho crítico do Escritório: o TaskCard (e todo o seu grafo de dependências)
// só é baixado/montado quando o usuário abre o rascunho de fato.
const LazyTaskCard = lazy(() => import("@/components/TaskCard"));
import { supabase } from "@/integrations/supabase/client";
import { draftClientChangePatch } from "@/lib/draftDemand";

interface NewDemandActionProps {
  tenantId: string | null | undefined;
  /** Chamado após criar a demanda (para atualizar a tela hospedeira). */
  onCreated?: () => void;
}

/**
 * Fluxo canônico de "Nova Demanda" (rascunho em memória + `create_manual_demand_atomic`)
 * empacotado em um componente independente: permite criar demandas de qualquer
 * tela — inclusive do Escritório virtual — sem montar o Kanban inteiro.
 */
export default function NewDemandAction({ tenantId, onCreated }: NewDemandActionProps) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<any>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const openDraft = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data } = await supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", tenantId)
        .order("name");
      setClients((data || []).map((c: any) => ({ id: c.id, name: c.fantasy_name || c.name })));
    } catch (err) {
      console.error("[NewDemandAction] clients error", err);
      setClients([]);
    }

    const nowIso = new Date().toISOString();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const rounded = new Date(now);
    const mins = rounded.getMinutes();
    if (mins === 0 || mins === 30) rounded.setMinutes(mins + 30);
    else if (mins < 30) rounded.setMinutes(30);
    else {
      rounded.setHours(rounded.getHours() + 1);
      rounded.setMinutes(0);
    }
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    const defaultStartTime = `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;

    let draftDefaultArea: "midia" | "sistemas" = "midia";
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("default_work_area")
          .eq("id", uid)
          .maybeSingle();
        const v = (prof as any)?.default_work_area;
        if (v === "sistemas" || v === "midia") draftDefaultArea = v;
      }
    } catch {
      /* mantém midia */
    }

    const endParts = (() => {
      const [h, mi] = defaultStartTime.split(":").map((n) => parseInt(n, 10));
      const dt = new Date(rounded);
      dt.setHours(h + 1, mi, 0, 0);
      return {
        date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
        time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
      };
    })();

    setCard({
      id: "draft",
      title: "",
      description: null,
      objective: null,
      instructions: null,
      observations: null,
      post_caption: null,
      status: "Planejamento",
      due_date: todayStr,
      channel: null,
      attachments: [],
      reference_attachments: [],
      publish_date: null,
      publish_time: null,
      tenant_id: tenantId,
      delivery_date: endParts.date,
      due_time: defaultStartTime,
      delivery_time: endParts.time,
      period_plan_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      archived_at: null,
      additional_publish_dates: [],
      source: "demand",
      demand_id: "draft",
      demand_type: null,
      demand_type_key: null,
      work_area: draftDefaultArea,
      origin: "interno",
      periodPlanId: "",
      assigned_to: null,
      current_function_key: null,
      clientId: "",
      clientName: "",
    });
    setOpen(true);
  }, [tenantId]);

  const discard = useCallback(() => {
    setOpen(false);
    setCard(null);
  }, []);

  const save = useCallback(
    async (extras?: { executionItemTexts?: string[] }) => {
      if (savingRef.current || !card) return;
      if (!card.clientId) return void sonnerToast.error("Selecione uma empresa");
      if (!card.demand_type_key) return void sonnerToast.error("Defina o tipo da demanda");
      const isDaily = !!card.is_daily_card;
      if (!isDaily && !card.due_date) return void sonnerToast.error("Defina a data de início de produção");
      if (isDaily && !card.daily_start_date)
        return void sonnerToast.error("Defina a data de início do Card Diário");
      if (!card.title?.trim()) return void sonnerToast.error("Informe um título");
      if (!card.assigned_to) return void sonnerToast.error("Escolha um responsável antes de salvar");

      savingRef.current = true;
      setSaving(true);
      try {
        const subIds = Array.isArray(card.subclient_ids) ? (card.subclient_ids as string[]) : [];
        const payload: Record<string, any> = {
          client_id: card.clientId,
          title: card.title.trim(),
          description: card.description || null,
          objective: card.objective || null,
          instructions: card.instructions || null,
          observations: card.observations || null,
          post_caption: card.post_caption || null,
          demand_type: card.demand_type || card.demand_type_key,
          demand_type_key: card.demand_type_key,
          channel: card.channel || null,
          work_area: card.work_area || "midia",
          origin: card.origin || "interno",
          origin_note: card.origin_note || null,
          assigned_to: card.assigned_to,
          period_plan_id: card.period_plan_id || null,
          subclient_id: subIds[0] || card.subclient_id || null,
          subclient_ids: subIds,
          classifications: Array.isArray(card.classifications) ? card.classifications : [],
          content_brief: card.content_brief && typeof card.content_brief === "object" ? card.content_brief : null,
          image_aspect_ratio: card.image_aspect_ratio || null,
          is_daily_card: isDaily,
        };

        if (isDaily) {
          payload.daily_start_date = card.daily_start_date ?? null;
          payload.daily_end_date = card.daily_end_date ?? null;
          payload.daily_time = card.daily_time ?? null;
          payload.daily_exclude_weekends = card.daily_exclude_weekends ?? true;
          payload.daily_exclude_holidays = card.daily_exclude_holidays ?? true;
          payload.daily_next_date = card.daily_next_date ?? card.daily_start_date ?? null;
          payload.daily_total_occurrences = card.daily_total_occurrences ?? null;
        } else {
          payload.due_date = card.due_date || null;
          payload.due_time = card.due_time || null;
          payload.delivery_date = card.delivery_date || null;
          payload.delivery_time = card.delivery_time || null;
          payload.publish_date = card.publish_date || null;
          payload.publish_time = card.publish_time || null;
          payload.additional_publish_dates = card.additional_publish_dates || [];
        }

        const { data, error } = await (supabase.rpc as any)("create_manual_demand_atomic", {
          p_payload: payload,
        });
        if (error) throw error;
        const result = data as {
          success?: boolean;
          demand_id?: string;
          error?: string;
          current_function_key?: string | null;
        } | null;

        if (!result?.success || !result.demand_id) {
          sonnerToast.error(result?.error || "Erro ao criar demanda");
          return;
        }

        if (tenantId) {
          const { recordOriginTouchpoint } = await import("@/lib/recordTouchpoint");
          await recordOriginTouchpoint(tenantId, result.demand_id);
        }

        const itemTexts = (extras?.executionItemTexts || []).filter(Boolean);
        if (itemTexts.length > 0 && tenantId) {
          try {
            const { ensureExecutionRun } = await import("@/lib/demandExecution");
            const run = await ensureExecutionRun({
              tenantId,
              demandId: result.demand_id,
              context: {
                functionKey: result.current_function_key ?? null,
                demandTypeKey: card.demand_type_key ?? null,
                assignedTo: card.assigned_to ?? null,
              },
              itemTexts,
              metadata: { created_from: "manual_draft" },
            });
            if (!run) throw new Error("run_not_created");
          } catch (err) {
            console.error("[NewDemandAction] execution materialization failed", err);
            sonnerToast.warning(
              "Demanda criada, mas o checklist de execução não foi salvo. Abra o card e reescreva os itens na aba Execução.",
            );
          }
        }

        sonnerToast.success("Demanda criada!");
        discard();
        onCreated?.();
      } catch (err: any) {
        console.error("[NewDemandAction] save error", err);
        sonnerToast.error(err?.message || "Erro ao salvar demanda");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [card, tenantId, discard, onCreated],
  );

  return (
    <>
      <Button size="sm" onClick={openDraft}>
        <Plus className="h-4 w-4 mr-1" />
        Nova Demanda
      </Button>

      {open && (
        <Suspense fallback={null}>
          <LazyTaskCard
            open={open}
        onOpenChange={(next) => {
          if (!next) discard();
        }}
        isDraft
        card={card}
        onCardChange={(next) => setCard(next as any)}
        onDraftSave={save}
        savingDraft={saving}
        onDraftDiscard={discard}
        draftClients={clients}
        onDraftClientChange={(clientId, clientName) =>
          setCard((prev: any) =>
            prev ? { ...prev, clientId, clientName, ...draftClientChangePatch() } : prev,
          )
        }
        onSave={async () => {}}
        onFileUpload={async () => {}}
        onRemoveAttachment={async () => {}}
            onDelete={() => discard()}
          />
        </Suspense>
      )}
    </>
  );
}
