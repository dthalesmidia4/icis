/**
 * TROCA RÁPIDA DE ETAPA (Visão Geral).
 *
 * Um clique no card continua abrindo o card. Pressionar e segurar ~0,5s no chip
 * da etapa abre este popover com as etapas do fluxo daquele card:
 *  - só etapas que o RESPONSÁVEL ATUAL pode executar ficam habilitadas;
 *  - etapas inválidas aparecem com o motivo (nunca somem sem explicação);
 *  - a troca real passa por `jumpToFunction`, o mesmo caminho do fluxo normal
 *    (histórico, responsável e regras de etapa de cliente preservados).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createLongPressCore } from "@/lib/longPress";
import { jumpToFunction } from "@/lib/proceedDemand";
import { loadStageOptionsForAssignee, type StageOption } from "@/lib/stageOptions";

export interface StageQuickChangeCard {
  id: string;
  tenant_id?: string | null;
  demand_type_key?: string | null;
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
  const [options, setOptions] = useState<StageOption[]>([]);

  const load = useCallback(async () => {
    if (!tenantId || !card.assigned_to) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await loadStageOptionsForAssignee({
        tenantId,
        card: {
          id: card.id,
          demand_type_key: card.demand_type_key ?? null,
          work_area: card.work_area ?? null,
          origin: card.origin ?? null,
          current_function_key: card.current_function_key ?? null,
        },
        userId: card.assigned_to,
        administrative: true,
      });
      setOptions(res.options);
    } catch (err) {
      console.error("[StageQuickChange] load error", err);
      toast.error("Não foi possível carregar as etapas deste card.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, card.id, card.assigned_to, card.demand_type_key, card.work_area, card.origin, card.current_function_key]);

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

  async function choose(functionKey: string) {
    if (!tenantId || functionKey === card.current_function_key) {
      setOpen(false);
      return;
    }
    setSaving(functionKey);
    try {
      const res = await jumpToFunction({
        demandId: card.id,
        tenantId,
        demandTypeKey: card.demand_type_key ?? null,
        targetFunctionKey: functionKey,
        currentFunctionKey: card.current_function_key ?? null,
      });
      if (res.success) {
        toast.success(`Etapa alterada para "${stageLabel(functionKey)}".`);
        onChanged?.();
        setOpen(false);
      } else {
        toast.error(res.message || "Não foi possível alterar a etapa.");
      }
    } catch (err) {
      console.error("[StageQuickChange] jump error", err);
      toast.error("Não foi possível alterar a etapa.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          title="Segure para trocar a etapa"
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
        className="w-64 p-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-1.5 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          Trocar etapa
        </p>
        {loading && (
          <div className="flex items-center gap-2 px-1.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando etapas…
          </div>
        )}
        {!loading && options.length === 0 && (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">
            Nenhuma etapa disponível para o responsável atual.
          </p>
        )}
        {!loading &&
          options.map((o) => {
            const isCurrent = o.functionKey === card.current_function_key;
            return (
              <button
                key={o.functionKey}
                type="button"
                disabled={!o.valid || !!saving}
                onClick={() => void choose(o.functionKey)}
                title={o.reasonLabel || undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1.5 text-left text-xs font-semibold transition-colors",
                  o.valid ? "hover:bg-primary/10 text-foreground" : "cursor-not-allowed text-muted-foreground/60",
                  isCurrent && "bg-primary/10",
                )}
              >
                <span className="truncate">{o.name}</span>
                {saving === o.functionKey ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                ) : isCurrent ? (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] text-primary">atual</span>
                ) : !o.valid ? (
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.08em]">bloqueada</span>
                ) : null}
              </button>
            );
          })}
      </PopoverContent>
    </Popover>
  );
}
