/**
 * TROCA RÁPIDA DE ETAPA E DE TIPO DE ATIVIDADE (Visão Geral).
 *
 * Um clique no card continua abrindo o card. Pressionar e segurar ~0,5s no chip
 * da etapa abre este popover com:
 *  - as etapas do TIPO ATUAL da demanda (bloco de cima);
 *  - os OUTROS TIPOS de atividade da mesma área, cada um com suas etapas.
 *
 * Regras preservadas: só etapas que o RESPONSÁVEL ATUAL pode executar ficam
 * habilitadas, etapas inválidas aparecem com o motivo (nunca somem sem
 * explicação) e a troca de tipo + etapa acontece em uma única gravação
 * condicionada ao estado esperado (nunca "tipo novo + etapa antiga").
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createLongPressCore } from "@/lib/longPress";
import { applyTypeStageChange, type TypeStageChangeResult } from "@/lib/typeStageChange";
import { useExecutionExitGuard } from "@/hooks/useExecutionExitGuard";
import { loadTypeStageGroups, type TypeStageGroup } from "@/lib/typeStageOptions";

export interface StageQuickChangeCard {
  id: string;
  tenant_id?: string | null;
  demand_type_key?: string | null;
  demand_type?: string | null;
  work_area?: string | null;
  origin?: string | null;
  current_function_key?: string | null;
  assigned_to?: string | null;
}

interface Props {
  tenantId?: string | null;
  card: StageQuickChangeCard;
  /** Conteúdo original do chip da etapa. */
  children: React.ReactNode;
  disabled?: boolean;
  onChanged?: () => void;
}

const stageLabel = (key?: string | null) => (key ? key.replace(/_/g, " ") : "sem etapa");

export default function StageQuickChangePopover({ tenantId, card, children, disabled, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [groups, setGroups] = useState<TypeStageGroup[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Trocar etapa/tipo ABANDONA a passagem atual: passa pelo guard de execução.
  const { requestExit, dialog: executionExitDialog } = useExecutionExitGuard();

  const load = useCallback(async () => {
    if (!tenantId || !card.assigned_to) {
      setGroups([]);
      return;
    }
    setLoading(true);
    try {
      const res = await loadTypeStageGroups({
        tenantId,
        card: {
          id: card.id,
          demand_type_key: card.demand_type_key ?? null,
          demand_type: card.demand_type ?? null,
          work_area: card.work_area ?? null,
          origin: card.origin ?? null,
          current_function_key: card.current_function_key ?? null,
        },
        userId: card.assigned_to,
        administrative: true,
        // Escolha manual explícita: etapa já concluída não é bloqueio.
        mode: "manual_stage_change",
      });
      setGroups(res.groups);
      setExpanded(
        Object.fromEntries(res.groups.map((g) => [g.demandTypeKey, g.isCurrentType])),
      );
    } catch (err) {
      console.error("[StageQuickChange] load error", err);
      toast.error("Não foi possível carregar as etapas deste card.");
    } finally {
      setLoading(false);
    }
  }, [
    tenantId,
    card.id,
    card.assigned_to,
    card.demand_type_key,
    card.demand_type,
    card.work_area,
    card.origin,
    card.current_function_key,
  ]);

  const longPress = useMemo(
    () =>
      createLongPressCore({
        onLongPress: () => {
          if (disabled) return;
          setOpen(true);
          void load();
        },
      }),
    [disabled, load],
  );
  const pressed = useRef(false);

  async function choose(group: TypeStageGroup, functionKey: string) {
    if (!tenantId) {
      setOpen(false);
      return;
    }
    const sameType = group.isCurrentType;
    if (sameType && functionKey === card.current_function_key) {
      setOpen(false);
      return;
    }
    const busyKey = `${group.demandTypeKey}::${functionKey}`;
    setSaving(busyKey);
    try {
      let res: TypeStageChangeResult = {
        status: "error",
        message: "Não foi possível alterar a etapa.",
      };
      await requestExit({
        demandId: card.id,
        reason: sameType ? "stage_changed" : "type_and_stage_changed",
        actionLabel: "Trocar etapa",
        perform: async () => {
          res = await applyTypeStageChange({
            tenantId,
            card: {
              id: card.id,
              demand_type_key: card.demand_type_key ?? null,
              demand_type: card.demand_type ?? null,
              work_area: card.work_area ?? null,
              origin: card.origin ?? null,
              current_function_key: card.current_function_key ?? null,
              assigned_to: card.assigned_to ?? null,
            },
            targetTypeKey: group.demandTypeKey,
            targetTypeLabel: group.demandTypeLabel,
            targetFunctionKey: functionKey,
            mode: "manual_stage_change",
            source: "overview_stage_long_press",
            // Grupos já carregados/validados no popover: não revalidar tudo.
            validatedGroups: groups,
          });
          return res;
        },
      });

      const final = res as TypeStageChangeResult;
      if (final.status === "ok") {
        toast.success(
          sameType
            ? `Etapa alterada para "${stageLabel(functionKey)}".`
            : `${group.demandTypeLabel} · ${stageLabel(functionKey)}`,
        );
        onChanged?.();
        setOpen(false);
      } else {
        toast.error(final.message);
        if (final.status === "stale") {
          onChanged?.();
          void load();
        }
      }
    } catch (err) {
      console.error("[StageQuickChange] change error", err);
      toast.error("Não foi possível alterar a etapa.");
    } finally {
      setSaving(null);
    }
  }

  const renderStages = (group: TypeStageGroup) => (
    <div className="space-y-0.5">
      {group.stages.map((o) => {
        const busyKey = `${group.demandTypeKey}::${o.functionKey}`;
        return (
          <button
            key={busyKey}
            type="button"
            disabled={!o.valid || !!saving}
            onClick={() => void choose(group, o.functionKey)}
            title={o.reasonLabel || undefined}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-left text-xs font-semibold transition-colors",
              o.valid ? "text-foreground hover:bg-primary/10" : "cursor-not-allowed text-muted-foreground/60",
              o.isCurrentStage && "bg-primary/10",
            )}
          >
            <span className="truncate">{o.name}</span>
            {saving === busyKey ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : o.isCurrentStage ? (
              <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] text-primary">atual</span>
            ) : !o.valid ? (
              <span className="shrink-0 text-[9px] uppercase tracking-[0.08em]">bloqueada</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const current = groups.find((g) => g.isCurrentType);
  const others = groups.filter((g) => !g.isCurrentType);

  return (
    <>
      {executionExitDialog}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          title="Segure para trocar a etapa ou o tipo"
          className={cn("cursor-pointer rounded px-0.5", !disabled && "hover:bg-primary/10")}
          onPointerDown={(e) => {
            if (disabled) return;
            pressed.current = true;
            longPress.start(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => longPress.move(e.clientX, e.clientY)}
          onPointerUp={() => {
            if (!pressed.current) return;
            pressed.current = false;
            longPress.end();
          }}
          onPointerLeave={() => {
            pressed.current = false;
            longPress.cancel();
          }}
          onClick={(e) => {
            // Long-press consumido: o clique não deve abrir o card.
            if (longPress.shouldSuppressClick() || open) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-72 overflow-y-auto p-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-1.5 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          Trocar etapa / tipo
        </p>

        {loading && (
          <div className="flex items-center gap-2 px-1.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando etapas…
          </div>
        )}

        {!loading && groups.length === 0 && (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">
            {card.assigned_to
              ? "Nenhuma etapa disponível para o responsável atual."
              : "Defina um responsável para trocar a etapa deste card."}
          </p>
        )}

        {!loading && current && (
          <div className="mb-1">
            <p className="px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
              {current.demandTypeLabel} · tipo atual
            </p>
            {renderStages(current)}
          </div>
        )}

        {!loading && others.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <p className="px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Outros tipos desta área
            </p>
            {others.map((g) => {
              const isOpen = !!expanded[g.demandTypeKey];
              return (
                <div key={g.demandTypeKey}>
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [g.demandTypeKey]: !isOpen }))}
                    className="flex w-full items-center gap-1 rounded px-1.5 py-1.5 text-left text-xs font-bold text-foreground hover:bg-muted"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{g.demandTypeLabel}</span>
                    {!g.hasValidStage && (
                      <span className="ml-auto shrink-0 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                        sem etapa
                      </span>
                    )}
                  </button>
                  {isOpen && <div className="pl-3">{renderStages(g)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
    </>
  );
}
